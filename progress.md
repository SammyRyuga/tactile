# Progress

## Compute 50 Round 1

- Built the no-key walkthrough from proposal through confirmed claims, evidence, verdicts, and Markdown export.
- Added live claim extraction, independent review checks, source validation, and streamed progress.
- Added repository onboarding, contribution guidance, MIT licensing, CI, and a baseline comparison protocol.

## Verification

- `npm run check` passed formatting, lint, type checks, all 12 tests, and the production build.
- Chrome verified the no-key workflow at 1,487 px desktop and 390 px mobile widths. The walkthrough covered claim edits, add/remove, cancellation, retry, keyboard focus, evidence links, and Markdown export.
- Live API behavior was exercised with provider fixtures. See Workspace and review reliability below for the latest provider verification. The [evaluation guide](docs/evaluation.md) includes the prewritten expectations and the commands.
- GitHub Actions runs the same checks on each push and pull request. [CI workflow](https://github.com/SammyRyuga/tactile/actions/workflows/ci.yml)

## Hosted app

- Added a public homepage, direct demo entry, Supabase email/password screens, and sign-out.
- Added Render-compatible binding and health checks. Hosted live reviews require a verified account and have hourly usage limits.

## Review quality and auditability

- Added claim routing, load-bearing labels, an engineering scope gate, explicit arithmetic checks, a passage verification pass, and an expandable trail in reports and Markdown.
- Added specific unresolved reasons and repair tradeoffs. The review preserves its recommendation when individual claims need more information.
- Added tab-session restoration, production security headers, and a Supabase-backed rolling account quota.
- Added a 15-case development set and a 15-case holdout with a repeatable runner and scoring rubric. See the evaluation guide for the latest comparison.
- Verified the deployed quota migration enables row-level security, denies anonymous execution, and rejects requests without a session.

## Interface redesign

- Introduced an expressive visual system across the homepage, review workspace, and sign-in.
- Extended the homepage with an interactive case preview, review walkthrough, feature explanations, and FAQ.
- Added two new bundled scenarios and desktop/mobile browser coverage for opening a specific scenario.

## Authentication and appearance

- Required a verified Supabase session for the review workspace and Settings, including legacy example links.
- Added motion to the claim editor with reduced-motion support, and a browser-persisted dark theme.
- Added authenticated, session-scoped Meta Model API key settings and an adapter for Muse Spark. Provider requests are covered by fixtures.

## Workspace and review reliability

- Opened the blank proposal workspace after sign-in and moved optional cases into an example library. Added reduced-motion-aware transitions, recent reports that preserve the active draft, and clipboard export.
- Routed search by risk, enforced the load-bearing cap at review time, and added an evidence specialist. Proposal-grounded findings survive unavailable search. Explicit arithmetic mismatches can determine a verdict.
- Verified citation excerpts from bounded public HTTPS requests. Unavailable pages remain visible in the trail without a verification judgment. Exercised the source reader against the public PostgreSQL documentation.
- Added a Meta verifier override, a citation smoke probe, and zero-citation diagnostics. Added a raw-proposal baseline, request metrics, and case-level uncertainty to the evaluation runner. A credentialed Meta smoke run returned citations and completed the replica review; the three verdicts remained unresolved. Independent holdout cases remain pending.
- Required a personal Meta key for hosted live reviews and reduced the Meta synthesis workload after observing a timeout.
- Ran a focused live Meta rollback check. It returned a proposal-grounded contradiction and a repair.

## Citation quality and workspace layout

- Deduplicated research URLs per claim and required an exact, directly applicable source quote. The verifier also checks whether a proposal quote entails the specialist concern. Reports distinguish positive support from finding no credible break.
- Added bounded redirects, compressed responses, partial-body processing, and per-source fetch diagnostics. Arithmetic now checks explicit equations in prose and covers all six quantitative corpus cases.
- Stopped the proposal panel from stretching to match report history. Simplified the sidebar and verified it in Chromium at desktop and 320px widths, in RTL, and at a 720 CSS-pixel viewport.
- Ran one credentialed Meta pass over all 15 development cases. Twenty-five of 36 findings were unresolved. [Measured results and misses](docs/evaluation.md#meta-development-pass)
- Restored expressive apricot and blue surfaces for the compact workspace sidebar, with corresponding light and dark contrast checks.

## Personal key validation and review diagnostics

- Explained the personal Meta key requirement at sign-in and surfaced a Settings error for attempts to extract claims without a saved key.
- Added a small Muse Spark request to validate new keys before saving. A rejected replacement leaves the previously validated key available.
- Fixed money-to-cents comparisons and numbered equations. Reports now count unreadable sources and identify why each rejected proposal premise failed its check.
- Added reassurance scoring fields. Two blind automated reviewers agreed that one of five reassurance findings in the development pass was misleading.
- Completed the one-pass Meta baseline comparison over all 15 development cases and published blinded automated grades. Human and citation grading remain pending.
- Separated plausible integer rounding from exact mismatches. Aligned Meta key validation with production reasoning and isolated validation locks to Supabase sign-in sessions.

## Project evidence and post-rollout checks

- Added text attachments and exact claim-scoped project citations. Attachments go to the structured review provider and stay out of the web-search payload.
- Added deterministic checks for retry amplification, serial SLO composition, sequential timeout budgets, throughput units, and weighted averages.
- Added per-claim evaluator activity, verifier attribution and disagreement, and one-claim re-review. Added downloadable measurement checks and account-scoped local outcome tracking.
- Completed all 45 development trials on the previous review revision and prepared 381 blinded candidates for human grading. Recorded the unresolved rate and its case-cluster interval in the evaluation guide.

## Round 1 release verification · November 21, 2026

- **Reproducible checkout.** The initial Windows checkout failed Prettier in 49 files. Git had converted LF to CRLF, and the handoff also needed formatting. Added `.gitattributes` to align fresh checkouts with the existing LF convention, and formatted the handoff without changing its instructions.
- **Evidence paths.** In `server/pipeline.ts`, a verifier can recover a missing specialist quote, but an exact, relevant excerpt must still establish a contradiction or material limitation within the proposal’s scope. Verified premises can survive synthesis failure. Source-based findings are tied to applicable exact quotations for the same claim. Conflicting sources and unavailable evidence remain visible. Report recommendations take the accepted verdicts into account. `server/arithmetic.ts` skips incomplete equations and distinguishes plausible ceiling rounding. `tests/live.test.ts` and `tests/review.test.ts` exercise those paths and Markdown link serialization.
- **Judging walkthrough.** Added public `/demo` to `server/index.ts` and reused the existing React workflow, bundled cases, report trail, and Markdown exporter. Three cases run locally in the browser without auth or provider requests. `e2e/demo.spec.ts` covers the rollout claim, cancel and retry, evidence timeline, exported memo, and desktop and mobile layouts. See the [demo script](docs/round1-demo.md).
- **Service boundaries.** Checked Supabase session verification, request and quota limits, personal-key validation, API errors, bounded source fetching, and report rendering/export. The server reserves a concurrency slot before consuming account quota. Provider errors expose retry guidance and avoid forwarding response bodies. The public demo works during authentication outages. The registered source-fetch policy and authenticated live API boundaries remain in use. Tests use local auth and provider fixtures.
- **Evaluation.** Added `--fixtures` and extended the existing blind grader to support both splits, evidence excerpts, and unresolved counts. The fixture command reproduced two mismatches and one matching equation in the quantitative development cases, and returned the recorded verdicts in all three bundled demos. The one-pass and 45-trial live comparisons predate branch hardening. Both live smoke commands exited at the missing-credential check, and independent citation and human grading are pending. See the [evaluation report](docs/evaluation.md) and [grading instructions](docs/evaluation-grading.md).
- **Dependency and live audit.** Refreshed all seven assigned PRs and inspected failing CI jobs. The grouped React upgrade passed on isolated copies of main at `8cb7ae0` and `2adb9a7`. TypeScript 7 did not install with the current lint toolchain. See the [dependency review](docs/dependency-review.md). On the deployed service, the browser loaded the homepage, switched to the rollout case, followed the sign-in redirect, opened the signup form, and saw `{"ok":true}` at `/health`. Authenticated Render behavior needs an authorized test account. The deployed build predates this work.
- **Final branch checks.** Integrated upstream project evidence, outcome tracking, and the mobile evidence-picker fix through `2adb9a7`. `npm ci`, `npm run check`, and `npm run test:e2e` passed on Node 24.19.0 and on a fresh LF checkout with Node 22.23.5. Each check passed 45 automated tests and all 20 desktop and mobile Chromium tests. `npx playwright install chromium` completed. The blind grader passed a synthetic prepare/unblind/score round trip for each split. The production dependency audit reported zero vulnerabilities. The full dependency audit reported a moderate development-only ESLint/minimatch advisory.

## Beginner workspace and model settings

- Added short instructions and a sample plan, explained claims in the review flow, and added a Meta model picker that validates the choice before saving.
- Grouped repeated Meta prompt prefixes under stable routing keys, recorded cached input tokens, and trimmed duplicated evidence from synthesis.
- Reused identical claim extraction for five minutes within the signed-in model session. Verified that changing the model clears the cache.
- Kept the workflow and example library behind sign-in. Previous example links direct users to their signed-in workspace.
- Verified all 46 unit and HTTP tests and 20 desktop and mobile browser tests. Meta accepted the test key for all three models and reported zero cached input tokens in the two-request probe.

## Compute 50 final validation · November 21, 2026

- Started on `feat/compute50-final-validation` from current `main`. The workspace and model-picker revision `62c6379` passed both CI jobs. The subsequent CodeQL addition `4ff38ac` passed CodeQL and failed Prettier in the main CI workflow. Formatted the workflow and verified it with Prettier’s AST check.
- Updated React and React DOM together to 19.3.1. The lockfile resolves a single React version and scheduler 0.28.0. Clean installs, `npm run check` (46 tests), and `npm run test:e2e` (20 Chromium tests) passed on Node 22.23.5 and 24.19.0. Fixture evaluation still returned the expected verdicts. The production dependency audit reported zero vulnerabilities. The full audit reported the existing ESLint/minimatch advisory.
- Kept TypeScript at 5.9.3. The current `typescript-eslint` 8.73.0 release declares a TypeScript peer range below 6.1.0. See the [dependency review](docs/dependency-review.md).
- Updated the [Round 1 walkthrough](docs/round1-demo.md) for the signed-in bundled run. Render returned HTTP 200 for the homepage, health endpoint, and bundled evidence page, and the legacy example URL redirected to the current workspace route. Browser tests with auth fixtures verified the sign-in gate, review, evidence link, and Markdown download. Authenticated Render rehearsal and independent human and citation grading remain pending.

## Final dependency and rehearsal check · November 21, 2026

- Reproduced the development-only audit finding in [Issue #13](https://github.com/SammyRyuga/tactile/issues/13). Updated ESLint from 10.8.1 to 10.15.0, which resolves minimatch to 11.0.9 and clears [CVE-2026-118764](https://github.com/advisories/GHSA-g3hv-75wg-m249). Compared the before and after lockfiles and confirmed the production entries are identical. [Dependency review](docs/dependency-review.md)
- Node 22.23.5 and 24.19.0 passed clean installs, formatting, lint, type checking, all 46 automated tests, production builds, and all 20 Chromium tests. On both versions the fixture evaluation passed and the full and production-only dependency audits returned zero vulnerabilities. The desktop and mobile rollout tests cover the evidence link and Markdown report, show **Contradicted** and **Supported** for the two original claims, and show **Unresolved** after editing a claim.
- Verified the Render landing page, keyboard-accessible rollout preview, evidence timeline, and the `/demo` redirect through sign-in. The public bundle still reported React 19.2.8, while the repository builds with React 19.3.1. The [90-second rehearsal](docs/round1-demo.md) needs a verified test account and uses bundled evidence without a model key. No new live model or human evaluations were run.
- Removed the four stale remote branches associated with PRs #8, #9, #10, and #11 after matching the remote tips to their reviewed PR heads and confirming their effective patches were merged into `main`.

## Account-free demo and independent staging · November 21, 2026

- Opened `/demo` with bundled CI coverage, replica consistency, and feature-flag rollback. Visitors can inspect and edit claims, replay recorded checks, open evidence, and export a memo. Edited claims outside the fixture receive **Unresolved** with no source attribution. Demo drafts and reports use separate tab storage from the signed-in workspace.
- Chromium exercises all three cases on desktop and mobile, with keyboard navigation, light and dark themes, reduced motion, refresh, error recovery, and Markdown download. The demo makes no application API or provider requests. Local HTTP tests verify that anonymous users cannot access provider settings or run live extraction or reviews when auth is configured. Fixture evaluation reproduces the recorded verdicts.
- Node 22.23.5 and 24.19.0 passed clean installs, formatting, lint, types, all 47 unit and HTTP tests, production builds, all 24 Chromium tests, and fixture evaluation. Full and production dependency audits found zero vulnerabilities on both runtimes.
- Verified that the existing Render service serves the homepage and evidence timeline, responds to `/health`, and still sends `/demo` to sign-in. Creating the separate service requires an authorized Render connection. Vercel repository access requires authorization as well. The [independent deployment guide](docs/DUAL_DEPLOYMENT.md) records setup, CI-gated deploys, preview options, and a read-only smoke suite. The independent site's URL, running revision, and runtime logs are pending provisioning.

## Local Round 1 rehearsal · November 21, 2026

- Rehearsed all three bundled cases on the zero-key Windows development server in desktop Chromium and at a 320 CSS-pixel mobile viewport. Verified claim edits, recorded verdicts, source destinations, Markdown exports, refresh, browser Back, and case resets. The public flow made no provider requests.
- Corrected the review trail's singular check count and labeled its links as cited evidence. The browser regression test verifies the accessible list label and follows its bundled timeline link.

## Crossfire review routing

- Adapted Crossfire’s isolated multi-evaluator panel and targeted cross-examination to the Tactile backend. Assumptions, feasibility, and adoption reviewers check every confirmed claim. Technical and evidence claims also get evidence critique and routine public research.
- A critical claim can use one follow-up tool call on a public blocker. The follow-up uses a generic search topic; its citations go through the same independent source fetch, claim-specific applicability check, and exact-quote gate.
- Each specialist concern has its own verification entry in the review trail. The case recommendation starts from the critical claims. The workspace components, styles, and report format use their existing interfaces.
- Regression tests cover evaluator dispatch, the probe budget, private and unrelated blockers, evidence attribution, and recommendation priority. The historical 45-trial evaluation predates this routing.

## Isometric review room

- Added an interactive five-station view of the existing review events. The room highlights running checks and shows the status and a relevant excerpt for the selected station.
- Completed reports offer an optional view populated from their saved audit trail. Keyboard controls, reduced-motion styling, and responsive layouts are covered by browser tests.

## Crossfire review engine

- Integrated the pinned Crossfire core in the authenticated live review flow. The review uses Crossfire’s extraction prompts, panel, ranking, reconciliation, and decision synthesis. The existing review room consumes translated progress events.
- Retained Tactile’s model picker, API and report storage. Added Crossfire’s claim verdicts and memo sections to the current report layout. The gateway supplies the selected provider and Tactile’s bounded public-page reader.

## Render release for Crossfire

- Prepare and verify Crossfire’s Python dependencies during an authenticated Render build. Route bundled examples through sign-in on that service and retain the public fixture walkthrough for staging without Supabase.

- Removed the separate three-claim selection cap. New drafts start with all extracted claims selected, and the API accepts all claims the editor can hold.
- Show Crossfire’s suggested adversarial panel in the claim editor and allow a reviewer to be added or removed before the run. Carry the actual panel into Crossfire, the named review stations, the Decision Memo, and exported audit trails.

## Workspace UI cleanup

- Kept the active reviewer names visible in one compact setup row and collapsed reviewer settings, evidence, and individual claim options.
- Made the 3D room the main live view with the detailed activity log one step away. Grouped memo details and export actions to bring the recommendation and claim findings forward.

## Review setup and room

- Aligned the proposal, reviewer, and evidence disclosures on desktop and stacked them on narrow screens with matching indicators.
- Rebuilt the live and recorded scene as a dimensional workbench with five distinct reviewer instruments and a separate update panel.

## Stable disclosures and report history

- Stacked the claim setup and decision report disclosures in full-width rows. Opening one keeps the other controls aligned.
- Added a per-report delete button to the tab's Recent reports. Deleting a report leaves the workspace draft in place.

## Workspace dropdown styling

- Matched the risk, engineering check, and outcome selects to the workspace palette and field sizing. Browsers that support customizable native selects also get themed open menus.

## Crossfire intake and revision

- Matched the pinned Crossfire input formats in the Tactile workspace. Start with a written plan alone or add a public HTTPS link, PDF, screenshot, text file, or Markdown file.
- Pass extracted attachment text into claim extraction and review. Surface follow-up questions from Crossfire’s recovery stage and allow the user to correct the inferred decision deadline or reversibility.
- Reuse Crossfire’s original Steelman rewrite on selected fixes and let the user edit the revised draft before applying it.

## Manual COMPUTE 50 demo follow-up · November 22, 2026

- The report and export list original critical fixture claims left unchecked after replacement, removal, or deselection. Only submitted claims get verdicts. Edited claims stay **Unresolved** without fixture citations. Guidance describes evidence to collect based on the selected risk.
- The memo embeds verbatim recorded evidence with its fixture path and keeps usable web citations. Localhost links are omitted from portable exports. Saved demo reports recover coverage and excerpts while retaining their recorded verdicts.
- Confirmed at 320 CSS pixels that the shorter rollout risk label fits and moving the demo disclosures puts the first verdict higher on the page. Labeled the copy button **Copy Markdown** and aligned the rollback claim with the in-place writer proposal.
- Passed all 59 Node tests and 28 Chromium tests on Node 22.23.5 and 24.19.0. Fixture evaluation passed on both runtimes, and both dependency audits reported zero vulnerabilities.

## Beginner review walkthrough · November 22, 2026

- Simplified the workspace into Plan, Assumptions, and Results. The plan form offers optional attachments and examples. The assumption editor keeps inclusion, editing, and criticality visible and groups decision context, reviewers, project evidence, risk, and engineering checks under Advanced settings.
- Moved the running review room and activity behind optional controls. The primary progress message uses actual review events. Results show the recommendation and findings first, with the evidence, full memo, review room, revision, export, and outcome controls available in the same workflow.
- Inspected the before-and-after Chromium walkthrough and checked light and dark at 320 and 390 CSS pixels with reduced motion. Primary controls measured 46 CSS pixels, and the three steps stayed within the viewport. Added browser coverage for empty selections, longer edits, Back, repeated reviews, and advanced settings surviving a reload.
- Node 22.23.5 and 24.19.0 each passed 59 automated tests, 30 Chromium tests, fixture evaluation, and both dependency audits with zero vulnerabilities. All four Crossfire integration tests passed on Windows with local fixtures.

## Final demo polish · November 22, 2026

- Aligned the recorded Plan and Example Library cards in the two-column layout without stretching the example links. At the original 1366 CSS-pixel viewport, the gap beneath the library went from 58 pixels to zero.
- Placed Copy Markdown and Export Markdown in the Results header. The flag warning appears only when the recorded persisted-write claim was contradicted and cites the bundled timeline. Edited and unchecked claims retain their uncertainty and coverage guidance.
- Labeled missing fixture checks as not included, distinct from skipped, incomplete, and completed checks. The finished memo has its own ready state. Inspected all four screens and the room in light and dark from 320 to 1440 CSS pixels, with a Chromium 200% zoom pass for long text and an empty selection.
- Node 22.23.5 and 24.19.0 each passed 60 automated tests, 32 Chromium tests, fixture evaluation, production builds, and both dependency audits with zero vulnerabilities. All four Crossfire integration tests passed on Windows.

## Public-demo black-box QA · November 22, 2026

- Exercised 53 public-demo cases across 159 Chromium and Edge sessions. The matrix recorded 49 passing cases, three reproducible defects, and one blocked anonymous evidence-URL case.
- The recorded demo preserved unchecked-claim warnings, kept unrelated claims unresolved without sources, and included portable fixture evidence in downloaded memos. Authenticated live review remains pending authorized configuration.
- Documented zero-selection accessibility feedback, browser history skipping intermediate steps, and duplicate downloads on rapid activation in [the QA defect report](qa/blackbox/DEFECTS.md). The harness and evidence index are in [the QA run report](qa/blackbox/RUN_REPORT.md).

## Final UI and black-box repairs · November 22, 2026

- Separated Results disclosures from claim cards, corrected homepage dark-mode number contrast, and made the example showcase and trace preview size from their longest content. Verified both themes at six widths and 200% Chromium zoom, including increased homepage text size.
- Added Ryan Fernandes, Samanyu Pattanayak and Aritra Ghosh to the site footers and README. Fixed accessible zero-selection guidance, public demo browser history and duplicate Markdown downloads.
- Added rate limits to the routes flagged by CodeQL, kept the existing 12/hour default in an owner-configurable Supabase quota migration, and preserved provider Retry-After metadata. The local PostgreSQL test verified quota adjustment and permissions. Hosted databases and provider accounts were outside the run.
- The [black-box rerun](qa/blackbox/RUN_REPORT.md#follow-up-repair-verification) recorded 156 passed and three blocked executions out of 159. The authenticated evidence URL editor is still unavailable to anonymous testers.

## Merged UI release verification · November 22, 2026

- The published site reported revision `224efa8e7f559041a37a20bcc7fc7a97a30a37d9` after [PR #31](https://github.com/SammyRyuga/tactile/pull/31). CI and CodeQL passed on that revision. Desktop and mobile browser checks confirmed the homepage and team credits. The hosted examples redirected to sign-in at that revision.
- A clean Node 24 checkout passed the repository check, 46 Chromium tests, fixture evaluation, five Crossfire integration tests, and both npm audits. The local production build completed all three recorded examples and exported their memos without credentials.

## Public demo and Meta integration candidate · November 22, 2026

- Kept all recorded examples public when Supabase is configured and left the workspace, provider settings, and live APIs protected.
- Replaced the paid generation probe for saving a Meta key with the authenticated model list. Settings preserves unsaved input through failures and distinguishes access, request format, billing, rate limit, network and upstream errors with a safe request ID.
- Verified all three selected model IDs through the mocked HTTP-to-Crossfire flow, including structured generation, selected reviewers, fixture evidence, streamed progress, and Markdown export. Local checks passed 65 Node tests, 48 Chromium tests, six Python Crossfire tests, fixture evaluation and both dependency audits. A separate Supabase-configured local deployment passed all eight public smoke tests.
- The [live Meta checklist](docs/meta-live-verification.md) records what the mocks prove and how an authorized user can verify real provider access. Ryan’s original failure remains unconfirmed. Real provider calls, authenticated hosted verification and release approval remain pending.

## Repository cleanup · November 22, 2026

- Preserved the timed Round 1 walkthrough, exact-revision smoke checks, and historical release verification from closed [PR #32](https://github.com/SammyRyuga/tactile/pull/32). Updated the README and staging guide for the combined public demo and authenticated workspace.
- Removed the completed Round 1 execution plan from the active tree. The evaluation report retains the measured outcomes and grading limitations, and the QA harness retains the browser cases and evidence.
- A clean Node 24 install passed the repository check, production build, 65 Node tests, 48 Chromium tests, six Crossfire integration tests, fixture evaluation, and both npm audits. The tracked-file credential scan reported no matches.

## Meta model validation recovery

- Verify the selected model directly when Meta's model catalog is unavailable with a 404, malformed, or omits the selected ID.
- Distinguish an endpoint failure from Meta confirming that a model is unavailable. Log the model and lookup outcome without credentials.

## Explicit Meta model test

- When Meta's metadata lookup rejects a Settings save, offer an explicit short generation test of the selected model.
- Keep ordinary saves free of generation calls. Save after a model test only when Meta completes generation for the requested model and returns text.

## Emergency Meta backend verification

- Reproduced the original model error on `38b6d30` from both a valid catalog lacking the selected ID and a catalog endpoint 404. Production serves Ryan’s combined fixes at `0f5c852`. The original request’s upstream response remains unavailable.
- Preserved Ryan’s exact-model lookup. Explicit generation now requires inconclusive metadata, stops on a confirmed denial, and reports incomplete output without retrying Meta. Added a startup worker handshake and propagated cancellation and safe provider status through the Crossfire stream.
- The pinned upstream Crossfire protocol and evidence checks remain in place. Passed the repository check, 68 Node tests, 50 Chromium tests, seven Crossfire integration tests, fixture evaluation, production build, and both npm audits. A compiled Express run with mocked Supabase and Meta verified a complete live review and a missing-worker run preserved the public demo.
- [The owner smoke procedure](docs/meta-live-verification.md) defines a single manual attempt after approval. Real Meta calls, credits, and the production account’s model access remain unverified.

## Render Crossfire startup repair

- Production revision `9369462` served the public app while emitting the generic worker error. The screenshot was consistent with a slow initialization. A clean Linux build with the pinned dependency target completed its normal handshake. With a controlled startup delay, the original probe failed after 5.01 seconds and the patched worker became ready after 6.26 seconds. The original Render log did not identify the exact failure category.
- Shared interpreter and dependency selection between build and runtime, verified the full worker handshake and native imports during the authenticated Render build, and moved runtime probing off the HTTP startup path with a bounded 20-second budget and sanitized diagnostics. No files under `server/crossfire/` changed.
- Passed 68 Node tests, 52 Chromium tests, eight Crossfire integration tests, fixture evaluation, the production build, and both npm audits. The hosted-mode Linux smoke used fixture auth and verified public routes during initialization plus authenticated readiness afterward. No live provider was used.

## Local Blender room prototype

- Added local scene assembly scripts for the supplied apartment, four hoverbot reviewer skins, Slump and helper bots. The generated scenes and source assets remain local; see [asset restrictions and instructions](docs/blender-scene.md).
- The scene is an animation prototype and does not yet connect to the review event stream. Work remains to synchronize per-station motion with live, skipped, failed, and completed checks and to validate the spider model and asset rights.
- `npm run check` passed on Node 24.22.3 outside the network sandbox; the local HTTP tests could not bind ports inside it.
- Added a relighting script and a local lit scene with a graphite floor, three area lights and local replacements for two missing linked paint materials. Blender reopened the result with no linked libraries and all file images packed. Live event synchronization remains unimplemented.

## Radial Blender control room

- Built and rendered a separate octagonal control room with four role-specific consoles and hoverbots, a floating Slump head above the central platform, and a camera covering all four workspaces. The local build command and asset credits are in [the Blender scene notes](docs/blender-scene.md).
- Reopened the saved file in Blender 5.2.3 and verified movement on all five actors, packed image textures, and zero linked libraries. The motion plays on the Blender timeline. Connecting it to Tactile review events remains open.
- `npm run check` passed, including 68 Node tests and the production build.
- Refined the consoles so the bots reach their keys before the monitor, with animated wrist targets on the controls. Added Slump's fiber feeds, focusing ring, and floating receiver. Two wheeled couriers now carry cargo on separate service lanes, pause at scan pads, and return to their docks. Blender checks covered sampled wrist reach, wheel contact, scan stops, and dock returns over the 480-frame timeline.
- Isolated Slump's orange head and its armature from the overlapping blue variant in the source asset. Reopened the rebuilt scene in Blender and verified one central head mesh, four reviewers, and both maintenance courier routes.
- Added the full-screen local viewer and repeatable Blender-to-glTF export. Chrome checks covered desktop and phone layouts, concurrent reviewer motion, and the memo reveal using simulated review events. `npm run check` passed. A configured live provider was not used for verification.
- Replaced the maintenance couriers' straight lanes and loose cargo with varied patrols and four fixed service cabinets. Blender checks sampled every eighth frame of the 60-second loop for wheel contact and clearance between couriers, desks, reviewer bodies, cabinets, rails, and the hub.
- Animated Slump's head turns, nods, and emissive eyes. Added interior worker stops, reverse wheel motion, and fitted button controls. Blender checked sampled route clearance and wheel contact, and measured all 16 fingertip positions within 1 cm of their button centers.
- Reworked the room with matte walls, diffused lighting and integrated machine consoles. The couriers follow distinct 80-second assignments and exchange data with all four officers through service relays. Blender verified sampled clearance, wheel contact, and all 20 fingertip positions.
- Removed the four officer relay cabinets and floor signals. Officers now turn and lower toward the couriers for direct handoffs, then return to their consoles. Blender measured gripper gaps of 2–6 mm at the four exchange poses and verified sampled patrol clearance.
- Replaced the southwest wall display bay with four officer pods. Blender authored the shutter, flight, and docking animation. Verified that all four officers return to their original pods and the established courier handoffs still align after the timeline shift.
- Replaced rectangular pod housings with rounded pressure shells, smoked hinged canopies, and illuminated charging cradles. Tightened the docked arm pose and adjusted the canopy swing using Blender mesh clearance checks.
- Restored Slump’s charcoal shell and orange trim, and reduced the worker indicators to a low glow. The couriers now finish a cabinet interaction, park independently, and fade their indicators to black when the review ends. Verified the final poses, fingertip contacts, sampled clearance, and both material changes in the Blender scene and its glTF export.
- Chrome verified the animated worker shutdown after a simulated review report, plus desktop and mobile layouts and officer wake on reload. `npm run check` passed.
- Added cyan and magenta service lighting, textured ceramic deck panels, recessed armored cable runs, and updated console and robot finishes. The Blender timeline gives each officer an independent work cadence, Slump a varied sequence of deliberate glances, and both couriers varied transit speeds. The viewer varies shared playback speed by review so the handoffs stay aligned. Officers reverse an interrupted launch and finish an in-progress handoff before docking.
- Rendered the revised scene in Blender 5.2.3 and verified four officer handoffs, sixteen fingertip contacts, wheel contact, and sampled clearance along the worker and pod routes. The final GLB passed Chrome checks for desktop and mobile, wake on reload, four staffed stations, individual docking, and worker shutdown using simulated review events. `npm run check` passed all 68 tests.
- Keyed each pod canopy to close after launch, open for the returning officer, and latch after docking. The Steelman projection continues moving while the officers dock and fades out once they are asleep at the end of the review. Blender verified the eight canopy leaves and sampled clearance, then checked that the optical paths, packets, indicators, and projector uplight switch off.
- Verified the exported hinge poses and power metadata, then checked projector shutdown and restart in Chrome with simulated review events on desktop and mobile. The worker clearance and cabinet shutdown checks still pass, along with all 68 repository tests.
- Added Start and Stop controls to the viewer. Start replays the local shift after shutdown. Stop uses the current animation poses to return the officers, park the couriers, and power down the projector. The buttons control the room simulation, and the page still follows the automatic review feed before manual control is used.
- Workers now begin at their service cabinets with indicators off. Blender authors staggered power-on, reverse wheel motion, and a turn into the patrol lane. Start preserves the workers’ actual parking cabinets after a manual stop, and Stop during wake reverses the departure. Verified the Blender startup and shutdown poses, sampled route clearance including departure, and checked the exported worker animation and restart timing.
- Queued officers stay docked until their stage starts, and officers whose work finishes during takeoff reverse back into their pods. The viewer skips courier reaches at unstaffed stations using Blender’s neutral poses and keeps both actors on the same clock for handoffs already underway at completion or Stop. Blender verified the four neutral transitions and the existing contact and clearance checks. The review feed ignores late progress after a report or stop.
- Saved the Blender scene with native compression and made the export share byte-identical GLB data. The Blender file fell from 44.5 MB to 39.9 MB, the GLB from 68.0 MB to 47.4 MB, and the gzip download is 25.9 MB. Verified that every GLB buffer view still contains the same bytes, and checked the local server’s gzip download, uncompressed fallback, HEAD responses, and byte ranges.
- Added a cabinet-synchronized visual relay for each officer. The couriers carry a station-colored signal on their chassis, upload at the next service stop, and trigger a matching intake pulse at Steelman. The authored demo stages the final intake, synthesis sweep, and physical report terminal in order. The viewer labels the guided demo separately from live activity and exposes only stage states. Verified the four pickup and upload intervals and the order of synthesis and result in the exported GLB.
- Tested the updated viewer in Chrome on desktop and mobile with simulated review events. Verified queued officers remain docked, Steelman shows the synthesis signal, the report opens the decision terminal, and the Start and Stop controls continue to work. All 70 repository tests passed, including two feed tests for overlapping work and terminal events.
- Added lossless Meshopt packing and Brotli delivery. The GLB dropped from 47.9 MB to 30.5 MB, and the browser download from 26.0 MB to 23.0 MB. Verified byte-for-byte equality for all 3,841 decoded buffer views and scene metadata. The Blender source remains editable with its original scene data.
- Repacked the eligible floor and metal PNG textures as lossless WebP. The GLB is now 27.2 MB and the Brotli download is 19.5 MB. Verified exact decoded texture pixels, exact geometry and animation bytes, and identical scene metadata aside from encoding.
- Integrated the nearly full-width Operator Room into the local waiting screen and kept it mounted as the report opens. The embedded scene follows the originating tab’s stage feedback. Recorded examples replay their feedback at animation pace while live activity updates directly. Authored the five floating titles and status anchors in Blender and verified them in the optimized GLB. Chrome verified the bundled replay, memo, persistent iframe, and desktop and mobile sizing. All 71 repository tests passed.
- Replaced action arrows on the landing page and review workspace with the shared clipped orange tile and curved SVG. Chrome verified the hover and keyboard animations, reduced-motion behavior, 320 and 390 px layouts, and the bundled review’s Markdown download.
- Kept the curved SVG and its animation as inline icons, restoring the original control styling and layout.
- Added a smooth expand and collapse to the homepage FAQ, with an animated plus-to-minus indicator. The answers use native disclosure controls and respect reduced motion.
- Packaged the original Operator Room master and matching GLB locally with SHA-256 checksums. Blender 5.2.3 verified 21 packed images, no external dependencies, all five holograms, the original couriers, cabinet and officer contact, pod clearance, and shutdown. Verified the portable asset-directory rebuild and an independent export of the unchanged master. Animation, geometry positions, and textures matched the delivered GLB, with UV rounding differences at most 0.00000012. Chrome verified the original GLB in the standalone and embedded review flows. All 71 repository tests passed.
- Added the checksum-verified original GLB to `assets/operator-room/control-room.glb` for handoff on the `operator_room` branch.
