"""Build four chairless, radial reviewer consoles for the Tactile control room.

The component is intentionally self-contained so scene builders can call
``build_consoles`` after creating the room floor and before placing reviewers.
Coordinates are in metres. The center argument is the hub's floor center.
"""

from __future__ import annotations

import math
from typing import Mapping, Sequence

import bpy
from mathutils import Vector


COLLECTION_NAME = "Tactile Radial Consoles"
ROLE_ORDER = ("devils_advocate", "builder", "researcher", "operator")
ROLE_LABELS = {
    "devils_advocate": "DEVIL'S ADVOCATE",
    "builder": "BUILDER",
    "researcher": "RESEARCHER",
    "operator": "OPERATOR",
}
ROLE_SUBTITLES = {
    "devils_advocate": "COUNTEREXAMPLE / RISK",
    "builder": "FEASIBILITY / DESIGN",
    "researcher": "EVIDENCE / SOURCES",
    "operator": "OPERATIONS / FLOW",
}
ROLE_COLORS = {
    "devils_advocate": (0.95, 0.075, 0.055, 1.0),
    "builder": (1.0, 0.42, 0.035, 1.0),
    "researcher": (0.0, 0.78, 0.9, 1.0),
    "operator": (0.12, 0.38, 1.0, 1.0),
}


