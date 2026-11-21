# COMPUTE 50 Round 1 — Execution Handoff

- **Branch:** `feat/compute50-evidence-hardening` (based on `main`)
- **Event domain:** #9 — Developer Productivity and Intelligent Automation
- **Canonical project:** Tactile, adversarial engineering-decision review
- **Live URL:** https://tactile-compute50.onrender.com/
- **Status of this document:** task plan, **not** a claim that the listed work is complete.

## Existing implementation — preserve

As documented in `README.md`, `progress.md`, `AGENTS.md`, and `docs/evaluation.md`, Tactile has:

- a proposal → extraction → user-edited claims → up-to-three-claim review → evidence trail → Markdown report workflow;
- bundled no-key examples, a signed-in workspace, Supabase email/password auth, session-scoped user Meta Muse Spark keys, server quota logic, an Express backend, and a React frontend;
- deterministic equation checks, source passage fetching and quotation checks, specialist probes, and named unresolved reasons;
- Node 22/24 GitHub Actions CI, unit tests, Playwright E2E, and a reproducible evaluation runner.

**Do not redesign, reset, or replace this work.** Follow `AGENTS.md` and `CONTRIBUTING.md`. Treat `progress.md` as a historical log: confirm claims before changing them; append only verified outcomes and remaining gaps.

## Grounded findings from repository audit (Nov 21, 2026)

- Repository `SammyRyuga/tactile` currently has **public** visibility.
- `docs/evaluation.md` reports a one-pass Muse Spark 1.3 development comparison on 12 in-scope cases: Tactile caught **8/12** prewritten targets with **5/12** false alarms; single-critique baseline caught **7/12** with **3/12** false alarms. On that run Tactile had **18 unresolved verdicts out of 36**. These are team-authored cases with automated blind grading; independent human and citation grading is pending. Do not portray these as independent wins.
- Earlier Meta dev pass had **25 unresolved out of 36**, with source fetching and missing verified proposal quotes among causes.
- `progress.md` records passing `npm run check` and browser tests at several viewports, but a new Codex run must reverify these facts before reporting them as current.
- Open Dependabot PRs (verified): #1 actions/setup-node, #2 actions/checkout, #4 React, #5 TypeScript, #6 react-dom. Already merged: #3 Vite, #7 @types/node. Ryan's assignment notifications are GitHub activity. **Do not blindly merge or close any PR.**
- The review tool's `web.run` fetch of the hosted URL was blocked, and an independent shell fetch failed DNS resolution; thus **live Render runtime is not yet verified in this audit**. Codex must explicitly test it using its available browser/network access and document any limitation.

## Tasks ordered for qualification

### P0 — audit and demo stability

1. Inspect current `main`, `AGENTS.md`, docs, outstanding PRs and GitHub Actions CI runs; confirm branch ancestry and changes made by others. Never overwrite Ryan's work.
2. Install pinned dependencies and rerun `npm run check`, `npm run test:e2e`. Verify at minimum desktop, ~390px mobile, keyboard focus, reduced motion, light/dark themes, export, cancellation/retry, no-key examples, failed-provider feedback and authentication redirects. Log exact commands and results.
3. Verify Render `/`, `/login`, and `/health`, and the public/demo/signed-in path when authorized test credentials are available. Never publish secrets, send real private proposals to an AI provider without approval, or fake an authenticated success.
4. Make a reliable, reproducible no-key judging flow requiring no paid provider and showing **claim → check → source/premise → reason → verdict → next action**. Explicitly label fixtures, previews, simulations and live output. Ensure first-time judges are not blocked by a needless sign-in if a public no-key preview can safely be provided without changing protected live APIs; otherwise provide a convincing public landing/demo video and precise sign-in instructions.

### P1 — review quality with tests

5. Diagnose missing quote / unverified citations / source read failures from corpus. Add regression tests for exact proposal quotation gates; citation-claim separation; misleading reassurance; unknown local conditions; non-applicable public sources; obvious equations; arithmetic rounding; and the distinction between contradicted, weakened, supported, unresolved, and no credible break found.
6. Repair issues that are reproducible and backed by tests; **do not force resolved verdicts just to reduce the unresolved count**. A valid abstention is better than invented certainty.
7. Run existing deterministic/fixture evaluation, then any live evaluations only with supplied authorized credentials and within provider quota. Compare against single-pass and best-of-N fairly, record latency, token/request metrics and full source evidence. Preserve prewritten cases and split hygiene. Don't mislabel automated grading as human grading or optimize on the holdout.
8. Make evidence and limitations prominent in the UI/report; every severe claim must show a verified source excerpt, an explicit quoted premise, or a deterministic counterexample. Unsupported suggestions should be unresolved.

### P2 — assigned dependency PRs and polish

9. Audit #1, #2, #4, #5 and #6 (release notes, supported Node versions, compatibility, grouped upgrade implications, CI and E2E). #4/#6 should be assessed as a compatible pair; evaluate #5 TypeScript 7 as a potentially disruptive major upgrade. #3/#7 are already merged; do not redo them. **Do not merge Dependabot PRs without explicit user approval.** Provide a recommended disposition for each.
10. Clean up errors, make the presentation and `README.md` match actual behavior, add a short recorded-demo script, and document caveats in an evidence-led way. Preserve the existing visual identity unless a visual bug warrants a focused change.

## Definition of done

- No-key end-to-end example works under clean install, producing a valid Markdown memo with traceable verdicts.
- `npm run check` and `npm run test:e2e` pass on the working branch (or specific blockers are reproducibly documented).
- Authenticated live review is tested only with authorized credentials; missing-key / offline states are graceful.
- At least one provable critical bug or reliability gap is fixed with an automated regression test, or a documented audit shows that none was reproduced.
- The evaluation report truthfully states measured Tactile and baseline outcomes and unresolved/human-grading limitations.
- Every open dependency PR has a specific recommendation, not just a blanket "merge everything".
- `progress.md` includes **verified** changes, command outputs, and remaining blockers.
- Changes are committed to this feature branch and offered in a PR for user review. No main-branch merge, destructive operations, permission changes, emails, or external deployment modifications without explicit approval.

## Operating rule for Codex

Implement continuously and make best-effort progress across the full checklist instead of stopping after an initial plan. Leave user-only secrets, credentialed checks, and approval-gated merges/deploys as explicit action items; do not claim them done.
