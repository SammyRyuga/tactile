"""Build a local Blender scene from the Steelman/helper-bot source assets.

Usage:
  blender --background --python scripts/steelman_bots_scene.py -- \
    --models-dir D:/tactile_models --output D:/tactile/steelman_bots.blend

The source archives are extracted into a temporary directory and are not copied
into this repository. The resulting .blend references the appended geometry.
"""

from __future__ import annotations

import argparse
import math
import tempfile
import zipfile
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


DEFAULT_MODELS = Path(r"D:\tactile_models")
DEFAULT_OUTPUT = Path(r"D:\tactile\steelman_bots.blend")


def parse_args() -> argparse.Namespace:
    argv = __import__("sys").argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models-dir", type=Path, default=DEFAULT_MODELS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--preview", type=Path, default=None, help="Optional PNG render path")
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.collections,):
        for datablock in list(datablocks):
            if datablock.name != "Collection":
                datablocks.remove(datablock)


def load_objects(blend_path: Path, collection: bpy.types.Collection, label: str, *, object_names=None):
    """Append specified objects, or all non-camera objects when unspecified."""
    with bpy.data.libraries.load(str(blend_path), link=False) as (source, target):
        if object_names is None:
            target.objects = [name for name in source.objects if name not in {"Camera", "Camera.001"}]
        else:
            missing = set(object_names) - set(source.objects)
            if missing:
                raise ValueError(f"{blend_path.name} is missing objects: {', '.join(sorted(missing))}")
            target.objects = list(object_names)
    imported = [obj for obj in target.objects if obj is not None]
    for obj in imported:
        if obj.name not in collection.objects:
            collection.objects.link(obj)
        obj.name = f"{label} | {obj.name}"
    return imported


def append_bot_from_model(blend_path, destination_collection, name, target_height,
                          location=(0.0, 0.0, 0.0), animation=None, *, object_names=None):
    """Public integration API: append one actor into an existing Blender scene.

    `blend_path` is a .blend file, `destination_collection` is the host room's
    collection, and `location` is the requested world-space anchor location.
    Returns (motion_anchor, imported_objects). The model remains editable.
    """
    objects = load_objects(Path(blend_path), destination_collection, name, object_names=object_names)
    bpy.context.view_layer.update()
    return make_actor(name, objects, target_height, location, animation), objects


def blend_from_archive(archive_path, scratch_directory):
    """Extract an asset ZIP to temp storage and return its .blend file."""
    archive_path = Path(archive_path)
    destination = Path(scratch_directory) / archive_path.stem
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path) as source:
        members = [n for n in source.namelist() if n.lower().endswith(".blend")]
        if not members:
            raise FileNotFoundError(f"No .blend file in {archive_path}")
        for member in source.namelist():
            target = (destination / member).resolve()
            if destination.resolve() not in target.parents and target != destination.resolve():
                raise ValueError(f"Unsafe path in archive {archive_path}: {member}")
            if member.endswith("/"):
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(source.read(member))
    return destination / members[0]


def bounds(objects):
    geometry = [obj for obj in objects if obj.type in {"MESH", "CURVE", "SURFACE", "FONT", "META"} and not obj.hide_render]
    points = [obj.matrix_world @ Vector(corner) for obj in geometry for corner in obj.bound_box]
    if not points:
        return Vector((0, 0, 0)), Vector((1, 1, 1))
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    return low, high


def make_actor(name, objects, target_height, location, animate=None):
    low, high = bounds(objects)
    center = (low + high) * 0.5
    height = max(0.001, high.z - low.z)
    scale = target_height / height
    anchor = bpy.data.objects.new(f"{name} | motion", None)
    anchor.empty_display_type = "SPHERE"
    anchor.empty_display_size = 0.12
    bpy.context.scene.collection.objects.link(anchor)
    anchor.location = center
    # Parent only top-level objects: preserving internal bone/vertex parenting
    # is essential for the supplied robot rigs.
    roots = [obj for obj in objects if obj.parent is None]
    original_world = {obj: obj.matrix_world.copy() for obj in roots}
    for obj, world in original_world.items():
        obj.parent = anchor
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = Matrix.Translation(-center) @ world
    anchor.scale = (scale, scale, scale)
    anchor.location = location
    anchor["actor_name"] = name
    anchor["source_height"] = height
    anchor["target_height"] = target_height
    if animate == "idle":
        for frame, z, rot in ((1, 0.0, -0.015), (40, 0.035, 0.0), (80, 0.0, 0.015), (120, -0.035, 0.0), (160, 0.0, -0.015)):
            anchor.location.z = location[2] + z
            anchor.rotation_euler.z = rot
            anchor.keyframe_insert(data_path="location", frame=frame, group="Idle motion")
            anchor.keyframe_insert(data_path="rotation_euler", frame=frame, group="Idle motion")
    elif animate == "hover":
        for frame, z, yaw in ((1, 0.0, -0.08), (40, 0.12, 0.0), (80, 0.0, 0.08), (120, -0.1, 0.0), (160, 0.0, -0.08)):
            anchor.location.z = location[2] + z
            anchor.rotation_euler.z = yaw
            anchor.keyframe_insert(data_path="location", frame=frame, group="Hover cycle")
            anchor.keyframe_insert(data_path="rotation_euler", frame=frame, group="Hover cycle")
    elif animate == "crawl":
        for frame, x, yaw in ((1, 0.0, -0.15), (40, 0.12, 0.0), (80, 0.0, 0.15), (120, -0.12, 0.0), (160, 0.0, -0.15)):
            anchor.location.x = location[0] + x
            anchor.rotation_euler.z = yaw
            anchor.keyframe_insert(data_path="location", frame=frame, group="Scout cycle")
            anchor.keyframe_insert(data_path="rotation_euler", frame=frame, group="Scout cycle")
    return anchor


