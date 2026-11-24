"""Add two animated maintenance couriers to the Tactile control room.

``build_workers()`` sizes the supplied Worker robot from its visible geometry
and animates the couriers on separate service lanes.
"""

from __future__ import annotations

import math
from random import Random
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

from control_room_consoles import ROLE_COLORS
from control_room_worker_hands import animate_worker_hands, contact_point


MODELS_DIR = Path("build/operator-room-inputs")
WORKER_BLEND = MODELS_DIR / "Worker robot.blend"
COLLECTION_NAME = "Tactile Maintenance Workers"
SHOT_FRAME = 88
PATROL_END = 1921
WAKE_FRAMES = 360
TARGET_HEIGHT = 1.2
LANE_RADIUS = 5.53
SERVICE_RADIUS = 6.21
CENTER_SERVICE_RADIUS = 3.88


def _material(name, color, *, metallic=0.0, roughness=0.38, emission=0.0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Emission Color"].default_value = (*color, 1.0)
        shader.inputs["Emission Strength"].default_value = emission
    return material


def _geometry(objects):
    return [
        obj for obj in objects
        if obj.type in {"MESH", "CURVE", "SURFACE", "FONT", "META"}
        and not obj.hide_render
        and not obj.name.startswith("WGT-")
    ]


def _visible_bounds(objects):
    geometry = _geometry(objects)
    points = [obj.matrix_world @ Vector(corner) for obj in geometry for corner in obj.bound_box]
    if not points:
        raise ValueError("Worker robot contains no visible geometry")
    low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    return low, high


def _import_worker(collection, label, worker_blend):
    if not worker_blend.is_file():
        raise FileNotFoundError(f"Worker robot model not found: {worker_blend}")
    with bpy.data.libraries.load(str(worker_blend), link=False) as (source, target):
        target.objects = [name for name in source.objects if name not in {"Camera", "Camera.001"}]
    objects = [obj for obj in target.objects
               if obj is not None and obj.type not in {"CAMERA", "LIGHT"}]
    for obj in objects:
        collection.objects.link(obj)
        obj.name = f"{label} | {obj.name}"
        # These hidden shape meshes exist only to draw Blender's rig controls.
        if obj.name.startswith(f"{label} | WGT-") or obj.type == "CURVE":
            obj.hide_render = True
            obj.hide_set(True)
    bpy.context.view_layer.update()
    return objects


def _dim_indicators(objects, worker_id, wake, parked, relays):
    indicators = {}
    levels = {"Eye": 0.46, "Attena": 0.25}
    for obj in _geometry(objects):
        display = obj.name.split(" | ")[-1].split(".")[0] == "Text"
        if not any(slot.material and slot.material.name.split(".")[0] in levels
                   for slot in obj.material_slots):
            continue
        if obj.data.users > 1:
            obj.data = obj.data.copy()
        for slot in obj.material_slots:
            source = slot.material
            kind = source.name.split(".")[0] if source else None
            if kind not in levels:
                continue
            key = (source, display)
            if key not in indicators:
                indicator = source.copy()
                indicator.name = f"{worker_id} indicator {'relay' if display else kind}"
                indicator["worker_active_emission"] = levels[kind]
                indicator.node_tree.animation_data_clear()
                shader = indicator.node_tree.nodes.get("Principled BSDF")
                strength = shader.inputs["Emission Strength"]
                shader.inputs["Base Color"].default_value = (0.035, 0.038, 0.04, 1)
                for frame, value in (
                    (wake, 0), (wake + 12, levels[kind]),
                    (parked - 12, levels[kind]), (parked, 0),
                ):
                    strength.default_value = value
                    strength.keyframe_insert(data_path="default_value", frame=frame)
                if display:
                    indicator["worker_relay_display"] = worker_id
                    lamp = shader.inputs["Emission Color"]
                    neutral = tuple(lamp.default_value)
                    for role, (pickup, upload) in relays.items():
                        for frame, color in (
                            (pickup - 3, neutral), (pickup, ROLE_COLORS[role]),
                            (upload, ROLE_COLORS[role]), (upload + 8, neutral),
                        ):
                            lamp.default_value = color
                            lamp.keyframe_insert(data_path="default_value", frame=frame)
                indicators[key] = indicator
            slot.link = "DATA"
            slot.material = indicators[key]


def _make_worker(collection, label, worker_id, route, jobs, wake, worker_blend):
    objects = _import_worker(collection, label, worker_blend)
    parked = route[-1][0]
    relays = {}
    for position, (index, begin, _) in enumerate(jobs):
        role = SERVICE_STOPS[index][-1]
        if role:
            _, upload_begin, _ = next(job for job in jobs[position + 1:] if not SERVICE_STOPS[job[0]][-1])
            relays[role] = (begin + 15, upload_begin + 15)
    _dim_indicators(objects, worker_id, wake, parked, relays)
    low, high = _visible_bounds(objects)
    source_center = (low + high) * 0.5
    source_height = max(high.z - low.z, 0.001)
    scale = TARGET_HEIGHT / source_height

    anchor = bpy.data.objects.new(f"{label} | route anchor", None)
    anchor.empty_display_type = "CIRCLE"
    anchor.empty_display_size = 0.32
    collection.objects.link(anchor)
    anchor.location = source_center
    roots = [obj for obj in objects if obj.parent is None]
    world_matrices = {obj: obj.matrix_world.copy() for obj in roots}
    for obj, matrix_world in world_matrices.items():
        obj.parent = anchor
        obj.matrix_parent_inverse = Matrix.Identity(4)
        # matrix_world can still be stale immediately after creating the Empty;
        # use the known source-center translation instead of querying it.
        obj.matrix_basis = Matrix.Translation(-source_center) @ matrix_world
    anchor.scale = (scale, scale, scale)

    action = bpy.data.actions.new(f"{label} | service itinerary")
    anchor.animation_data_create()
    anchor.animation_data.action = action
    if hasattr(action, "slots") and not len(action.slots):
        anchor.animation_data.action_slot = action.slots.new(id_type="OBJECT", name=anchor.name)

    for frame, x, y, yaw in route:
        anchor.location = (x, y, TARGET_HEIGHT * 0.5)
        anchor.rotation_euler = (0.0, 0.0, yaw)
        anchor.keyframe_insert(data_path="location", frame=frame, group="Route")
        anchor.keyframe_insert(data_path="rotation_euler", frame=frame, group="Route")
    # Curves are sampled explicitly so evaluation cannot overshoot a corner.
    for curve in _action_curves(action):
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"
    _animate_rig(objects, route, jobs, scale, label, anchor, collection)
    anchor["worker_role"] = "inspect cabinets and center aisle console"
    anchor["worker_id"] = worker_id
    anchor["worker_park_frames"] = [end for index, _, end in jobs[:-1] if index < 4] + [parked]
    anchor["worker_alt_park_frames"] = [
        end for index, _, end in jobs[:-1] if index < 4 and index != jobs[-1][0]
    ]
    anchor["worker_wake_frames"] = (wake, wake + 12)
    for index, begin, end in jobs:
        role = SERVICE_STOPS[index][-1]
        if role:
            # Either end of this hold has the same position, heading and arm pose.
            anchor[f"worker_handoff_{role}_frames"] = (begin - 21, end + 21)
    for role, frames in relays.items():
        anchor[f"worker_relay_{role}_frames"] = frames
    anchor["source_model"] = worker_blend.name
    anchor["source_visible_height"] = source_height
    anchor["target_height"] = TARGET_HEIGHT
    anchor["itinerary"] = "four cabinet spurs and one center aisle console visit"
    return anchor


def _animate_rig(objects, route, jobs, scale, label, anchor, collection):
    """Rotate the tyre directly so the source travel rig cannot displace the chassis."""
    rig = next((obj for obj in objects if obj.type == "ARMATURE"), None)
    bone = rig.pose.bones.get("Tyre cntrl") if rig else None
    if bone is None:
        return
    action = bpy.data.actions.new(f"{label} | wheel and service gestures")
    rig.animation_data_create()
    rig.animation_data.action = action
    if hasattr(action, "slots") and not len(action.slots):
        rig.animation_data.action_slot = action.slots.new(id_type="OBJECT", name=rig.name)
    for constraint in bone.constraints:
        constraint.mute = True
    bone.rotation_mode = "XYZ"
    distance = 0.0
    previous = None
    radius = 2.5  # source Robot tyre radius, before scaling
    for frame, x, y, yaw in route:
        point = Vector((x, y))
        if previous is not None:
            travel = point - previous[0]
            heading = (previous[1] + yaw) * 0.5
            forward = Vector((math.sin(heading), -math.cos(heading)))
            signed_length = travel.length if travel.dot(forward) >= 0 else -travel.length
            distance += signed_length / scale
        previous = (point, yaw)
        bone.rotation_euler.x = -distance / radius
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group="Tyre roll")
    for curve in _action_curves(action):
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"
    animate_worker_hands(rig, anchor, route, jobs, scale, label,
                         collection=collection, action=action)


