"""Assemble the local Tactile review room from the user's Blender assets."""
from pathlib import Path
import sys
import tempfile

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_sci_fi_workstations as room
import blender_reviewer_bots as reviewers
import steelman_bots_scene as helpers

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "tactile_review_room.blend"
PREVIEW = ROOT / "tactile_review_room.png"

room.load_apartment(room.DEFAULT_ARCHIVE)
room.remove_human_furnishings()
room.create_workstations()
positions = {
    "devils_advocate": (-2.25, 3.85, 0.665),
    "builder": (2.20, 3.85, 0.665),
    "researcher": (-2.25, 7.25, 0.665),
    "operator": (2.20, 7.25, 0.665),
}
actors = bpy.data.collections.new("Steelman and support bots")
bpy.context.scene.collection.children.link(actors)
models = Path(r"D:\tactile_models")
with tempfile.TemporaryDirectory(prefix="tactile-actors-") as scratch:
    reviewers.append_reviewer_bots({
        role: (x, y, z + 1.4) for role, (x, y, z) in positions.items()
    }, target_height=1.25)
    for archive, name, height, location, animation in (
        ("Slump.zip", "Steelman", 1.1, (0, 4.55, 1.9), "idle"),
        ("Doctor Who - Skaro degradation spider - Dalek.zip", "Spider assistant", 0.5, (-4.2, 4.5, 0.95), "crawl"),
    ):
        source = helpers.blend_from_archive(models / archive, scratch)
        helpers.append_bot_from_model(source, actors, name, height, location, animation)
    helpers.append_bot_from_model(
        models / "Worker robot.blend", actors, "Worker assistant", 1.0,
        (4.3, 6.6, 1.2), "idle",
    )

station = bpy.data.collections.get(room.COLLECTION_NAME)
server_mat = room.material("Steelman | server", (0.025, 0.04, 0.06, 1), 0.7, 0.3)
room.make_box(station, "Steelman | server pedestal", (0, 4.55, 1.2), (1.1, 0.9, 1.05), server_mat, 0.06)

scene = bpy.context.scene
scene.frame_start, scene.frame_end, scene.render.fps = 1, 160, 24
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1280, 800
scene.render.resolution_percentage = 100
camera_data = bpy.data.cameras.new("Tactile overview camera")
camera = bpy.data.objects.new("Tactile overview camera", camera_data)
scene.collection.objects.link(camera)
camera.location = (10, -10, 15)
target = Vector((0, 4.5, 1))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 15
scene.camera = camera
light_data = bpy.data.lights.new("Tactile softbox", "AREA")
light_data.energy = 2200
light_data.shape = "DISK"
light_data.size = 12
light = bpy.data.objects.new("Tactile softbox", light_data)
scene.collection.objects.link(light)
light.location = (0, 3, 8)
scene.frame_set(1)
scene.render.filepath = str(PREVIEW)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
bpy.ops.render.render(write_still=True)
print(f"Saved {OUTPUT} and {PREVIEW}")
