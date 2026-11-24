# Operator Room

The text-based Operator Room displays the selected reviewers and their progress. Recorded examples replay saved stages. Live stations track events from the current review. Missing and unrecorded checks have distinct labels. The memo and Markdown export remain available if the viewer is closed or unavailable.

## Preview the original scene locally

1. Place the authorized, self-contained GLB at `build/control-room-assets/control-room.glb`. Verify its size and SHA-256 against the [asset handoff](operator-room-handoff.md).
2. From the repository root, run `npm ci` and `npm run dev`.
3. Open a [recorded demo](http://127.0.0.1:5173/demo?example=ci) at a viewport at least 769 CSS pixels wide. Select **Review example**, then **Run checks**. Expand **Operator Room** and select **Load local 3D preview**.

The loopback development server checks for the model before showing the button. The viewer requires WebGL 2. Drag to orbit, scroll to zoom, and use **Reset camera** to return to the authored overview. The couriers illustrate support activity. Reviewer status comes from review events. The checkout keeps preview assets in the ignored `build` directory.

## Production and distribution

The production bundle and server exclude the 3D viewer and model route. The [Blender tools](../tools/operator-room) are an independent development package. A future rollout requires verified Worker robot distribution terms, full attribution, and performance checks on target devices. Use the [deployment guide](DUAL_DEPLOYMENT.md#verify-a-deployment) for an approved production release.
