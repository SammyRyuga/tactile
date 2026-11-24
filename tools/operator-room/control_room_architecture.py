"""Procedural octagonal control-room architecture for the Tactile scene.

Import this module from a Blender Python script and call ``build_architecture()``.
The room is centered at the origin with its floor at z=0. The southeast-facing
octagonal wall bay is intentionally open for the overview camera and approach.
"""

from __future__ import annotations

import math

import bpy


COLLECTION_NAME = "Tactile | Control Room Architecture"
ROOM_RADIUS = 8.0
FLOOR_Z = 0.0


def _material(name, color, metallic=0.0, roughness=0.35, emission=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if roughness >= 0.65:
        bsdf.inputs["Specular IOR Level"].default_value = 0.19
    if emission:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def _link_only(obj, collection):
    for linked in list(obj.users_collection):
        linked.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def _box(collection, name, location, dimensions, mat, rotation=0.0, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    obj.rotation_euler[2] = rotation
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Machined edge radius", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        obj.modifiers.new("Weighted panel normals", "WEIGHTED_NORMAL")
    return _link_only(obj, collection)


def _cylinder(collection, name, location, radius, depth, mat, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    mod = obj.modifiers.new("Soft perimeter edge", "BEVEL")
    mod.width = 0.035
    mod.segments = 2
    obj.modifiers.new("Weighted surface normals", "WEIGHTED_NORMAL")
    return _link_only(obj, collection)


def _octagon_mesh(collection, name, radius, bottom, top, mat, sides=8, phase=22.5):
    verts = []
    for z in (bottom, top):
        verts.extend((radius * math.cos(math.radians(phase + i * 360 / sides)),
                      radius * math.sin(math.radians(phase + i * 360 / sides)), z)
                     for i in range(sides))
    faces = [tuple(range(sides - 1, -1, -1)), tuple(range(sides, 2 * sides))]
    faces.extend((i, (i + 1) % sides, (i + 1) % sides + sides, i + sides) for i in range(sides))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], faces)
    uv = mesh.uv_layers.new(name="Deck tile UV")
    for face in mesh.polygons:
        for loop in face.loop_indices:
            x, y, z = mesh.vertices[mesh.loops[loop].vertex_index].co
            uv.data[loop].uv = (x * .62, y * .62 if len(face.vertices) > 4 else z * .62)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def _edge_frame(collection, prefix, midpoint, tangent_angle, inward, length, z, mats):
    """A recessed window/monitor bay framed in the plane of a perimeter wall."""
    rot = tangent_angle
    def at_inset(distance, height):
        return (midpoint[0] + inward[0] * distance,
                midpoint[1] + inward[1] * distance, height)
    # Layered outer cladding and a dark recess give the wall a deep machined look.
    _box(collection, f"{prefix} | bay backing", at_inset(0.24, z),
         (length, 0.28, 2.58), mats["cladding"], rot, 0.055)
    _box(collection, f"{prefix} | inset shadow", at_inset(0.40, z + 0.10),
         (length - 0.48, 0.045, 1.98), mats["shadow"], rot, 0.025)
    # A broad smoked viewport with slender mullions reads as a window or inactive display.
    _box(collection, f"{prefix} | viewport glass", at_inset(0.43, z + 0.10),
         (length - 0.64, 0.018, 1.67), mats["glass"], rot, 0.018)
    for xoff in (-length * 0.30, 0.0, length * 0.30):
        x, y = midpoint
        x += math.cos(rot) * xoff
        y += math.sin(rot) * xoff
        _box(collection, f"{prefix} | mullion", (x + inward[0] * 0.47, y + inward[1] * 0.47, z + 0.10),
             (0.055, 0.055, 1.94), mats["steel"], rot, 0.012)
    # Thin cyan status bars above and below each recessed bay.
    _box(collection, f"{prefix} | upper light", at_inset(0.47, z + 1.23),
         (length - 0.45, 0.035, 0.045), mats["cyan"], rot, 0.012)
    _box(collection, f"{prefix} | lower light", at_inset(0.47, z - 1.04),
         (length - 0.72, 0.035, 0.028), mats["cyan_dim"], rot, 0.009)
    # Three lit diagnostic tiles behind the glazing make the far ring read as
    # an active control room. Their subdued dark face keeps console colors primary.
    for tile, xoff in enumerate((-length * 0.27, 0.0, length * 0.27), start=1):
        tx = midpoint[0] + math.cos(rot) * xoff + inward[0] * 0.49
        ty = midpoint[1] + math.sin(rot) * xoff + inward[1] * 0.49
        _box(collection, f"{prefix} | diagnostic tile {tile}", (tx, ty, z + 0.10),
             (0.76, 0.025, 0.72), mats["screen"], rot, 0.025)
        for row in range(3):
            row_z = z - 0.13 + row * 0.19
            bar_width = (0.43, 0.28, 0.36)[(row + tile) % 3]
            bx = tx - math.cos(rot) * 0.09 + inward[0] * 0.026
            by = ty - math.sin(rot) * 0.09 + inward[1] * 0.026
            _box(collection, f"{prefix} | diagnostic trace {tile}-{row + 1}",
                 (bx, by, row_z), (bar_width, 0.018, 0.026),
                 mats["cyan"] if row == 0 else mats["cyan_dim"], rot, 0.007)


def _make_wall(collection, index, p0, p1, mats, is_camera_flank=False):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    length = math.hypot(dx, dy)
    rot = math.atan2(dy, dx)
    mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
    height = 1.12 if index == 6 else (2.15 if is_camera_flank else 5.25)
    zc = FLOOR_Z + height / 2
    tag = f"Perimeter {index:02d}"
    inward = (-math.sin(rot), math.cos(rot))
    bay_bottom, bay_top = 1.86, 4.44
    if index == 5:
        # Keep the southwest bay clear on the room side for the officer pods.
        back = (mid[0] - inward[0] * .34, mid[1] - inward[1] * .34)
        _box(collection, f"{tag} | pod bay backing", (*back, zc),
             (length - 0.1, 0.31, height), mats["wall"], rot, 0.05)
    elif is_camera_flank:
        _box(collection, f"{tag} | armored wall", (mid[0], mid[1], zc),
             (length - 0.08, 0.42, height), mats["wall"], rot, 0.07)
    else:
        # Leave a true opening between the sill and lintel; the smoked pane is
        # inset behind the wall's inner face to make the bay read as a recess.
        _box(collection, f"{tag} | armored sill", (mid[0], mid[1], bay_bottom / 2),
             (length - 0.08, 0.42, bay_bottom), mats["wall"], rot, 0.05)
        _box(collection, f"{tag} | armored lintel", (mid[0], mid[1], (bay_top + height) / 2),
             (length - 0.08, 0.42, height - bay_top), mats["wall"], rot, 0.05)
    # Inner face cladding is interrupted by a deep central bay.
    bay_len = min(4.5, length - 0.9)
    if not is_camera_flank and index != 5:
        # Break the infill into shoulders so the screen/window sits visibly recessed.
        shoulder = (length - bay_len) / 2
        for sign in (-1, 1):
            offset = sign * (bay_len / 2 + shoulder / 2)
            pt = (mid[0] + math.cos(rot) * offset, mid[1] + math.sin(rot) * offset)
            _box(collection, f"{tag} | side armor {sign:+d}", (pt[0], pt[1], 2.75),
                 (max(0.16, shoulder), 0.24, 4.5), mats["panel"], rot, 0.035)
        _edge_frame(collection, tag, mid, rot, inward, bay_len, 3.15, mats)
    # Every wall segment gets a lower kick plate and a heavy top cap.
    _box(collection, f"{tag} | kick plate", (mid[0], mid[1], 0.20),
         (length - 0.10, 0.56, 0.34), mats["steel"], rot, 0.045)
    _box(collection, f"{tag} | crown beam", (mid[0], mid[1], height + 0.02),
         (length + 0.08, 0.60, 0.30), mats["steel"], rot, 0.055)
    if index == 6:
        _box(collection, f"{tag} | safety gold inlay", (mid[0], mid[1] + 0.23, 0.84),
             (length - 0.9, 0.025, 0.035), mats["amber"], rot, 0.008)
    # Structural end pilasters and vertical cyan seams.
    for endpoint in (p0, p1):
        _box(collection, f"{tag} | corner pilaster", (endpoint[0], endpoint[1], height / 2),
             (0.36, 0.62, height + 0.05), mats["steel"], rot, 0.045)
        inward = (-math.sin(rot) * 0.33, math.cos(rot) * 0.33)
        _box(collection, f"{tag} | edge beacon", (endpoint[0] + inward[0], endpoint[1] + inward[1], 1.22),
             (0.035, 0.045, 1.28), mats["cyan"], rot, 0.009)


def _make_upper_structure(collection, vertices, mats):
    # Open central oculus with a deep segmented ring and radial ceiling trusses.
    phase = math.radians(22.5)
    outer_r, inner_r = 7.9, 5.75
    for i in range(8):
        a0 = phase + i * math.tau / 8
        a1 = phase + (i + 1) * math.tau / 8
        # Leave the southeast arc open to preserve the camera approach.
        midangle = (a0 + a1) / 2
        if math.cos(midangle) > 0 and math.sin(midangle) < 0:
            continue
        p0 = (outer_r * math.cos(a0), outer_r * math.sin(a0))
        p1 = (outer_r * math.cos(a1), outer_r * math.sin(a1))
        if min(p0[1], p1[1]) < -0.001:
            continue
        length = math.dist(p0, p1)
        _box(collection, f"Upper octagonal ring {i + 1:02d}",
             ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 5.85),
             (length + 0.1, 0.38, 0.42), mats["steel"], math.atan2(p1[1]-p0[1], p1[0]-p0[0]), 0.06)
        # Inset light channel faces inward at the lower edge of the ring.
        _box(collection, f"Upper ring light {i + 1:02d}",
             ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 5.60),
             (length - 0.25, 0.055, 0.055), mats["cyan"], math.atan2(p1[1]-p0[1], p1[0]-p0[0]), 0.015)
    # Radial rafters bridge the wall crown to the open oculus, giving the room a
    # recognizable command-bunker canopy without visually closing its center.
    for i in range(8):
        angle = phase + i * math.tau / 8
        if math.sin(angle) < -0.001:
            continue
        start = (inner_r * math.cos(angle), inner_r * math.sin(angle))
        end = (7.7 * math.cos(angle), 7.7 * math.sin(angle))
        mid = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
        _box(collection, f"Ceiling radial truss {i + 1:02d}", (mid[0], mid[1], 5.52),
             (2.15, 0.26, 0.32), mats["beam"], angle, 0.045)
        _box(collection, f"Truss light channel {i + 1:02d}", (mid[0], mid[1], 5.34),
             (1.55, 0.035, 0.025), mats["cyan_dim"], angle, 0.008)


