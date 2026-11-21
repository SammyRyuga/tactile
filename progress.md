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
