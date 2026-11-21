# Evaluation

The development and holdout splits contain 15 cases each across sound, mixed, uncertain, quantitative, and out-of-scope decisions. Expected findings are recorded before provider runs. The visible, team-authored holdout gives a preliminary comparison. A stronger evaluation needs new cases written and graded outside the project.

```sh
npm run eval -- --list
npm run eval -- --fixtures
npm run eval -- --smoke
npm run eval -- --smoke --meta
npm run --silent eval -- --live development > development.jsonl
npm run --silent eval -- --live holdout > holdout.jsonl
npm run eval -- --score independent-marks.json
```

The default runner uses `OPENAI_API_KEY`. Set `META_API_KEY` locally for `--meta`. The Meta smoke test checks that the Responses API returns at least one URL citation, then exercises claim extraction and review. It prints stage diagnostics and fails if every adjudication check fails. `OPENAI_VERIFIER_MODEL` and `META_VERIFIER_MODEL` optionally select a separate verifier model for their provider. [Meta Responses schemas](https://dev.meta.ai/docs/api-reference/responses/schemas) · [Meta search grounding](https://dev.meta.ai/docs/cookbook/search-grounding)

The live runner repeats each case three times and records raw outputs. Systems include Tactile, a single search-enabled critique, a best-of-N pool sized to Tactile’s provider request attempts, a research agent asked to revise its hypothesis with a larger requested search budget, and a raw-proposal critique that receives only the original proposal. The single critique is also the first member of the pool. Out-of-scope cases compare the two scope gates. Metrics include elapsed time, HTTP request attempts and observed responses, and input and output tokens when the provider reports them. Meta controls search context size and OpenAI uses a tool-call budget. These are imperfect proxies for cost and do not make the systems compute-equivalent.

Give the reviewer only the generated `blind/` directory and the [grading instructions](evaluation-grading.md). The packet randomizes candidate order and removes system labels and metrics. Output style can still suggest where a candidate came from. Unblind after grading. For best-of-N, include only complete pools and report the strongest graded sample as an upper bound.

Pass the scorer one JSON object per evaluated case, repetition, and system. Each object includes `caseId`, `category`, `repetition`, `system` (`tactile`, `single`, `best-of-n`, `research-agent`, or `raw-proposal`), `caught`, `falseAlarm`, `unsupportedConclusions`, `relevantCitations`, and `totalCitations`. Score the two splits separately. Per-category and aggregate results include 95% percentile bootstrap intervals that resample whole cases, keeping repeated trials together. With only three cases per category, treat these estimates as descriptive.

A credentialed Meta smoke run returned eight citations in the search probe and completed the replica review in 53 seconds. All three extracted claims remained unresolved. The case lacked local consistency and freshness requirements, and the review established no verdict from a fetched source. In a separate focused check, Meta correctly marked the claim that disabling a feature flag restores already-overwritten records as contradicted by the proposal and provided a repair. These smoke results cover connectivity and workflow. The one-pass baseline comparison is recorded below.

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

The run identified the feature-flag rollback contradiction and both incorrect equations in the quantitative development cases. The replica report raised immediate-read staleness in its rationale but did not establish the target verdict. The read-only canary report incorrectly treated the absence of write coverage as a defect. These are observations from one run. Fresh holdout cases remain pending.

### Reassurance review

Two automated reviewers independently examined the five earlier “No credible break found” findings without system identities. Both marked one finding as misleading. It treated retries, duplicates, and losses as immaterial to the request count without a counting rule or evidence. Both accepted the other four within the proposals’ stated assumptions. This is a small automated review. Independent human grading is pending.

For comparison runs, `npm run --silent eval -- --live development --meta --once` runs one repetition with the baselines. Timed-out baseline samples are recorded in the output. Score a best-of-N pool only when it contains its full intended sample count. Human marks can include an optional `reassurance` object with `reviewed` and `misleading` counts.

### Replica diagnostic rerun

The rerun returned three unresolved claims. The immediate order lookup and replication-lag findings both recorded “Specialist did not supply a quote.” The throughput finding had no cited passages. The audit identifies why the proposal-grounded verdict did not go through in this run.

### One-pass baseline comparison

Muse Spark 1.3 completed all 15 development cases and 84 best-of-N samples. Two automated reviewers graded 138 candidate entries with system labels hidden. They scored whether the answer captured the prewritten target and whether it asserted a substantive unsupported defect. Best-of-N picks a caught answer first, then prefers an answer without a false alarm. The table covers the 12 in-scope cases.

| System                | Target caught | False alarms |
| --------------------- | ------------: | -----------: |
| Tactile               |          8/12 |         5/12 |
| Single critique       |          7/12 |         3/12 |
| Best-of-N upper bound |         11/12 |         1/12 |
| Research agent        |          8/12 |         6/12 |
| Raw-proposal critique |          8/12 |         5/12 |

Tactile and the single-critique scope baseline correctly declined all 3 out-of-scope cases. Tactile returned 18 unresolved claims out of 36 on this pass. These results use one repetition and automated grading. Human grading and independent citation scoring are pending.

### Human grading a full comparison

The standard comparison command runs three repetitions. `TACTILE_EVAL_WORKERS` bounds parallel trials, and `TACTILE_EVAL_TRIALS` can retry specific `case:repetition` pairs. Use the same Tactile revision and provider configuration for all attempts. Keep one complete result per case and repetition.

```sh
npm run --silent eval -- --live development --meta > comparison.jsonl
node scripts/grading.ts prepare comparison.jsonl grading
node scripts/grading.ts unblind grading/blind/marks.csv grading/system-key.json > marked.json
npm run eval -- --score marked.json
```

Grade the case files and fill out the matching CSV before opening the system key. The single critique is also the first sample in the best-of-N pool, so it appears once in the packet. The scorer chooses the strongest marked sample from a complete pool and reports case-cluster bootstrap intervals for catch and false-alarm rates.

For the holdout, pass `holdout` as the last argument to `grading.ts prepare`. Keep the two splits in separate packet directories. An unexpected scope rejection on an engineering case is reported as an incomplete paired trial.

### Full development run ready for human grading

All 45 trials completed across 15 development cases, three repetitions each, with Muse Spark 1.3 on Tactile revision `8cb7ae0`. Two trials were rerun after provider timeouts left incomplete baseline pools. The final set contains 36 engineering reports, nine paired scope decisions, and 255 best-of-N samples. The blinded packet contains 381 candidate outputs.

Tactile returned 72 unresolved findings out of 108 (66.7%). The 95% case-cluster bootstrap interval was 53.7% to 79.6%. The remaining findings were 17 **Contradicted**, 13 **No credible break found**, five **Weakened**, and one **Supported**. These are automatically counted verdict labels. Comparative accuracy, false alarms, citation relevance, and reassurance require the human marks. This run predates the project-evidence workflow.

## Prompt-cache measurements

New Meta runs group requests by a stable key derived from the model, task instructions, and request format. The data follows the shared instructions. Request logs and evaluation output record cached input tokens when Meta reports them. Cache hits depend on the overlap between requests and the provider’s cache lifetime.

The app also reuses identical claim extraction for up to five minutes within the same authenticated key session and model. Model changes, key replacement, and sign-out clear that cache. Full reviews still run their checks and look up evidence again.

A two-request live probe with the same synthetic prefix and a different final observation reported 0 cached tokens out of 2,418 input tokens on both calls. A separate HTTP test verified that a repeated extraction reuses the app cache and that changing models causes a fresh provider request.

## Round 1 evidence hardening

`npm run eval -- --fixtures` reproduced the development arithmetic checks. The `workers` claim evaluates to 120 and the `headroom` claim to 100, contradicting their stated totals. The `requests` equation evaluates to 600 and matches. The bundled CI, replica, and rollout examples returned their recorded verdicts and evidence links. Browser tests opened the rollout timeline and checked the downloaded memo. These are deterministic and fixture checks.

The historical misses reproduced as control-flow failures in provider fixtures. A missing quote previously skipped premise verification entirely. The verifier can now look for a contiguous exact excerpt and must explain how it contradicts or limits the actual claim. An absent, non-applicable, or non-entailing passage cannot establish a verdict. A rejected synthesis verdict can no longer authorize rollout through the report recommendation. Regression fixtures cover cross-claim citation IDs, invented excerpts, missing local facts, conflicting sources, unreadable pages, incomplete equations, and a fallback when synthesis fails after a proposal premise has been verified. They test enforcement of the verification contract. Whether the live model consistently makes the right semantic judgments remains unmeasured.

Both credentialed smoke commands stopped at the missing-key check. The live comparisons above predate this branch’s hardening. Holdout cases and prewritten expectations were preserved. Independent human grading and citation review remain pending.

The checkout contains the historical summaries and scoring tools. The underlying one-pass responses and per-candidate grades were unavailable for this audit, so the five false alarms in that comparison could not be individually attributed. The archived notes identify a read-only canary scope error and a misleading request-count reassurance in the earlier development pass.