def _action_curves(action):
    if hasattr(action, "layers"):
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    bag = strip.channelbag(slot)
                    if bag:
                        yield from bag.fcurves
    elif hasattr(action, "fcurves"):
        yield from action.fcurves



# Bearings count 45-degree sectors counterclockwise from east. The routes have
# different jobs and seeded stop timing, and share the aisle in one direction.
SERVICE_STOPS = (
    ("East / power relays", 0, 6.695, (0.94, 0.38, 0.08), False, None),
    ("North / cooling controls", 2, 6.695, (0.07, 0.68, 0.86), False, None),
    ("West / network cabinet", 4, 6.695, (0.35, 0.79, 0.46), False, None),
    ("South / floor diagnostics", 6, 6.695, (0.36, 0.62, 1.0), False, None),
    ("East center / utility manifold", 0, 3.395, (0.13, 0.82, 0.60), True, None),
    ("West center / sensor calibration", 4, 3.395, (0.76, 0.41, 0.11), True, None),
    ("Direct exchange / Devil's Advocate", 1, 5.045, (0.83, 0.12, 0.10), True, "devils_advocate"),
    ("Direct exchange / Builder", 3, 5.045, (0.95, 0.48, 0.06), True, "builder"),
    ("Direct exchange / Researcher", 5, 5.045, (0.10, 0.72, 0.76), True, "researcher"),
    ("Direct exchange / Operator", 7, 5.045, (0.16, 0.50, 0.94), True, "operator"),
)
PATROL_ASSIGNMENTS = (
    ("South lane courier", 6, 45, (3, 4, 6, 2, 8)),
    ("East lane courier", 2, 61, (1, 7, 5, 9, 0)),
)


