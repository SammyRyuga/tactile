"""Bake the saved Blender scene into a browser-ready glTF asset."""

import argparse
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from control_room_glb import publish_glb


def prepare_actor_materials():
    """Translate the old paint outputs into shaders glTF can represent."""
    for material in bpy.data.materials:
        active_emission = material.get("worker_active_emission")
        if active_emission is not None:
            # Export the powered-on color. The viewer fades the indicators
            # against the Blender wake/park times without a glTF shader track.
            material.node_tree.animation_data_clear()
            shader = material.node_tree.nodes["Principled BSDF"]
            shader.inputs["Emission Strength"].default_value = active_emission
        reviewer_skin = any(
            material.name.endswith(f" - {role}")
            for role in ("devils_advocate", "builder", "researcher", "operator")
        )
        worker_paint = material.name.split(".")[0] in {"Body", "Head"}
        if not (reviewer_skin or worker_paint) or material.users == 0 or material.get("control_room_finish"):
            continue
        color = tuple(material.diffuse_color)
        material.use_nodes = True
        nodes = material.node_tree.nodes
        nodes.clear()
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Roughness"].default_value = 0.37
        shader.inputs["Metallic"].default_value = 0.25
        output = nodes.new("ShaderNodeOutputMaterial")
        material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])


ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output-dir", type=Path, default=ROOT / "build" / "control-room-assets")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
output = args.output_dir.resolve() / "control-room.glb"
output.parent.mkdir(parents=True, exist_ok=True)
working = output.with_name("control-room.tmp.glb")
scene = bpy.context.scene
scene.frame_set(scene.frame_start)
prepare_actor_materials()
bpy.ops.export_scene.gltf(
    filepath=str(working),
    export_format="GLB",
    use_visible=True,
    use_renderable=True,
    export_extras=True,
    export_cameras=True,
    export_apply=True,
    export_animations=True,
    export_animation_mode="SCENE",
    export_frame_step=2,
)
publish_glb(working, output)
working.unlink()
print(f"Web model saved to {output}")
