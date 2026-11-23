"""Build a Tactile four-seat workstation scene inside the supplied apartment.

Run with Blender 5.2 (or newer):
  blender --background --python scripts/build_sci_fi_workstations.py -- \
    --asset-zip "D:/tactile_models/Sci-Fi Apartment GamerHacker Room.zip" \
    --output "D:/tactile/tactile_workstations_scene.blend"

The asset archive is read-only. Its .blend is extracted to a temporary folder,
then the room is loaded, populated, and saved to the requested output path.
"""

from __future__ import annotations

import argparse
import re
import tempfile
import zipfile
from pathlib import Path

import bpy


DEFAULT_ARCHIVE = Path(r"D:\tactile_models\Sci-Fi Apartment GamerHacker Room.zip")
DEFAULT_OUTPUT = Path(r"D:\tactile\tactile_workstations_scene.blend")
COLLECTION_NAME = "Tactile Workstations"
# This generic-name slab is the oversized white mattress in the asset scene,
# rather than the room's raised floor (`Cube.001`).
HUMAN_PROP_OBJECT_NAMES = {"Cube.003"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset-zip", type=Path, default=DEFAULT_ARCHIVE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    values = __import__("sys").argv
    return parser.parse_args(values[values.index("--") + 1 :] if "--" in values else [])


def load_apartment(archive_path: Path) -> None:
    if not archive_path.is_file():
        raise FileNotFoundError(f"Apartment archive not found: {archive_path}")
    with zipfile.ZipFile(archive_path) as archive, tempfile.TemporaryDirectory(prefix="tactile-room-") as temp:
        blend_member = next((n for n in archive.namelist() if n.lower().endswith(".blend")), None)
        if not blend_member:
            raise ValueError(f"No .blend scene found in {archive_path}")
        target = Path(temp) / Path(blend_member).name
        target.write_bytes(archive.read(blend_member))
        bpy.ops.wm.open_mainfile(filepath=str(target))


def remove_human_furnishings() -> list[str]:
    """Hide human-use props from the apartment while retaining its architecture.

    The source scene has several human furnishings embedded in a broad, poorly
    named prop collection. Match known prop names and the source buffet collection
    explicitly; leave lights and all objects in our own workstation collection.
    Hiding keeps the source meshes available for later scene edits.
    """
    prop_name = re.compile(
        r"bed|mattress|pillow|duvet|blanket|bottle|chair|armchair|sofa|couch|stool|"
        r"wardrobe|dresser|nightstand|bedside|buffet|hologram\s*table|clothes|garment|"
        r"shoe|sneaker|mug|cup|toothbrush|toothpaste|towel|cosmetic|vase|plant|rug|carpet",
        re.IGNORECASE,
    )
    buffet_collection = bpy.data.collections.get("tvl_Buffet.000")
    buffet_objects = set(buffet_collection.objects) if buffet_collection else set()
    hidden = []
    for obj in bpy.data.objects:
        if any(collection.name == COLLECTION_NAME for collection in obj.users_collection):
            continue
        # Keep actual Blender light objects so the apartment stays lit, but remove
        # a visible desk-lamp assembly if one is present in the source scene.
        visible_lamp_mesh = obj.type == "MESH" and obj.name.lower().startswith("lamp")
        if (obj in buffet_objects or prop_name.search(obj.name) or visible_lamp_mesh
                or obj.name in HUMAN_PROP_OBJECT_NAMES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(obj.name)
    print(f"Hidden {len(hidden)} human furnishings/accessories: {', '.join(hidden)}")
    return hidden


def material(name: str, color: tuple[float, float, float, float], metallic: float = 0.0,
             roughness: float = 0.35, emission: float = 0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def make_box(collection, name: str, location, dimensions, mat, bevel: float = 0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Soft machined edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def make_cylinder(collection, name: str, location, radius: float, depth: float, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Rounded edges", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 2
    obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def make_station(collection, index: int, x: float, y: float, floor_z: float, mats) -> None:
    prefix = f"WS-{index:02d}"
    top_z = floor_z + 0.83
    # Broad, slim bench with a cyan edge light and four reinforced legs.
    make_box(collection, f"{prefix} | worktop", (x, y, top_z), (2.85, 1.28, 0.12), mats["top"], 0.055)
    make_box(collection, f"{prefix} | light strip", (x, y - 0.63, top_z - 0.085), (2.6, 0.035, 0.035), mats["cyan"], 0.012)
    for dx in (-1.22, 1.22):
        for dy in (-0.48, 0.48):
            make_box(collection, f"{prefix} | leg", (x + dx, y + dy, floor_z + 0.39), (0.09, 0.09, 0.72), mats["metal"], 0.018)
    # Forward-facing widescreen console: the luminous face is on the chair side (-Y).
    screen_y = y - 0.47
    make_box(collection, f"{prefix} | display shell", (x, screen_y, top_z + 0.67), (1.68, 0.14, 0.98), mats["shell"], 0.075)
    make_box(collection, f"{prefix} | display glass", (x, screen_y - 0.077, top_z + 0.67), (1.52, 0.018, 0.81), mats["screen"], 0.028)
    make_box(collection, f"{prefix} | display status", (x, screen_y - 0.09, top_z + 0.27), (1.06, 0.012, 0.035), mats["cyan"], 0.008)
    make_box(collection, f"{prefix} | display stand", (x, screen_y + 0.02, top_z + 0.22), (0.13, 0.20, 0.38), mats["metal"], 0.025)
    make_box(collection, f"{prefix} | display foot", (x, screen_y + 0.08, top_z + 0.055), (0.68, 0.30, 0.055), mats["metal"], 0.025)
    # Keyboard and a compact side terminal.
    make_box(collection, f"{prefix} | keyboard", (x, y + 0.16, top_z + 0.085), (0.95, 0.29, 0.045), mats["shell"], 0.025)
    make_box(collection, f"{prefix} | side terminal", (x + 0.94, y + 0.17, top_z + 0.085), (0.43, 0.49, 0.045), mats["shell"], 0.025)
    for i in range(3):
        make_box(collection, f"{prefix} | terminal indicator {i + 1}",
                 (x + 0.80 + i * 0.13, y + 0.18, top_z + 0.113), (0.045, 0.11, 0.012),
                 mats["cyan"] if i == 0 else mats["amber"], 0.005)
def create_workstations() -> None:
    old = bpy.data.collections.get(COLLECTION_NAME)
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
    collection = bpy.data.collections.new(COLLECTION_NAME)
    bpy.context.scene.collection.children.link(collection)
    mats = {
        "top": material("Tactile | graphite alloy", (0.045, 0.070, 0.095, 1), 0.72, 0.27),
        "metal": material("Tactile | brushed titanium", (0.24, 0.32, 0.38, 1), 0.82, 0.24),
        "shell": material("Tactile | dark polymer", (0.018, 0.026, 0.04, 1), 0.38, 0.24),
        "dark": material("Tactile | rubber", (0.008, 0.012, 0.018, 1), 0.0, 0.7),
        "screen": material("Tactile | live display", (0.015, 0.13, 0.19, 1), 0.18, 0.18, 1.4),
        "cyan": material("Tactile | cyan LEDs", (0.015, 0.65, 0.9, 1), 0.1, 0.25, 3.0),
        "magenta": material("Tactile | magenta LEDs", (0.7, 0.045, 0.3, 1), 0.1, 0.25, 2.2),
        "amber": material("Tactile | amber indicators", (0.95, 0.32, 0.035, 1), 0.0, 0.28, 1.7),
    }
    # The apartment's large, unobstructed raised floor is centered at (1.55, 4.74),
    # 15.19 x 6.21 m, with its top surface at z=0.665 m. Keep stations in its center.
    floor_z = 0.665
    for idx, (x, y) in enumerate(((-2.25, 2.65), (2.20, 2.65), (-2.25, 6.05), (2.20, 6.05)), start=1):
        make_station(collection, idx, x, y, floor_z, mats)


def main() -> None:
    args = parse_args()
    load_apartment(args.asset_zip)
    remove_human_furnishings()
    create_workstations()
    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    print(f"Saved Tactile room and four workstations: {output}")


if __name__ == "__main__":
    main()