def _patrol(start_bearing, seed, assignments):
    rng = Random(seed)
    route, jobs = [], []
    lookup = {SERVICE_STOPS[index][1]: index for index in assignments}
    sector_frames = (PATROL_END - 1) // 8
    angle_step = math.tau / 8

    def key(frame, angle, yaw, radius=LANE_RADIUS):
        route.append((frame, radius * math.cos(angle), radius * math.sin(angle), yaw))

    for step in range(8):
        frame = 1 + step * sector_frames
        bearing = start_bearing + step
        angle = bearing * angle_step
        tangent = angle + math.pi
        key(frame, angle, tangent)
        index = lookup.get(bearing % 8)
        arc_start = frame
        if index is not None:
            _, _, _, _, inward, role = SERVICE_STOPS[index]
            heading = angle - math.pi / 2 if inward else angle + math.pi / 2
            radius = LANE_RADIUS if role else (CENTER_SERVICE_RADIUS if inward else SERVICE_RADIUS)
            turn = frame + rng.randint(2, 7) + 17
            if turn > frame + 17:
                key(turn - 17, angle, tangent)
            key(turn, angle, heading)
            approach_frames = round(abs(radius - LANE_RADIUS) * 24 / 0.93)
            if approach_frames:
                key(turn + approach_frames, angle, heading, radius)
            start = turn + approach_frames + 4
            end = start + rng.randint(39, 53)
            key(start, angle, heading, radius)
            key(end, angle, heading, radius)
            if approach_frames:
                key(end + 4, angle, heading, radius)
                key(end + 4 + approach_frames, angle, heading)
            arc_start = end + 4 + approach_frames + 17
            key(arc_start, angle, tangent)
            jobs.append((index, start, end))
        arrive = frame + sector_frames
        # Vary the acceleration across sectors while preserving rendezvous times.
        pace = rng.uniform(.35, .70) if index is not None else rng.uniform(.05, .25)
        for tick in range(4, arrive - arc_start, 4):
            t = tick / (arrive - arc_start)
            t += pace * (t*t*(3-2*t) - t)
            sweep = angle_step * t
            key(arc_start + tick, angle + sweep, tangent + sweep)
    final = (start_bearing + 8) * angle_step
    key(PATROL_END, final, final + math.pi)
    normalized = [route[0]]
    for frame, x, y, yaw in route[1:]:
        previous = normalized[-1][3]
        normalized.append((frame, x, y, previous + math.remainder(yaw - previous, math.tau)))
    return normalized, jobs


