# Compute 50 Round 1 walkthrough

## Rehearse on the hosted app

Open the [hosted rollout example](https://tactile-compute50.onrender.com/review?example=flag) with a verified test account. Sign in before judging and confirm the example opens at **Choose what to check**. The bundled run and Markdown export require no provider key. Visitors can read the case preview on the homepage before signing in.

## Run it locally

Use Node 22.19+ within the 22.x line or Node 24+. Configure Supabase as described in the [README](../README.md), run `npm ci` and `npm run dev`, then open [the rollout example](http://127.0.0.1:5173/review?example=flag) and sign in. The example uses bundled evidence and requires no model key. For a production-like rehearsal, run `npm run build` and `npm start` instead.

## 90-second walkthrough

1. **Decision.** “We’ll ship an in-place record writer behind a feature flag. If the rollout goes wrong, turning the flag off should restore the previous records.”
2. **Claim.** Open **Choose what to check** and read the first claim marked **Critical to the plan**. Explain that the reviewer can edit the wording and reselect which assumptions matter.
3. **Challenge.** Select **Run review**. In the first finding, open **Review trail** and read **Feasibility**. The flag is checked before future writes, while an earlier mutation is already persisted.
4. **Evidence.** Open **Bundled flag timeline**. Show the write and then the flag switch. The stored record stays changed after the flag turns off.
5. **Verdict.** Point to **Contradicted** for reversing stored records, then **Supported** for preventing new writes in this fixture. The claims make different promises.
6. **Action.** Keep the flag as a kill switch and retain the old representation or rehearse a repair job. Select **Export Markdown** to show the decision, both verdicts, and the timeline link in the memo.

Say “This is a bundled scenario with recorded evidence.” If a judge asks to try an edit, change the first claim to a materially different one and rerun. The report will mark it **Unresolved** and explain that the fixture does not cover the edited wording. Use the CI coverage example to show the difference between a contradicted coverage claim and an unresolved speed claim.

## Live follow-up

Use a test account and approved sample proposal. Configure Supabase and the quota migration per the [README](../README.md), sign in, and validate an authorized Meta Model API key in **Settings**. Use **Workspace** to find and choose claims, then review the live trail. Live search and provider availability can affect the report. Keep the local rollout example open for the judges while a live request runs.
