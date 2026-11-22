# Compute 50 Round 1 walkthrough

## Rehearse on the hosted app

Open `/demo?example=flag` on the authorized no-key origin before judging, then start a fresh browser session and verify that **Public demo** opens directly. The existing production site uses sign-in. Use the local rehearsal below until a separate public demo origin is available. [Deployment and smoke-check instructions](DUAL_DEPLOYMENT.md)

## Run it locally

Use Node 22.19+ within the 22.x line or Node 24+. From a checkout without provider or Supabase settings, run `npm ci --include=dev`, `npm run build`, and `npm start`, then open [the rollout example](http://127.0.0.1:5173/demo?example=flag). The public route also works with `npm run dev`.

## 90-second walkthrough

1. **Plan · 0–20 seconds.** Show the rollout proposal. The team wants to disable a feature flag if the new in-place record writer fails and expects that to restore earlier records. Say that this demo replays bundled evidence.
2. **Assumptions · 20–40 seconds.** Select **Review example**. Point out the **Critical assumption** about restoring stored records and the separate assumption about preventing future writes. Select **Run checks**.
3. **Results · 40–90 seconds.** Open the first **Review trail** and its **Bundled flag timeline**. Show why restoration is **Contradicted** and preventing future flagged writes is **Supported** in this fixture. Read the recommended repair or reversible write strategy, then select **Export Markdown** to show the evidence excerpt and provenance.

If a judge asks to try an edit, change the first claim to a materially different one and rerun. The edited claim is **Unresolved** and its finding explains what evidence to collect. **Claim coverage** lists the original critical assumption as unchecked. Select **Choose another example** to replay CI coverage or replica consistency.

## Live follow-up

Live Meta reviews remain unverified for this release. Rehearse them separately with an authorized test account, Supabase, both quota migrations, and an approved personal Meta key. Use a synthetic proposal and verify extraction, selected claims, and the live evidence trail before presenting that path. Keep the 90-second walkthrough on the recorded demo.
