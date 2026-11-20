# Tactile

Tactile helps engineering teams test the assumptions behind a proposed change. Review the claims that matter, see which checks and sources led to each verdict, and export a Markdown report for a design review or pull request.

Built for **Compute 50 · Domain 9 · Developer Productivity and Intelligent Automation**.

[Open the hosted app](https://tactile-compute50.onrender.com/) · [Try the bundled demo](https://tactile-compute50.onrender.com/review?demo=1)

## Quickstart

Install Node.js **22.19 or later in the 22.x line**, or **24 or later**.

```sh
git clone https://github.com/SammyRyuga/tactile.git
cd tactile
npm ci
npm run dev
```

Open [Tactile on localhost](http://127.0.0.1:5173/) and select **Try the demo**. The bundled example works without a provider key or an account.

### Walk through a review

1. Start with the example proposal to replace full pull request test runs with changed-package tests.
2. On **Confirm the claims**, review the preselected claims. You can edit the wording, change the main risk, and mark assumptions whose failure would change the decision as **Load-bearing**.
3. Select **Run review**. The bundled dependency replay shows how a change can pass its own package tests while breaking a consumer. The timing claim stays **Unresolved** until you have representative measurements.
4. Open **Review trail** on a finding to see the checks and supporting material. Review the **Smallest viable change** and its tradeoff where available, then select **Export Markdown** to share the report.

## Run a live review

Copy `.env.example` to `.env`, set `OPENAI_API_KEY`, and run `npm run dev`. Enter an engineering proposal and select **Extract claims**. Tactile extracts up to six claims. Confirm up to three for review.

| Setting                                       | Purpose                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`                              | Enables live reviews. Keep this key on the server.                                                                 |
| `OPENAI_MODEL`                                | Model for live extraction, review, and search. Defaults to `gpt-5-mini`.                                           |
| `OPENAI_VERIFIER_MODEL`                       | Optional model for the passage verification pass. Defaults to the main model.                                      |
| `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` | Enable email/password accounts and Supabase-backed quotas. Production requires both when live reviews are enabled. |
| `AUTH_REQUIRED`                               | Set to `true` to require Supabase Auth for live reviews in local development too.                                  |
| `ALLOWED_HOSTS`                               | Comma-separated API hostnames for additional domains.                                                              |
| `PORT`                                        | HTTP port. Defaults to `5173`.                                                                                     |

Custom models need Responses API support for structured output. The main model also needs web search support.

Live review sends inputs to the model provider and draws on web search. Use only material you can share with the provider. The browser keeps drafts and completed reports in the tab’s session storage. Refreshing during a review restores the confirmed claims so you can retry.

## How findings are produced

- **Route checks by risk.** Specialist checks cover assumptions, engineering feasibility, or adoption and operations as appropriate. Claims marked load-bearing get a larger search allowance. The arithmetic check evaluates explicit equations in claim text.
- **Check cited material.** A separate verification pass assesses whether each cited research excerpt supports, contradicts, qualifies, or has no bearing on the claim. These excerpts come from the provider’s search response. Follow the source links to confirm the original context.
- **Make the decision traceable.** The report records verdicts and their review trails. An **Unresolved** finding can identify insufficient evidence, conflicting sources, or a failed check. Where the review identifies a viable repair, it shows the change and the tradeoff together.

For integrations, `POST /api/claims` extracts claims and `POST /api/reviews` streams progress and results as newline-delimited JSON. Protected live endpoints require a verified Supabase session.

## Deploy to Render

1. Create a Node web service from the GitHub repository. Use an eligible Node version from the quickstart. Set the build command to `npm ci --include=dev && npm run build`, the start command to `npm start`, and the health check to `/health`.
2. For accounts and live review, apply the [review quota migration](supabase/migrations/20261121000000_review_quota.sql) to the Supabase project. Set the project URL and public publishable key in Render, then add the provider key to enable live review.
3. In Supabase Auth, set **Site URL** to the deployed HTTPS origin and add its `/login` URL to the redirect allowlist. Configure an SMTP provider to send confirmation emails for public sign-ups.

To try the production build locally, run `npm run build` followed by `npm start`.

## Verification and evaluation

Run `npm run check` for formatting, lint, types, tests, and the production build. After installing Chromium with `npx playwright install chromium`, run `npm run test:e2e` to exercise the demo on desktop and mobile.

The evaluation project includes separate 15-case development and holdout sets, baselines, and a scoring rubric. Credentialed comparison results are pending. See the [evaluation protocol](docs/evaluation.md) and [verification status](progress.md).

For development workflow and review guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits and license

Tactile was built by [ryanfer123](https://github.com/ryanfer123) and [SammyRyuga](https://github.com/SammyRyuga). Tactile’s original code and documentation are available under the [MIT License](LICENSE).

Crossfire inspired the claim-review approach, including checks selected by risk and a report that traces verdicts back to evidence. [Crossfire repository](https://github.com/hriday-singh/crossfire) · [Technical breakdown](https://www.linkedin.com/pulse/crossfire-technical-breakdown-ashutosh-padhy-wnaqc/)
