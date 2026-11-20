# Tactile

**Review the assumptions behind an engineering decision before you commit.**

Tactile turns a proposal into claims you can edit and prioritize. It checks confirmed claims for hidden assumptions, engineering feasibility, and public evidence, then produces a decision report with citations and a next step.

Built for **Compute 50 · Domain 9 — Developer Productivity and Intelligent Automation**.

## Run the demo

Install Node.js **22.19+ within the 22.x line**, or **24+**, then run:

```sh
git clone https://github.com/SammyRyuga/tactile.git
cd tactile
npm ci
npm run dev
```

Open [Tactile on localhost](http://127.0.0.1:5173/) and select **Try the demo**. No provider account or API key is needed.

### Judge walkthrough

1. Tactile opens a proposal to replace full pull request test runs with changed-package tests.
2. On **Confirm the claims**, keep the first three selected or edit one to see how Tactile handles a claim outside its evidence.
3. Select **Run review**. The bundled dependency replay shows how tests in the changed package can pass while a consumer fails. The speed claim stays unresolved because the example has no representative timing sample.
4. Open the evidence from the report, then select **Export Markdown** to attach the review to an engineering discussion.

## Review your own proposal

Copy `.env.example` to `.env` and set `OPENAI_API_KEY` locally. Restart Tactile and enter a proposal, then select **Extract claims**. The default model is `gpt-5-mini`; `OPENAI_MODEL` can override it with a model that supports Structured Outputs and web search. Live requests use your provider quota.

Use proposals you can share with the configured provider. Tactile keeps the working review in the open tab and keeps the provider key on the server. Refreshing resets the form. The demo does not send proposals to a provider. For a built local app, run `npm run build` followed by `npm start`.

## Hosting and accounts

The public homepage links to the review workspace and an email/password sign-in page. The demo is available without an account. Supabase verifies accounts. If live review is enabled on Render, requests also require a verified session and are subject to usage limits. Proposals and reports stay in the workspace tab.

To deploy from GitHub, create a free Render Node web service with `npm ci --include=dev && npm run build` as the build command and `npm start` as the start command. Use Node.js 22.19 or later on the 22.x line. The server binds to Render’s assigned port and exposes `/health`.

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the service. Use the project’s public publishable key. In Supabase Auth, set Site URL to the service’s HTTPS origin and allow that origin’s `/login` callback. Configure a production SMTP provider to deliver public account confirmation emails. `OPENAI_API_KEY` is optional and independent of sign-in.

## How it works

- **Decision → claims.** `POST /api/claims` converts a proposal into up to six testable claims. The user chooses up to three to review.
- **Claims → findings.** `POST /api/reviews` streams newline-delimited JSON progress. Assumptions, feasibility, and web evidence are collected independently before synthesis.
- **Findings → report.** The server maps citations back to each confirmed claim and downgrades unsupported results to **Unresolved**. Source links let the reader check applicability to their own system. The reviewer prepares a recommendation and does not execute the proposal.

Run `npm run check` for formatting, lint, types, tests, and the production build. See [evaluation](docs/evaluation.md) for the comparison protocol, [contributing](CONTRIBUTING.md) for the development workflow, and [progress](progress.md) for verification status.

## Credits and license

Tactile was built by [ryanfer123](https://github.com/ryanfer123) and [SammyRyuga](https://github.com/SammyRyuga). Tactile’s original code and documentation are available under the [MIT License](LICENSE).

**Reference:** [Crossfire technical breakdown](https://www.linkedin.com/pulse/crossfire-technical-breakdown-ashutosh-padhy-wnaqc/) inspired the claim-review approach.
