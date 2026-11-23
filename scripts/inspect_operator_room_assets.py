"""Check the loaded Operator Room master for external dependencies and actors."""

import json

import bpy


scene = bpy.context.scene
expected = {"builder", "devils_advocate", "operator", "researcher", "slump"}
labels = {obj["hologram_role"] for obj in scene.objects if "hologram_role" in obj}
workers = [obj for obj in scene.objects if "worker_park_times" in obj]
images = sorted(image.name for image in bpy.data.images if image.packed_files)
external = [
    image.name for image in bpy.data.images
    if image.source in {"FILE", "SEQUENCE", "MOVIE", "TILED"} and not image.packed_files
]
external.extend(
    font.name for font in bpy.data.fonts
    if font.filepath not in {"", "<builtin>"} and not font.packed_file
)
external.extend(library.filepath for library in bpy.data.libraries)
assert not external, f"External Blender dependencies: {external}"
assert labels == expected, f"Unexpected holograms: {sorted(labels)}"
assert len(workers) == 2 and all(obj.get("source_model") == "Worker robot.blend" for obj in workers)
assert any(obj.get("review_memo") for obj in scene.objects), "The decision terminal is missing"
print(json.dumps({
    "blender": bpy.app.version_string,
    "renderer": scene.render.engine,
    "fps": scene.render.fps / scene.render.fps_base,
    "frames": [scene.frame_start, scene.frame_end],
    "render_resolution": [scene.render.resolution_x, scene.render.resolution_y],
    "render_percentage": scene.render.resolution_percentage,
    "original_couriers": sorted(obj.name for obj in workers),
    "holograms": sorted(labels),
    "packed_images": images,
    "external_dependencies": external,
}, indent=2))
