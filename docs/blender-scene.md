# Local Blender review room prototype

The radial control room is a separate Blender scene with four review stations,
a central Steelman platform, and a cutaway overview camera. Its architecture,
consoles, and lighting are built from Blender geometry and procedural materials.
It uses Maintenance Hoverbot by ClayOgre for the four reviewers and
SafetyBotBust by masterxeon1001 for Slump, both under CC BY 3.0.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/build_tactile_control_room.py
```

The command creates `tactile_control_room.blend` and
`tactile_control_room_preview.png` at the repository root. The Blender file
opens with the four officers in rounded charging capsules in the southwest
wall bay. Play from frame 1 to see the split canopies swing open and the
officers fly to their consoles. During the
80-second work section, the couriers follow distinct rounds through the perimeter cabinets,
interior service points, and direct officer exchanges. Couriers pause and
press buttons at equipment stops. At an officer stop, the officer lifts clear
of its console, turns toward the courier, and lowers to exchange data hand to
hand. Stop durations and departure times vary within the loop.
Slump turns and nods, with two glowing lenses attached to its head rig.
The officers use integrated instrument panels and haptic controls.
Slump's platform feeds a focusing ring and a moving receiver beneath
the single orange head from the source asset.
The console graphics and movement model an illustrative review cycle.

## Full-screen local website

The editable `tactile_control_room.blend` is the source for the website.
Make scene or behavior changes in Blender first, save it, then export the
saved scene again. If editing the generator scripts, run the build command
above before exporting.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup tactile_control_room.blend --python-exit-code 1 --python scripts/export_control_room.py
npm run dev
```

Open [the local viewer](http://127.0.0.1:5173/control-room/) on the same origin
as the review workspace. Drag to orbit and scroll or pinch to zoom. The
**Guided demo** plays one authored cycle with five beats.

1. Claim intake and station wake-up
2. Parallel specialist checks for assumptions, feasibility, adoption, and evidence
3. Evidence follow-up and courier relay
4. Steelman verification and reconciliation
5. Synthesis and delivery of the decision memo

In the demo, a courier receives a color-coded packet at an officer handoff
and uploads it at its next service stop. Steelman receives the last packet
before opening the report terminal. **Start** replays the authored cycle after
shutdown. **Stop** docks the bots and powers down the projection.

When a live review starts in another tab, the viewer uses actual stage activity
to wake working officers and distinguish queued, completed, skipped, and
unavailable checks. The courier routes illustrate support and never hold up
the software. Steelman shows a live result only when Tactile emits a report.
Only stage states and timing are sent between tabs. The export lives in the
ignored `build` directory.

Run `npm ci` before exporting. The website GLB uses lossless Meshopt compression
and stores eligible texture maps as lossless WebP. The packer keeps a texture
conversion only if its decoded pixels match. For editing, open the Blender file.
The dev server negotiates Brotli or gzip for model downloads.

To watch the embedded room, open the local review workspace or bundled demo and
run the checks. The room appears in the waiting view and stays mounted when the
report opens. The bundled example paces its recorded stage feedback in the room
independently of the report. An authenticated live review uses its active
stages directly. The tab shares only stage metadata with its embedded room.
Five floating labels show deployment, the task in progress, handoffs, or the
result above the corresponding station.
The site is for local use with the supplied worker model.

On the tested Windows setup, Blender 5.2.3 reported a shutdown error after
writing the glTF file. The exporter prints `Web model saved to` after replacing
the asset, and Chrome loaded the resulting file successfully.

## Earlier apartment prototype

This prototype assembles the models supplied in `D:/tactile_models` into a
local Blender scene. It does not yet receive Tactile review events: its motion
is a repeating scene animation, not a representation of a live review. In
particular, the bots do not stop when a reviewer finishes, and a rendered
scene must not be presented as live progress.

With Blender 5.2 installed, run from the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python scripts/build_tactile_scene.py
```

The script creates `tactile_review_room.blend` and a PNG preview locally. The
source models and generated outputs are not included in the repository. Open
the `.blend` in Blender and play the timeline to inspect the prototype.

The supplied apartment and Skaro spider archives are marked as fan art and
their included license notices prohibit commercial use. Their notices also
require attribution but do not identify the author in the provided text; find
and verify the authors before distributing derivatives. The Maintenance
Hoverbot is by ClayOgre and SafetyBotBust (Slump) is by masterxeon1001; their
archives require attribution under CC BY 3.0. The Worker robot's license and
author have not been established. Do not redistribute these assets or deploy
the resulting scene until all rights and attribution are verified.

The next integration needs an explicit local event bridge, a mapping from the
existing review-room states to station animation controls, reliable handling
of simultaneous and repeated events, and tests for completion, errors,
skipped reviewers, and recorded demos. Avoid sending claim contents or provider
credentials to an untrusted local process.

## Room and work plan

The apartment has a raised central floor, surrounding walls and built-in
displays, overhead pipes, and a gridded corridor. The central floor becomes
the review area; beds, seating, and human-use accessories are hidden. Four
chairless consoles surround a Steelman server. The corridor and wall displays
offer space for support activity and shared information.

| Position      | Bot                          | Visible task to build                                                                                  |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| Front left    | Devil's Advocate hoverbot    | Inspect a claim card, test a counterexample on the console, and flag a concern.                        |
| Front right   | Builder hoverbot             | Adjust inputs and inspect a feasibility or engineering-check display.                                  |
| Back left     | Researcher hoverbot          | Compare a claim with source cards and inspect the evidence display.                                    |
| Back right    | Operator hoverbot            | Examine an operational workflow, check its control panel, and flag friction.                           |
| Center        | Slump as Steelman            | Reconcile incoming findings at the server, then assemble the decision memo when synthesis is reported. |
| Service route | Worker and spider assistants | Service equipment and move data between work areas without suggesting extra review findings.           |

These are animation goals, not yet verified event-driven behavior. Reviewer
motion must reflect the actual selected panel and streamed states, including
simultaneous work, skipped or failed checks, and repeat activity. Work should
transition to an idle or completed pose only when the relevant state supports
it; no progress percentages or verdicts should be invented.