def material(name, color, metallic=0.0, roughness=0.6):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = (*color, 1)
        principled.inputs["Metallic"].default_value = metallic
        principled.inputs["Roughness"].default_value = roughness
    return mat


def add_stage() -> None:
    scene = bpy.context.scene
    floor_mat = material("Stage | graphite", (0.025, 0.04, 0.06), metallic=0.2, roughness=0.82)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.08))
    floor = bpy.context.object
    floor.name = "Stage | floor"
    floor.data.materials.append(floor_mat)

    world = bpy.data.worlds.new("Steelman | studio") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.025, 0.04, 0.065, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35

    def area(name, loc, power, size, color):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.shape, data.size, data.color = power, "DISK", size, color
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        obj.rotation_euler = (Vector((0, 0, 1.0)) - obj.location).to_track_quat("-Z", "Y").to_euler()

    area("Key | softbox", (0.5, -4.5, 6), 950, 5, (0.78, 0.88, 1.0))
    area("Rim | cool", (3, 2, 4.5), 1200, 3, (0.24, 0.58, 1.0))
    area("Fill | warm", (-4, -1, 2.8), 650, 3, (1.0, 0.54, 0.24))

    cam_data = bpy.data.cameras.new("Camera | bot lineup")
    camera = bpy.data.objects.new("Camera | bot lineup", cam_data)
    scene.collection.objects.link(camera)
    camera.location = (0.2, -7.2, 3.0)
    target = Vector((0, 0, 1.0))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = 58
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.frame_start, scene.frame_end = 1, 160
    scene.render.fps = 24
    scene.frame_set(1)


def main():
    args = parse_args()
    models = args.models_dir.expanduser().resolve()
    if not models.is_dir():
        raise SystemExit(f"Model directory not found: {models}")
    args.output.parent.mkdir(parents=True, exist_ok=True)

    reset_scene()
    stage = bpy.data.collections.get("Collection")
    stage.name = "Stage and cameras"
    slots = bpy.data.collections.new("Actors | appended source models")
    bpy.context.scene.collection.children.link(slots)

    sources = [
        ("Steelman", None, 1.95, (0.0, 0.0, 0.0), "idle"),
        ("Worker Helper", models / "Worker robot.blend", 1.15, (-1.55, 0.0, 0.0), "idle"),
        ("Maintenance Hoverbot", None, 0.72, (1.55, 0.0, 1.05), "hover"),
        ("Skaro Scout", None, 0.55, (2.35, 0.0, 0.0), "crawl"),
    ]
    with tempfile.TemporaryDirectory(prefix="tactile-bots-") as scratch:
        temp = Path(scratch)
        slump = temp / "Slump2.blend"
        spider = temp / "spider.blend"
        hover = temp / "hoverbot.blend"
        slump = blend_from_archive(models / "Slump.zip", temp)
        spider = blend_from_archive(models / "Doctor Who - Skaro degradation spider - Dalek.zip", temp)
        hover = blend_from_archive(models / "Maintenance Hoverbot - rigged animated.zip", temp)
        sources[0] = (sources[0][0], slump, *sources[0][2:])
        sources[2] = (sources[2][0], hover, *sources[2][2:])
        sources[3] = (sources[3][0], spider, *sources[3][2:])

        for label, path, height, location, anim in sources:
            if not path.is_file():
                raise SystemExit(f"Source model not found: {path}")
            anchor, objects = append_bot_from_model(path, slots, label, height, location, anim)
            print(f"Loaded {label}: {len(objects)} objects from {path.name}; height={anchor['source_height']:.3f} -> {height:.2f}")

    add_stage()
    scene = bpy.context.scene
    scene.frame_set(1)
    scene.render.filepath = str(args.preview.resolve()) if args.preview else "//steelman_bots.png"
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    if args.preview:
        bpy.ops.render.render(write_still=True)
        print(f"Rendered preview: {args.preview.resolve()}")
    print(f"Saved scene: {args.output.resolve()}")


if __name__ == "__main__":
    main()
