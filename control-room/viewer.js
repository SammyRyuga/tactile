import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { makePodShift } from "./pod-shift.js";
import { makeRoomProcess, signalTrack, stationNames } from "./room-process.js";
import { makeRecordedPlayback } from "./recorded-playback.js";
import { makeHolograms } from "./holograms.js";

const roles = ["devils_advocate", "builder", "researcher", "operator"];
const statusLabels = {
  inactive: "Not selected",
  queued: "Queued",
  working: "In progress",
  done: "Complete",
  unavailable: "Unavailable",
  skipped: "Skipped",
  unrecorded: "Not recorded",
  unreported: "No update",
};
const relayColors = {
  devils_advocate: new THREE.Color(0.95, 0.075, 0.055),
  builder: new THREE.Color(1, 0.42, 0.035),
  operator: new THREE.Color(0.12, 0.38, 1),
  researcher: new THREE.Color(0, 0.78, 0.9),
};

function trackRole(track, model) {
  const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
  for (let node = model.getObjectByName(nodeName); node; node = node.parent) {
    const signal = signalTrack(node.userData);
    if (signal) return signal;
    if (node.userData.reviewer_id) return node.userData.reviewer_id;
    if (node.userData.worker_id) return node.userData.worker_id;
    if (node.userData.worker_role) return "support";
    if (node.userData.steelman_packet) return "projection";
    if (node.name.startsWith("Steelman") || node.name.startsWith("Slump")) {
      return "slump";
    }
    const role = roles.find((id) => node.name.startsWith(id));
    if (role) return role;
  }
  return "support";
}

function makeActions(asset) {
  const mixer = new THREE.AnimationMixer(asset.scene);
  const actions = new Map();
  for (const clip of asset.animations) {
    const groups = Map.groupBy(clip.tracks, (track) =>
      trackRole(track, asset.scene),
    );
    for (const [role, tracks] of groups) {
      const action = mixer.clipAction(
        new THREE.AnimationClip(role, clip.duration, tracks),
      );
      action.play();
      const group = actions.get(role) ?? [];
      group.push(action);
      actions.set(role, group);
    }
  }
  return { mixer, actions };
}

export function mountControlRoom(root, readReview, onReady, onFailure) {
  const controller = new AbortController();
  const cleanups = [];
  const close = () => {
    controller.abort();
    while (cleanups.length) cleanups.pop()();
  };
  const fail = (reason) => {
    if (controller.signal.aborted) return;
    close();
    onFailure(reason);
  };
  void showRoom(root, readReview, controller.signal, cleanups, fail)
    .then((resetCamera) => {
      if (!controller.signal.aborted) onReady(resetCamera);
    })
    .catch(() => fail("loadFailed"));
  return close;
}

function disposeScene(scene) {
  const resources = new Set();
  const bitmaps = new Set();
  scene.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    if (object.isSkinnedMesh) resources.add(object.skeleton);
    for (const material of [object.material].flat().filter(Boolean)) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) {
          resources.add(value);
          if (value.image instanceof ImageBitmap) bitmaps.add(value.image);
        }
      }
    }
  });
  for (const resource of resources) resource.dispose();
  for (const bitmap of bitmaps) bitmap.close();
}