def _park_at_cabinet(route, jobs, bearing, cabinet):
    frame, x, y, tangent = route[-1]
    angle = bearing * math.pi / 4
    yaw = tangent + math.remainder(angle + math.pi / 2 - tangent, math.tau)
    dock_x, dock_y = SERVICE_RADIUS * math.cos(angle), SERVICE_RADIUS * math.sin(angle)
    start, end = frame + 44, frame + 92
    route.extend([
        (frame + 4, x, y, tangent),
        (frame + 23, x, y, yaw),
        (frame + 40, dock_x, dock_y, yaw),
        (end + 12, dock_x, dock_y, yaw),
    ])
    jobs.append((cabinet, start, end))


def _depart_cabinet(route, bearing, wake):
    """Prepend a grounded reverse and turn from the worker's overnight dock."""
    _, x, y, tangent = route[0]
    angle = bearing * math.pi / 4
    outward = tangent - math.pi / 2
    dock_x, dock_y = SERVICE_RADIUS * math.cos(angle), SERVICE_RADIUS * math.sin(angle)
    route[:0] = [
        (1 - WAKE_FRAMES, dock_x, dock_y, outward),
        (wake + 12, dock_x, dock_y, outward),
        (wake + 34, x, y, outward),
        (wake + 55, x, y, tangent),
    ]


