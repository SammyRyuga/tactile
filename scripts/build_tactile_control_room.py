"""Build and render Tactile's radial control room in Blender 5.2."""

import argparse
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from control_room_workers import PATROL_END

ROOT = Path(__file__).resolve().parents[1]
PULSE_CYCLE_FRAMES = 44


def material(name, color, metallic=0.0, roughness=0.38, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Emission Color"].default_value = (*color, 1)
    shader.inputs["Emission Strength"].default_value = emission
    return mat


def finish_mesh(name, mat, bevel):
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        edge = obj.modifiers.new("Machined edges", "BEVEL")
        edge.width = bevel
        edge.segments = 3
        obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


def drum(name, radius, depth, height, mat, bevel=0.04, sides=8):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=sides, radius=radius, depth=depth, location=(0, 0, height)
    )
    bpy.context.object.rotation_euler.z = math.pi / 8 if sides == 8 else 0
    return finish_mesh(name, mat, bevel)


def box(name, location, dimensions, mat, angle=0, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    for vertex in obj.data.vertices:
        for axis, length in enumerate(dimensions):
            vertex.co[axis] *= length
    obj.rotation_euler.z = angle
    return finish_mesh(name, mat, bevel)


def trace(name, points, radius, mat):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = radius
    data.bevel_resolution = 2
    spline = data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, xyz in zip(spline.points, points):
        point.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(mat)
    return obj


def arc(name, radius, height, start, sweep, thickness, mat):
    return trace(name, [
        (radius * math.cos(start + sweep * i / 32),
         radius * math.sin(start + sweep * i / 32), height)
        for i in range(33)
    ], thickness, mat)


def text(name, body, location, size, mat, yaw=0):
    data = bpy.data.curves.new(name, "FONT")
    data.body = body
    data.align_x = "CENTER"
    data.size = size
    data.space_character = 1.18
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler.z = yaw
    data.materials.append(mat)
    return obj


def build_platform():
    graphite = material("Steelman / graphite armor", (0.046, 0.073, 0.085), 0.66)
    steel = material("Steelman / satin steel", (0.21, 0.28, 0.30), 0.72)
    dark = material("Steelman / black ceramic", (0.018, 0.028, 0.037), 0.28)
    cyan = material("Steelman / cyan indicators", (0.11, 0.73, 0.86), emission=3.0)
    white = material("Steelman / stencil", (0.66, 0.87, 0.89), emission=0.8)
    ochre = material("Steelman / safety stripe", (0.68, 0.39, 0.08), 0.44)
    drum("Steelman / foundation", 2.00, 0.20, 0.12, dark)
    drum("Steelman / lower deck", 1.90, 0.24, 0.30, graphite)
    drum("Steelman / perimeter flange", 1.83, 0.11, 0.46, steel)
    drum("Steelman / upper deck", 1.72, 0.14, 0.55, dark)
    drum("Steelman / projection collar", 0.94, 0.15, 0.67, graphite, sides=64)
    drum("Steelman / recessed emitter", 0.72, 0.047, 0.75, dark, 0.012, 64)
    drum("Steelman / emitter core", 0.44, 0.025, 0.78, steel, 0.01, 64)

    for i in range(8):
        angle = i * math.pi / 4
        c, s = math.cos(angle), math.sin(angle)
        box("Steelman / radial brace", (1.37*c, 1.37*s, 0.67), (0.43, 0.23, 0.14), steel, angle)
        box("Steelman / brace indicator", (1.39*c, 1.39*s, 0.749), (0.21, 0.040, 0.013), cyan, angle, 0.004)
        box("Steelman / recessed front vent", (1.76*c, 1.76*s, 0.34), (0.07, 0.54, 0.11), dark, angle)
        for offset in (-0.15, -0.05, 0.05, 0.15):
            box("Steelman / vent fin", (1.81*c-offset*s, 1.81*s+offset*c, 0.35), (0.03, 0.034, 0.086), steel, angle, 0.004)
        arc("Steelman / segmented emitter", 0.80, 0.756, angle + 0.08, 0.60, 0.014, cyan)
        arc("Steelman / deck warning band", 1.55, 0.63, angle + 0.10, 0.56, 0.017, ochre)
    for pulse in range(3):
        arc("Steelman / core lens", 0.32 + 0.05 * pulse, 0.797, 0, math.tau, 0.009, cyan)
    text("Steelman / deck stencil", "S T E E L M A N", (0, -1.105, 0.625), 0.125, white)


def build_suspension(head):
    """Model a continuous power and projection path from the deck to Slump."""
    from control_room_pods import POWER_DOWN_FRAMES, RETURN_FRAMES

    conduit = material("Steelman / black cable sleeve", (0.019, 0.035, 0.042), 0.25)
    steel = material("Steelman / projector mount", (0.17, 0.25, 0.28), 0.66)
    fiber = material("Steelman / optical filament", (0.025, 0.44, 0.82), emission=1.9)
    field = material("Steelman / focusing field", (0.09, 0.62, 0.83), emission=1.15)
    pulse = material("Steelman / signal pulse", (0.26, 0.86, 1.0), emission=5.5)
    node_light = material("Steelman / focus node indicator", (0.26, 0.86, 1.0), emission=5.5)
    for mat in (fiber, field, pulse):
        mat["steelman_power"] = "projection"
        mat.surface_render_method = "BLENDED"
    node_light["steelman_power"] = "indicator"
    focus_z = 1.55
    receiving_z = head.location.z - head["target_height"] * 0.5 - 0.045

    def polar(radius, angle, z):
        return (radius * math.cos(angle), radius * math.sin(angle), z)

    # Face-mounted sockets feed the focusing ring. Each sleeve splits into a
    # pair of thin optical paths, routed out of the head's silhouette.
    for index in range(4):
        angle = index * math.pi / 2 + math.pi / 4
        box("Steelman / fiber socket", polar(1.02, angle, 0.705),
            (0.30, 0.19, 0.13), steel, angle)
        trace("Steelman / shielded lower harness",
              [polar(radius, angle, z) for radius, z in
               ((1.14, 0.69), (1.07, 0.77), (0.91, 0.86), (0.82, 0.88))],
              0.035, conduit)
        for offset in (-0.045, 0.045):
            theta = angle + offset
            trace("Steelman / optical feed to ring", [
                polar(0.82 - 0.103 * math.sin(t * math.pi / 2),
                      theta + 0.14 * math.sin(t * math.pi),
                      0.875 + (focus_z - 0.875) * t)
                for t in (i / 24 for i in range(25))
            ], 0.010, fiber)
        box("Steelman / focus node", polar(0.72, angle, focus_z),
            (0.105, 0.12, 0.035), node_light, angle, 0.008)

    for index in range(8):
        angle = index * math.tau / 8
        arc("Steelman / focus ring", 0.72, focus_z, angle + 0.035, 0.71, 0.014, field)
        arc("Steelman / focus ring calibration", 0.77, focus_z + 0.05, angle + 0.10, 0.45, 0.005, fiber)

        def beam(t):
            return polar(0.72 - 0.37 * t, angle + 0.34 * t, focus_z + (receiving_z - focus_z) * t)

        trace("Steelman / focused light path", [beam(i / 24) for i in range(25)], 0.004, field)
        # Glowing packets move from the ring into the receiver. They shrink at
        # both ends so the loop has no visible pop.
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.034)
        packet = bpy.context.object
        packet.name = "Steelman / rising signal packet"
        packet["steelman_packet"] = True
        packet.data.materials.append(pulse)
        initial = 1 - (index % 4) * 10
        for frame in range(initial, PATROL_END + RETURN_FRAMES + POWER_DOWN_FRAMES, PULSE_CYCLE_FRAMES):
            for offset, t, size in ((0, 0, 0.01), (5, 0.14, 1), (22, 0.72, 0.86), (32, 1, 0.01)):
                packet.location = beam(t)
                packet.scale = (size, size, size * 1.8)
                packet.keyframe_insert(data_path="location", frame=frame + offset)
                packet.keyframe_insert(data_path="scale", frame=frame + offset)

    # The receiver brackets follow the head, so light reaches its underside
    # even as it bobs. The original model's surfaces and textures stay visible.
    bpy.context.view_layer.update()
    for index in range(6):
        receiver = arc("Steelman / receiver scan", 0.37, receiving_z, index * math.tau / 6 + 0.14,
                       0.69, 0.012, fiber)
        receiver.parent = head
        receiver.matrix_parent_inverse = head.matrix_world.inverted()


