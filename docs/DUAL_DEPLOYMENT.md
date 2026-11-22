# Independent Tactile deployments

Both developers can run the React frontend and Express API from the same GitHub repository. Each deployment owner controls their own service, settings, and releases. The [existing Tactile site](https://tactile-compute50.onrender.com/) serves the authenticated workspace. Use a separate, explicitly authorized origin for the anonymous Round 1 demo.

| Mode                                 | Requirements                                                                 | Behavior                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public demo at `/demo`               | A current build with Supabase Auth unset                                     | Replays bundled evidence for CI coverage, replica consistency, and flag rollback in the browser. Edited claims outside the fixture are marked **Unresolved**. |
| Authenticated workspace at `/review` | Supabase Auth and a verified account                                         | Keeps reports and drafts in the signed-in tab and supports bundled runs without a provider key.                                                               |
| Live AI review                       | A verified account, both quota migrations, and a validated personal Meta key | Performs live extraction and review through the protected API. Provider usage is billed to that key's account.                                                |

## Create the independent Render service

1. Sign in to Render with the account that will own staging. Choose **New → Web Service** and connect the GitHub repository `SammyRyuga/tactile`. Grant the GitHub integration access to this repository only. Use the Git-connected service option so Render can see CI results.
2. Create a **new** service with an available name such as `tactile-round1-staging`. Use the settings below. Keep it in a separate project or workspace from the existing service, with no shared environment group.
3. Leave Supabase and AI provider environment variables unset. Let CI-gated auto-deploy finish if scheduled. If no deploy is scheduled, choose **Manual Deploy → Deploy a specific commit** on the service you are authorized to operate and select the exact verified `main` SHA.
4. Verify the running revision and smoke-test the generated HTTPS origin as described below.

Use the local rehearsal if Render requires billing setup before an authorized free service can be created. The existing authenticated service has its own release and configuration.

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

In a repository checkout with Node 24, replace the sample origin with the new service's HTTPS origin. Compare `revision` from `/health` to the checked commit. Use `git rev-parse origin/main` after fetching when testing the latest merge. Then open `/demo?example=flag` in a fresh browser. A redirect to sign-in means the origin is running in authenticated mode. Run the no-key desktop and mobile smoke tests on an origin that opens the **Public demo** directly.

```sh
git fetch origin main
git rev-parse origin/main
npm ci --include=dev
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

Use an authorized staging-only Supabase project for isolated accounts and quota counters. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the new service, enable email/password auth, and register the exact staging HTTPS `/login` redirect in that project's allowlist. Apply both [Supabase quota migrations](../supabase/migrations) in order before exercising live review. When Supabase is configured, the Render build prepares the Crossfire runtime and example links open the signed-in workspace. Keep AI keys unset during zero-key staging.

If both owners deliberately share a Supabase project, add the new redirect only with the project owner's approval and keep the existing Site URL. Accounts and database-backed per-account quotas are shared in that configuration. Sign-ins and session storage are scoped to each origin and tab. Review drafts and reports stay in their tab, outcome tracking stays in account-scoped browser storage, and provider settings live in the serving process for the sign-in session. Sign in separately on each origin.

A fallback host must run the Express application as well as serve the Vite build. Vercel's Express integration runs as a function and needs separate handling for Vite's static files. Its function instances also do not provide a durable in-memory session store. Render's persistent server process fits the current application layout. [Vercel Express integration](https://vercel.com/docs/frameworks/backend/express)
