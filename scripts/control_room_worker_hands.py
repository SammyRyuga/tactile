"""Animate the supplied Worker robot's operator arms at cabinet stops.

The model has two real, segmented arms (including articulated digits), but no
IK targets.  This module keys the source rig directly; every moving part stays
skinned to its original armature.  ``route`` is accepted alongside the other
worker itinerary data so this helper can be called from the route animator.
The job tuple format is ``(cabinet_index, start_frame, end_frame)``.
"""

from __future__ import annotations

from typing import Iterable

import bpy
from mathutils import Vector


# Bone names are the model's actual control bones, not generated props.  The
# forearm/palm controls sit below the shoulder and upper-arm pivot in the rig.
_ARM_CHAINS = (
    {
        "shoulder": "Arm rotate",
        "upper": "Arm rotate main",
        "elbow": "Bone",
        "forearm": "Arm longate",
        "palm": "Bone.001",
        "digits": ("Bone.002", "Bone.004", "Bone.006", "Bone.008"),
    },
    {
        "shoulder": "Arm rotate.001",
        "upper": "Bone.024",
        "elbow": "Arm rotate.R",
        "forearm": "Arm longate.R",
        "palm": "Elbow.R",
        "digits": ("Bone.012", "Bone.014", "Bone.016", "Bone.018"),
    },
)

_FINGERTIP_BONES = {
    "left": ("Bone.003", "Bone.005", "Bone.007", "Bone.009"),
    "right": ("Bone.013", "Bone.015", "Bone.017", "Bone.019"),
}


def evaluated_fingertip_points(rig, *, frame: int | None = None):
    """Return each hand's forward-most evaluated mesh point per fingertip.

    Call after ``animate_worker_hands`` has keyed the gesture.  This samples
    the actual rigid finger meshes parented to the terminal finger bones, so
    callers can place physical controls at the interaction pose.  The result
    maps terminal bone names to copied world-space ``Vector`` values.
    """
    scene = bpy.context.scene
    previous_frame = scene.frame_current
    try:
        if frame is not None:
            scene.frame_set(frame)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated_rig = rig.evaluated_get(depsgraph)
        forward = evaluated_rig.matrix_world.to_3x3() @ Vector((0.0, -1.0, 0.0))
        forward.normalize()
        points: dict[str, list] = {name: [] for names in _FINGERTIP_BONES.values() for name in names}
        for obj in rig.children_recursive:
            bone_name = obj.parent_bone
            if obj.type != "MESH" or bone_name not in points:
                continue
            evaluated_obj = obj.evaluated_get(depsgraph)
            mesh = evaluated_obj.to_mesh()
            try:
                points[bone_name].extend(
                    evaluated_obj.matrix_world @ vertex.co for vertex in mesh.vertices
                )
            finally:
                evaluated_obj.to_mesh_clear()
        result = {}
        for bone_name, vertices in points.items():
            if vertices:
                result[bone_name] = max(vertices, key=lambda point: point.dot(forward)).copy()
        return result
    finally:
        if frame is not None and scene.frame_current != previous_frame:
            scene.frame_set(previous_frame)


def contact_point(rig, hand: str, *, frame: int | None = None):
    """Return the leading fingertip contact patch for one hand in world space.

    ``hand`` is ``"left"`` or ``"right"``.  Four physical fingertips are
    sampled from the evaluated model and averaged for placement of a broad
    panel button.
    Use :func:`evaluated_fingertip_points` to place individual controls.
    """
    if hand not in _FINGERTIP_BONES:
        raise ValueError("hand must be 'left' or 'right'")
    scene = bpy.context.scene
    previous_frame = scene.frame_current
    try:
        if frame is not None:
            scene.frame_set(frame)
        points = evaluated_fingertip_points(rig)
        samples = [points[name] for name in _FINGERTIP_BONES[hand] if name in points]
        if not samples:
            raise ValueError(f"No evaluated fingertip geometry found for {hand} hand")
        evaluated_rig = rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
        forward = evaluated_rig.matrix_world.to_3x3() @ Vector((0.0, -1.0, 0.0))
        forward.normalize()
        leading = max(point.dot(forward) for point in samples)
        contact_pair = [point for point in samples if leading - point.dot(forward) <= 0.01]
        return sum(contact_pair, contact_pair[0].copy() * 0.0) / len(contact_pair)
    finally:
        if frame is not None and scene.frame_current != previous_frame:
            scene.frame_set(previous_frame)


