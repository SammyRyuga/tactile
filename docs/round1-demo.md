# Compute 50 Round 1 walkthrough

## Rehearse on the hosted app

On the approved release or an authorized staging service, open `/demo?example=flag` on its origin before judging to give Render time to wake up. Use a fresh browser window and verify that **Public demo** opens directly. The bundled run and Markdown export need no account or API key. If the current host redirects to sign-in, its deployed revision does not yet serve the combined release. Use the local run below while staging is being set up. [Independent staging setup](DUAL_DEPLOYMENT.md)

## Run it locally

Use Node 22.19+ within the 22.x line or Node 24+. Run `npm ci --include=dev`, `npm run build`, and `npm start`, then open [the rollout example](http://127.0.0.1:5173/demo?example=flag). The public route also works with `npm run dev`.

## 90-second walkthrough

1. **Plan · 0–20 seconds.** Show the proposal to ship an in-place record writer behind a feature flag. The team expects turning the flag off to restore earlier records. Explain that the demo replays bundled evidence.
2. **Assumptions · 20–40 seconds.** Select **Review example**. Point out the **Critical assumption** about restoring stored records and the separate assumption about preventing future writes. Select **Run checks**.
3. **Results · 40–90 seconds.** Open **Review trail**, read **Feasibility**, and open **Bundled flag timeline**. Show the persisted write and the later flag switch. Restoration is **Contradicted** and preventing future flagged writes is **Supported** in this fixture. Read the recommended next step, then select **Export Markdown** to show the recorded excerpt and its provenance.

If a judge asks to try an edit, change the first claim to a materially different one and rerun. The edited claim is **Unresolved** and its finding explains what evidence to collect. **Claim coverage** lists the original critical assumption as unchecked. Select **Choose another example** to replay CI coverage or replica consistency.

## Live follow-up

Keep the 90-second walkthrough on the recorded demo. Rehearse live review separately using the [live Meta verification procedure](meta-live-verification.md), an authorized test account, both Supabase quota migrations, and a personal Meta Model API key. Use a synthetic proposal and confirm extraction, the live evidence trail, and Markdown export before presenting the live path.
