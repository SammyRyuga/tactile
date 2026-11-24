"""Author the officer pods and the wake/work/return timeline in Blender."""

import math

import bpy
from mathutils import Matrix, Vector

from blender_reviewer_bots import _animation_curves
from control_room_consoles import ROLE_COLORS, ROLE_LABELS
from control_room_workers import PATROL_END, WAKE_FRAMES

RETURN_FRAMES = 360
POWER_DOWN_FRAMES = 36
BAY_ANGLE = 5 * math.pi / 4
BAY_ORDER = ("builder", "researcher", "devils_advocate", "operator")
POD_TUCK = (.22, -.15, -.56)


def _profile(radius, straight):
    """Evenly sample the two rounded ends of a vertical capsule."""
    return [
        (radius * math.cos(angle), center + radius * math.sin(angle))
        for center, angles in (
            (straight, [math.pi * i / 24 for i in range(25)]),
            (-straight, [math.pi + math.pi * i / 24 for i in range(25)]),
        )
        for angle in angles
    ]


def _pod_mesh(scene, name, vertices, faces, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    mesh.materials.append(material)
    for face in mesh.polygons:
        face.use_smooth = True
    return obj


def _shell(scene, prefix, point, armor, gasket):
    profile = _profile(.594, .56)
    # A rolled mouth, a wider pressure jacket, and a tapered back. The inner
    # rings return to the mouth, leaving a hollow bay for the officer.
    sections = ((6.55, .97), (6.62, 1.00), (6.77, 1.035), (7.12, 1.04),
                (7.44, .99), (7.58, .88), (7.48, .83), (7.20, .89),
                (6.77, .91), (6.61, .90))
    count = len(profile)
    vertices = [point(x, y * scale, 1.43 + z * scale)
                for x, scale in sections for y, z in profile]
    faces = []
    for section in range(len(sections)):
        a, b = section * count, ((section + 1) % len(sections)) * count
        faces.extend((a + i, a + (i + 1) % count, b + (i + 1) % count, b + i)
                     for i in range(count))
    obj = _pod_mesh(scene, f"{prefix} pressure shell", vertices, faces, armor)
    obj.data.materials.append(gasket)
    for face in obj.data.polygons[-4 * count:]:
        face.material_index = 1


def _rounded_canopy(scene, prefix, role, side, point, glass, rim, depart, work_last, final):
    """Build a curved split canopy that swings clear of the launch opening."""
    hinge = bpy.data.objects.new(f"{prefix} canopy hinge {side:+}", None)
    scene.collection.objects.link(hinge)
    hinge.location = point(6.565, side * .565, 1.43)
    hinge["reviewer_id"] = role
    points = []
    columns, rows = 16, 28
    for column in range(columns + 1):
        # A small gap at the center separates the two leaves.
        across = side * (.012 + .523 * column / columns)
        height = .54 + math.sqrt(max(0, .547**2 - across**2))
        for row in range(rows + 1):
            up = height * (2 * row / rows - 1)
            curve = -.10 * (1 - (across/.55)**2) * (1 - (up/1.14)**2)
            points.append((curve, across - side * .565, up))
    faces = []
    for column in range(columns):
        for row in range(rows):
            index = column * (rows + 1) + row
            face = (index, index + rows + 1, index + rows + 2, index + 1)
            faces.append(face if side > 0 else tuple(reversed(face)))
    panel = _pod_mesh(scene, f"{prefix} curved canopy {side:+}", points, faces, glass)
    panel.parent = hinge

    border = (list(range(0, rows + 1))
              + [column * (rows + 1) + rows for column in range(1, columns + 1)]
              + list(range((columns + 1) * (rows + 1) - 2, columns * (rows + 1) - 1, -1))
              + [column * (rows + 1) for column in range(columns - 1, 0, -1)])
    curve = bpy.data.curves.new(f"{prefix} curved seal {side:+}", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = .019
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(border) - 1)
    for key, index in zip(spline.points, border):
        key.co = (*points[index], 1)
    spline.use_cyclic_u = True
    seal = bpy.data.objects.new(curve.name, curve)
    scene.collection.objects.link(seal)
    seal.parent = hinge
    curve.materials.append(rim)

    open_angle = -side * math.radians(88)
    outbound = (
        (1, 0), (depart - 19, 0), (depart - 2, open_angle),
        (depart + 55, open_angle), (depart + 76, 0),
    )
    mirror = work_last + WAKE_FRAMES
    inbound = [(mirror - frame, angle) for frame, angle in reversed(outbound)]
    for frame, angle in (*outbound, *inbound, (final, 0)):
        hinge.rotation_euler.z = BAY_ANGLE + angle
        hinge.keyframe_insert(data_path="rotation_euler", frame=frame)
    for curve in _animation_curves(hinge.animation_data.action):
        for key in curve.keyframe_points:
            key.handle_left_type = key.handle_right_type = "AUTO_CLAMPED"
        curve.update()


def build_pod_housings(scene, box, material, text):
    """Build the capsule meshes without changing the officer flight tracks."""
    armor = material("Pods / ceramic pressure shell", (.091, .116, .151), .27, .57)
    gasket = material("Pods / graphite gasket", (.017, .022, .023), .04, .84)
    glass = material("Pods / smoked curved canopy", (.14, .24, .33), .06, .25)
    glass.surface_render_method = "BLENDED"
    glass.node_tree.nodes.get("Principled BSDF").inputs["Alpha"].default_value = .31
    outward = Vector((math.cos(BAY_ANGLE), math.sin(BAY_ANGLE), 0))
    across = Vector((-outward.y, outward.x, 0))
    work_last = WAKE_FRAMES + PATROL_END
    final = work_last + RETURN_FRAMES

    for index, role in enumerate(BAY_ORDER):
        prefix = f"{role} / pod"
        cross = (index - 1.5) * 1.36
        light = material(f"{prefix} charge status", ROLE_COLORS[role][:3], emission=1.65)

        def point(radius, offset, z):
            return outward * radius + across * (cross + offset) + Vector((0, 0, z))

        _shell(scene, prefix, point, armor, gasket)
        for height, radius, depth, mat in ((.28, .47, .17, gasket), (.372, .37, .06, armor),
                                           (.405, .29, .015, light)):
            bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth,
                                                location=point(7.03, 0, height))
            cradle = bpy.context.object
            cradle.name = f"{prefix} inductive cradle"
            cradle.data.materials.append(mat)
            bevel = cradle.modifiers.new("Rounded charge plate", "BEVEL")
            bevel.width = .01
            bevel.segments = 3
        for side in (-1, 1):
            box(f"{prefix} ceramic hinge mount", point(6.67, side * .568, 1.43),
                (.25, .125, .36), gasket, BAY_ANGLE, .036)
            box(f"{prefix} standby indicator", point(6.71, side * .35, 2.38),
                (.035, .074, .033), light, BAY_ANGLE, .009)
            _rounded_canopy(scene, prefix, role, side, point, glass, armor,
                            22 + index * 24, work_last, final)
        sign = text(f"{prefix} role stencil", ROLE_LABELS[role], point(6.65, 0, 2.69), .096, light)
        sign.rotation_euler = (math.pi / 2, 0, BAY_ANGLE - math.pi / 2)