async function showRoom(root, readReview, signal, cleanups, fail) {
  const canvas = root.querySelector("canvas");
  const flowPanel = root.querySelector(".room-flow");
  const flowMode = root.querySelector("[data-room-mode]");
  const flowPhase = root.querySelector("[data-room-phase]");
  const flowStations = root.querySelector("[data-room-stations]");
  const flowRelay = root.querySelector("[data-room-relay]");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const context = canvas.getContext("webgl2", { antialias: true });
  if (!context) {
    fail("unsupported");
    return;
  }
  const renderer = new THREE.WebGLRenderer({ canvas, context });
  cleanups.push(() => {
    renderer.setAnimationLoop(null);
    renderer.dispose();
    renderer.forceContextLoss();
  });
  canvas.addEventListener("webglcontextlost", () => fail("contextLost"), {
    signal,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#10151e");
  scene.add(new THREE.HemisphereLight(0xc5d5e7, 0x443748, 1.32));
  for (const [color, intensity, position] of [
    [0xe3e7ec, 2.12, [2, 9, 3]],
    [0xaabed9, 0.85, [-5, 6, -4]],
    [0xffc292, 0.58, [6, 5, -4]],
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...position);
    if (position[0] === 2) {
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      Object.assign(light.shadow.camera, {
        left: -9,
        right: 9,
        top: 9,
        bottom: -9,
        far: 22,
      });
      light.shadow.normalBias = 0.035;
      light.shadow.bias = -0.0003;
      light.shadow.radius = 3;
    }
    scene.add(light);
  }

  const response = await fetch("/control-room-assets/control-room.glb", {
    signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    redirect: "error",
  });
  if (response.status === 404) {
    fail("missing");
    return;
  }
  if (
    !response.ok ||
    response.headers.get("content-type")?.split(";")[0]?.trim() !==
      "model/gltf-binary"
  )
    throw new Error("Invalid local room model response.");
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(blob:|data:)/.test(url)) return url;
    throw new Error("Room models must embed their resources.");
  });
  const asset = await new GLTFLoader(manager)
    .setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(await response.arrayBuffer(), "");
  if (signal.aborted) {
    disposeScene(asset.scene);
    return;
  }
  scene.add(asset.scene);
  cleanups.push(() => disposeScene(scene));
  const camera = asset.cameras.find((item) => item.name.includes("overview"));
  if (!camera?.isPerspectiveCamera)
    throw new Error("The Blender overview camera is missing.");
  camera.updateWorldMatrix(true, false);
  scene.attach(camera);
  const authoredFov = camera.fov;
  const authoredAspect = camera.aspect;
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(
    camera
      .getWorldDirection(new THREE.Vector3())
      .multiplyScalar(21)
      .add(camera.position),
  );
  controls.enableDamping = true;
  controls.enableZoom = false;
  canvas.style.touchAction = "pan-y";
  cleanups.push(() => controls.dispose());
  controls.minDistance = 6;
  controls.maxDistance = 32;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();
  controls.saveState();
  const podCamera = asset.cameras.find((item) => item.userData.pod_bay_camera);
  const overviewPosition = camera.position.clone();
  const overviewTarget = controls.target.clone();
  let podPosition;
  let podTarget;
  let shotWeight = 1;
  let manualCamera = false;
  const resetCamera = () => {
    controls.reset();
    manualCamera = false;
    shotWeight = 0;
  };
  if (podCamera) {
    podPosition = podCamera.getWorldPosition(new THREE.Vector3());
    podTarget = podCamera
      .getWorldDirection(new THREE.Vector3())
      .multiplyScalar(podCamera.userData.look_distance)
      .add(podPosition);
    camera.position.copy(podPosition);
    controls.target.copy(podTarget);
    controls.update();
    controls.addEventListener("start", () => {
      manualCamera = true;
    });
  }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(new THREE.Vector2(1, 1), 0.25, 0.32, 1.6),
  );
  composer.addPass(new OutputPass());
  cleanups.push(() => {
    for (const pass of composer.passes) pass.dispose();
    composer.dispose();
  });

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    camera.aspect = width / Math.max(1, height);
    const halfFov = THREE.MathUtils.degToRad(authoredFov) / 2;
    camera.fov = THREE.MathUtils.radToDeg(
      2 *
        Math.atan(
          Math.tan(halfFov) * Math.max(1, authoredAspect / camera.aspect),
        ),
    );
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
  }
  resize();
  const layout = new ResizeObserver(resize);
  layout.observe(canvas);
  cleanups.push(() => layout.disconnect());

  const { mixer, actions } = makeActions(asset);
  cleanups.push(() => {
    mixer.stopAllAction();
    mixer.uncacheRoot(asset.scene);
  });
  const podShift = makePodShift(asset.scene, roles);
  const roomProcess = makeRoomProcess(asset.scene);
  const playback = makeRecordedPlayback();
  const updateHolograms = makeHolograms(asset.scene, scene, overviewPosition);
  const stationRows = new Map(
    roles.map((role) => {
      const row = document.createElement("li");
      row.dataset.role = role;
      flowStations.append(row);
      return [role, row];
    }),
  );
  const signalObjects = new Map();
  const relayDisplays = new Map();
  const workerIndicators = new Map();
  const projectors = new Map();
  const lightPaths = [];
  let decisionMemo;
  asset.scene.traverse((object) => {
    const { room_light_color: color, room_light_intensity: intensity } =
      object.userData;
    if (Array.isArray(color) && Number.isFinite(intensity)) {
      const spill = new THREE.PointLight(
        new THREE.Color(...color),
        intensity,
        12,
      );
      object.getWorldPosition(spill.position);
      scene.add(spill);
    }
    if (object.userData.review_memo) decisionMemo = object;
    const signal = signalTrack(object.userData);
    if (signal) {
      const objects = signalObjects.get(signal) ?? [];
      objects.push(object);
      signalObjects.set(signal, objects);
    }
    if (object.isMesh) {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const item of materials) {
        const relay = item?.userData.worker_relay_display;
        if (relay && !relayDisplays.has(relay))
          relayDisplays.set(relay, {
            material: item,
            idle: item.emissive.clone(),
          });
        const kind = item?.userData.steelman_power;
        if (kind) {
          projectors.set(item, { kind, power: item.emissiveIntensity });
          if (kind === "projection") {
            item.transparent = true;
            lightPaths.push(object);
          }
        }
        const id = /^(courier-\S+) indicator /.exec(item?.name)?.[1];
        if (!id) continue;
        const indicators = workerIndicators.get(id) ?? new Map();
        indicators.set(item, item.emissiveIntensity);
        workerIndicators.set(id, indicators);
      }
      object.receiveShadow = true;
      object.castShadow =
        /courier|hoverbot|^Slump|worktop|Steelman.*deck|mounted.cabinet/.test(
          object.name,
        );
    }
  });
  let lastRun;
  let previousTime;
  function draw(time) {
    const review = readReview();
    const dt = Math.min((time - (previousTime ?? time)) / 1000, 0.1);
    previousTime = time;
    if (!podShift && review?.id !== lastRun) {
      for (const group of actions.values()) {
        for (const action of group) action.reset().play();
      }
      lastRun = review?.id;
    }
    const current = playback(dt, review, reduceMotion.matches);
    const shift = podShift?.(dt, current, reduceMotion.matches);
    const process = roomProcess(dt, shift, reduceMotion.matches);
    const moving = (role) =>
      !reduceMotion.matches &&
      Boolean(
        current &&
        (role === "support"
          ? current.active.length > 0
          : current.active.includes(role)),
      );
    let playing;
    if (shift) {
      flowPanel.hidden = false;
      if (flowMode.textContent !== process.mode)
        flowMode.textContent = process.mode;
      if (flowPhase.textContent !== process.label)
        flowPhase.textContent = process.label;
      for (const [role, state] of process.stations) {
        const row = stationRows.get(role);
        if (row.dataset.state === state) continue;
        row.dataset.state = state;
        row.textContent = `${stationNames[role]} · ${statusLabels[state]}`;
      }
      for (const [track, objects] of signalObjects) {
        const visible = process.signals.has(track);
        for (const object of objects) object.visible = visible;
      }
      for (const [id, { material, idle }] of relayDisplays) {
        const payload = process.cargo.get(id);
        material.emissive.copy(payload ? relayColors[payload] : idle);
      }
      const payloads = [...process.cargo.values()];
      const relayText = payloads.length
        ? `Courier relay · ${payloads.map((role) => stationNames[role]).join(", ")}`
        : "";
      if (flowRelay.textContent !== relayText)
        flowRelay.textContent = relayText;
      flowRelay.hidden = !relayText;
      const activeSignals = [...process.signals.keys()].join(",");
      if (canvas.dataset.roomSignals !== activeSignals)
        canvas.dataset.roomSignals = activeSignals;
      const phases = roles
        .map((role) => `${role}:${shift.get(role).phase}`)
        .join(",");
      if (canvas.dataset.officerPhases !== phases)
        canvas.dataset.officerPhases = phases;
      const workers = [];
      for (const [id, indicators] of workerIndicators) {
        const state = shift.get(id);
        if (!state) continue;
        workers.push(`${id}:${state.phase}`);
        for (const [item, power] of indicators)
          item.emissiveIntensity = power * state.power;
      }
      const workerPhases = workers.join(",");
      if (canvas.dataset.workerPhases !== workerPhases)
        canvas.dataset.workerPhases = workerPhases;
      const projector = shift.get("projection");
      if (projector) {
        if (canvas.dataset.steelmanPower !== projector.phase)
          canvas.dataset.steelmanPower = projector.phase;
        for (const [item, { kind, power }] of projectors) {
          item.emissiveIntensity = power * projector.power;
          if (kind === "projection") item.opacity = projector.power;
        }
        for (const path of lightPaths) path.visible = projector.power > 0;
      }
      for (const [role, group] of actions) {
        for (const action of group) {
          action.paused = true;
          action.time = Math.min(
            process.signals.get(role)?.time ?? shift.get(role)?.time ?? 0,
            action.getClip().duration,
          );
        }
      }
      mixer.update(0);
      if (podPosition && !manualCamera) {
        const officers = roles.map((role) => shift.get(role));
        const atBay = officers.every(
          ({ phase, time }) =>
            phase === "sleeping" || (phase === "waking" && time < 6),
        );
        shotWeight = reduceMotion.matches
          ? 0
          : THREE.MathUtils.damp(shotWeight, atBay ? 1 : 0, 1.7, dt);
        camera.position.lerpVectors(overviewPosition, podPosition, shotWeight);
        controls.target.lerpVectors(overviewTarget, podTarget, shotWeight);
      }
      playing = [...shift]
        .filter(([, state]) => state.phase === "working")
        .map(([role]) => role);
    } else {
      for (const [role, group] of actions) {
        for (const action of group) action.paused = !moving(role);
      }
      mixer.update(dt);
      playing = [...actions.keys()].filter(moving);
    }
    playing = playing.sort().join(",");
    if (canvas.dataset.playing !== playing) canvas.dataset.playing = playing;
    const reviewReady = current?.phase === "ready";
    const memoReady = String(reviewReady);
    if (canvas.dataset.memoReady !== memoReady)
      canvas.dataset.memoReady = memoReady;
    if (decisionMemo && !signalObjects.has("result")) {
      decisionMemo.visible = reviewReady;
      if (reviewReady) decisionMemo.scale.setScalar(1);
    }
    controls.update();
    updateHolograms(camera, current, shift, process);
    composer.render(dt);
  }
  renderer.setAnimationLoop((time) => {
    try {
      draw(time);
    } catch {
      fail("loadFailed");
    }
  });
  canvas.dataset.ready = "true";
  canvas.dataset.animatedRoles = [...actions.keys()].join(",");
  return resetCamera;
}