def _material(name, rgba, *, metallic=0.0, roughness=0.35, emission=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission:
            bsdf.inputs["Emission Color"].default_value = rgba
            bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def _link_object(obj, collection):
    for current in tuple(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def _point(center, yaw, local):
    """Convert station-local (right, outward, up) coordinates to scene space."""
    x, y, z = local
    return (
        center[0] + x * math.cos(yaw) - y * math.sin(yaw),
        center[1] + x * math.sin(yaw) + y * math.cos(yaw),
        center[2] + z,
    )


def _box(collection, name, center, yaw, local, dimensions, mat, bevel=0.025,
         tilt=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=_point(center, yaw, local))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Local X is tangential, local Y points away from the hub, local Z is up.
    obj.rotation_euler = (tilt, 0.0, yaw)
    if mat:
        obj.data.materials.append(mat)
    if bevel:
        edge = obj.modifiers.new("Machined edge radius", "BEVEL")
        edge.width = bevel
        edge.segments = 3
        obj.modifiers.new("Weighted face normals", "WEIGHTED_NORMAL")
    return _link_object(obj, collection)


def _text(collection, name, body, center, yaw, local, size, mat, *, align="CENTER"):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.size = size
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.extrude = 0.0008
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.location = _point(center, yaw, local)
    # Face +Y and keep the glyphs upright. The half turn makes text's local X
    # point left from the station's outward-facing viewer, as a front face should.
    obj.rotation_euler = (math.pi / 2, 0.0, yaw + math.pi)
    if mat:
        curve.materials.append(mat)
    return obj



def _station(collection, role, center, yaw, floor_z, mats):
    """Machine console with an armored chassis and a flush slanted interface."""
    prefix = f"{ROLE_LABELS[role]} |"
    color = mats[role]

    def part(name, local, size, mat, bevel=0.025, tilt=0):
        x, y, z = local
        return _box(collection, f"{prefix} {name}", center, yaw,
                    (x, y, z + floor_z), size, mat, bevel, tilt=tilt)

    part("foundation", (0, 0.02, 0.10), (1.92, 1.04, 0.16), mats["rubber"], 0.04)
    part("armored equipment core", (0, 0, 0.48), (1.80, 0.96, 0.75), mats["alloy"], 0.12)
    part("floating worktop", (0, 0.04, 0.79), (2.12, 1.16, 0.14), mats["top"], 0.065)
    part("lower maintenance panel", (0, 0.506, 0.47), (1.20, 0.055, 0.40), mats["shell"], 0.03)
    part("inset status strip", (0, 0.538, 0.67), (1.52, 0.025, 0.035), color, 0.007)
    _text(collection, f"{prefix} identity lettering", ROLE_LABELS[role], center, yaw,
          (0, 0.540, 0.365 + floor_z), 0.10, mats["white"])
    for side in (-1, 1):
        part("replaceable flank armor", (side * .904, -.10, .49),
             (.045, .64, .36), mats["top"], .015)
        for z in (.37, .61):
            part("flank captive fastener", (side * .930, .09, z),
                 (.016, .057, .055), mats["key"], .007)
        part("recessed side status lens", (side * .929, -.24, .49),
             (.015, .14, .038), color, .008)
        part("shielded side pod", (side * 0.92, -0.10, 0.94), (0.22, 0.76, 0.36), mats["alloy"], 0.06)
        part("wear strip", (side * 0.94, 0.18, 1.126), (0.10, 0.20, 0.018), mats["amber"], 0.005)
        for fin in range(4):
            part("cooling slot", (side * (0.68 + fin * 0.06), 0.505, 0.37),
                 (0.032, 0.02, 0.24), mats["shell"], 0.007)

    # Integrated instrument glass, recessed in the enclosure. All readouts
    # follow the same plane, with no upright monitor or separate keyboard.
    tilt = 0.60
    def face(x, z, depth):
        return (x, -0.26 - math.sin(tilt)*z + math.cos(tilt)*depth,
                1.14 + math.cos(tilt)*z + math.sin(tilt)*depth)

    part("instrument cowling", face(0, 0, 0), (1.73, 0.24, 0.71), mats["alloy"], 0.052, tilt)
    part("recessed instrument glass", face(0, 0, 0.127), (1.57, 0.02, 0.58), mats["screen"], 0.031, tilt)
    for x in (-0.71, 0.71):
        part("instrument edge seal", face(x, 0, 0.145), (0.027, 0.015, 0.51), color, 0.006, tilt)
    title = _text(collection, f"{prefix} instrument title", ROLE_SUBTITLES[role], center, yaw,
                  face(0, 0.19, 0.152), 0.069, mats["white"])
    title.rotation_euler.x += tilt
    heights = {"devils_advocate": (0.19,0.04,0.13,0.07,0.21),
               "builder": (0.07,0.10,0.13,0.18,0.20),
               "researcher": (0.12,0.12,0.20,0.20,0.07),
               "operator": (0.06,0.16,0.09,0.12,0.18)}[role]
    for i, height in enumerate(heights):
        part(f"process channel {i+1}", face(-0.52 + i * 0.12, -0.21 + height/2, 0.15),
             (0.08, 0.013, height), color, 0.007, tilt)
    for i, width in enumerate((0.38,0.29,0.42,0.24)):
        part(f"telemetry trace {i+1}", face(0.40, 0.067-i*0.064, 0.15),
             (width, 0.012, 0.019), mats["cyan"] if i == 0 else mats["white"], 0.003, tilt)

    part("haptic command surface", (-0.17, 0.29, 0.882), (0.87, 0.37, 0.055), mats["shell"], 0.04)
    for i in range(3):
        part("direct control channel", (-0.34 + i * 0.18, 0.31, 0.915),
             (0.070, 0.26, 0.020), color if i == 1 else mats["key"], 0.012)
    part("service bus receiver", (0.71, 0.27, 0.89), (0.37, 0.38, 0.062), mats["alloy"], 0.04)
    part("service bus socket", (0.71, 0.27, 0.929), (0.22, 0.24, 0.025), color, 0.024)


def _aisle_markings(collection, center, floor_z, mats):
    """Inset, segmented radial lanes connect the hub to each work pod."""
    for index, role in enumerate(ROLE_ORDER):
        theta = math.radians(45 + index * 90)
        yaw = theta - math.pi / 2
        # Dark inset runner with a broken luminous center stripe.
        mid_radius = 2.51
        _box(collection, f"Aisle {role} | inset runner", center, yaw,
             (0, mid_radius, floor_z + 0.012), (0.27, 0.78, 0.018), mats["rubber"], 0.025)
        for segment, offset in enumerate((-0.27, -0.09, 0.09, 0.27)):
            _box(collection, f"Aisle {role} | guide segment {segment + 1}", center, yaw,
                 (0, mid_radius + offset, floor_z + 0.025), (0.035, 0.105, 0.012),
                 mats[role], 0.006)


def build_consoles(center: Sequence[float] = (0.0, 0.0, 0.0),
                   collection: bpy.types.Collection | None = None) -> dict[str, dict]:
    """Create four independent radial console bays and return bot anchors.

    ``center`` is the center of the circular platform at floor level. Each bay
    lies on a diagonal at radius 3.5 m; the reviewer anchor is 4.30 m from the
    hub, outside the worktop. ``yaw`` is a Blender Z rotation where a model's
    local -Y forward axis faces inward toward the hub.

    Pass a collection to control ownership. Otherwise the module creates or
    replaces its own ``Tactile Radial Consoles`` collection. Returned positions
    are visual bounding-box centers for a 1.2 m hoverbot, at z=floor+1.43 m.
    """
    if len(center) != 3:
        raise ValueError("center must be an XYZ coordinate")
    center = tuple(float(value) for value in center)
    if collection is None:
        collection = bpy.data.collections.get(COLLECTION_NAME)
        if collection:
            for obj in list(collection.objects):
                bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.collections.remove(collection)
        collection = bpy.data.collections.new(COLLECTION_NAME)
        bpy.context.scene.collection.children.link(collection)

    mats = {
        "alloy": _material("Tactile Console | dark titanium", (0.048, 0.074, 0.094, 1), metallic=0.78, roughness=0.25),
        "top": _material("Tactile Console | graphite ceramic", (0.022, 0.034, 0.049, 1), metallic=0.48, roughness=0.24),
        "shell": _material("Tactile Console | matte black polymer", (0.008, 0.014, 0.023, 1), metallic=0.22, roughness=0.3),
        "rubber": _material("Tactile Console | rubber trim", (0.006, 0.009, 0.013, 1), roughness=0.68),
        "key": _material("Tactile Console | keycaps", (0.09, 0.13, 0.16, 1), metallic=0.25, roughness=0.32),
        "screen": _material("Tactile Console | glass interface", (0.006, 0.035, 0.056, 1), metallic=0.12, roughness=0.16, emission=0.55),
        "white": _material("Tactile Console | display text", (0.54, 0.82, 0.89, 1), emission=1.35),
        "cyan": _material("Tactile Console | cyan telemetry", (0.015, 0.68, 0.91, 1), emission=2.3),
        "amber": _material("Tactile Console | amber status", (1.0, 0.34, 0.035, 1), emission=1.6),
        **{role: _material(f"Tactile Console | {role} accent", color, metallic=0.12,
                           roughness=0.25, emission=1.6)
           for role, color in ROLE_COLORS.items()},
    }

    # Vertical values in station-local coordinates are offsets from center.z.
    floor_z = 0.0
    _aisle_markings(collection, center, floor_z, mats)
    result = {}
    for index, role in enumerate(ROLE_ORDER):
        theta = math.radians(45 + index * 90)
        radius = 3.5
        station_center = (center[0] + radius * math.cos(theta),
                          center[1] + radius * math.sin(theta), center[2])
        # Console local +Y points radially outward, so its display faces the bot.
        station_yaw = theta - math.pi / 2
        _station(collection, role, station_center, station_yaw, floor_z, mats)

        bot_radius = 4.30
        bot_theta = theta
        bot_position = (center[0] + bot_radius * math.cos(bot_theta),
                        center[1] + bot_radius * math.sin(bot_theta), center[2] + 1.43)
        # A conventional bot rig faces along local -Y.
        bot_yaw = math.atan2(-math.cos(theta), math.sin(theta))
        result[role] = {"position": bot_position, "yaw": bot_yaw,
                        "station_center": station_center,
                        "station_yaw": station_yaw,
                        "control_deck": _point(station_center, station_yaw,
                                               (-0.17, 0.27, floor_z + 0.89)),
                        "terminal": _point(station_center, station_yaw,
                                           (0.71, 0.27, floor_z + 0.89))}
    return result


__all__ = ["build_consoles", "COLLECTION_NAME", "ROLE_ORDER", "ROLE_COLORS"]
