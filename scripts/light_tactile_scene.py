"""Create a locally relit copy of the assembled Tactile scene."""
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "tactile_review_room_lit.blend"
PREVIEW = ROOT / "tactile_review_room_lit.png"


def material(name, color, metallic=0.0, roughness=0.4, emission=0.0):
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


# Replace absent linked paints with locally editable materials. Their original
# external library is not present in the supplied asset archives.
replacements = {
    "BLUE": material("Tactile | recovered blue paint", (0.025, 0.16, 0.33), 0.65),
    "ORANGE": material("Tactile | recovered orange paint", (0.75, 0.23, 0.025), 0.55),
}
for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    for slot in obj.material_slots:
        if slot.material and slot.material.library and slot.material.name in replacements:
            replacement = replacements[slot.material.name]
            slot.link = "OBJECT"
            slot.material = replacement
for mat in list(bpy.data.materials):
    if mat.library and mat.name in replacements:
        bpy.data.materials.remove(mat, do_unlink=True)

floor = bpy.data.objects.get("Cube.001")
if floor and floor.type == "MESH":
    floor.data.materials.clear()
    floor.data.materials.append(material("Office | graphite floor", (0.055, 0.085, 0.095), 0.52, 0.52))

scene = bpy.context.scene
for obj in bpy.data.objects:
    if obj.type == "LIGHT":
        obj.hide_render = True
        obj.hide_set(True)

def area(name, location, target, energy, size, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector(target) - light.location).to_track_quat("-Z", "Y").to_euler()

area("Office | overhead softbox", (0, 4.5, 7.5), (0, 4.5, 0), 1700, 8, (0.72, 0.86, 1.0))
area("Office | cool rim", (-5, 7, 5.5), (0, 4.5, 1), 1000, 5, (0.17, 0.65, 1.0))
area("Office | warm fill", (6, 0, 5), (0, 4.5, 1), 800, 5, (1.0, 0.53, 0.25))
world = scene.world or bpy.data.worlds.new("Tactile world")
scene.world = world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.055, 0.075, 0.1, 1)
background.inputs["Strength"].default_value = 0.3
scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.view_transform = "AgX"
scene.render.filepath = str(PREVIEW)
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
bpy.ops.render.render(write_still=True)
print(f"Saved relit scene: {OUTPUT}; preview: {PREVIEW}")
