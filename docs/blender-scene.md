# Operator Room release candidate

Base `5a16328`. Source branch `operator_room` at `fa6accd`. This integration selects the review visualization and UI changes from `22319dc`, `d789142`, and `fa6accd`. The Blender generators and export tools remain on the source branch for an asset owner to reproduce the original scene.

## Integration matrix

| Work                                                  | Disposition                    | Release behavior                                                                                                                     |
| ----------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Review feed and station states                        | Ready after integration repair | Uses the existing review events and selected panel. The tab keeps only transient display state. Reports and exports are independent. |
| Recorded pace, room process, pod shifts and holograms | Local preview                  | The browser loads these modules on request. Recorded playback is labeled. Authored courier movement is illustrative.                 |
| Blender model and original animation tracks           | Blocked for distribution       | The checkout has no source archive or original export. The courier model has unresolved distribution rights.                         |
| Blender generator, export and pack scripts            | Deferred                       | The source branch retains them and its author notices. The production build runs without Blender, Sharp or a model.                  |
| Curved action arrows and FAQ                          | Ready                          | Native links, buttons and disclosures keep their keyboard behavior. Reduced motion disables the effects.                             |
| Mobile and failed renderer                            | Ready                          | Review stations, check trail and Markdown remain accessible without WebGL.                                                           |

## Local preview

Run `npm ci` and `npm run dev` from this checkout. Open a recorded example or an authorized local mock review and expand **Operator Room**. On desktop, the application checks the local model with a HEAD request and offers **Load local 3D preview** after the server confirms the model. Place the authorized, self-contained `control-room.glb` at `build/control-room-assets/control-room.glb` and reload the page if it was already open. The directory is ignored by Git. The loopback server serves one named asset with optional matching Brotli and gzip sidecars and supports byte ranges from the original file. The stations remain available when the file is missing, the browser lacks WebGL 2, loading fails, or the preview loses its graphics context.

The asset handoff on the Tactile `operator_room` branch documents the packed Blender master and its matching 27,258,868-byte Meshopt/WebP GLB. Compare the SHA-256 against the handoff before testing. The viewer includes the Meshopt decoder and uses an embedded overview camera. Verify the original scene’s camera, animation and performance locally after delivery.

The preview pulls only station state and recorded transitions from React memory. It uses no iframe, cross-tab storage, review text, evidence content, or credentials. A production build omits the preview and model route. A later public scene should be clearance-reviewed and packaged as a separate, versioned same-origin asset. Verify the deployed artifact contains the approved model and attribution, confirm Content-Type, compression and cache behavior, and set a size and device budget from the actual approved export. Do not add any asset to the public output before that review. [Render web services](https://render.com/docs/web-services)

## Asset inventory

| Source                                        | Author         | Evidence and next step                                                                                                                                                                                                                  |
| --------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maintenance Hoverbot, four reviewer variants  | ClayOgre       | [Creator’s BlendSwap listing](https://blendswap.com/blend/14372) identifies CC BY. The source branch records CC BY 3.0. Retain the source title, author, license link, supplied notices and adaptation credit with any approved export. |
| SafetyBotBust, used for Slump                 | masterxeon1001 | The source branch identifies CC BY 3.0. Match the exact `Slump.zip` export to the original listing and archive notice before distributing. Credit the creator, source, license and adaptations.                                         |
| Worker robot, used for two couriers           | Unverified     | `scripts/control_room_workers.py` on the source branch imports `Worker robot.blend`. Obtain explicit distribution terms and author attribution or replace it with an original model.                                                    |
| Apartment and Doctor Who Skaro spider fan art | Unverified     | The earlier prototype documents noncommercial terms. They are absent from this candidate. Keep them out of a public scene.                                                                                                              |

[CC BY 3.0 terms and attribution notes](https://creativecommons.org/licenses/by/3.0/)

## Local approval and rollout

1. Review the local branch, the regression results and the optional-scene exclusions with the owner.
2. After approval, push `integration/operator-room-release` to `origin` and open a PR into `SammyRyuga/tactile:main`.
3. Verify CI on the PR and CodeQL. Check that the production output contains no GLB, local viewer, credentials or license-restricted files. Reconcile teammate changes if the base moved.
4. Obtain owner approval to merge. For a controlled manual rollout, use the Render skip marker on the merge commit, then have the owner deploy the verified merge SHA.
5. Verify the revision at `/health`, authenticated `/api/status`, settings, public demo for all three recordings, station activity, Markdown export and anonymous API rejection. Keep the recorded demo available while the Meta account access case is open.
6. If worker readiness, demo or protected routes regress, the Render owner should roll back to the last verified production revision and recheck health, demo export and sign-in. The pre-integration baseline is `5a16328`.

## Proposed PR description

**Integrate Operator Room review states and preserve the recorded demo**

- Display live and recorded Operator Room stations from actual review events with existing authentication, checks and exports.
- Preserve the branch’s curved actions and keyboard-accessible FAQ effects.
- Keep the authored 3D preview on localhost pending asset availability and distribution approval. Provide a text fallback on every device and verify the preview path with an original synthetic GLB.