def animate_steelman_power(scene):
    from control_room_pods import POWER_DOWN_FRAMES

    end = scene.frame_end
    begin = end - POWER_DOWN_FRAMES
    for name in ("Steelman / cyan indicators", "Slump | red eye glow"):
        bpy.data.materials[name]["steelman_power"] = "indicator"
    for mat in bpy.data.materials:
        kind = mat.get("steelman_power")
        if not kind:
            continue
        shader = mat.node_tree.nodes["Principled BSDF"]
        strength = shader.inputs["Emission Strength"]
        strength.keyframe_insert(data_path="default_value", frame=begin)
        strength.default_value = 0
        strength.keyframe_insert(data_path="default_value", frame=end)
        if kind == "projection":
            opacity = shader.inputs["Alpha"]
            opacity.keyframe_insert(data_path="default_value", frame=begin)
            opacity.default_value = 0
            opacity.keyframe_insert(data_path="default_value", frame=end)
    light = bpy.data.lights["Light / Steelman uplight"]
    light.keyframe_insert(data_path="energy", frame=begin)
    light.energy = 0
    light.keyframe_insert(data_path="energy", frame=end)
    for obj in scene.objects:
        if obj.get("steelman_packet"):
            obj["steelman_shutdown_seconds"] = POWER_DOWN_FRAMES / scene.render.fps
            obj["steelman_packet_cycle_seconds"] = PULSE_CYCLE_FRAMES / scene.render.fps
            break


