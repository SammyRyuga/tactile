# Blind review instructions

The coordinator runs `node scripts/grading.ts prepare RUN.jsonl OUTPUT_DIR development` for the development split. Use `holdout` for a separate packet. Give the grader the generated `blind/` directory and this guide. Keep `system-key.json`, raw outputs, metrics, and system names out of the grading handoff.

For each candidate, fill the matching row in `marks.csv`.

- **Target caught.** Mark true when the candidate identifies the prewritten target and explains the failure mechanism, or appropriately declines an out-of-scope proposal. An unresolved finding can catch a target when it identifies the mechanism and the conditions under which it matters.
- **False alarm.** Mark true if an asserted substantive defect exceeds the stated scope or evidence. For example, consider whether the proposal ever promised write coverage when evaluating a read-only canary.
- **Unsupported conclusions.** Count specific conclusions whose evidence fails to establish them. Include advice that depends on a speculative conclusion.
- **Unresolved findings.** Count distinct material questions the candidate explicitly leaves open.
- **Citation relevance.** Keep the prefilled total. Open each cited source, read the passage with its caveats, and check the mechanism, version, scope, and conditions against the associated claim. Mark inaccessible sources as unverified and record the reason in your notes.
- **Reassurance.** Count reviewed and misleading reassurances. Check whether missing local dependencies, measurements, or counting rules could change the conclusion.

Record one sentence explaining each false alarm, unsupported conclusion, or citation failure. Use only the supplied project excerpts to assess local evidence. A general mechanism can support a conditional risk, while project outcomes require evidence from the applicable deployment.

After grading, the coordinator runs `node scripts/grading.ts unblind OUTPUT_DIR/blind/marks.csv OUTPUT_DIR/system-key.json > MARKS.json`, then `npm run eval -- --score MARKS.json`. The script selects the strongest result from each complete best-of-N pool, prioritizing target detection and then avoiding false alarms. Track incomplete trials and grader disagreements separately. Report whether the reviewer was human or automated.
