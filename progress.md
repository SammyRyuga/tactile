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

## Operator Room local integration

- Integrated the three `operator_room` changes selectively. Review events drive the selected stations and Steelman. The existing review trail and export remain independent, and the visual preview uses only in-memory stage state.
- Curved action arrows and native FAQ disclosures passed keyboard checks from 320 to 1920 CSS pixels. Completed 71 Node tests, 57 Chromium tests with one desktop-only width sweep skipped in the mobile project, and eight Crossfire integration tests. The fixture evaluation and production build passed. Both npm audits found zero vulnerabilities.
- Verified the loopback 3D route with an original synthetic GLB, including compression, ranges, loading delay, context loss, missing assets and missing WebGL. The optional preview stays local until source availability, licenses and performance of the original scene are verified. The production build omits the viewer and GLB route. See the [asset inventory and rollout plan](docs/blender-scene.md).

## Operator Room manual QA

- Restored the Results-to-Operator Room gap from 0 to 16 CSS pixels. A later shared proposal rule had reset the room's margin. At 320 pixels the transformed deck also extended past the review canvas. The narrower deck at compact widths, even disclosure insets, and matched chevrons keep the panels and their contents visible.
- Named the detailed disclosure **Review activity** and made Operator Room station cards equal in size with state-specific labels and marks. Recorded playback and live checks are labeled. Unrecorded, skipped, and unavailable checks remain distinct from completed checks.
- The desktop development preview uses one typed HEAD check per page before offering a model download. Verified the actual loopback route in an isolated directory and covered valid GLB, missing and HTML responses, unavailable WebGL, loading failure, and context loss in Chromium. The production bundle excludes the viewer.
- Verified all three recorded cases and Markdown export in Windows Chrome, and the CI layout at 320, 390, 768, 1280, and 1920 pixels in both themes with keyboard and reduced motion. Passed the repository check, 71 Node tests, 63 Chromium tests with two mobile skips for desktop viewport sweeps, eight Crossfire integration tests, fixture evaluation, production build, and both dependency audits. No live provider was used.
- The original GLB and Blender master remain pending. The handoff's GLB can use the existing development path once delivered. Local scene verification, distribution permission, and performance checks remain open for the optional 3D feature.

## Original Operator Room local asset verification

- Extracted the authored GLB from Tactile commit `4e991081d1bcad47054e83a824ac173179d08c02` into the ignored local asset directory. Verified 27,258,868 bytes and SHA-256 `c70bdec3dc366f17f6fe6a9f86ed9b0c2ab64c9f14195e684f52409ead45be45` on disk and over loopback.
- Windows Chrome displayed the original room, all four reviewers, both couriers, Steelman, five holograms, and the pod and relay animations. All three recorded cases reached the decision. Mocked live reviews covered concurrent reviewers, courier handoff, reconciliation, the decision memo, cancellation, failure, and export.
- Aligned the local preview's labels with the actual recorded and live events, added a camera reset, and explicitly released decoded images and skeletal animation resources when the viewer closes. Three opens and closes released three WebGL contexts and all 24 decoded image bitmaps.
- On Intel UHD with ANGLE/D3D11, first frames appeared in 1.07–1.62 seconds and the warmed CI preview reopened in 0.68 seconds. CI activity averaged about 89 FPS over a three-second animation-frame sample. Cold shader compilation and projected labels that crowd at some angles remain optional-feature performance and readability issues.
- Passed 71 Node tests, eight Crossfire integration tests, 63 Chromium tests with two intentional skips, fixture evaluation, both npm audits, and the production build. The built frontend excludes the viewer and GLB, and the production model route returns 404 even with the GLB on disk. Worker distribution rights and rollout approval remain open.

## Local pre-release engineering audit

- Preserved the approved branch and checkpointed the original-preview work at `413272146a9ca362ffc760f67418e9efd6d32449`. The local GLB still matches the original handoff hash and is ignored.
- Hardened the live report contract, stream bounds and cancellation, extraction identity checks, request validation before quota, evaluator progress, route aliases and session restore. Added reproducible browser, stream, Unicode and lifecycle regressions.
- Re-ran Node, Crossfire and Chromium three times with 81, 8 and 74 passes per run and two intentional viewport skips. Fixture evaluation, production builds, both audits and compiled hosted-mode checks passed using local fixtures. No real provider requests were made.
- Ran 110 responsive checks, 96 seeded browser interactions, 1,600 feed transitions and 240 seeded Unicode inputs. Recorded the remaining accessibility, account and provider verification gaps in the local QA report.
- Verified all three original-asset replays and mocked live activity. The 35-second Intel UHD sample averaged 88 FPS. Twenty open-and-close cycles released 20 WebGL contexts and 160 decoded images. Shader startup and occasional frame delays still need more work before a 3D rollout.
- The compiled production artifact and runtime exclude the GLB and viewer. Worker distribution rights, Meta account entitlement and separate rollout approval remain pending.

## Local release closure

- Replayed the audit regressions against the saved checkpoint and current candidate. A synthetic subprocess confirmed that missing and failed checks remain unavailable. Tightened the Tactile adapter to discard progress for foreign claims or unselected reviewers, including nested worker events. Exercised all 15 supported panels through the worker with local fixtures.
- Profiled shader linking and an offscreen memo/export pause in headed Windows Chrome. Parallel shader preparation reduced median click-to-first-render from 1,528 to 1,087 ms in three runs per variant. The stable memo renders matched pixel-for-pixel. Suspended graphics rendering while the canvas is offscreen, reducing the matched export from 4.43 s to 26 ms. Kept the original asset, visual settings and animation state.
- Verified the real 60- and 135-second deadlines, storage errors, pending extraction reload, synthesis cancellation/reload, interrupted model retry and native Chrome zoom. Windows UI Automation exposed the expected controls. Spoken screen-reader output and external session behavior were not verified.
- The final suite passed 81 Node, 9 Crossfire and 75 Chromium cases with two existing viewport skips. Builds, fixture evaluation, dependency audits and local compiled parity passed. Twenty rendered open-and-close cycles released 20 WebGL contexts and 160 decoded image bitmaps.
- The local recorded demonstration passes. Public authored 3D still needs rights and broader device qualification. Live Meta still needs entitlement and separate verification approval.

## Operator Room release and handoff

- Merged audited candidate `63f647653d7ad93976e7e8227fb59d88fc3eabc6` in [PR #39](https://github.com/SammyRyuga/tactile/pull/39). The merge commit is `3cd9c5a65fd2e39a50d8a04e1189194d41115054`. CI and CodeQL passed on the merge. The owner confirmed production Auto-Deploy is disabled.
- Consolidated the original room's generator, exporter, inspector and packer into an independent development package. The Python syntax checks, synthetic export through the Python wrapper, Meshopt decode, WebP pixel comparison, gzip and Brotli round trips, and tool dependency audit passed. Blender and the editable master were unavailable for a fresh export on this workstation.
- Preserved the original `operator_room` branch, recovery checkpoint and asset handoff. Production builds exclude the local viewer and GLB. The optional tool package stays outside the application dependency tree.