def _key_pose(bones, frame: int, *, reach: float, flex: float, press: float) -> None:
    """Key both arm chains with a restrained, shoulder-led control reach."""
    for chain in _ARM_CHAINS:
        shoulder = bones[chain["shoulder"]]
        upper = bones[chain["upper"]]
        elbow = bones[chain["elbow"]]
        forearm = bones[chain["forearm"]]
        palm = bones[chain["palm"]]

        for bone in (shoulder, upper, elbow, forearm, palm):
            bone.rotation_mode = "XYZ"

        # The source arms rest slightly forward already.  Small pitch changes
        # reach toward a face-height panel without locking the joints straight.
        shoulder.rotation_euler = (0.0, 0.0, 0.0)
        upper.rotation_euler = (reach, 0.0, 0.0)
        elbow.rotation_euler = (-flex, 0.0, 0.0)
        forearm.rotation_euler = (flex * 0.35, 0.0, 0.0)
        palm.rotation_euler = (-0.02 - press * 0.12, 0.0, 0.0)
        for bone in (shoulder, upper, elbow, forearm, palm):
            bone.keyframe_insert(data_path="rotation_euler", frame=frame, group="Cabinet interaction")

        # Four finger roots curl just enough to brace a button or panel edge.
        # The distal bones inherit this motion and remain attached to the hand.
        for name in chain["digits"]:
            digit = bones[name]
            digit.rotation_mode = "XYZ"
            digit.rotation_euler = (press * 0.22, 0.0, 0.0)
            digit.keyframe_insert(data_path="rotation_euler", frame=frame, group="Cabinet interaction")


def animate_worker_hands(
    rig,
    anchor,
    route: Iterable[tuple[int, float, float, float]],
    jobs: Iterable[tuple[int, int, int]],
    scale: float,
    label: str,
    collection=None,
    action=None,
):
    """Animate the original paired armature chains only while the worker stops.

    ``route`` and ``collection`` are included in the public signature to match
    the worker route builder and leave room for scene-specific targets.  The
    current model is animated with its real armature, so this helper creates
    no follower empties or loose hand parts.  Supply the existing rig action
    to preserve its wheel channels; when omitted a dedicated action is made.
    """
    del anchor, route, scale, collection
    bones = rig.pose.bones
    missing = [name for chain in _ARM_CHAINS for name in
               (chain["shoulder"], chain["upper"], chain["elbow"], chain["forearm"], chain["palm"], *chain["digits"])
               if bones.get(name) is None]
    if missing:
        raise ValueError(f"Worker rig is missing arm controls: {', '.join(missing)}")

    if action is None:
        action = bpy.data.actions.new(f"{label} | wheel and service gestures")
        rig.animation_data_create()
        rig.animation_data.action = action
        if hasattr(action, "slots") and not len(action.slots):
            rig.animation_data.action_slot = action.slots.new(id_type="OBJECT", name=rig.name)

    scene = bpy.context.scene
    first_frame = scene.frame_start
    # Establish a neutral arm pose before any work starts, so no source action
    # or initial Blender pose leaves the hands reaching while the courier moves.
    _key_pose(bones, first_frame, reach=0.0, flex=0.0, press=0.0)
    for _, start, end in jobs:
        # Ease into the stop, touch controls briefly, then retract before travel.
        beats = (
            (max(first_frame, start - 8), 0.0, 0.0, 0.0),
            (start, 0.05, 0.0, 0.0),
            (start + 8, 0.20, 0.08, 0.0),
            (start + 13, 0.30, 0.18, 0.55),
            (end - 12, 0.30, 0.18, 0.55),
            (end - 6, 0.18, 0.08, 0.0),
            (end, 0.0, 0.0, 0.0),
        )
        for frame, reach, flex, press in beats:
            if frame > end:
                continue
            _key_pose(bones, frame, reach=reach, flex=flex, press=press)

    # Smooth, controlled starts and stops; preserve any existing wheel curves.
    if hasattr(action, "layers"):
        curves = []
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    bag = strip.channelbag(slot)
                    if bag:
                        curves.extend(bag.fcurves)
    else:
        curves = list(action.fcurves)
    for curve in curves:
        if curve.group and curve.group.name == "Cabinet interaction":
            for key in curve.keyframe_points:
                key.interpolation = "BEZIER"
                key.handle_left_type = "AUTO_CLAMPED"
                key.handle_right_type = "AUTO_CLAMPED"
    return action
