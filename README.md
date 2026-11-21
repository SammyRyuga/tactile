<p align="center">
  <img src="public/tactile.png" width="56" height="56" alt="" />
</p>

<h1 align="center">Tactile</h1>

<p align="center">Pressure-test engineering decisions before committing to a rollout.</p>

<p align="center">
  <a href="https://tactile-compute50.onrender.com/">Open Tactile</a> ·
  <a href="#quickstart">Run locally</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

[![CI](https://github.com/SammyRyuga/tactile/actions/workflows/ci.yml/badge.svg)](https://github.com/SammyRyuga/tactile/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![Tactile homepage with lime, graphite, and blue assembly artwork and a sign-in link](docs/screenshots/home.webp)

Tactile turns a proposed change into testable claims. It routes those claims to the checks that matter, records the evidence behind each verdict, and produces a Markdown decision memo for a design review or pull request. Built for **Compute 50 · Domain 9 · Developer Productivity and Intelligent Automation**.

## Try a review

Open `/demo` on a current build to try CI coverage, replica consistency, or feature-flag rollback. Inspect and edit claims, replay the recorded evidence, and export a Markdown memo. The public demo runs entirely in the browser and requires no account or model key. Claims outside the recorded evidence return **Unresolved**. [90-second Round 1 walkthrough](docs/round1-demo.md)

## Use the signed-in workspace

1. Sign in to [Tactile](https://tactile-compute50.onrender.com/login).
2. Open **Workspace**, enter a proposal, and select **Run stress test** for a live review. To explore first, choose a case from the **Example library**.
3. Edit the claims, select up to three, and mark claims that could change your decision as **Critical to the plan**.
4. Select **Run Tests** for a live review. Open a finding’s **Review trail** to inspect the checks and evidence, then copy or export the report as Markdown. Recent reports are available in the same signed-in tab.

Before running a live review, expand **Project evidence** to attach or paste up to three text excerpts. Attachments become context for Crossfire’s analysis. The app sends that context to your configured model provider.

Open **Add an engineering check** on a claim to enter retry, SLO, timeout, throughput, or weighted-average inputs. Tactile calculates the result and passes it to Crossfire as review context.

In a live report, use **Settle this claim** for a downloadable measurement check, **Re-review this claim** to run one claim with additional evidence, or **Track after rollout** to save a claim in the workspace’s outcome log. The outcome log stays on this device for your account and can be exported as JSON.

The example library covers changed-package tests, replica consistency, and feature-flag rollback. Live reviews send your proposal to the configured provider and use web search where applicable. Use proposals you can share with the provider.

![Claim editor with risk categories, load-bearing controls, and a visible selection count](docs/screenshots/claims.webp)

## Settings

Open **Settings** after signing in. Use the header theme button to switch between light and dark. Tactile remembers your theme in that browser. The claim editor and other animated surfaces respect the system’s reduced-motion preference.

To configure live reviews, paste your **Meta Model API key** in Settings. Choose Muse Spark, Ember, or Wonder for live reviews. Tactile checks that your key can run the selected model before saving. Your Meta account determines model access. Tactile keeps the key in server memory for the current sign-in session for up to eight hours. Signing out or restarting the server clears it. Settings never displays the saved value. Use **Remove key** to clear it before the session expires. Meta bills usage to the key’s account. The hosted app requires each user to add their own key for live reviews. [Meta Model API documentation](https://dev.meta.ai/docs/overview)

![Tactile Settings in dark mode with an empty provider key field](docs/screenshots/settings.webp)

## Quickstart

Install Node.js **22.19 or later in the 22.x line**, or **24 or later**.

```sh
git clone https://github.com/SammyRyuga/tactile.git
cd tactile
npm ci
npm run dev
```

Open the [public demo on localhost](http://127.0.0.1:5173/demo). To serve the production build locally, use `npm run build` followed by `npm start`.

To use the authenticated workspace, install Python 3.11 or newer and run `npm run setup:crossfire`. Set `TACTILE_PYTHON` to the absolute path of the virtual environment’s Python executable if you install it outside `.venv`. Then copy `.env.example` to `.env`, configure a Supabase project with email/password sign-in, and restart Tactile. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Apply the [review quota migration](supabase/migrations/20261121000000_review_quota.sql) before running a live review. In Supabase Auth, allow `http://127.0.0.1:5173/login` as a redirect.

| Variable                   | Purpose                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| `SUPABASE_URL`             | Supabase project URL.                                                       |
| `SUPABASE_PUBLISHABLE_KEY` | Public key for browser authentication and authenticated quota calls.        |
| `OPENAI_API_KEY`           | Optional OpenAI key for local reviews. Keep it out of source control.       |
| `OPENAI_MODEL`             | Model for live extraction, review, and search. Defaults to `gpt-5-mini`.    |
| `OPENAI_VERIFIER_MODEL`    | Optional model for OpenAI passage verification. Defaults to the main model. |
| `META_VERIFIER_MODEL`      | Optional model for Meta passage verification. Defaults to Muse Spark.       |
| `PORT`                     | HTTP port. Defaults to `5173` locally.                                      |
| `ALLOWED_HOSTS`            | Comma-separated API hostnames for additional domains.                       |

## How review works

- **Claim Map.** Crossfire extracts testable assumptions and selects an adversarial panel. Confirm up to three claims before running tests.
- **Isolated tests and cross-examination.** The selected evaluators test claims independently, look for evidence, and follow up on critical blockers.
- **Decision Memo.** Crossfire’s Steelman reconciles findings into **Survived**, **Weakened**, **Broken**, or **Unresolved**. The memo records **Proceed**, **Proceed with Changes**, **Hold**, or **Drop**, with its deciding factor, dissent, and next actions when available.

Tactile runs the pinned [Crossfire Python engine](server/crossfire/upstream/README.md) for authenticated live reviews. Tactile supplies the selected model, web search, and its bounded public-page fetcher. The browser uses the existing interface and report storage. Bundled examples retain their recorded results.

The browser keeps drafts and completed reports in the tab’s session storage. Refreshing during a review restores the confirmed claims so you can retry. `POST /api/claims` extracts claims and `POST /api/reviews` streams update events as NDJSON. Both require a verified session.

## Deploy to Render

Follow the [independent staging guide](docs/DUAL_DEPLOYMENT.md) to create a separate web service from this repository, verify its deployed commit, and run the public demo smoke tests. The existing hosted service may still serve an older build. An authenticated deployment needs Python 3.11 or newer and `npm run setup:crossfire` in its build command.

## Development and evaluation

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

The evaluation dataset has separate 15-case development and holdout sets, baselines, and a scoring rubric. A one-pass Meta baseline comparison is available, with human grading pending. [Evaluation protocol](docs/evaluation.md) · [Project progress](progress.md) · [Contributing guide](CONTRIBUTING.md)

## Credits and license

Tactile was built by [ryanfer123](https://github.com/ryanfer123) and [SammyRyuga](https://github.com/SammyRyuga). Tactile’s original code and documentation are available under the [MIT License](LICENSE).

Crossfire inspired the claim-review approach, including checks selected by risk and a report that traces verdicts back to evidence. [Crossfire repository](https://github.com/hriday-singh/crossfire) · [Technical breakdown](https://www.linkedin.com/pulse/crossfire-technical-breakdown-ashutosh-padhy-wnaqc/)

The homepage illustration is original artwork generated for Tactile. The site uses Bricolage Grotesque and Geist with GSAP and Lenis for motion.