def add_pod_camera(scene):
    """Frame the southwest pod bank from inside the camera cutaway."""
    target = Vector((-3.35, -3.45, 1.53))
    camera = bpy.data.objects.new("Camera / pod bay", bpy.data.cameras.new("Pod bay"))
    scene.collection.objects.link(camera)
    camera.location = (7.8, -0.25, 7.5)
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = scene.camera.data.lens
    camera["pod_bay_camera"] = True
    camera["look_distance"] = (target - camera.location).length
    return camera


def _delay_work(scene):
    """Push the original work sequence forward without changing its poses."""
    for action in bpy.data.actions:
        for curve in _animation_curves(action):
            for key in curve.keyframe_points:
                key.co.x += WAKE_FRAMES
                key.handle_left.x += WAKE_FRAMES
                key.handle_right.x += WAKE_FRAMES
            curve.update()
    for marker in scene.timeline_markers:
        marker.frame += WAKE_FRAMES


def _flight(center, dock, outward, station_yaw, order):
    """Use an elevated perimeter arc and approach the pod from inside the room."""
    depart = 22 + order * 24
    dock_yaw = math.remainder(BAY_ANGLE - math.pi / 2 - station_yaw, math.tau)
    release = dock - outward * 0.86
    climb = dock - outward * 1.35
    # Each officer starts in its own straight approach bay. The more distant
    # stations have higher transit lanes until they reach their descent point.
    altitude = (3.42, 2.76, 4.00, 3.34)[order]
    climb.z = altitude
    start_theta = math.atan2(climb.y, climb.x)
    dest_theta = math.atan2(center.y, center.x)
    sweep = math.remainder(dest_theta - start_theta, math.tau)
    poses = [(1, dock, dock_yaw), (depart, dock, dock_yaw),
             (depart + 24, release, dock_yaw), (depart + 51, climb, dock_yaw)]
    for step in range(1, 9):
        t = step / 8
        theta = start_theta + t * sweep
        radius = climb.xy.length * (1 - t) + 5.06 * t
        point = Vector((radius * math.cos(theta), radius * math.sin(theta), altitude))
        poses.append((depart + 51 + step * 13, point, dock_yaw * (1 - t)))
    poses += [(depart + 186, center + Vector((0, 0, .60)), 0),
              (depart + 210, center, 0), (WAKE_FRAMES, center, 0)]
    return poses, depart