def animate_review_work(consoles):
    """Time each instrument response to the reviewer's authored work intervals."""
    from control_room_actors import reviewer_work_cycles
    from control_room_consoles import ROLE_COLORS

    for role, details in consoles.items():
        yaw = details["station_yaw"]
        x, y, _ = details["station_center"]
        mat = material(f"Work / {role}", ROLE_COLORS[role][:3], emission=1.8)
        profiles = {
            "devils_advocate": ("Counterexample flags", (0.05, 0.16, 0.04, 0.14)),
            "builder": ("Capacity gauges", (0.07, 0.11, 0.15, 0.19)),
            "researcher": ("Source comparison", (0.14, 0.14, 0.08, 0.08)),
            "operator": ("Workflow checkpoints", (0.05, 0.05, 0.05, 0.05)),
        }
        title, heights = profiles[role]
        for step, height in enumerate(heights):
            local_x, local_y = -0.90 + step * 0.13, -0.44
            locator = (x + math.cos(yaw) * local_x - math.sin(yaw) * local_y,
                       y + math.sin(yaw) * local_x + math.cos(yaw) * local_y,
                       0.86)
            lamp = box(f"{role} / {title} {step + 1}", locator, (0.08, 0.06, height * 2), mat, yaw, 0.008)
            for start, duration in reviewer_work_cycles(role):
                response = .13 + step * .11
                for beat, level in ((response, .07), (response + .09, 1.0),
                                    (response + .22, .7), (response + .42, .07)):
                    frame = start + round(duration * beat)
                    lamp.scale.z = level
                    lamp.keyframe_insert(data_path="scale", frame=frame)


