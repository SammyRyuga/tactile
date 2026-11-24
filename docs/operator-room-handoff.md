# Original Operator Room handoff

The local handoff contains the current editable `tactile_control_room.blend`
and its matching optimized `control-room.glb`. It keeps the original four
hoverbot officers, both original wheeled workers, and Slump. The apartment
and Skaro spider are separate prototypes and do not appear in this scene.

| Handoff file                 |      Bytes | SHA-256                                                            |
| ---------------------------- | ---------: | ------------------------------------------------------------------ |
| `tactile_control_room.blend` | 44,468,323 | `e41c3fdff066c252eb4ace01f2e768b8ddadba0556c437b6b644df4bcee22132` |
| `control-room.glb`           | 27,258,868 | `c70bdec3dc366f17f6fe6a9f86ed9b0c2ab64c9f14195e684f52409ead45be45` |

The Blender master already packs its texture images, including the two robots’
metal materials and the generated floor map. It uses Blender’s built-in font
and has no linked libraries or external texture paths required at runtime.
The GLB embeds its geometry, animations, and images and uses Meshopt and
WebP extensions. The website includes the matching decoder. The Git branch
carries the [original GLB export](../assets/operator-room/control-room.glb),
the reproducible tools, and this manifest. The editable master is in the
local handoff package.

## Re-export the exact master

Install the locked dependencies with `npm ci`. Use Blender **5.2.3 LTS**
(build `e13b728c6880`) and put Node.js 24 or newer, or Node.js 22.19+ in the
22.x line, on `PATH`. From the repository root in PowerShell, copy the master
into the root and run:

```powershell
$blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
& $blender -b tactile_control_room.blend --python-exit-code 2 --python scripts/inspect_operator_room_assets.py
& $blender -b tactile_control_room.blend --python-exit-code 2 --python scripts/export_control_room.py -- --output-dir build/control-room-assets
```

The source uses Eevee, 24 fps, frames 1–2677, and a 1600 × 1060 base render at
50% preview scale. The exporter samples from frame 1, includes visible and
renderable objects, applies modifiers, includes cameras and custom properties,
and bakes scene animation every two frames. The packer writes lossless
Meshopt and verified lossless WebP data plus gzip and Brotli transport variants.
If Blender reports its known Windows shutdown crash, check that the exporter
printed `Web model saved to` and that the target GLB opens in the viewer.

To use the delivered export directly, copy
`assets/operator-room/control-room.glb` to
`build/control-room-assets/control-room.glb` and run `npm run dev`.

## Rebuild from the original actor inputs

The original actor files below are used only for regenerating the scene
from scripts. The delivered master and GLB already include the geometry and
textures they use.

| Original input                               | Archive identity                                                                                                               | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `Maintenance Hoverbot - rigged animated.zip` | `bot_normal_toolbox2.blend` and the notice for [ClayOgre’s Maintenance Hoverbot](https://blendswap.com/blend/77451), CC BY 3.0 | `cb240836b07d45fd6bc5afe7d6ce4a96a6c58c2eecf54a20246fe7917440963a` |
| `Slump.zip`                                  | `Slump2.blend` and the notice for [masterxeon1001’s SafetyBotBust](https://blendswap.com/blend/71997), CC BY 3.0               | `0f403aac26e9c3429b0f5502b169111e43f30e923aebebf262c9630e2b391a2c` |
| `Worker robot.blend`                         | Both original couriers                                                                                                         | `a5b7788caae2d07e0360f55253b7868408ae8e6e7cff9942483f7c63d4b1a4bd` |

The room adapts the Hoverbot with four skins and custom station animation,
and adapts SafetyBotBust as the floating Steelman with updated materials,
eye lighting, and head motion. Both archive notices link to
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

```powershell
& $blender -b --python-exit-code 2 --python scripts/build_tactile_control_room.py -- --models-dir 'D:\tactile_models' --output-dir build/operator-room-rebuild --draft --skip-render
& $blender -b build/operator-room-rebuild/tactile_control_room.blend --python-exit-code 2 --python scripts/export_control_room.py -- --output-dir build/operator-room-rebuild/export
```

Use the handed-off master for the exact scene. A new Blender save or export
may produce different file bytes, so the table above identifies only the
delivered files. Production rollout and GPU performance measurement are
tracked separately.
