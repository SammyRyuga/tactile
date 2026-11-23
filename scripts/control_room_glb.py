"""Run the website's lossless GLB packer from Blender."""

import argparse
import subprocess
from pathlib import Path


def publish_glb(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    packer = Path(__file__).with_name("pack-control-room.mjs")
    subprocess.run(["node", str(packer), str(source), str(destination)], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    publish_glb(args.source, args.destination)