def build_steelman_flow(scene):
    """Instrument the input, synthesis, and decision stages on the hub itself."""
    from control_room_consoles import ROLE_COLORS

    fps = scene.render.fps
    rail = material("Steelman / sealed data raceway", (.017, .026, .035), .39)
    armature = material("Steelman / intake fittings", (.096, .139, .155), .72)
    gold = material("Steelman / synthesis amber", (.9, .53, .11), emission=2.55)
    ports = {
        "devils_advocate": (math.pi - .30, "RISK"),
        "builder": (math.pi + .29, "BUILD"),
        "researcher": (-math.pi / 2 + .45, "SOURCES"),
        "operator": (-.22, "OPS"),
    }
    received = {}
    for role in ports:
        key = f"worker_relay_{role}_times"
        upload = next((obj[key][1] for obj in scene.objects if key in obj), None)
        if upload is None:
            raise ValueError(f"Steelman is missing {role}'s courier upload")
        received[role] = round(upload * fps) + 1
    intake_frames = 2 * fps
    synthesis_begin = max(received.values()) + intake_frames
    synthesis_end = synthesis_begin + 4 * fps
    report_frame = synthesis_end + 12

    def label_signal(node, signal, begin, end):
        node["steelman_signal"] = signal
        node["signal_begin"] = (begin - 1) / fps
        node["signal_end"] = (end - 1) / fps

    def scale_signal(node, frame, scale):
        node.scale = (scale,) * 3
        node.keyframe_insert(data_path="scale", frame=frame)

    for role, (angle, label) in ports.items():
        packet_material = material(f"Steelman / {label} received signal", ROLE_COLORS[role][:3], emission=4.2)
        stencil = material(f"Steelman / {label} intake stencil", ROLE_COLORS[role][:3], emission=.44)
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        along = Vector((-radial.y, radial.x, 0))

        def point(radius, height, offset=0):
            return radial * radius + along * offset + Vector((0, 0, height))

        # The channel follows the machined steps of the existing deck.
        for radius, height, length in ((1.63, .620, .30), (1.25, .705, .46)):
            box(f"Steelman / {label} intake bed", point(radius, height),
                (length, .245, .059), rail, angle, .017)
            for side in (-1, 1):
                box(f"Steelman / {label} intake channel edge", point(radius, height + .034, side * .092),
                    (length - .025, .026, .022), armature, angle, .004)
        box(f"Steelman / {label} receiver socket", point(1.73, .658),
            (.140, .23, .065), armature, angle, .014)
        text(f"Steelman / {label} intake label", label, point(1.45, .656, .146), .063, stencil, angle)
        packet = box(f"Steelman / {label} arriving relay", point(1.72, .698),
                     (.145, .132, .037), packet_material, angle, .010)
        packet["relay_role"] = role
        arrival = received[role]
        label_signal(packet, "incoming", arrival, arrival + intake_frames)
        scale_signal(packet, 1, .001)
        for offset, radius, height, scale in (
            (0, 1.72, .698, .001), (6, 1.66, .682, 1), (17, 1.47, .759, 1),
            (34, 1.10, .756, .96), (intake_frames, 1.00, .758, .001),
        ):
            packet.location = point(radius, height)
            packet.keyframe_insert(data_path="location", frame=arrival + offset)
            scale_signal(packet, arrival + offset, scale)
        scene.timeline_markers.new(f"Steelman receives {label}", frame=arrival)
        scale_signal(packet, scene.frame_end, .001)

    # The open panel pulses sequentially during synthesis, without suggesting
    # a pass/fail verdict. An independent output board only opens at delivery.
    scan = arc("Steelman / synthesis sweep", .60, .824, -.23, 1.29, .018, gold)
    label_signal(scan, "processing", synthesis_begin, synthesis_end)
    for frame, scale, angle in (
        (1, .001, 0), (synthesis_begin, .001, 0), (synthesis_begin + 8, 1, 0),
        (synthesis_end - 8, 1, math.tau * 2), (synthesis_end, .001, math.tau * 2),
        (scene.frame_end, .001, math.tau * 2),
    ):
        scan.rotation_euler.z = angle
        scan.keyframe_insert(data_path="rotation_euler", frame=frame)
        scale_signal(scan, frame, scale)

    box("Steelman / report terminal cradle", (0, -1.04, .700), (.91, .37, .15), armature, bevel=.034)
    box("Steelman / report terminal recess", (0, -1.04, .780), (.83, .30, .027), rail, bevel=.010)
    result_light = material("Steelman / report characters", (.63, .93, .93), emission=1.95)
    memo = bpy.data.objects.new("Steelman / completed decision memo", None)
    scene.collection.objects.link(memo)
    memo.location = (0, -1.04, .915)
    memo.rotation_euler.x = .33
    memo["review_memo"] = True
    label_signal(memo, "result", synthesis_end, report_frame)
    plate = box("Steelman / decision terminal panel", (0, 0, 0), (.92, .38, .040), rail, bevel=.023)
    plate.parent = memo
    title = text("Steelman / report terminal title", "REVIEW REPORT", (0, .033, .024), .085, result_light)
    title.parent = memo
    subtitle = text("Steelman / report terminal status", "MEMO AVAILABLE", (0, -.083, .024), .057, result_light)
    subtitle.parent = memo
    for x in (-.411, .411):
        indicator = box("Steelman / report terminal side light", (x, 0, .026),
                        (.018, .246, .012), result_light, bevel=.003)
        indicator.parent = memo
    for frame, scale in (
        (1, .001), (synthesis_end, .001), (report_frame, 1),
        (scene.frame_end, 1),
    ):
        scale_signal(memo, frame, scale)
    scene.timeline_markers.new("Steelman / synthesis", frame=synthesis_begin)
    scene.timeline_markers.new("Steelman / report delivered", frame=report_frame)


