# Progress

## Compute 50 Round 1

- Built the no-key walkthrough from proposal through confirmed claims, evidence, verdicts, and Markdown export.
- Added live claim extraction, independent review checks, source validation, and streamed progress.
- Added repository onboarding, contribution guidance, MIT licensing, CI, and a baseline comparison protocol.

## Verification

- `npm run check` passed formatting, lint, type checks, all 12 tests, and the production build.
- Chrome verified the no-key workflow at 1,487 px desktop and 390 px mobile widths. The walkthrough covered claim edits, add/remove, cancellation, retry, keyboard focus, evidence links, and Markdown export.
- Live API behavior was exercised with provider fixtures. A real provider smoke test and the four-case comparative evaluation are pending credentials. The [evaluation guide](docs/evaluation.md) includes the prewritten expectations and the commands.
- GitHub Actions runs the same checks on each push and pull request. [CI workflow](https://github.com/SammyRyuga/tactile/actions/workflows/ci.yml)

## Hosted app

- Added a public homepage, direct demo entry, Supabase email/password screens, and sign-out.
- Added Render-compatible binding and health checks. Hosted live reviews require a verified account and have hourly usage limits.

## Review quality and auditability

- Added claim routing, load-bearing labels, an engineering scope gate, explicit arithmetic checks, a passage verification pass, and an expandable trail in reports and Markdown.
- Added specific unresolved reasons and repair tradeoffs. The review preserves its recommendation when individual claims need more information.
- Added tab-session restoration, production security headers, and a Supabase-backed rolling account quota.
- Added a 15-case development set and a 15-case holdout with a repeatable runner and scoring rubric. Credentialed comparative results are pending.
- Verified the deployed quota migration enables row-level security, denies anonymous execution, and rejects requests without a session.

## Interface redesign

- Introduced an expressive visual system across the homepage, review workspace, and sign-in.
- Extended the homepage with an interactive case preview, review walkthrough, feature explanations, and FAQ.
- Added two new bundled scenarios and desktop/mobile browser coverage for opening a specific scenario.

## Authentication and appearance

- Required a verified Supabase session for the review workspace and Settings, including legacy example links.
- Added motion to the claim editor with reduced-motion support, and a browser-persisted dark theme.
- Added authenticated, session-scoped Meta Model API key settings and an adapter for Muse Spark. Provider requests are covered by fixtures pending a credentialed run.
