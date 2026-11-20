# Evaluation

The development and holdout splits contain 15 cases each. Each split covers sound, mixed, uncertain, quantitative, and out-of-scope decisions. Expected findings are checked in before provider runs. The holdout cases are visible in the repository, so keep them out of prompt adjustments and document any reuse.

```sh
npm run eval -- --list
npm run eval -- --smoke
npm run --silent eval -- --live development > development.jsonl
npm run --silent eval -- --live holdout > holdout.jsonl
npm run eval -- --score independent-marks.json
```

The live runner repeats every case three times and stores raw outputs. It compares the full workflow with a single critique, a best-of-N pool with the same number of model requests, and a research baseline that can make multiple searches in one request. The comparison records call counts. Token budgets and provider prices can still differ. Out-of-scope cases compare the two scope gates.

Assign a reviewer who did not develop the prompts. Blind system identities, grade each response against the expected finding, and check whether each citation directly supports the associated statement. For best-of-N, retain the strongest sample using the same rubric and report that selection as an upper bound.

Pass the scorer a JSON array with one object per evaluated case, repetition, and system. Fields are `caseId`, `repetition`, `system` (`tactile`, `single`, `best-of-n`, or `research-agent`), `caught`, `unsupportedConclusions`, `relevantCitations`, and `totalCitations`. Score the untouched holdout separately.

No credentialed development or holdout result is available. The runner uses the configured provider quota and requires `OPENAI_API_KEY`.