def build_holograms(scene, consoles):
    """Place the floating station titles and browser status anchors in the room."""
    from control_room_consoles import ROLE_COLORS, ROLE_LABELS

    lettering = material("Hologram / cyan lettering", (.17, .78, .92), emission=2.3)
    locations = {
        role: (*details["station_center"][:2], 2.13)
        for role, details in consoles.items()
    }
    locations["slump"] = (0, 0, 3.67)
    for role, location in locations.items():
        title = ROLE_LABELS.get(role, "STEELMAN")
        root = bpy.data.objects.new(f"Hologram / {role}", None)
        scene.collection.objects.link(root)
        root.location = location
        root.rotation_euler = (scene.camera.location - root.location).to_track_quat("Z", "Y").to_euler()
        root["hologram_role"] = role
        heading = text(f"{title} floating title", title, (0, .092, 0), .20, lettering)
        heading.parent = root
        accent = ROLE_COLORS.get(role, (.23, .82, .98, 1.0))
        edge = material(f"Hologram / {title} trace", accent[:3], emission=1.35)
        width = max(.64, len(title) * .079)
        for side in (-1, 1):
            rail = trace(f"Hologram / {title} bracket", [
                (side * (width - .25), -.073, 0),
                (side * width, -.073, 0),
                (side * (width + .10), .012, 0),
                (side * (width + .10), .21, 0),
            ], .009, edge)
            rail.parent = root
        status = bpy.data.objects.new(f"Hologram / {title} status anchor", None)
        scene.collection.objects.link(status)
        status.parent = root
        status.location = (0, -.195, .015)
        status["hologram_status"] = role


