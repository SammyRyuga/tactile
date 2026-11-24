# Original Operator Room handoff

The original `operator_room` branch preserves the scene work and the GLB anchored at commit `4e991081d1bcad47054e83a824ac173179d08c02`. The editable Blender master belongs to the local handoff package. Both assets remain outside the production build. [Source branch](https://github.com/SammyRyuga/tactile/tree/operator_room)

| Handoff file                 |      Bytes | SHA-256                                                            |
| ---------------------------- | ---------: | ------------------------------------------------------------------ |
| `tactile_control_room.blend` | 44,468,323 | `e41c3fdff066c252eb4ace01f2e768b8ddadba0556c437b6b644df4bcee22132` |
| `control-room.glb`           | 27,258,868 | `c70bdec3dc366f17f6fe6a9f86ed9b0c2ab64c9f14195e684f52409ead45be45` |

The master packs its texture images and uses Blender’s built-in font. The GLB embeds geometry, animations, and images and uses Meshopt and WebP. Use the handed-off GLB for exact bytes. Re-exporting can produce a different hash. The editable scene uses Eevee at 24 fps, frames 1–2677, and a base resolution of 1600 × 1060 with 50% preview scale.

## Inspect or re-export the master

Use Blender 5.2.3, the version recorded in the source handoff, and a supported Node version on `PATH`. The example assumes the authorized master is at `build/operator-room-inputs/tactile_control_room.blend`. Run from the repository root.

```powershell
npm ci --prefix tools/operator-room
blender --background build/operator-room-inputs/tactile_control_room.blend --python-exit-code 2 --python tools/operator-room/inspect_operator_room_assets.py
blender --background build/operator-room-inputs/tactile_control_room.blend --python-exit-code 2 --python tools/operator-room/export_control_room.py
```

The inspector checks packed dependencies, all five holograms, both original couriers, and the decision terminal. The exporter samples animations every two frames and includes visible, renderable objects, cameras, modifiers, and custom properties. The packer uses lossless Meshopt and verifies pixels before retaining a lossless WebP conversion. It also writes gzip and Brotli sidecars. Outputs default to `build/operator-room-export` so re-exporting preserves the verified file used by the [local preview](blender-scene.md#preview-the-original-scene-locally). If Blender reports the Windows shutdown error recorded in the handoff, verify that the exporter printed `Web model saved to` and that the output opens.

## Rebuild from the original actor inputs

An authorized owner can place the following inputs in a local directory. The editable master and handed-off GLB already include their geometry and textures.

| Original input                               | Provenance                                                                                     | SHA-256                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `Maintenance Hoverbot - rigged animated.zip` | ClayOgre’s Maintenance Hoverbot, `bot_normal_toolbox2.blend`, CC BY 3.0 per the archive notice | `cb240836b07d45fd6bc5afe7d6ce4a96a6c58c2eecf54a20246fe7917440963a` |
| `Slump.zip`                                  | masterxeon1001’s SafetyBotBust, `Slump2.blend`, CC BY 3.0 per the archive notice               | `0f403aac26e9c3429b0f5502b169111e43f30e923aebebf262c9630e2b391a2c` |
| `Worker robot.blend`                         | Both original couriers. Author and distribution terms remain unverified.                       | `a5b7788caae2d07e0360f55253b7868408ae8e6e7cff9942483f7c63d4b1a4bd` |

```powershell
blender --background --python-exit-code 2 --python tools/operator-room/build_tactile_control_room.py -- --models-dir build/operator-room-inputs --draft --skip-render
blender --background build/operator-room-rebuild/tactile_control_room.blend --python-exit-code 2 --python tools/operator-room/export_control_room.py -- --output-dir build/operator-room-rebuild/export
```

The room adapts the Hoverbot with four skins and station animation. It uses SafetyBotBust as Steelman with updated materials, eye lighting, and head motion. Retain the archive notices and adaptation credits. The earlier apartment and Skaro fan-art prototypes remain on the source branch and are separate from this scene. Distribution of the room requires verified Worker robot rights. [CC BY 3.0 terms](https://creativecommons.org/licenses/by/3.0/)
