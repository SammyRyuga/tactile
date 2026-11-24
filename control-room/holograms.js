import * as THREE from "three";

function stationStatus(role, review, shift, process) {
  if (role === "slump") {
    if (process.ready) return "Memo ready";
    if (process.signals.has("processing"))
      return review?.steelman === "verifying"
        ? "Verifying evidence"
        : "Synthesizing findings";
    if (review?.steelman === "unavailable") return "Check unavailable";
    return "Standing by";
  }
  const motion = shift?.get(role)?.phase;
  const state = review?.stations?.[role];
  if (shift?.has(`handoff:${role}`)) return "Courier handoff";
  if (motion === "waking") return "Deploying";
  if (motion === "returning") return "Returning to pod";
  if (motion === "working" && state?.state === "working")
    return state.stages[0] ?? "Reviewing";
  if (
    state?.state === "queued" &&
    review.phase !== "ready" &&
    review.phase !== "stopped"
  )
    return "Queued";
  return (
    {
      done: "Check complete",
      unavailable: "Check unavailable",
      skipped: "Check skipped",
      inactive: "Not selected",
      unrecorded: "Not recorded",
      queued: "No update",
    }[state?.state] ?? "Docked"
  );
}

export function makeHolograms(model, scene, overview) {
  const panels = [];
  const displays = [];
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const point = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  model.traverse((object) => {
    if (object.userData.hologram_role) {
      const position = object.getWorldPosition(new THREE.Vector3());
      matrix.lookAt(overview, position, up);
      const basis = new THREE.Quaternion()
        .setFromRotationMatrix(matrix)
        .invert()
        .multiply(object.quaternion);
      panels.push({ object, position, basis });
    }
    const role = object.userData.hologram_status;
    if (!role) return;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 80;
    const context = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    sprite.scale.set(role === "slump" ? 1.95 : 2.36, 0.37, 1);
    scene.add(sprite);
    displays.push({ role, anchor: object, context, texture, sprite });
  });
  return function update(camera, review, shift, process) {
    for (const { object, position, basis } of panels) {
      matrix.lookAt(camera.position, position, up);
      object.quaternion.copy(
        rotation.setFromRotationMatrix(matrix).multiply(basis),
      );
    }
    for (const display of displays) {
      display.sprite.position.copy(display.anchor.getWorldPosition(point));
      if (display.role === "slump") display.sprite.position.y -= 0.27;
      const label = stationStatus(display.role, review, shift, process);
      if (label === display.label) continue;
      display.label = label;
      const { context, texture } = display;
      context.clearRect(0, 0, 512, 80);
      context.fillStyle = "#9af5ff";
      context.shadowColor = "#149cc8";
      context.shadowBlur = 12;
      context.font = "600 44px system-ui";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label.toUpperCase(), 256, 40, 488);
      texture.needsUpdate = true;
    }
  };
}