def build_pod_lifecycle(actors, consoles, box, material, text):
    """Add four docked states and exported lifecycle boundaries."""
    scene = bpy.context.scene
    _delay_work(scene)
    for obj in scene.objects:
        stages = ("park", "alt_park", "wake")
        stages += tuple(f"{kind}_{role}" for kind in ("handoff", "relay") for role in BAY_ORDER)
        for stage in stages:
            key = f"worker_{stage}_frames"
            if key in obj:
                obj[f"worker_{stage}_times"] = [
                    (frame + WAKE_FRAMES - 1) / scene.render.fps
                    for frame in obj.pop(key)
                ]
    work_first = WAKE_FRAMES + 1
    work_last = WAKE_FRAMES + PATROL_END
    final = work_last + RETURN_FRAMES
    scene.frame_start, scene.frame_end = 1, final + POWER_DOWN_FRAMES
    scene.timeline_markers.new("Officer pods / wake", frame=1)
    scene.timeline_markers.new("Officers at stations", frame=work_first)
    scene.timeline_markers.new("Work complete / dock", frame=work_last)
    scene.timeline_markers.new("Officer pods / asleep", frame=final)
    add_pod_camera(scene)
    build_pod_housings(scene, box, material, text)
    outward = Vector((math.cos(BAY_ANGLE), math.sin(BAY_ANGLE), 0))
    across = Vector((-outward.y, outward.x, 0))

    for index, role in enumerate(BAY_ORDER):
        prefix = f"{role} / pod"
        cross = (index - 1.5) * 1.36
        dock = outward * 7.015 + across * cross + Vector((0, 0, 1.33))
        center = Vector(consoles[role]["position"])
        yaw = consoles[role]["yaw"]
        poses, _ = _flight(center, dock, outward, yaw, index)
        returning = [(work_last + WAKE_FRAMES - frame, pos, turn)
                     for frame, pos, turn in reversed(poses)]

        pivot = bpy.data.objects.new(f"{prefix} flight", None)
        scene.collection.objects.link(pivot)
        pivot["reviewer_id"] = role
        pivot["pod_work_start"] = (work_first - 1) / scene.render.fps
        pivot["pod_work_end"] = (work_last - 1) / scene.render.fps
        pivot["pod_sleep"] = (final - 1) / scene.render.fps
        # The recorded loop completes roles at separate times.
        pivot["pod_demo_done"] = (work_last - 1) / scene.render.fps - (8, 0, 5, 2)[index]
        exchange = actors[role].parent
        if "exchange_frames" in exchange:
            pivot["pod_handoff"] = [
                (frame + WAKE_FRAMES - 1) / scene.render.fps
                for frame in exchange.pop("exchange_frames")
            ]
        exchange.parent = pivot
        exchange.matrix_parent_inverse = Matrix.Translation(-center)
        for frame, position, turn in poses + returning + [(final, dock, poses[0][2])]:
            pivot.location = position
            pivot.rotation_euler.z = turn
            pivot.keyframe_insert(data_path="location", frame=frame)
            pivot.keyframe_insert(data_path="rotation_euler", frame=frame)
            if frame in (WAKE_FRAMES, work_last):
                continue
            # The IK target follows the officer in flight rather than reaching
            # for a distant desk while docked or underway.
            for side, sign in (("L", 1), ("R", -1)):
                hand = bpy.data.objects[f"{role} / {side} control reach"]
                x, y, z = POD_TUCK
                tuck = Matrix.Rotation(yaw + turn, 3, "Z") @ Vector((sign * x, y, z))
                hand.location = position + tuck
                hand.keyframe_insert(data_path="location", frame=frame)

    return work_first
