# Independent Tactile deployments

Both developers can run the React frontend and Express API from the same GitHub repository. Each deployment owner controls their own service, settings, and releases. The same current build serves the anonymous demo and, when Supabase is configured, the protected workspace. Independent staging stays useful for owner-controlled rehearsals and release testing.

| Mode                                 | Requirements                                                               | Behavior                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public demo at `/demo`               | A current Tactile build                                                    | Replays bundled evidence for CI coverage, replica consistency, and flag rollback in the browser. Edited claims outside the fixture are marked **Unresolved**. |
| Authenticated workspace at `/review` | Supabase Auth and a verified account                                       | Keeps reports and drafts in the signed-in tab and supports bundled runs without a provider key.                                                               |
| Live AI review                       | A verified account, the quota migration, and a validated personal Meta key | Performs live extraction and review through the protected API. Provider usage is billed to that key's account.                                                |

## Create the independent Render service

1. Sign in to Render with the account that will own staging. Choose **New → Web Service** and connect the GitHub repository `SammyRyuga/tactile`. Grant the GitHub integration access to this repository only. Use the Git-connected service option so Render can see CI results.
2. Create a **new** service with an available name such as `tactile-round1-staging`. Use the settings below. Keep it in a separate project or workspace from the existing service, with no shared environment group.
3. Leave Supabase and AI provider environment variables unset. Wait for the first build. If needed, choose **Manual Deploy → Deploy latest commit** on the new service after confirming `main` still points to the checked merge. Render's skip marker on that merge suppresses automatic deploys for the rollout. To deploy a specific earlier commit, select **Deploy a specific commit** and restore **After CI Checks Pass** afterward.
4. Verify the running revision and smoke-test the generated HTTPS origin as described below.

| Render setting        | Value                                   |
| --------------------- | --------------------------------------- |
| Repository and branch | `SammyRyuga/tactile`, `main`            |
| Runtime and instance  | **Node**, **Free**                      |
| Root directory        | Repository root (leave blank)           |
| Build command         | `npm ci --include=dev && npm run build` |
| Start command         | `npm start`                             |
| Health check path     | `/health`                               |
| Environment           | `NODE_VERSION=24.19.0`                  |
| Auto-Deploy           | **After CI Checks Pass**                |

Render supplies the port, public hostname, and Git revision. For an optional custom domain, set `ALLOWED_HOSTS` to its hostname so same-origin API requests are accepted. Free services can spin down when idle. Open the site in advance of the rehearsal. [Render web services](https://render.com/docs/web-services) · [Node version](https://render.com/docs/node-version) · [Free service limits](https://render.com/docs/free)

## Verify a deployment

In a repository checkout with Node 24, replace the sample origin with the new service's HTTPS origin. Compare `revision` from `/health` to the checked commit. Use `git rev-parse origin/main` after fetching when testing the latest merge. Then run the desktop and mobile smoke tests.

```sh
git fetch origin main
git rev-parse origin/main
npm ci
npx playwright install chromium
curl --fail --show-error https://your-staging-service.onrender.com/health
TACTILE_SMOKE_URL=https://your-staging-service.onrender.com npm run test:e2e
```

In PowerShell use `$env:TACTILE_SMOKE_URL = 'https://your-staging-service.onrender.com'` before running `npm run test:e2e`, then `Remove-Item Env:TACTILE_SMOKE_URL` when finished. If the service is cold, run the health request first and wait for it to succeed before starting the browser suite.

The smoke suite replays all three cases in Chromium, checks that the demo avoids API and external requests, opens the evidence timeline, exports the memo, and checks anonymous access to the settings read endpoint. Review the new service's **Events** and **Logs** for deploy or runtime errors. See the [Round 1 walkthrough](round1-demo.md) for a manual rehearsal.

## Development and previews

Develop on a feature branch and open a PR. Verify CI and CodeQL for the PR and for the merged commit. The independent service's CI-gated auto-deploy picks up eligible pushes to `main`. Coordinate shared-branch rollout timing with both owners if both services have auto-deploy enabled. [Render deploys](https://render.com/docs/deploys)

Render supports service previews for Git-connected pull requests. A preview uses the base instance's pricing and can consume shared free usage or inherit environment settings. Leave previews off initially. Rehearse an unmerged branch locally with `npm ci`, `npm run check`, `npm run test:e2e`, then `npm start`. If the staging owner enables previews later, use manual opt-in on the separate no-key service and confirm the plan and usage first. [Render service previews](https://render.com/docs/service-previews)

## Optional authenticated testing

Use an authorized staging-only Supabase project for isolated accounts and quota counters. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the new service, enable email/password auth, and register the exact staging HTTPS `/login` redirect in that project's allowlist. Apply both [quota migrations](../supabase/migrations) in order before exercising live review. When Supabase is configured, the Render build prepares the Crossfire runtime. The public demo remains at `/demo` and private operations remain under `/review` and `/settings`. Keep AI keys unset during zero-key staging.

If both owners deliberately share a Supabase project, add the new redirect only with the project owner's approval and keep the existing Site URL. Accounts and database-backed per-account quotas are shared in that configuration. Sign-ins and session storage are scoped to each origin and tab. Review drafts and reports stay in their tab, outcome tracking stays in account-scoped browser storage, and provider settings live in the serving process for the sign-in session. Sign in separately on each origin.

A fallback host must run the Express application as well as serve the Vite build. Vercel's Express integration runs as a function and needs separate handling for Vite's static files. Its function instances also do not provide a durable in-memory session store. Render's persistent server process fits the current application layout. [Vercel Express integration](https://vercel.com/docs/frameworks/backend/express)
