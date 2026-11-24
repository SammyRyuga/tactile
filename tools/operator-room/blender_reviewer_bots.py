"""Append four animated Maintenance Hoverbots as Tactile reviewers.

The source ZIP stays in the user's local model directory. Its one Blender file
is extracted to a temporary directory at run time and never copied to the repo.
"""

from __future__ import annotations

import os
import tempfile
import zipfile
from pathlib import Path
from typing import Mapping, Sequence

import bpy
from mathutils import Matrix, Vector


DEFAULT_ARCHIVE = Path(os.environ.get(
    "TACTILE_HOVERBOT_ARCHIVE",
    "build/operator-room-inputs/Maintenance Hoverbot - rigged animated.zip",
))
MODEL_MEMBER = "bot_normal_toolbox2.blend"
NON_BOT_OBJECTS = {
    "Camera", "Camera.001", "Lamp", "Lamp.001", "Plane", "mat_bareoak",
    "Empty", "EXP_NAME",
}
# The toolbox and hand tools are useful props, but they distort the scale
# calculation. Size and center the character from its body, head, and limbs.
SCALE_EXCLUDED = {
    "toolbox", "toolbox_handle", "hammer_handle", "hammer_head",
    "screwdriver", "wrench", "wrench.001", "KBD BASE", "KEYS",
}

# Shell, toolbox, and eye colors for the four reviewer roles.
SKINS = {
    "devils_advocate": {"shell": (0.42, 0.09, 0.075, 1), "toolbox": (0.65, 0.20, 0.08, 1), "eye": (1.0, 0.16, 0.10, 1)},
    "researcher": {"shell": (0.025, 0.31, 0.36, 1), "toolbox": (0.06, 0.48, 0.51, 1), "eye": (0.15, 0.95, 0.9, 1)},
    "builder": {"shell": (0.7, 0.28, 0.035, 1), "toolbox": (0.95, 0.46, 0.045, 1), "eye": (1.0, 0.60, 0.08, 1)},
    "operator": {"shell": (0.08, 0.22, 0.45, 1), "toolbox": (0.14, 0.36, 0.64, 1), "eye": (0.18, 0.85, 0.5, 1)},
}


def _material_role(name: str) -> str | None:
    """Recognize role materials even when Blender appends .001 on import."""
    base = name.lower().split(".", 1)[0]
    if base in {"plastic", "star_ship_hull1", "hat_body"}:
        return "shell"
    if base in {"keyboard", "keys"}:
        return "toolbox"
    if base in {"eye_glow", "back iris", "lens"}:
        return "eye"
    return None


def _set_material_color(material: bpy.types.Material, rgba: Sequence[float]) -> None:
    material.diffuse_color = rgba
    if not material.use_nodes or not material.node_tree:
        return
    for node in material.node_tree.nodes:
        if node.type != "BSDF_PRINCIPLED":
            continue
        base = node.inputs.get("Base Color")
        if base is not None:
            base.default_value = rgba
        if "eye" in material.name.lower():
            emission = node.inputs.get("Emission Color") or node.inputs.get("Emission")
            strength = node.inputs.get("Emission Strength")
            if emission is not None:
                emission.default_value = rgba
            if strength is not None:
                strength.default_value = max(1.0, strength.default_value)


def _animation_curves(action):
    if hasattr(action, "layers"):
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    bag = strip.channelbag(slot)
                    if bag:
                        yield from bag.fcurves
    elif hasattr(action, "fcurves"):
        yield from action.fcurves


def _make_cyclic(action) -> None:
    for curve in _animation_curves(action):
        if not any(modifier.type == "CYCLES" for modifier in curve.modifiers):
            curve.modifiers.new("CYCLES")


def _extract_model(archive_path: Path, scratch: Path) -> Path:
    if not archive_path.is_file():
        raise FileNotFoundError(f"Maintenance Hoverbot archive not found: {archive_path}")
    with zipfile.ZipFile(archive_path) as archive:
        try:
            member = archive.getinfo(MODEL_MEMBER)
        except KeyError as error:
            raise FileNotFoundError(f"{MODEL_MEMBER} missing from {archive_path}") from error
        # Extract only the exact known model filename; no archive paths are
        # trusted or expanded, so traversal entries cannot escape scratch.
        target = scratch / MODEL_MEMBER
        target.write_bytes(archive.read(member))
    return target


def _source_bounds(objects):
    geometry = [obj for obj in objects if obj.type == "MESH" and obj.name not in SCALE_EXCLUDED]
    points = [obj.matrix_world @ Vector(corner) for obj in geometry for corner in obj.bound_box]
    if not points:
        raise ValueError("Maintenance Hoverbot contains no mesh geometry")
    low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    return low, high


def _append_source(source_path: Path, collection: bpy.types.Collection):
    with bpy.data.libraries.load(str(source_path), link=False) as (source, target):
        target.objects = [name for name in source.objects if name not in NON_BOT_OBJECTS]
    objects = [obj for obj in target.objects if obj is not None]
    for obj in objects:
        collection.objects.link(obj)
    bpy.context.view_layer.update()
    return objects


