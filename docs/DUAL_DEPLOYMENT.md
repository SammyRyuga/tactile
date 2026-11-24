# Independent Tactile deployments

Both developers can run the React frontend and Express API from the same GitHub repository. Each deployment owner controls their own service, settings, and releases. The same current build serves the anonymous demo and, when Supabase is configured, the protected workspace. Independent staging stays useful for owner-controlled rehearsals and release testing.

| Mode                                 | Requirements                                                                 | Behavior                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public demo at `/demo`               | A current Tactile build                                                      | Replays bundled evidence for CI coverage, replica consistency, and flag rollback in the browser. Edited claims outside the fixture are marked **Unresolved**. |
| Authenticated workspace at `/review` | Supabase Auth and a verified account                                         | Keeps reports and drafts in the signed-in tab and supports bundled runs without a provider key.                                                               |
| Live AI review                       | A verified account, both quota migrations, and a validated personal Meta key | Performs live extraction and review through the protected API. Provider usage is billed to that key's account.                                                |

## Create the independent Render service

1. Sign in to Render with the account that will own staging. Choose **New → Web Service** and connect the GitHub repository `SammyRyuga/tactile`. Grant the GitHub integration access to this repository only. Use the Git-connected service option so Render can see CI results.
2. Create a **new** service with an available name such as `tactile-round1-staging`. Use the settings below. Keep it in a separate project or workspace from the existing service, with no shared environment group.
3. Leave Supabase and AI provider environment variables unset for a demo-only staging service. If no automatic deploy is scheduled and a manual rollout has been approved, choose **Manual Deploy → Deploy a specific commit** on the service you are authorized to operate. Select the exact revision that passed CI and verify it at `/health`.
4. Verify the running revision and smoke-test the generated HTTPS origin as described below.

Use the [local rehearsal](round1-demo.md#run-it-locally) if an authorized staging service is unavailable.

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

In a repository checkout with Node 24, replace the sample origin with the service's HTTPS origin. Compare `revision` from `/health` to the checked commit. Use `git rev-parse origin/main` after fetching when testing the latest merge. Open `/demo?example=flag` in a fresh browser session and confirm that **Public demo** opens directly. If you see a sign-in redirect, check the deployed revision and route before presenting. Then run the desktop and mobile smoke tests.

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

The build packages the versioned Operator Room model, its precompressed variants, and the attribution notice from the commit. On desktop, open the room in a recorded demo after the service wakes. Confirm that the browser loads the model only after **Open 3D Operator Room**, renders the scene, and still exports Markdown with the room open. The server streams the prebuilt variants. Cold starts and the visitor’s connection and GPU affect first-open time. [Operator Room guide](blender-scene.md)

### Verify Crossfire startup on Render

For an approved authenticated deploy, check the build log for `crossfire_build_ready`. It reports the Python version, the dependency mode, and the time taken by the full worker handshake. The default uses `python3` and installs the pinned requirements in `.crossfire-python`. A deliberate `TACTILE_PYTHON` override must name an executable available during both build and startup with the required packages already installed.

Then check the service log for `crossfire_runtime_ready` and sign in to confirm that `GET /api/status` returns `workerReady: true`. The worker can take up to 20 seconds to initialize while the public demo and `/health` remain available. No provider key is needed for this check.

If startup reports `crossfire_runtime_unavailable`, use its `reason` and elapsed time. For `python_not_found`, verify the selected interpreter is available at runtime. For `dependency_target_missing`, `missing_module`, or `import_failed`, verify the deployed build contains the dependency target and uses a Python version compatible with its native wheels. For `timeout`, compare the build and runtime durations. For `nonzero_exit` or `invalid_handshake`, share the revision and sanitized reason.

## Development and previews

Develop on a feature branch and open a PR. Verify CI and CodeQL for the PR and for the merged commit. The independent service's CI-gated auto-deploy picks up eligible pushes to `main`. Coordinate shared-branch rollout timing with both owners if both services have auto-deploy enabled. [Render deploys](https://render.com/docs/deploys)

Render supports service previews for Git-connected pull requests. A preview uses the base instance's pricing and can consume shared free usage or inherit environment settings. Leave previews off initially. Rehearse an unmerged branch locally with `npm ci`, `npm run check`, `npm run test:e2e`, then `npm start`. If the staging owner enables previews later, use manual opt-in on the separate no-key service and confirm the plan and usage first. [Render service previews](https://render.com/docs/service-previews)

## Optional authenticated testing

Use an authorized staging-only Supabase project for isolated accounts and quota counters. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the new service, enable email/password auth, and register the exact staging HTTPS `/login` redirect in that project's allowlist. Apply both [quota migrations](../supabase/migrations) in order before exercising live review. When Supabase is configured, the Render build prepares the Crossfire runtime. The public demo remains at `/demo` and private operations remain under `/review` and `/settings`. Keep AI keys unset during zero-key staging.

If both owners deliberately share a Supabase project, add the new redirect only with the project owner's approval and keep the existing Site URL. Accounts and database-backed per-account quotas are shared in that configuration. Sign-ins and session storage are scoped to each origin and tab. Review drafts and reports stay in their tab, outcome tracking stays in account-scoped browser storage, and provider settings live in the serving process for the sign-in session. Sign in separately on each origin.

A fallback host must run the Express application as well as serve the Vite build. Vercel's Express integration runs as a function and needs separate handling for Vite's static files. Its function instances also do not provide a durable in-memory session store. Render's persistent server process fits the current application layout. [Vercel Express integration](https://vercel.com/docs/frameworks/backend/express)
