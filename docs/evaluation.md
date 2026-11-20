# Evaluation

Compare Tactile with one prompted critique on the same engineering proposals and confirmed claims. Both use the same configured model and access to web search. Tactile can make more provider calls. This is a quality comparison with unequal compute budgets.

| Scenario              | Expected finding to check                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Changed-package tests | Changed-package-only tests miss a regression in a dependent package. Measure time savings separately. |
| Read replica rollout  | Asynchronous replication can break read-after-write consistency.                                      |
| Feature flag rollback | Disabling a flag cannot undo writes already completed.                                                |
| Read-only canary      | A scoped pilot is plausible, but an internal cohort cannot establish user-wide latency.               |

Run `npm run eval -- --list` for the four cases and their full rubrics. With live credentials, use `npm run eval -- --smoke` for a one-claim integration check and `npm run eval -- --live` to print both outputs for every case. These commands use public synthetic examples and the configured provider quota.

For each output, record which prespecified findings it caught. Inspect cited links and mark each as directly supporting, indirectly relevant, or unrelated to the claim. Count unsupported categorical conclusions. Report per-case findings and raw counts alongside the model and run date.

**Status.** The rubric and runner are ready. No credentialed comparison has been run in this workspace.