def _skin_bot(source_objects, reviewer: str, root: bpy.types.Object,
              destination: bpy.types.Collection, target_height: float):
    clones = {}
    for source in source_objects:
        clone = source.copy()
        if source.data is not None:
            clone.data = source.data.copy()
        clone.name = f"{reviewer} | {source.name}"
        destination.objects.link(clone)
        clones[source] = clone

    material_cache = {}
    for source, clone in clones.items():
        if clone.type == "MESH" and clone.data:
            for slot_index, material in enumerate(source.data.materials):
                if material is None:
                    continue
                key = material.name
                if key not in material_cache:
                    copy = material.copy()
                    copy.name = f"{material.name} - {reviewer}"
                    role = _material_role(material.name)
                    if role:
                        _set_material_color(copy, SKINS[reviewer][role])
                    material_cache[key] = copy
                clone.data.materials[slot_index] = material_cache[key]
        if source.parent in clones:
            clone.parent = clones[source.parent]
            clone.matrix_parent_inverse = source.matrix_parent_inverse.copy()
        for modifier in clone.modifiers:
            target = getattr(modifier, "object", None)
            if target in clones:
                modifier.object = clones[target]
        for constraint in clone.constraints:
            target = getattr(constraint, "target", None)
            if target in clones:
                constraint.target = clones[target]

    armature = next((clone for source, clone in clones.items() if source.type == "ARMATURE"), None)
    if armature is None:
        raise RuntimeError("Maintenance Hoverbot model contains no armature")
    action = armature.animation_data.action if armature.animation_data else None
    if action is not None:
        action = action.copy()
        action.name = f"{reviewer} | hoverbot work cycle"
        armature.animation_data.action = action
        _make_cyclic(action)

    # The source model includes toolbox and hand tools but not the studio floor,
    # so size from the imported character assembly's evaluated local bounds.
    low, high = _source_bounds(source_objects)
    source_center = (low + high) * 0.5
    source_height = max(high.z - low.z, 0.001)
    scale = target_height / source_height
    for clone in clones.values():
        if clone.parent is None:
            source = next(original for original, candidate in clones.items() if candidate is clone)
            clone.parent = root
            clone.matrix_parent_inverse = Matrix.Identity(4)
            clone.matrix_basis = source.matrix_world.copy()
    root.scale = (scale, scale, scale)
    root["reviewer_id"] = reviewer
    root["armature"] = armature.name
    root["source_work_action"] = action.name if action else "none"
    root["source_height"] = source_height
    return armature, action, source_center, scale


def _add_hover_loop(root: bpy.types.Object, reviewer: str, base_location: Vector,
                    amplitude: float, period: int) -> bpy.types.Action:
    action = bpy.data.actions.new(f"{reviewer} | hover loop")
    root.animation_data_create()
    root.animation_data.action = action
    if hasattr(action, "slots") and len(action.slots) == 0:
        slot = action.slots.new(id_type="OBJECT", name=root.name)
        root.animation_data.action_slot = slot
    # Gentle rise, settle, and return to the same pose at the loop boundary.
    keys = ((1, 0.0, -0.012), (period // 4, amplitude, 0.0),
            (period // 2, 0.0, 0.012), (3 * period // 4, -amplitude, 0.0),
            (period, 0.0, -0.012))
    for frame, offset, yaw in keys:
        root.location = (base_location.x, base_location.y, base_location.z + offset)
        root.rotation_euler.z = yaw
        root.keyframe_insert(data_path="location", frame=frame, group="Hover")
        root.keyframe_insert(data_path="rotation_euler", frame=frame, group="Hover")
    _make_cyclic(action)
    return action


def append_reviewer_bots(
    positions: Mapping[str, Sequence[float] | Vector],
    *,
    source_archive: str | os.PathLike = DEFAULT_ARCHIVE,
    target_collection: bpy.types.Collection | None = None,
    target_height: float = 1.05,
    hover_amplitude: float = 0.035,
    hover_period: int = 48,
) -> dict[str, bpy.types.Object]:
    """Append one skinned Maintenance Hoverbot per reviewer role.

    `positions` maps reviewer ids to XYZ anchors at each existing workstation.
    Z is the hoverbot's visual center. Returned placement Empties expose
    `armature`, `source_work_action`, and `hover_action` custom properties.
    """
    unknown = set(positions) - set(SKINS)
    if unknown:
        raise ValueError(f"Unknown reviewer ids: {', '.join(sorted(unknown))}")
    if target_height <= 0 or hover_period < 4:
        raise ValueError("target_height must be positive and hover_period at least 4")
    if not positions:
        return {}

    scene = bpy.context.scene
    destination = target_collection or scene.collection
    result = {}
    with tempfile.TemporaryDirectory(prefix="tactile-hoverbot-") as temp_name:
        temp = Path(temp_name)
        source_path = _extract_model(Path(source_archive), temp)
        source_collection = bpy.data.collections.new("_tactile_hoverbot_source")
        scene.collection.children.link(source_collection)
        source_objects = _append_source(source_path, source_collection)
        low, high = _source_bounds(source_objects)
        source_center = (low + high) * 0.5
        source_height = max(high.z - low.z, 0.001)

        for reviewer, position in positions.items():
            location = Vector(position)
            collection = bpy.data.collections.new(f"Reviewer Hoverbot - {reviewer}")
            destination.children.link(collection)
            root = bpy.data.objects.new(f"{reviewer} hoverbot placement", None)
            root.empty_display_type = "CIRCLE"
            root.empty_display_size = 0.16
            collection.objects.link(root)
            armature, work_action, center, scale = _skin_bot(
                source_objects, reviewer, root, collection, target_height,
            )
            # Position the bounding-box center at the station anchor while
            # retaining the model's original rig and object transforms.
            root.location = location - source_center * scale
            root["target_height"] = target_height
            root["hover_action"] = f"{reviewer} | hover loop"
            hover_action = _add_hover_loop(root, reviewer, root.location.copy(), hover_amplitude, hover_period)
            root["hover_action"] = hover_action.name
            result[reviewer] = root

        source_collection.hide_render = True
        source_collection.hide_viewport = True
    return result
