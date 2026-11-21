# Evaluation

The development and holdout splits contain 15 cases each across sound, mixed, uncertain, quantitative, and out-of-scope decisions. Expected findings are recorded before provider runs. The visible, team-authored holdout gives a preliminary comparison. A stronger evaluation needs new cases written and graded outside the project.

```sh
npm run eval -- --list
npm run eval -- --smoke
npm run eval -- --smoke --meta
npm run --silent eval -- --live development > development.jsonl
npm run --silent eval -- --live holdout > holdout.jsonl
npm run eval -- --score independent-marks.json
```

The default runner uses `OPENAI_API_KEY`. Set `META_API_KEY` locally for `--meta`. The Meta smoke test checks that the Responses API returns at least one URL citation, then exercises claim extraction and review. It prints stage diagnostics and fails if every adjudication check fails. `OPENAI_VERIFIER_MODEL` and `META_VERIFIER_MODEL` optionally select a separate verifier model for their provider. [Meta Responses schemas](https://dev.meta.ai/docs/api-reference/responses/schemas) · [Meta search grounding](https://dev.meta.ai/docs/cookbook/search-grounding)

The live runner repeats each case three times and records raw outputs. Systems include Tactile, a single search-enabled critique, a best-of-N pool sized to Tactile’s provider request count, a research agent with a larger search budget, and a raw-proposal critique that receives only the original proposal. Out-of-scope cases compare the two scope gates. Metrics include elapsed time, observed HTTP responses, and input and output tokens when the provider reports them. Request counts and search settings are imperfect proxies for cost.

Blind system identities and ask an independent reviewer to check the expected finding and verify each citation against its associated statement. Grade a false alarm when a response confidently asserts a substantive defect that is absent or unsupported. For best-of-N, grade the strongest response using the same rubric and report that score as an upper bound.

Pass the scorer one JSON object per evaluated case, repetition, and system. Each object includes `caseId`, `category`, `repetition`, `system` (`tactile`, `single`, `best-of-n`, `research-agent`, or `raw-proposal`), `caught`, `falseAlarm`, `unsupportedConclusions`, `relevantCitations`, and `totalCitations`. Score the two splits separately. Per-category and aggregate results include 95% percentile bootstrap intervals that resample whole cases, keeping repeated trials together. With only three cases per category, treat these estimates as descriptive.

A credentialed Meta smoke run returned eight citations in the search probe and completed the replica review in 53 seconds. All three extracted claims remained unresolved. The case lacked local consistency and freshness requirements, and the review established no verdict from a fetched source. In a separate focused check, Meta correctly marked the claim that disabling a feature flag restores already-overwritten records as contradicted by the proposal and provided a repair. These smoke results cover connectivity and workflow. Comparative results are pending.

## Meta development pass

Run one Tactile review per case before spending provider quota on baseline comparisons.

```sh
npm run --silent eval -- --live development --meta --review-only > development-review.jsonl
```

The run used Muse Spark 1.3 with one repetition per case. All 15 cases completed. Three were rejected at the scope gate, and the other 12 produced 36 claim verdicts. Five reports had only unresolved claims.

| Verdict                 |     Claims |
| ----------------------- | ---------: |
| Unresolved              | 25 (69.4%) |
| No credible break found |          5 |
| Contradicted            |          5 |
| Weakened                |          1 |
| Supported               |          0 |

Twenty unresolved findings lacked sufficient evidence and five were affected by failed checks. Of 34 cited sources, 23 returned HTTP 200, including five truncated bodies and one truncated body with no static text. Seven returned 403, two returned 402, and two were blocked by URL policy. Twelve citations ultimately had no verification judgment. This identifies fetch failures as one factor in the unresolved rate. It does not establish that fetching alone caused the earlier replica result.

The run identified the feature-flag rollback contradiction and both incorrect equations in the quantitative development cases. The replica report raised immediate-read staleness in its rationale but did not establish the target verdict. The read-only canary report incorrectly treated the absence of write coverage as a defect. These are observations from one run. Baseline comparisons, independent scoring, and fresh holdout cases remain pending.

### Reassurance review

Two automated reviewers independently examined the five earlier “No credible break found” findings without system identities. Both marked one finding as misleading. It treated retries, duplicates, and losses as immaterial to the request count without a counting rule or evidence. Both accepted the other four within the proposals’ stated assumptions. This is a small automated review. Independent human grading is pending.

For comparison runs, `npm run --silent eval -- --live development --meta --once` runs one repetition with the baselines. Timed-out baseline samples are recorded in the output. Score a best-of-N pool only when it contains its full intended sample count. Human marks can include an optional `reassurance` object with `reviewed` and `misleading` counts.

### Replica diagnostic rerun

The rerun returned three unresolved claims. The immediate order lookup and replication-lag findings both recorded “Specialist did not supply a quote.” The throughput finding had no cited passages. The audit identifies why the proposal-grounded verdict did not go through in this run.
