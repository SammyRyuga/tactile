"""Stage Tactile's four reviewer hoverbots and floating Slump head.

Call ``stage_actors({role: (x, y, z), ...})`` from Blender after choosing a
scene. The supplied actor ZIPs are read in place and extracted only to temp.
The current scene is preserved; only actor source cameras, lights, and temporary
library debris are removed. Call after creating the room geometry.
"""

from __future__ import annotations

import math
import sys
import tempfile
from pathlib import Path
from random import Random
from typing import Mapping, Sequence

import bpy
import bmesh
from mathutils import Matrix, Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import blender_reviewer_bots as reviewers
import steelman_bots_scene as actors
from control_room_workers import PATROL_END

MODELS_DIR = Path("build/operator-room-inputs")
REVIEWER_HEIGHT = 1.2
SLUMP_HEIGHT = 1.05
SLUMP_CENTER = (0.0, 0.0, 2.75)
# The source layers a second, blue variant and studio props at the same origin.
# Keep the original orange head mesh and its own armature.
SLUMP_ORANGE_OBJECTS = ("Armature", "Plane.001")
WORK_PACE = {
    "devils_advocate": (347, 64, 99),
    "builder": (521, 73, 123),
    "researcher": (733, 102, 151),
    "operator": (907, 78, 114),
}


def reviewer_work_cycles(role):
    """Generate reproducible work and observation intervals for one station."""
    seed, low, high = WORK_PACE[role]
    rng = Random(seed)
    frame = 1
    while frame < PATROL_END:
        duration = min(rng.randint(low, high), PATROL_END - frame)
        if duration < 30:
            break
        yield frame, duration
        frame += duration


def finish_actor_materials():
    """Give the imported robots exportable lens, coating, and metal surfaces."""
    for mat in bpy.data.materials:
        part, _, role = mat.name.rpartition(" - ")
        reviewer_part = role in WORK_PACE
        worker_part = mat.name.split(".")[0] in {"Body", "Head"}
        if not mat.users or not (reviewer_part or worker_part):
            continue
        component = reviewers._material_role(part) if reviewer_part else "shell"
        color = tuple(mat.diffuse_color)
        metal, roughness, coat = .62, .44, .0
        if component == "shell":
            color = tuple(channel * .75 + .009 for channel in color[:3]) + (1.,)
            metal, roughness, coat = .33, .38, .24
        elif component == "eye":
            metal, roughness, coat = .06, .24, .20
        mat.diffuse_color = color
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Metallic"].default_value = metal
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Coat Weight"].default_value = coat
        shader.inputs["Coat Roughness"].default_value = .32
        if component == "eye":
            shader.inputs["Emission Color"].default_value = color
            shader.inputs["Emission Strength"].default_value = .13
        output = nodes.new("ShaderNodeOutputMaterial")
        mat.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
        mat["control_room_finish"] = True


def _make_cycle(action) -> None:
    if action is None:
        return
    for curve in reviewers._animation_curves(action):
        if not any(modifier.type == "CYCLES" for modifier in curve.modifiers):
            curve.modifiers.new("CYCLES")


