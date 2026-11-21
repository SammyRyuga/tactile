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
