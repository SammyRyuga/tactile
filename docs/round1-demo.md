# Compute 50 Round 1 walkthrough

## Rehearse on the hosted app

Once the independent staging service is live, open `/demo?example=flag` on its origin before judging to give Render time to wake up. Use a fresh browser window and verify that **Public demo** opens directly. The bundled run and Markdown export need no account or API key. Use the local run below while staging is being set up. [Independent staging setup](DUAL_DEPLOYMENT.md)

## Run it locally

Use Node 22.19+ within the 22.x line or Node 24+. Run `npm ci`, `npm run build`, and `npm start`, then open [the rollout example](http://127.0.0.1:5173/demo?example=flag). The public route also works with `npm run dev`.

## 90-second walkthrough

1. **Decision.** “We’ll ship an in-place record writer behind a feature flag. If the rollout goes wrong, turning the flag off should restore the previous records.”
2. **Claim.** Select **Inspect claims**. In **Choose what to check**, read the first claim marked **Critical to the plan**. Explain that the reviewer can edit the wording and reselect which assumptions matter.
3. **Challenge.** Select **Run review**. In the first finding, open **Review trail** and read **Feasibility**. The flag is checked before future writes, while an earlier mutation is already persisted.
4. **Evidence.** Open **Bundled flag timeline**. Show the write and then the flag switch. The stored record stays changed after the flag turns off.
5. **Verdict.** Point to **Contradicted** for reversing stored records, then **Supported** for preventing new writes in this fixture. The claims make different promises.
6. **Action.** Keep the flag as a kill switch and retain the old representation or rehearse a repair job. Select **Export Markdown** to show the decision, both verdicts, and the recorded timeline excerpt in the memo.

Say “This is a bundled scenario with recorded evidence.” If a judge asks to try an edit, change the first claim to a materially different one and rerun. The edited claim is **Unresolved** and its finding explains what evidence to collect. **Claim coverage** lists the original critical assumption as unchecked. Select **Choose another example** to replay CI coverage or replica consistency.

## Live follow-up

Use a test account and approved sample proposal. Configure Supabase and the quota migration per the [README](../README.md), sign in, and validate an authorized Meta Model API key in **Settings**. Use **Workspace** to find and choose claims, then review the live trail. Live search and provider availability can affect the report. Keep the local rollout example open for the judges while a live request runs.