def _slump_eye_material() -> bpy.types.Material:
    """Create a glTF-friendly red eye material using Principled emission."""
    material = bpy.data.materials.get("Slump | red eye glow")
    if material is None:
        material = bpy.data.materials.new("Slump | red eye glow")
    material.diffuse_color = (1.0, 0.018, 0.012, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = (0.8, 0.008, 0.004, 1.0)
        shader.inputs["Roughness"].default_value = 0.24
        emission = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
        if emission:
            emission.default_value = (1.0, 0.012, 0.006, 1.0)
        strength = shader.inputs.get("Emission Strength")
        if strength:
            strength.default_value = 6.0
    return material


def _add_slump_eyes(armature: bpy.types.Object) -> bpy.types.Object:
    """Add two small, bone-weighted lenses to the front of the source head."""
    mesh = bpy.data.meshes.new("Slump | eye lens geometry")
    bm = bmesh.new()
    # Source coordinates: the face points along -Y, near the upper front of the
    # bust. Convert them to the motion anchor's centered local space.
    for x in (-0.155, 0.155):
        result = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
        eye_verts = result["verts"]
        bmesh.ops.scale(bm, verts=eye_verts, vec=Vector((0.063, 0.028, 0.063)))
        bmesh.ops.translate(bm, verts=eye_verts, vec=Vector((x, -0.985, 1.59)))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    lenses = bpy.data.objects.new("Slump | glowing eyes", mesh)
    bpy.data.collections["Tactile Actors"].objects.link(lenses)
    # The source mesh is armature-parented in armature-local coordinates, so
    # this matches its transform and lets the head vertex weights deform it.
    lenses.parent = armature
    lenses.matrix_parent_inverse = Matrix.Identity(4)
    lenses.data.materials.append(_slump_eye_material())
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    group = lenses.vertex_groups.new(name="head")
    group.add(list(range(len(mesh.vertices))), 1.0, "REPLACE")
    deform = lenses.modifiers.new("Follow Slump head", "ARMATURE")
    deform.object = armature
    deform.use_deform_preserve_volume = True
    return lenses


def _animate_slump_head(armature: bpy.types.Object) -> None:
    """Let Slump look gently from one desk group to the other and back."""
    pose = armature.pose.bones.get("head")
    if pose is None:
        return
    pose.rotation_mode = "XYZ"
    rng = Random(417)
    glances = ((-.46, .10), (-.23, .04), (.16, .06), (.46, .10), (0, -.035))
    poses = [(1, 0., 0.), (42, -.25, .055), (82, 0., -.025), (122, .25, .055)]
    frame, previous = 140, 2
    while frame < PATROL_END - 105:
        index = rng.choice([i for i in range(len(glances)) if i != previous])
        yaw, pitch = glances[index]
        settle = frame + rng.randint(18, 30)
        end = settle + rng.randint(34, 69)
        poses.extend(((settle, yaw, pitch), (end, yaw, pitch + rng.uniform(.006, .022))))
        frame, previous = end, index
    poses.append((PATROL_END, 0., 0.))
    for frame, yaw, nod in poses:
        pose.rotation_euler = (nod, 0.0, yaw)
        pose.keyframe_insert(data_path="rotation_euler", frame=frame, group="Attentive head")
    action = armature.animation_data.action if armature.animation_data else None
    if action:
        for curve in reviewers._animation_curves(action):
            for key in curve.keyframe_points:
                key.interpolation = "BEZIER"
            curve.update()
        _make_cycle(action)


def _add_yaw_offset(root: bpy.types.Object, yaw: float, center: Sequence[float]) -> None:
    """Rotate the rig around its visual center instead of the source pivot."""
    if not yaw or not root.animation_data or not root.animation_data.action:
        root.rotation_euler.z = yaw
        return
    offset = root.location - Vector(center)
    correction = Matrix.Rotation(yaw, 3, "Z") @ offset - offset
    for curve in reviewers._animation_curves(root.animation_data.action):
        if curve.data_path == "rotation_euler" and curve.array_index == 2:
            for key in curve.keyframe_points:
                key.co.y += yaw
            curve.update()
        if curve.data_path == "location" and curve.array_index < 2:
            for key in curve.keyframe_points:
                key.co.y += correction[curve.array_index]
            curve.update()


def _unpack_position(value: Sequence[float]) -> tuple[tuple[float, float, float], float]:
    if len(value) not in (3, 4):
        raise ValueError("Each placement must be (x, y, z) or (x, y, z, yaw)")
    return (float(value[0]), float(value[1]), float(value[2])), (float(value[3]) if len(value) == 4 else 0.0)


def _exchange_motion(collection, bot, role, home, outward, begin, end):
    """Lift clear of the desk, turn, and lower to the courier's reach."""
    pivot = bpy.data.objects.new(f"{role} / exchange pivot", None)
    pivot["reviewer_id"] = role
    pivot["exchange_frames"] = (begin - 44, end + 56)
    collection.objects.link(pivot)
    bot.parent = pivot
    bot.matrix_parent_inverse = Matrix.Translation(-home)
    poses = (
        (1, 0, 0, 0),
        (begin - 44, 0, 0, 0),
        (begin - 31, .33, .13, 0),
        (begin - 17, .33, .13, math.pi / 2),
        (begin - 3, .29, -.38, math.pi),
        (end, .29, -.38, math.pi),
        (end + 15, .33, .13, math.pi),
        (end + 29, .33, .13, math.pi / 2),
        (end + 43, .33, .13, 0),
        (end + 56, 0, 0, 0),
        (PATROL_END, 0, 0, 0),
    )
    for frame, travel, rise, turn in poses:
        pivot.location = home + outward * travel + Vector((0, 0, rise))
        pivot.rotation_euler.z = turn
        pivot.keyframe_insert(data_path="location", frame=frame)
        pivot.keyframe_insert(data_path="rotation_euler", frame=frame)
    return poses


def reviewer_finger_point(scene, role, frame, destination):
    """Find the nearest point on the actual posed gripper surface."""
    scene.frame_set(frame)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    fingers = bpy.data.objects[f"{role} | fingers_L"].evaluated_get(depsgraph)
    inverse = fingers.matrix_world.inverted()
    hit, point, _, _ = fingers.closest_point_on_mesh(inverse @ destination, depsgraph=depsgraph)
    if not hit:
        raise RuntimeError(f"No gripper geometry for {role}")
    return fingers.matrix_world @ point


def aim_reviewer_hands(staged, consoles, handoffs):
    """Give the arm IK explicit targets on the machine interface."""
    collection = bpy.data.collections["Tactile Actors"]
    for role, desk in consoles.items():
        if role not in staged:
            continue
        rig = bpy.data.objects[staged[role]["armature"]]
        rig.animation_data.action = None
        for bone in rig.pose.bones:
            bone.matrix_basis = Matrix.Identity(4)
        head = rig.pose.bones["head"]
        head.rotation_mode = "XYZ"
        exchange = handoffs.get(role)

        def interrupted(frame):
            return bool(exchange and exchange[0] - 44 <= frame <= exchange[1] + 56)

        cycles = list(reviewer_work_cycles(role))
        seed, _, _ = WORK_PACE[role]
        gaze = Random(seed + 1)
        for start, duration in cycles:
            turn = gaze.uniform(-.15, .15)
            for progress, pitch, yaw in (
                (0, .02, 0), (.18, gaze.uniform(.07, .13), -.045),
                (.48, -.025, turn), (.68, -.016, turn), (.90, .025, 0),
            ):
                frame = start + round(duration * progress)
                if not interrupted(frame):
                    head.rotation_euler = (pitch, 0, yaw)
                    head.keyframe_insert(data_path="rotation_euler", frame=frame)
        if exchange:
            begin, end, _ = exchange
            for frame, pitch, turn in (
                (begin - 44, 0.02, 0), (begin - 3, 0.04, 0),
                (begin + 16, 0.19, 0.10), (end, 0.12, 0.08), (end + 56, 0.02, 0),
            ):
                head.rotation_euler = (pitch, 0, turn)
                head.keyframe_insert(data_path="rotation_euler", frame=frame)
        deck = Vector(desk["control_deck"])
        terminal = Vector(desk["terminal"])
        yaw = desk["station_yaw"]
        lateral = Vector((math.cos(yaw), math.sin(yaw), 0))
        toward_bot = Vector((-math.sin(yaw), math.cos(yaw), 0))
        home_center = Vector(desk["position"])
        poses = _exchange_motion(collection, staged[role], role, home_center, toward_bot,
                                 exchange[0], exchange[1]) if exchange else ()
        for side, sign in (("L", 1), ("R", -1)):
            arm = rig.pose.bones[f"lower_arm_{side}"]
            ik = next(constraint for constraint in arm.constraints if constraint.type == "IK")
            target = bpy.data.objects.new(f"{role} / {side} control reach", None)
            collection.objects.link(target)
            target.empty_display_size = 0.045
            ik.target = target
            ik.use_stretch = False
            home = deck + sign * 0.19 * lateral + 0.10 * toward_bot
            branch = terminal - 0.16 * lateral + 0.17 * toward_bot if sign > 0 else home - 0.13 * lateral
            gestures = Random(seed + (2 if side == "L" else 3))
            for start, duration in cycles:
                delay = .03 if side == "L" else .12
                tap = home + sign * gestures.uniform(.036, .076) * lateral
                beats = [(0, home, .17), (.12 + delay, home, .11), (.27 + delay, tap, .15)]
                if gestures.random() < .75:
                    beats.append((.35 + delay, tap, .11))
                beats.append((.54, home, .18))
                if gestures.random() < (.68 if side == "L" else .40):
                    beats.extend(((.65, branch, .17), (.73, branch, .11), (.81, branch, .19)))
                beats.append((.91, home, .16))
                for progress, point, rise in beats:
                    frame = start + round(duration * progress)
                    if interrupted(frame):
                        continue
                    target.location = point + Vector((0, 0, rise))
                    target.keyframe_insert(data_path="location", frame=frame)
            target.location = home + Vector((0, 0, .17))
            target.keyframe_insert(data_path="location", frame=PATROL_END)
            if exchange:
                begin, end, contact = exchange
                target.location = home + Vector((0, 0, .17))
                for frame in (begin - 44, end + 56):
                    target.keyframe_insert(data_path="location", frame=frame)
                for frame, travel, rise, turn in poses[2:-2]:
                    parked = -toward_bot * .15 + lateral * (sign * .26)
                    target.location = (home_center + toward_bot * travel
                                       + Matrix.Rotation(turn, 3, "Z") @ parked
                                       + Vector((0, 0, rise - .33)))
                    target.keyframe_insert(data_path="location", frame=frame)
                if side == "L":
                    contact_frames = (begin + 13, begin + 15, end - 12)
                    wrist = contact - toward_bot * .085 + Vector((0, 0, .045))
                    for _ in range(6):
                        for frame in contact_frames:
                            target.location = wrist
                            target.keyframe_insert(data_path="location", frame=frame)
                        nearest = reviewer_finger_point(bpy.context.scene, role, begin + 15, contact)
                        delta = contact - nearest
                        if delta.length < .007:
                            break
                        wrist += delta * .78
        # The original source action picks up a toolbox. At the consoles the
        # reviewer handles fixed controls, and the mobile units carry supplies.
        toolbox = bpy.data.objects.get(f"{role} | toolbox_handle")
        if toolbox:
            for prop in (toolbox, *toolbox.children_recursive):
                prop.hide_render = True
                prop.hide_set(True)


def stage_actors(
    placements: Mapping[str, Sequence[float]],
    *,
    models_dir: str | Path = MODELS_DIR,
    hoverbot_archive: str | Path = reviewers.DEFAULT_ARCHIVE,
) -> dict[str, bpy.types.Object]:
    """Add actors to the current room and return role/head motion anchors.

    Reviewer placements are center anchors; each accepts XYZ or XYZ plus yaw
    in radians. Slump is centered at ``(0, 0, 2.75)`` and has a subtle floating
    cycle. Returned keys are the four reviewer role ids plus ``"slump"``.
    """
    unknown = set(placements) - set(reviewers.SKINS)
    if unknown:
        raise ValueError(f"Unknown reviewer ids: {', '.join(sorted(unknown))}")
    positions = {role: _unpack_position(value) for role, value in placements.items()}
    scene = bpy.context.scene
    collection = bpy.data.collections.get("Tactile Actors")
    if collection is None:
        collection = bpy.data.collections.new("Tactile Actors")
        scene.collection.children.link(collection)
    staged: dict[str, bpy.types.Object] = {}

    if positions:
        staged.update(reviewers.append_reviewer_bots(
            {role: coords for role, (coords, _) in positions.items()},
            source_archive=hoverbot_archive,
            target_collection=collection,
            target_height=REVIEWER_HEIGHT,
            hover_amplitude=0.025,
        ))
        # Source append objects are just a staging cache; clones own their mesh,
        # actions, materials and rig targets, so remove these unused originals.
        source_collection = bpy.data.collections.get("_tactile_hoverbot_source")
        if source_collection:
            for obj in list(source_collection.objects):
                bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.collections.remove(source_collection)
        for role, (position, yaw) in positions.items():
            _add_yaw_offset(staged[role], yaw, position)
            armature_name = staged[role].get("armature")
            armature = bpy.data.objects.get(armature_name) if armature_name else None
            if armature and armature.animation_data:
                _make_cycle(armature.animation_data.action)

    model_root = Path(models_dir)
    slump_archive = model_root / "Slump.zip"
    if not slump_archive.is_file():
        raise FileNotFoundError(f"Slump archive not found in {model_root}")
    with tempfile.TemporaryDirectory(prefix="tactile-slump-") as temp:
        source = actors.blend_from_archive(slump_archive, temp)
        anchor, _ = actors.append_bot_from_model(
            source, collection, "Slump", SLUMP_HEIGHT, SLUMP_CENTER, "idle",
            object_names=SLUMP_ORANGE_OBJECTS,
        )
        armature = bpy.data.objects.get("Slump | Armature")
        if armature:
            _animate_slump_head(armature)
            _add_slump_eyes(armature)
        anchor["actor_name"] = "Slump floating head"
        anchor["motion"] = "subtle hover"
        _make_cycle(anchor.animation_data.action if anchor.animation_data else None)
        staged["slump"] = anchor

    scene.frame_start, scene.frame_end = 1, 160
    scene.render.fps = 24
    scene.frame_set(1)
    return staged