def build_architecture():
    """Create and return the architecture collection, replacing an earlier build."""
    previous = bpy.data.collections.get(COLLECTION_NAME)
    if previous:
        for obj in list(previous.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(previous)
    collection = bpy.data.collections.new(COLLECTION_NAME)
    bpy.context.scene.collection.children.link(collection)

    mats = {
        "floor": _material("Tactile Architecture | ceramic graphite", (0.058, 0.061, 0.057, 1), 0.07, 0.83),
        "wall": _material("Tactile Architecture | sealed concrete", (0.037, 0.045, 0.059, 1), 0.03, 0.91),
        "panel": _material("Tactile Architecture | oxidized panels", (0.061, 0.075, 0.092, 1), 0.15, 0.83),
        "cladding": _material("Tactile Architecture | charcoal cladding", (0.025, 0.036, 0.048, 1), 0.10, 0.86),
        "steel": _material("Tactile Architecture | worn coated steel", (0.085, 0.107, 0.126, 1), 0.24, 0.69),
        "beam": _material("Tactile Architecture | blackened truss", (0.063, 0.057, 0.047, 1), 0.16, 0.81),
        "shadow": _material("Tactile Architecture | recess shadow", (0.009, 0.010, 0.009, 1), 0.0, 0.90),
        "glass": _material("Tactile Architecture | smoked instrumentation", (0.014, 0.033, 0.039, 1), 0.08, 0.54, 0.08),
        "cyan": _material("Tactile Architecture | caged utility lights", (0.035, 0.57, 0.68, 1), 0.0, 0.52, 1.95),
        "cyan_dim": _material("Tactile Architecture | low utility accents", (0.14, 0.32, 0.43, 1), 0.0, 0.68, 0.53),
        "screen": _material("Tactile Architecture | diagnostic displays", (0.004, 0.038, 0.052, 1), 0.18, 0.18, 0.38),
        "amber": _material("Tactile Architecture | safety gold", (0.92, 0.36, 0.035, 1), 0.16, 0.28, 1.25),
    }

    # Main eight-sided floor slab and a slightly raised inner deck with precise
    # radial registration marks around the central floating-head-bot stage.
    _octagon_mesh(collection, "Eight-sided structural floor", ROOM_RADIUS, -0.34, 0.0, mats["floor"])
    # Leave the inner three-meter radius clear for the central floating head bot
    # and its separately authored plinth.
    # Low radial deck seams keep the floor legible without competing with the workstations.
    for i in range(16):
        angle = math.tau * i / 16
        r = 5.7
        _box(collection, f"Floor radial inlay {i + 1:02d}", (r * math.cos(angle), r * math.sin(angle), 0.009),
             (2.4, 0.025, 0.012), mats["steel"], angle, 0.004)
        _box(collection, f"Floor cyan index {i + 1:02d}", (7.0 * math.cos(angle), 7.0 * math.sin(angle), 0.012),
             (0.26, 0.065, 0.018), mats["cyan_dim"], angle, 0.009)

    # Octagon vertices at radius 8 with a 22.5 degree phase; omit the southeast
    # face (normal ~315 degrees) and lower the adjacent camera flanks for a cutaway.
    vertices = [(ROOM_RADIUS * math.cos(math.radians(22.5 + i * 45)),
                 ROOM_RADIUS * math.sin(math.radians(22.5 + i * 45))) for i in range(8)]
    for i in range(8):
        if i == 6:
            continue
        flank = i in (5, 7)
        _make_wall(collection, i + 1, vertices[i], vertices[(i + 1) % 8], mats, flank)
    _make_upper_structure(collection, vertices, mats)

    # Overhead service cylinders and small bulkhead panels reinforce an industrial
    # radial-control-room silhouette while staying out of the central sightline.
    for i in range(8):
        angle = math.radians(22.5 + i * 45)
        if math.sin(angle) < -0.001:
            continue
        x, y = 6.75 * math.cos(angle), 6.75 * math.sin(angle)
        _cylinder(collection, f"Overhead service conduit {i + 1:02d}", (x, y, 5.12), 0.095, 2.05, mats["steel"], 20)
        obj = bpy.data.objects.get(f"Overhead service conduit {i + 1:02d}")
        if obj:
            obj.rotation_euler[1] = math.pi / 2
            obj.rotation_euler[2] = angle

    return collection
