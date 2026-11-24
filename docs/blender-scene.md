# Operator Room

The text-based Operator Room displays the selected reviewers and their progress. Recorded examples replay saved stages. Live stations track events from the current review. Missing and unrecorded checks have distinct labels. The memo and Markdown export remain available if the viewer is closed or unavailable.

## Open the original scene

1. Open a recorded demo in a viewport at least 769 CSS pixels wide. For a local run, use `npm ci` and `npm run dev` and open the [CI example](http://127.0.0.1:5173/demo?example=ci).
2. Select **Review example**, then **Run checks**. Expand **Operator Room** and select **Open 3D Operator Room**.

Expanding the room checks for the model without downloading it. The viewer requires WebGL 2 and loads the model when opened. Drag to orbit, scroll to zoom, and use **Reset camera** to return to the authored overview. The couriers illustrate support activity. Reviewer status comes from review events.

## Production and distribution

The build verifies the approved GLB by size and SHA-256, then packages the files in `build/operator-room-release`. The compiled server delivers the model on a versioned URL with Brotli, gzip, or identity encoding and serves the [attribution notice](../assets/operator-room/ATTRIBUTION.txt) alongside it. Mobile and browsers without WebGL 2 retain the text-based room. The [Blender tools](../tools/operator-room) remain an independent development package. Use the [deployment guide](DUAL_DEPLOYMENT.md#verify-a-deployment) to verify a release on its hosted origin.
