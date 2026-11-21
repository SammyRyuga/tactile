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