def dress_floor():
    floor = bpy.data.materials["Tactile Architecture | ceramic graphite"]
    nodes, links = floor.node_tree.nodes, floor.node_tree.links
    shader = nodes.get("Principled BSDF")
    # Pack a repeatable deck tile so the wear and seams also survive glTF export.
    size = 512
    rng = np.random.default_rng(1707)
    y, x = np.mgrid[0:size, 0:size] / size
    edge = np.minimum.reduce((x, y, 1 - x, 1 - y))
    surface = 1 + rng.normal(0, .035, (size, size))
    surface += .055 * np.sin(2 * math.tau * x + np.cos(math.tau * y))
    surface[edge < .006] *= .41
    surface[(edge >= .006) & (edge < .012)] *= 1.24
    for u, v in ((.039, .039), (.961, .039), (.039, .961), (.961, .961)):
        d = (x - u)**2 + (y - v)**2
        surface[d < .012**2] *= .54
        surface[d < .006**2] *= 1.6
    for _ in range(24):
        u, v = rng.uniform(.06, .94, 2)
        length = rng.uniform(.018, .106)
        scratch = (x > u) & (x < u + length) & (abs(y - v + .23 * (x - u)) < .0028)
        surface[scratch] *= rng.uniform(1.11, 1.28)
    pixels = np.ones((size, size, 4), dtype=np.float32)
    pixels[:, :, :3] = np.clip(surface[:, :, None] * (.205, .228, .252), 0, 1)
    image = bpy.data.images.new("Deck tiles | scuffed ceramic", width=size, height=size)
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    tile = nodes.new("ShaderNodeTexImage")
    tile.image = image
    links.new(tile.outputs["Color"], shader.inputs["Base Color"])
    coords = nodes.new("ShaderNodeTexCoord")
    grain = nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 125
    grain.inputs["Detail"].default_value = 2
    links.new(coords.outputs["Object"], grain.inputs["Vector"])
    roughness = nodes.new("ShaderNodeMapRange")
    roughness.inputs["To Min"].default_value = 0.76
    roughness.inputs["To Max"].default_value = 0.91
    links.new(grain.outputs["Fac"], roughness.inputs["Value"])
    links.new(roughness.outputs["Result"], shader.inputs["Roughness"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.19
    bump.inputs["Distance"].default_value = 0.012
    links.new(grain.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    ink = material("Office / white floor markings", (0.31, 0.52, 0.55), emission=0.25)
    text("Office / floor title", "TACTILE   /   REVIEW CONTROL", (0, -5.25, 0.022), 0.25, ink)
    for offset in (-1, 1):
        trace("Office / approach lane",
              [(offset * 0.95, -4.78, 0.018), (offset * 0.95, -3.12, 0.018),
               (offset * 1.49, -2.55, 0.018)], 0.012, ink)
    steel = material("Office / catwalk steel", (0.13, 0.19, 0.21), 0.68)
    safety = material("Office / rail enamel", (0.50, 0.30, 0.082), 0.40)
    for angle in (math.pi / 4, math.pi * 3 / 4):
        a, b = angle - 0.22, angle + 0.22
        p0 = (6.70 * math.cos(a), 6.70 * math.sin(a))
        p1 = (6.70 * math.cos(b), 6.70 * math.sin(b))
        for x, y in (p0, p1):
            box("Office / rail mount", (x, y, 0.049), (0.15, 0.15, 0.095), steel)
            box("Office / rail stanchion", (x, y, 0.49), (0.065, 0.065, 0.92), steel)
        trace("Office / catwalk guardrail", [(*p0, 0.94), (*p1, 0.94)], 0.035, safety)
        trace("Office / catwalk lower rail", [(*p0, 0.52), (*p1, 0.52)], 0.026, steel)


def replace_missing_paints():
    colors = {"BLUE": (0.022, 0.17, 0.33), "ORANGE": (0.70, 0.19, 0.023)}
    for original in list(bpy.data.materials):
        if original.library and original.name in colors:
            replacement = material(f"Hoverbot / {original.name.lower()} paint", colors[original.name], 0.48)
            original.user_remap(replacement)
            bpy.data.materials.remove(original, do_unlink=True)


def finish_slump():
    head = bpy.data.objects["Slump | Plane.001"]
    # The source's layered glossy shader falls back to white in glTF.
    # Retain the orange trim assignment and give the shell its own PBR finish.
    head.material_slots[0].material = material(
        "Slump / charcoal shell", (0.014, 0.017, 0.019), 0.42, 0.38,
    )


def dress_equipment():
    """Mount service infrastructure along the walls, clear of the flight lanes."""
    dark = material("Services / powder-coated aluminum", (.036, .053, .064), .32, .64)
    fastener = material("Services / brushed titanium", (.19, .22, .24), .46, .48)
    copper = material("Services / warm cable jacket", (.23, .086, .036), .08, .56)
    violet = material("Services / violet optical conduit", (.64, .035, .32), roughness=.42, emission=2.35)
    teal = material("Services / teal optical conduit", (.018, .66, .7), roughness=.42, emission=2.15)
    # Two wall-mounted raceways frame the room without crowding the occupied floor.
    for bearing, accent in ((1, teal), (5, violet)):
        angle = bearing * math.pi / 4
        normal = Vector((math.cos(angle), math.sin(angle), 0))
        side = Vector((-normal.y, normal.x, 0))

        def pos(offset, distance, height):
            return side * offset + normal * distance + Vector((0, 0, height))

        yaw = angle + math.pi / 2
        box("Services / wall utility raceway", pos(0, 7.225, 4.77), (4.93, .28, .34), dark, yaw)
        for i in range(5):
            offset = (i - 2) * .93
            box("Services / removable raceway panel", pos(offset, 7.06, 4.77), (.89, .06, .24), fastener, yaw)
            box("Services / shielded optical segment", pos(offset, 7.025, 4.72), (.70, .025, .028), accent, yaw, .007)
        for p in (-1, 1):
            end = p * 2.57
            for z in (4.48, 4.58):
                trace("Services / armored cable return", [
                    pos(end, 7.14, z - .84), pos(end, 7.14, z - .16),
                    pos(end - p * .17, 7.14, z), pos(p * 1.72, 7.14, z),
                    pos(p * 1.55, 7.14, z + .18),
                ], .024, copper)
            box("Services / cable gland", pos(end, 7.13, 3.64), (.25, .20, .12), dark, yaw)


def light(name, pos, target, energy, color, size, kind="AREA"):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == "AREA":
        data.size = size
    else:
        data.shadow_soft_size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = pos
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def color_spill(name, position, color, watts, viewer_power):
    light(name, position, (0, 0, 1), watts, color, .65, "POINT")
    # Blender's area lights are replaced by the viewer's large fill sources.
    # Export the accent's location and color with the room geometry.
    source = bpy.data.objects.new(name + " | viewer accent", None)
    bpy.context.scene.collection.objects.link(source)
    source.location = position
    source["room_light_color"] = color
    source["room_light_intensity"] = viewer_power


def configure_shot():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1060
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.frame_start, scene.frame_end, scene.render.fps = 1, PATROL_END, 24
    scene.world = bpy.data.worlds.new("Control room / ambient")
    scene.world.use_nodes = True
    ambient = scene.world.node_tree.nodes.get("Background")
    ambient.inputs["Color"].default_value = (0.16, 0.18, 0.19, 1)
    ambient.inputs["Strength"].default_value = 0.23

    camera = bpy.data.objects.new("Camera / room overview", bpy.data.cameras.new("Room overview"))
    scene.collection.objects.link(camera)
    camera.location = (5.5, -17.4, 12.5)
    camera.rotation_euler = (Vector((0, 0.45, 1.0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 37
    scene.camera = camera

    detail = bpy.data.objects.new("Camera / Steelman and console", bpy.data.cameras.new("Steelman detail"))
    scene.collection.objects.link(detail)
    detail.location = (-1.2, -7.9, 4.0)
    detail.rotation_euler = (Vector((0, 0.85, 1.52)) - detail.location).to_track_quat("-Z", "Y").to_euler()
    detail.data.lens = 32

    light("Light / overcast opening", (0, -3, 8.8), (0, 0, 0), 1650, (0.83, 0.89, 1.0), 11.0)
    light("Light / reflected skylight", (-5, 4, 6.4), (0, 0, 1), 820, (0.68, 0.77, 0.86), 8.0)
    light("Light / warm emergency spill", (5.5, 4, 5.8), (0, 0, 1), 560, (1.0, 0.56, 0.28), 5.0)
    light("Light / front soft fill", (2, -8, 4.6), (0, 0, 1.3), 380, (0.83, 0.76, 0.65), 8.0)
    light("Light / Steelman key", (0, -3.1, 4.6), (0, 0, 2.6), 335, (0.78, 0.94, 1.0), 2.4)
    light("Light / Steelman uplight", (0, 0, 1.63), (0, 0, 2.6), 23, (0.10, 0.64, 1.0), 0.5, "POINT")
    color_spill("Light / pod bank magenta", (-4.24, -4.24, 4.33), (1.0, .075, .36), 134, 89)
    color_spill("Light / utility teal", (4.18, 4.19, 4.27), (.04, .70, 1.0), 156, 85)
    compositor = bpy.data.node_groups.new("Control room / subtle bloom", "CompositorNodeTree")
    scene.compositing_node_group = compositor
    compositor.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    render = compositor.nodes.new("CompositorNodeRLayers")
    glow = compositor.nodes.new("CompositorNodeGlare")
    glow.inputs["Type"].default_value = "Fog Glow"
    glow.inputs["Threshold"].default_value = 1.35
    glow.inputs["Strength"].default_value = 0.24
    output = compositor.nodes.new("NodeGroupOutput")
    compositor.links.new(render.outputs["Image"], glow.inputs["Image"])
    compositor.links.new(glow.outputs["Image"], output.inputs["Image"])
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
                area.spaces.active.overlay.show_overlays = False
                area.spaces.active.shading.color_type = "MATERIAL"


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("--draft", action="store_true", help="Render at half resolution.")
    args.add_argument("--skip-render", action="store_true", help="Save the scene without a still render.")
    args.add_argument("--output-dir", type=Path, default=ROOT)
    args.add_argument("--models-dir", type=Path, help="Directory containing the three original actor assets.")
    opts = args.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    output = opts.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    from control_room_architecture import build_architecture
    from control_room_consoles import build_consoles
    from control_room_actors import aim_reviewer_hands, finish_actor_materials, stage_actors
    from control_room_workers import build_workers
    from control_room_pods import build_pod_lifecycle

    build_architecture()
    dress_floor()
    dress_equipment()
    build_platform()
    consoles = build_consoles()
    placements = {role: (*details["position"], details["yaw"]) for role, details in consoles.items()}
    if opts.models_dir:
        models = opts.models_dir.resolve()
        actors = stage_actors(
            placements,
            models_dir=models,
            hoverbot_archive=models / "Maintenance Hoverbot - rigged animated.zip",
        )
        handoffs = build_workers(worker_blend=models / "Worker robot.blend")
    else:
        actors = stage_actors(placements)
        handoffs = build_workers()
    aim_reviewer_hands(actors, consoles, handoffs)
    animate_review_work(consoles)
    build_suspension(actors["slump"])
    replace_missing_paints()
    finish_slump()
    finish_actor_materials()
    configure_shot()
    scene = bpy.context.scene
    build_pod_lifecycle(actors, consoles, box, material, text)
    build_steelman_flow(scene)
    build_holograms(scene, consoles)
    animate_steelman_power(scene)
    scene.frame_set(1)
    scene.render.resolution_percentage = 50 if opts.draft else 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = "//tactile_control_room_preview.png"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(
        filepath=str(output / "tactile_control_room.blend"), relative_remap=False, compress=True,
    )
    if not opts.skip_render:
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