def _service_equipment(collection, label, angle, radius, jobs, alloy, dark, signal, interior=False,
                       worker_id=None):
    """Place two contact buttons and a status bar on the equipment face."""
    radial = Vector((math.cos(angle), math.sin(angle), 0))
    side = Vector((-radial.y, radial.x, 0))
    toward_worker = 1 if interior else -1

    def panel(name, distance, z, dimensions, mat, offset=0):
        position = radial * distance + side * offset + Vector((0, 0, z))
        bpy.ops.mesh.primitive_cube_add(size=1, location=position)
        obj = bpy.context.object
        obj.name = f"{label} | {name}"
        for vertex in obj.data.vertices:
            for axis, length in enumerate(dimensions):
                vertex.co[axis] *= length
        obj.rotation_euler.z = angle
        obj.data.materials.append(mat)
        for original in list(obj.users_collection):
            original.objects.unlink(obj)
        collection.objects.link(obj)
        edge = obj.modifiers.new("Machined edges", "BEVEL")
        edge.width, edge.segments = 0.015, 3
        return obj

    height = 0.80 if interior else 1.32
    # Recess the housing behind the controls. The worker's high head and
    # shoulders overhang the wheel and need room above the low button panel.
    body_radius = radius - toward_worker * 0.36
    panel("equipment housing", body_radius, height / 2 + 0.02,
          (0.42, 0.66 if interior else 1.13, height), alloy)
    panel("control inset", radius - toward_worker * 0.085, 0.58,
          (0.17, 0.59, 0.26), dark)
    for index, offset in enumerate((-0.237, 0.237), 1):
        button = panel(f"service button {index}", radius - toward_worker * 0.006,
                       0.518, (0.012, 0.095, 0.072), signal, offset)
        if worker_id:
            button["worker_id"] = worker_id
        home = button.location.copy()
        for start, end in jobs:
            for frame, pressed in ((start, False), (start+13, True), (end-12, True), (end, False)):
                button.location = home - radial * (toward_worker * 0.003 * pressed)
                button.keyframe_insert(data_path="location", frame=frame)
    indicator = panel("status readout", radius + toward_worker * 0.007, 0.68,
                      (0.012, 0.40, 0.035), signal)
    if worker_id:
        indicator["worker_id"] = worker_id
    for frame, active in [(1, 0.12), (PATROL_END, 0.12)] + [
        (frame, active) for start, end in jobs
        for frame, active in ((start, 0.12), (start+14, 1), (end-12, 1), (end, 0.12))
    ]:
        indicator.scale.y = active
        indicator.keyframe_insert(data_path="scale", frame=frame)


def build_workers(*, worker_blend=WORKER_BLEND):
    """Animate patrols and return measured worker handoff contact points."""
    scene = bpy.context.scene
    collection = bpy.data.collections.new(COLLECTION_NAME)
    scene.collection.children.link(collection)
    routes = [_patrol(start, seed, jobs) for _, start, seed, jobs in PATROL_ASSIGNMENTS]
    worker_ids = ("courier-south", "courier-east")
    exterior_owners = {}
    handoffs = {}
    for (route, jobs), (name, bearing, _, assignments), worker_id, cabinet, wake in zip(
        routes, PATROL_ASSIGNMENTS, worker_ids, (3, 1), (135 - WAKE_FRAMES, 169 - WAKE_FRAMES),
    ):
        _park_at_cabinet(route, jobs, bearing, cabinet)
        _depart_cabinet(route, bearing, wake)
        exterior_owners.update((index, worker_id) for index in assignments if index < 4)
        _make_worker(collection, name, worker_id, route, jobs, wake, worker_blend)
        rig = bpy.data.objects[f"{name} | Bot rig"]
        for index, begin, end in jobs:
            role = SERVICE_STOPS[index][-1]
            if role:
                fingertip = contact_point(rig, "right", frame=begin + 15)
                handoffs[role] = (begin, end, fingertip)
    alloy = _material("Workers | service alloy", (0.11, 0.16, 0.19), metallic=0.65)
    dark = _material("Workers | service insets", (0.024, 0.039, 0.046), metallic=0.27)
    for index, (label, bearing, radius, color, inward, role) in enumerate(SERVICE_STOPS):
        visits = [(start, end) for _, jobs in routes for stop, start, end in jobs if stop == index]
        if not role:
            signal = _material(f"Workers | cabinet signal {index+1}", color, emission=2.0)
            _service_equipment(collection, label, bearing * math.pi / 4, radius, visits,
                               alloy, dark, signal, interior=inward,
                               worker_id=exterior_owners.get(index))
        for start, _ in visits:
            scene.timeline_markers.new(label, frame=start)
    scene.frame_start, scene.frame_end, scene.render.fps = 1, PATROL_END, 24
    scene["worker_overview_frame"] = SHOT_FRAME
    return handoffs
