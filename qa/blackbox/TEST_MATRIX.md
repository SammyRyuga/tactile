# Black-box test matrix

Baseline: `e31372e0ee50ac2a0501bad65f856c3a89a831d2`. Independent cases ran three times: fresh Chromium desktop, a second fresh Chromium desktop context, and a fresh Edge mobile-emulated context. See the environment cells for zoom, width or theme overrides. Artifact filenames refer to the local QA evidence directory listed in [RUN_REPORT.md](RUN_REPORT.md).

| Unit       | Pass | Fail | Blocked | Inconclusive |
| ---------- | ---: | ---: | ------: | -----------: |
| Cases      |   49 |    3 |       1 |            0 |
| Executions |  147 |    9 |       3 |            0 |

The separate reused-session verification reproduced the three confirmed failures. It is outside the matrix totals.

## First-time use

### BB-001 · Fresh anonymous visit

- **Steps.** Open bare /demo in a clean browser; read the plan, inspect loaded images, page errors, console errors and network.
- **Expected.** Public demo and sample plan render without credentials, errors or redirects.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                   | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Public demo, plan and start control loaded on /demo; no broken images, failed HTTP response or browser error. | `BB-001-1.png`, `BB-001-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Public demo, plan and start control loaded on /demo; no broken images, failed HTTP response or browser error. | `BB-001-2.png`, `BB-001-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Public demo, plan and start control loaded on /demo; no broken images, failed HTTP response or browser error. | `BB-001-3.png`, `BB-001-3.zip` |

### BB-002 · Primary navigation

- **Steps.** Open flag plan, click Review example, then Run checks. Read the active step at each stage.
- **Expected.** One active marker agrees with the displayed Plan, Assumptions and Results stages.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                      | Local artifacts                |
| ---- | ------------------------- | ----------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Active marker matched all three workflow stages. | `BB-002-1.png`, `BB-002-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Active marker matched all three workflow stages. | `BB-002-2.png`, `BB-002-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Active marker matched all three workflow stages. | `BB-002-3.png`, `BB-002-3.zip` |

### BB-003 · Example switching

- **Steps.** Use the library to select CI, replica and flag in order; open assumptions, run, then Choose another example.
- **Expected.** Plan, assumptions and results belong to the library selection.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                           | Local artifacts                |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · CI, replica and flag had their own proposals, claims and recorded verdicts through library switching. | `BB-003-1.png`, `BB-003-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · CI, replica and flag had their own proposals, claims and recorded verdicts through library switching. | `BB-003-2.png`, `BB-003-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · CI, replica and flag had their own proposals, claims and recorded verdicts through library switching. | `BB-003-3.png`, `BB-003-3.zip` |

### BB-004 · Invalid example IDs

- **Steps.** Open ?example=unknown, ?example=, /demo, ?example=CI and ?example=RePLiCa.
- **Expected.** Each variant displays a usable example without a crash, blank document or unhandled error.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                            | Local artifacts                |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Bare /demo opened flag; unknown, (empty), CI, RePLiCa showed an unavailable-case message and working library recovery. | `BB-004-1.png`, `BB-004-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Bare /demo opened flag; unknown, (empty), CI, RePLiCa showed an unavailable-case message and working library recovery. | `BB-004-2.png`, `BB-004-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Bare /demo opened flag; unknown, (empty), CI, RePLiCa showed an unavailable-case message and working library recovery. | `BB-004-3.png`, `BB-004-3.zip` |

### BB-005 · Browser Back and Forward

- **Steps.** Open flag, switch to CI via library, edit claim 1 and run. Browser Back, Forward, and Back again. Inspect scenario, stage and saved draft.
- **Expected.** Browser history preserves internally consistent scenarios and drafts and permits returning to the stage just visited.
- **Outcome.** **Fail** 3/3 · S3 · [New QA-02](DEFECTS.md).

| Pass | Browser and viewport      | Actual                                                                                                                                                            | Local artifacts                |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Fail** · Browser history skipped workflow stages; stops: 1 Plan ?example=flag → 3 Results ?example=ci → 1 Plan ?example=flag; edited draft survived on Forward. | `BB-005-1.png`, `BB-005-1.zip` |
| 2    | Chromium, 1280×900, light | **Fail** · Browser history skipped workflow stages; stops: 1 Plan ?example=flag → 3 Results ?example=ci → 1 Plan ?example=flag; edited draft survived on Forward. | `BB-005-2.png`, `BB-005-2.zip` |
| 3    | Edge, 390×844, dark       | **Fail** · Browser history skipped workflow stages; stops: 1 Plan ?example=flag → 3 Results ?example=ci → 1 Plan ?example=flag; edited draft survived on Forward. | `BB-005-3.png`, `BB-005-3.zip` |

## Assumption changes

### BB-006 · Default assumptions

- **Steps.** Open each scenario, check all default selections, run, and compare results with the selected scenario.
- **Expected.** Each included default appears once and receives its recorded verdict.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                 | Local artifacts                |
| ---- | ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · All defaults selected; report claim counts were flag 2, CI 4 and replica 2. | `BB-006-1.png`, `BB-006-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · All defaults selected; report claim counts were flag 2, CI 4 and replica 2. | `BB-006-2.png`, `BB-006-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · All defaults selected; report claim counts were flag 2, CI 4 and replica 2. | `BB-006-3.png`, `BB-006-3.zip` |

### BB-007 · Deselect critical assumption

- **Steps.** Uncheck flag claim 1, leave claim 2 checked, then run.
- **Expected.** Warn that the original critical rollback claim is unchecked; avoid approval of rollback; only show claim 2.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                               | Local artifacts                |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Original rollback listed under unchecked coverage; only future writes shown as Supported. | `BB-007-1.png`, `BB-007-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Original rollback listed under unchecked coverage; only future writes shown as Supported. | `BB-007-2.png`, `BB-007-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Original rollback listed under unchecked coverage; only future writes shown as Supported. | `BB-007-3.png`, `BB-007-3.zip` |

### BB-008 · Deselect every assumption

- **Steps.** Uncheck both flag claims, try keyboard activation of Run checks, then reselect one and run.
- **Expected.** Disabled submission with explanatory feedback; a valid selection restores the action.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                    | Local artifacts                |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Zero-selection validation explained the disabled action; rechecking one claim restored review. | `BB-008-1.png`, `BB-008-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Zero-selection validation explained the disabled action; rechecking one claim restored review. | `BB-008-2.png`, `BB-008-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Zero-selection validation explained the disabled action; rechecking one claim restored review. | `BB-008-3.png`, `BB-008-3.zip` |

### BB-009 · Select one original assumption

- **Steps.** Submit each flag claim by itself, using Edit assumptions between runs. Inspect sources and warnings.
- **Expected.** Each result refers only to the included claim and its correct source; the critical scope gap appears when claim 1 is excluded.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                               | Local artifacts                |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Both single-claim runs correctly scoped the timeline and warned only when the critical claim was missing. | `BB-009-1.png`, `BB-009-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Both single-claim runs correctly scoped the timeline and warned only when the critical claim was missing. | `BB-009-2.png`, `BB-009-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Both single-claim runs correctly scoped the timeline and warned only when the critical claim was missing. | `BB-009-3.png`, `BB-009-3.zip` |

### BB-010 · Replace with an unrelated claim

- **Steps.** Replace flag claim 1 with the specified 73% database CPU statement and run.
- **Expected.** Edited claim Unresolved without sources; original critical rollback claim clearly unchecked.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                      | Local artifacts                |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · 73% CPU claim Unresolved without citation; original rollback assumption called out as unchecked. | `BB-010-1.png`, `BB-010-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · 73% CPU claim Unresolved without citation; original rollback assumption called out as unchecked. | `BB-010-2.png`, `BB-010-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · 73% CPU claim Unresolved without citation; original rollback assumption called out as unchecked. | `BB-010-3.png`, `BB-010-3.zip` |

### BB-011 · Add unrelated claim

- **Steps.** Keep defaults, add the specified zero-downtime-in-every-region statement, then run.
- **Expected.** New statement is Unresolved with no invented evidence; default outcomes stay intact.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                          | Local artifacts                |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Zero-downtime claim was Unresolved without sources; both recorded findings remained. | `BB-011-1.png`, `BB-011-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Zero-downtime claim was Unresolved without sources; both recorded findings remained. | `BB-011-2.png`, `BB-011-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Zero-downtime claim was Unresolved without sources; both recorded findings remained. | `BB-011-3.png`, `BB-011-3.zip` |

### BB-012 · Delete original critical assumption

- **Steps.** Click Remove assumption 1 in flag, inspect the remaining input and run.
- **Expected.** Only the future-writes claim remains; missing rollback coverage is explicit.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                               | Local artifacts                |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Deletion preserved the optional claim and explicitly reported the lost rollback coverage. | `BB-012-1.png`, `BB-012-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Deletion preserved the optional claim and explicitly reported the lost rollback coverage. | `BB-012-2.png`, `BB-012-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Deletion preserved the optional claim and explicitly reported the lost rollback coverage. | `BB-012-3.png`, `BB-012-3.zip` |

### BB-013 · Duplicate assumptions

- **Steps.** Add two identical zero-downtime claims, toggle claim 3 off, edit claim 4, re-include claim 3 and add another identical claim. Run and inspect cards.
- **Expected.** Rows remain independently editable and selectable; headings repeat only for included duplicates, each without evidence.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                               | Local artifacts                |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Three added rows stayed independent; two included duplicates were distinct report cards without evidence. | `BB-013-1.png`, `BB-013-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Three added rows stayed independent; two included duplicates were distinct report cards without evidence. | `BB-013-2.png`, `BB-013-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Three added rows stayed independent; two included duplicates were distinct report cards without evidence. | `BB-013-3.png`, `BB-013-3.zip` |

### BB-014 · Empty and whitespace validation

- **Steps.** Replace included claim 1 with empty text, attempt Run; repeat with spaces; re-enter valid text and run.
- **Expected.** Invalid text cannot produce a report and the reason is visible; corrected text is accepted.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                  | Local artifacts                |
| ---- | ------------------------- | --------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Empty and spaces were rejected with feedback; correction allowed the review. | `BB-014-1.png`, `BB-014-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Empty and spaces were rejected with feedback; correction allowed the review. | `BB-014-2.png`, `BB-014-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Empty and spaces were rejected with feedback; correction allowed the review. | `BB-014-3.png`, `BB-014-3.zip` |

### BB-015 · Maximum-length assumption

- **Steps.** Read the advertised input limit, fill to that limit, submit, then open the actual Markdown file and look for the same text.
- **Expected.** Maximum-length content stays readable and complete in UI and export.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                | Local artifacts                |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · 240 characters were preserved in the claim editor, report heading and downloaded Markdown. | `BB-015-1.png`, `BB-015-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · 240 characters were preserved in the claim editor, report heading and downloaded Markdown. | `BB-015-2.png`, `BB-015-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · 240 characters were preserved in the claim editor, report heading and downloaded Markdown. | `BB-015-3.png`, `BB-015-3.zip` |

### BB-016 · Special characters

- **Steps.** Enter a two-line claim with emoji, Unicode, Markdown markers, quotes, angle brackets and ≤/² notation; run and download.
- **Expected.** Preserve the content and Markdown safety; verify treatment of line boundaries.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                                          | Local artifacts                |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Unicode, emoji, mathematical symbols and both lines’ wording survived; heading line boundary retained in DOM, flattened in Markdown. | `BB-016-1.png`, `BB-016-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Unicode, emoji, mathematical symbols and both lines’ wording survived; heading line boundary retained in DOM, flattened in Markdown. | `BB-016-2.png`, `BB-016-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Unicode, emoji, mathematical symbols and both lines’ wording survived; heading line boundary retained in DOM, flattened in Markdown. | `BB-016-3.png`, `BB-016-3.zip` |

### BB-017 · Rapid edit and submit

- **Steps.** Fill one unrelated value, replace it with the 73% statement using a keyboard paste-equivalent, immediately click Run checks.
- **Expected.** Only the latest value reaches the result.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                      | Local artifacts                |
| ---- | ------------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · The latest edit reached the report; the superseded text did not. | `BB-017-1.png`, `BB-017-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · The latest edit reached the report; the superseded text did not. | `BB-017-2.png`, `BB-017-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · The latest edit reached the report; the superseded text did not. | `BB-017-3.png`, `BB-017-3.zip` |

## Verdict and reasoning integrity

### BB-018 · Flag outcome attribution

- **Steps.** Run the flag defaults and inspect both verdicts and reasons.
- **Expected.** Stored writes Contradicted; prevention of future flagged writes Supported, each with a scoped explanation.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                     | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · The persisted change and subsequent request used separate verdicts and reasons. | `BB-018-1.png`, `BB-018-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · The persisted change and subsequent request used separate verdicts and reasons. | `BB-018-2.png`, `BB-018-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · The persisted change and subsequent request used separate verdicts and reasons. | `BB-018-3.png`, `BB-018-3.zip` |

### BB-019 · CI outcome attribution

- **Steps.** Run default CI and inspect the claim wording, status and available evidence on each card.
- **Expected.** Consumer coverage Contradicted, timing Unresolved, post-merge fallback Weakened; scope links to their claims.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                                  | Local artifacts                |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Consumer coverage Contradicted, timing Unresolved, post-merge fallback Weakened; the fourth workflow-choice claim Supported. | `BB-019-1.png`, `BB-019-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Consumer coverage Contradicted, timing Unresolved, post-merge fallback Weakened; the fourth workflow-choice claim Supported. | `BB-019-2.png`, `BB-019-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Consumer coverage Contradicted, timing Unresolved, post-merge fallback Weakened; the fourth workflow-choice claim Supported. | `BB-019-3.png`, `BB-019-3.zip` |

### BB-020 · Replica outcome attribution

- **Steps.** Run default replica, read the ordering and latency cards.
- **Expected.** Immediate order reads Contradicted, p95 Unresolved; ordering gap is explained.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                           | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Immediate reads Contradicted with commit/replay gap; p95 Unresolved without citation. | `BB-020-1.png`, `BB-020-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Immediate reads Contradicted with commit/replay gap; p95 Unresolved without citation. | `BB-020-2.png`, `BB-020-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Immediate reads Contradicted with commit/replay gap; p95 Unresolved without citation. | `BB-020-3.png`, `BB-020-3.zip` |

### BB-021 · False reassurance under lost coverage

- **Steps.** Separately deselect, remove and edit flag claim 1 while keeping claim 2. Run each and inspect the overall recommendation and all card headings.
- **Expected.** Supported secondary claim never becomes approval of the rollback strategy; original unchecked claim has no inferred verdict.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                 | Local artifacts                |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · All three inputs retained a supported secondary claim, warned on unchecked rollback and gave it no verdict. | `BB-021-1.png`, `BB-021-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · All three inputs retained a supported secondary claim, warned on unchecked rollback and gave it no verdict. | `BB-021-2.png`, `BB-021-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · All three inputs retained a supported secondary claim, warned on unchecked rollback and gave it no verdict. | `BB-021-3.png`, `BB-021-3.zip` |

### BB-022 · Near-match evidence attribution

- **Steps.** Edit the CI consumer coverage claim by changing its subject to dependency-free packages; submit.
- **Expected.** Different claim is Unresolved without reusing the original dependency replay.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · The edited CI claim got no recycled dependency replay or original verdict. | `BB-022-1.png`, `BB-022-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · The edited CI claim got no recycled dependency replay or original verdict. | `BB-022-2.png`, `BB-022-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · The edited CI claim got no recycled dependency replay or original verdict. | `BB-022-3.png`, `BB-022-3.zip` |

### BB-023 · Conflicting custom claims

- **Steps.** Add opposite statements about staging keeping archived rows indefinitely and submit.
- **Expected.** Both arbitrary claims remain Unresolved unless the recorded evidence directly covers them.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                            | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Both conflicting claims were Unresolved with no source or implication of a live check. | `BB-023-1.png`, `BB-023-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Both conflicting claims were Unresolved with no source or implication of a live check. | `BB-023-2.png`, `BB-023-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Both conflicting claims were Unresolved with no source or implication of a live check. | `BB-023-3.png`, `BB-023-3.zip` |

### BB-024 · Recommendation consistency

- **Steps.** Run all defaults and one modified flag report; compare each report card’s claim, verdict, next step and missing coverage with its Markdown.
- **Expected.** Both surfaces communicate matching verdicts, supported scope, warnings and recommended action.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                          | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · All default verdicts and card actions matched the memo; modified memo preserved Unresolved status and scope warning. | `BB-024-1.png`, `BB-024-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · All default verdicts and card actions matched the memo; modified memo preserved Unresolved status and scope warning. | `BB-024-2.png`, `BB-024-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · All default verdicts and card actions matched the memo; modified memo preserved Unresolved status and scope warning. | `BB-024-3.png`, `BB-024-3.zip` |

## Evidence and exports

### BB-025 · Review trails

- **Steps.** Run all default reports. Expand every Review trail and read each status, observation and source.
- **Expected.** Every disclosed check agrees with its card, contains a status and observation, and any evidence is attributed.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                  | Local artifacts                |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Opened 7 claim trails. Displayed check statuses: Feasibility complete, Adoption complete, Evidence complete. | `BB-025-1.png`, `BB-025-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Opened 7 claim trails. Displayed check statuses: Feasibility complete, Adoption complete, Evidence complete. | `BB-025-2.png`, `BB-025-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Opened 7 claim trails. Displayed check statuses: Feasibility complete, Adoption complete, Evidence complete. | `BB-025-3.png`, `BB-025-3.zip` |

### BB-026 · Bundled source navigation

- **Steps.** Open all published sources, including links within expanded trails. Navigate each unique destination in Chromium and inspect its hash target.
- **Expected.** All sources lead to the referenced, nonempty local evidence section.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                        | Local artifacts                |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · 11 citation appearances resolved to all four expected evidence anchors (HTTP 200). | `BB-026-1.png`, `BB-026-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · 11 citation appearances resolved to all four expected evidence anchors (HTTP 200). | `BB-026-2.png`, `BB-026-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · 11 citation appearances resolved to all four expected evidence anchors (HTTP 200). | `BB-026-3.png`, `BB-026-3.zip` |

### BB-027 · Explicit insufficient evidence

- **Steps.** Inspect unsupported default CI timing and replica latency claims, then an unrelated added flag claim.
- **Expected.** Each identifies the evidence gap, what would settle it and has no source invented.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                     | Local artifacts                |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Three uncovered claims clearly said Evidence insufficient and provided a next evidence step without a citation. | `BB-027-1.png`, `BB-027-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Three uncovered claims clearly said Evidence insufficient and provided a next evidence step without a citation. | `BB-027-2.png`, `BB-027-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Three uncovered claims clearly said Evidence insufficient and provided a next evidence step without a citation. | `BB-027-3.png`, `BB-027-3.zip` |

### BB-028 · Review-room status integrity

- **Steps.** Collect check statuses from the expanded claim trails, then open the review room in all examples and select each station and memo.
- **Expected.** Room states agree with trail states, and Memo ready remains distinguishable from completed specialist checks.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                                                                                                                                                                        | Local artifacts                |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Assumptions Not included in this example; Feasibility Complete; Adoption Complete; Evidence Not included in this example; Decision memo Memo ready; Evidence Complete; Adoption Not included in this example. Any live-only transitions remain outside this check. | `BB-028-1.png`, `BB-028-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Assumptions Not included in this example; Feasibility Complete; Adoption Complete; Evidence Not included in this example; Decision memo Memo ready; Evidence Complete; Adoption Not included in this example. Any live-only transitions remain outside this check. | `BB-028-2.png`, `BB-028-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Assumptions Not included in this example; Feasibility Complete; Adoption Complete; Evidence Not included in this example; Decision memo Memo ready; Evidence Complete; Adoption Not included in this example. Any live-only transitions remain outside this check. | `BB-028-3.png`, `BB-028-3.zip` |

### BB-029 · Portable Markdown evidence

- **Steps.** Download each default report, open all four public source anchors, and compare provenance, excerpt, proposal, verdict headings and recommendation.
- **Expected.** Each file is self-contained, contains the published excerpt and provenance, and has no localhost URLs.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                                                                                | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Three actual Markdown files included preserved proposals, recorded verdicts and recommendations, and verbatim excerpts for four published anchors without localhost links. | `BB-029-1.png`, `BB-029-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Three actual Markdown files included preserved proposals, recorded verdicts and recommendations, and verbatim excerpts for four published anchors without localhost links. | `BB-029-2.png`, `BB-029-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Three actual Markdown files included preserved proposals, recorded verdicts and recommendations, and verbatim excerpts for four published anchors without localhost links. | `BB-029-3.png`, `BB-029-3.zip` |

### BB-030 · Modified Markdown export

- **Steps.** Export flag both after replacing rollback with the 73% claim and after excluding original rollback.
- **Expected.** Preserve the unchecked critical claim separately from verdicts and include only evidence applicable to the remaining checked claims.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                      | Local artifacts                |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Edited and deselected memos preserved scope and future-writes provenance; no evidence attached to the CPU claim. | `BB-030-1.png`, `BB-030-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Edited and deselected memos preserved scope and future-writes provenance; no evidence attached to the CPU claim. | `BB-030-2.png`, `BB-030-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Edited and deselected memos preserved scope and future-writes provenance; no evidence attached to the CPU claim. | `BB-030-3.png`, `BB-030-3.zip` |

### BB-031 · Clipboard matches downloaded memo

- **Steps.** Grant clipboard permissions only in the isolated local browser context, run CI, click Copy Markdown, observe feedback and compare clipboard text with a downloaded export.
- **Expected.** Clipboard copy announces completion and matches the downloaded memo.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                          | Local artifacts                |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Copied feedback appeared; clipboard and downloaded memo matched after Windows newline normalization. | `BB-031-1.png`, `BB-031-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Copied feedback appeared; clipboard and downloaded memo matched after Windows newline normalization. | `BB-031-2.png`, `BB-031-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Copied feedback appeared; clipboard and downloaded memo matched after Windows newline normalization. | `BB-031-3.png`, `BB-031-3.zip` |

### BB-032 · Repeated downloads

- **Steps.** Download the same flag result three times, choose replica and export that result twice.
- **Expected.** Repeated files are deterministic within a scenario; each new scenario has its own content.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                            | Local artifacts                |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Three flag downloads agreed and two replica downloads agreed; the new report replaced the old content. | `BB-032-1.png`, `BB-032-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Three flag downloads agreed and two replica downloads agreed; the new report replaced the old content. | `BB-032-2.png`, `BB-032-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Three flag downloads agreed and two replica downloads agreed; the new report replaced the old content. | `BB-032-3.png`, `BB-032-3.zip` |

## Resilience

### BB-033 · Refresh every stage

- **Steps.** Refresh after loading flag Plan, after editing Assumptions, while Running is visibly paused with the browser clock, then after Results.
- **Expected.** Restore plan/draft/results where applicable and offer a usable recovery after running is interrupted.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                           | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Plan, edited draft and result survived reload; active run recovered at 2 Assumptions. | `BB-033-1.png`, `BB-033-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Plan, edited draft and result survived reload; active run recovered at 2 Assumptions. | `BB-033-2.png`, `BB-033-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Plan, edited draft and result survived reload; active run recovered at 2 Assumptions. | `BB-033-3.png`, `BB-033-3.zip` |

### BB-034 · Tabs and scenario isolation

- **Steps.** Open flag and replica as separate tabs in one context, enter distinct drafts, run concurrently, reload both, and compare reports.
- **Expected.** Each tab keeps its own scenario, draft and findings.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                      | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Distinct drafts and reports stayed isolated in two tabs, including after reload. | `BB-034-1.png`, `BB-034-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Distinct drafts and reports stayed isolated in two tabs, including after reload. | `BB-034-2.png`, `BB-034-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Distinct drafts and reports stayed isolated in two tabs, including after reload. | `BB-034-3.png`, `BB-034-3.zip` |

### BB-035 · Repeated reviews

- **Steps.** Run flag defaults three times, using Edit assumptions between runs and exporting each result.
- **Expected.** Stable verdicts, no duplicate cards, stale progress or changed memo.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                               | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Three review runs produced identical two-card reports and memo downloads. | `BB-035-1.png`, `BB-035-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Three review runs produced identical two-card reports and memo downloads. | `BB-035-2.png`, `BB-035-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Three review runs produced identical two-card reports and memo downloads. | `BB-035-3.png`, `BB-035-3.zip` |

### BB-036 · Rapid action clicks

- **Steps.** Use browser double-clicks on Run, Edit, Export and example navigation, and inspect the final report, download content and draft stage.
- **Expected.** Repeated activation stays recoverable with coherent findings and valid files.
- **Outcome.** **Fail** 3/3 · S3 · [New QA-03](DEFECTS.md).

| Pass | Browser and viewport      | Actual                                                                                | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Fail** · Double-clicking Export Markdown saved 2 copies of the same report. 2 !== 1 | `BB-036-1.png`, `BB-036-1.zip` |
| 2    | Chromium, 1280×900, light | **Fail** · Double-clicking Export Markdown saved 2 copies of the same report. 2 !== 1 | `BB-036-2.png`, `BB-036-2.zip` |
| 3    | Edge, 390×844, dark       | **Fail** · Double-clicking Export Markdown saved 2 copies of the same report. 2 !== 1 | `BB-036-3.png`, `BB-036-3.zip` |

### BB-037 · Interrupt active review

- **Steps.** Edit flag, pause Running with the browser clock, use the visible cancel/back control if present or navigate to CI, return to flag and recover or rerun.
- **Expected.** A local user can recover without old results replacing the other scenario or losing an acknowledged saved draft.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                   | Local artifacts                |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Visible cancellation restored the edited draft and let the user run it again. | `BB-037-1.png`, `BB-037-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Visible cancellation restored the edited draft and let the user run it again. | `BB-037-2.png`, `BB-037-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Visible cancellation restored the edited draft and let the user run it again. | `BB-037-3.png`, `BB-037-3.zip` |

### BB-038 · Browser goes offline

- **Steps.** Load the flag plan, take the context offline, run and download, try the bundled source, restore networking and reopen source.
- **Expected.** Loaded recorded review/download work or clearly show recovery; source responds after reconnection.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                                               | Local artifacts                |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Loaded recorded review and export worked offline. Source navigation offline: net::ERR_INTERNET_DISCONNECTED; reconnected source HTTP 200. | `BB-038-1.png`, `BB-038-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Loaded recorded review and export worked offline. Source navigation offline: net::ERR_INTERNET_DISCONNECTED; reconnected source HTTP 200. | `BB-038-2.png`, `BB-038-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Loaded recorded review and export worked offline. Source navigation offline: net::ERR_INTERNET_DISCONNECTED; reconnected source HTTP 200. | `BB-038-3.png`, `BB-038-3.zip` |

### BB-039 · Session-storage restriction

- **Steps.** Block access to sessionStorage in a fresh context, navigate through Results, then reload and run again.
- **Expected.** Storage unavailability does not crash or block the anonymous recorded demo; password-free clean recovery works.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                     | Local artifacts                |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Both reviews completed without JS errors; after reload, storage restriction returned the user to a usable Plan. | `BB-039-1.png`, `BB-039-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Both reviews completed without JS errors; after reload, storage restriction returned the user to a usable Plan. | `BB-039-2.png`, `BB-039-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Both reviews completed without JS errors; after reload, storage restriction returned the user to a usable Plan. | `BB-039-3.png`, `BB-039-3.zip` |

### BB-040 · Long reused session

- **Steps.** Use one tab for nine alternating CI, replica and flag reviews. Edit the first claim on alternate runs; choose another example after each result.
- **Expected.** Case changes preserve the correct proposal, findings and independent drafts with no page errors.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                                                    | Local artifacts                |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Nine edited/default runs in one tab preserved scenario-specific claims and results without browser errors; heap growth was outside this check. | `BB-040-1.png`, `BB-040-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Nine edited/default runs in one tab preserved scenario-specific claims and results without browser errors; heap growth was outside this check. | `BB-040-2.png`, `BB-040-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Nine edited/default runs in one tab preserved scenario-specific claims and results without browser errors; heap growth was outside this check. | `BB-040-3.png`, `BB-040-3.zip` |

## Public trust boundaries

### BB-041 · Anonymous private boundaries

- **Steps.** Open /review and /settings as anonymous. Use the same browser context to request GET and empty JSON POST to /api/reviews on localhost.
- **Expected.** Private pages lead to sign-in and protected API does not start a live operation.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                               | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Both pages redirected to sign-in; /api/reviews GET 404 Unknown API route.; POST 503 Live reviews require a provider key.. | `BB-041-1.png`, `BB-041-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Both pages redirected to sign-in; /api/reviews GET 404 Unknown API route.; POST 503 Live reviews require a provider key.. | `BB-041-2.png`, `BB-041-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Both pages redirected to sign-in; /api/reviews GET 404 Unknown API route.; POST 503 Live reviews require a provider key.. | `BB-041-3.png`, `BB-041-3.zip` |

### BB-042 · Inert text rendering

- **Steps.** Enter inert HTML-like text and a non-executable text/plain script marker through claim input; run and download.
- **Expected.** Tokens are shown as literal claim text, not DOM elements or Markdown HTML.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                     | Local artifacts                |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Literal inert markers survived in UI and memo; no corresponding DOM nodes or raw Markdown tags. | `BB-042-1.png`, `BB-042-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Literal inert markers survived in UI and memo; no corresponding DOM nodes or raw Markdown tags. | `BB-042-2.png`, `BB-042-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Literal inert markers survived in UI and memo; no corresponding DOM nodes or raw Markdown tags. | `BB-042-3.png`, `BB-042-3.zip` |

### BB-043 · Malformed evidence URLs

- **Steps.** Inspect Plan, Assumptions including Advanced settings, Results, and the anonymous workspace entry for an evidence URL entry control.
- **Expected.** Check public URL validation only if an anonymous evidence URL authoring control exists.
- **Outcome.** **Blocked** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                                           | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Blocked** · No anonymous evidence URL editor at Plan, Advanced settings or Results; workspace requires sign-in. No external URL was submitted. | `BB-043-1.png`, `BB-043-1.zip` |
| 2    | Chromium, 1280×900, light | **Blocked** · No anonymous evidence URL editor at Plan, Advanced settings or Results; workspace requires sign-in. No external URL was submitted. | `BB-043-2.png`, `BB-043-2.zip` |
| 3    | Edge, 390×844, dark       | **Blocked** · No anonymous evidence URL editor at Plan, Advanced settings or Results; workspace requires sign-in. No external URL was submitted. | `BB-043-3.png`, `BB-043-3.zip` |

### BB-044 · Public demo network isolation

- **Steps.** Observe browser traffic while running all selected examples, opening available review trails/room and downloading Markdown.
- **Expected.** Recorded workflow sends no live provider or protected review requests.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                               | Local artifacts                |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · 120 local browser requests observed; no attempted third-party traffic or app API traffic. | `BB-044-1.png`, `BB-044-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · 120 local browser requests observed; no attempted third-party traffic or app API traffic. | `BB-044-2.png`, `BB-044-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · 123 local browser requests observed; no attempted third-party traffic or app API traffic. | `BB-044-3.png`, `BB-044-3.zip` |

### BB-045 · Error privacy

- **Steps.** Request one normal unknown API path and an empty local live-review POST; visit the anonymous sign-in page, then trigger zero-selection validation.
- **Expected.** Errors are bounded explanations without credentials, exception dumps or filesystem paths.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                                | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · 404 Unknown API route.; 503 Live reviews require a provider key.; login and form validation returned user-facing messages. | `BB-045-1.png`, `BB-045-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · 404 Unknown API route.; 503 Live reviews require a provider key.; login and form validation returned user-facing messages. | `BB-045-2.png`, `BB-045-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · 404 Unknown API route.; 503 Live reviews require a provider key.; login and form validation returned user-facing messages. | `BB-045-3.png`, `BB-045-3.zip` |

### BB-046 · Outbound navigation

- **Steps.** Inspect each GitHub link’s resolved destination, protocol, target and rel. Click in Chromium with external requests intercepted before transmission.
- **Expected.** Published links target only the displayed project/contributor locations and do not pass an opener to a new tab.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                                                                                 | Local artifacts                |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Intercepted expected GitHub destinations /SammyRyuga/tactile (same tab), /ryanfer123 (same tab), /SammyRyuga (same tab); external redirect chains were outside local scope. | `BB-046-1.png`, `BB-046-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Intercepted expected GitHub destinations /SammyRyuga/tactile (same tab), /ryanfer123 (same tab), /SammyRyuga (same tab); external redirect chains were outside local scope. | `BB-046-2.png`, `BB-046-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Intercepted expected GitHub destinations /SammyRyuga/tactile (same tab), /ryanfer123 (same tab), /SammyRyuga (same tab); external redirect chains were outside local scope. | `BB-046-3.png`, `BB-046-3.zip` |

## Responsive layout and accessibility

### BB-047 · Responsive workflows

- **Steps.** At 1440, 1280, 1024, 768, 390 and 320px in each theme, run Plan → Assumptions → Results, expand trail/room and inspect controls.
- **Expected.** Workflow stays reachable, layouts do not extend horizontally, and both report actions fit at every width.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport                              | Actual                                                                                         | Local artifacts                |
| ---- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440,1280,1024,768,390,320, both themes | **Pass** · 12 viewport/theme workflows with no document overflow or offscreen report controls. | `BB-047-1.png`, `BB-047-1.zip` |
| 2    | Chromium, 1440,1280,1024,768,390,320, both themes | **Pass** · 12 viewport/theme workflows with no document overflow or offscreen report controls. | `BB-047-2.png`, `BB-047-2.zip` |
| 3    | Edge, 1440,1280,1024,768,390,320, both themes     | **Pass** · 12 viewport/theme workflows with no document overflow or offscreen report controls. | `BB-047-3.png`, `BB-047-3.zip` |

### BB-048 · Actual 200 percent browser zoom

- **Steps.** Use Chromium’s real per-tab 200% zoom, verify CSS width halves, then go through all steps and open a review trail.
- **Expected.** Main controls stay reachable and regression does not introduce document-level overflow.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport                              | Actual                                                                                           | Local artifacts                |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1    | Chromium (zoom profile), 1440×1000 at 200%, light | **Pass** · Chrome tabs API reported 200%; window CSS width 1422 → 711 and all steps/actions fit. | `BB-048-1.png`, `BB-048-1.zip` |
| 2    | Chromium (zoom profile), 1280×1000 at 200%, light | **Pass** · Chrome tabs API reported 200%; window CSS width 1262 → 631 and all steps/actions fit. | `BB-048-2.png`, `BB-048-2.zip` |
| 3    | Chromium (zoom profile), 1024×1000 at 200%, dark  | **Pass** · Chrome tabs API reported 200%; window CSS width 1006 → 503 and all steps/actions fit. | `BB-048-3.png`, `BB-048-3.zip` |

### BB-049 · Keyboard-only workflow

- **Steps.** Use Tab and Shift+Tab to navigate, Enter to activate steps, Space to toggle an assumption and expand a review trail.
- **Expected.** Controls are reachable without a pointer and visible focus follows the chosen control.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                                                  | Local artifacts                |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Tab and Shift+Tab traversed controls; Enter and Space worked with visible focus on sampled workflow and disclosure controls. | `BB-049-1.png`, `BB-049-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Tab and Shift+Tab traversed controls; Enter and Space worked with visible focus on sampled workflow and disclosure controls. | `BB-049-2.png`, `BB-049-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Tab and Shift+Tab traversed controls; Enter and Space worked with visible focus on sampled workflow and disclosure controls. | `BB-049-3.png`, `BB-049-3.zip` |

### BB-050 · Themes and contrast

- **Steps.** Toggle theme twice at each workflow stage; compare actual color and visible control/step/verdict contrast. Set dark, reload, verify persistence.
- **Expected.** Theme switch works throughout and persists; sampled control/status text reaches 4.5:1 on solid backgrounds.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport            | Actual                                                                                                                                                                                                                                                                                                                                                                                    | Local artifacts                |
| ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, both themes | **Pass** · Theme changed and persisted; solid-background text ratios or unmeasured gradient samples: Review example (dark, 14.27), Review example (light, 14.94), Run checks (dark, 14.27), Run checks (light, 14.94), Copy Markdown (dark, 12.88), Contradicted (dark, 8.55), Supported (dark, 8.22), Copy Markdown (light, 17.38), Contradicted (light, 7.59), Supported (light, 8.18). | `BB-050-1.png`, `BB-050-1.zip` |
| 2    | Chromium, 1280×900, both themes | **Pass** · Theme changed and persisted; solid-background text ratios or unmeasured gradient samples: Review example (dark, 14.27), Review example (light, 14.94), Run checks (dark, 14.27), Run checks (light, 14.94), Copy Markdown (dark, 12.88), Contradicted (dark, 8.55), Supported (dark, 8.22), Copy Markdown (light, 17.38), Contradicted (light, 7.59), Supported (light, 8.18). | `BB-050-2.png`, `BB-050-2.zip` |
| 3    | Edge, 390×844, both themes      | **Pass** · Theme changed and persisted; solid-background text ratios or unmeasured gradient samples: Review example (light, 14.94), Review example (dark, 14.27), Run checks (light, 14.94), Run checks (dark, 14.27), Copy Markdown (light, 17.38), Contradicted (light, 7.59), Supported (light, 8.18), Copy Markdown (dark, 12.88), Contradicted (dark, 8.55), Supported (dark, 8.22). | `BB-050-3.png`, `BB-050-3.zip` |

### BB-051 · Reduced motion

- **Steps.** Enable the OS reduced-motion preference in Chromium, open all workflow steps and a review trail/room station.
- **Expected.** Preference is active; progress, recommendation, evidence and station details remain available.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport      | Actual                                                                                                       | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Pass** · Active reduced-motion preference did not prevent primary workflow, trail, or memo-station access. | `BB-051-1.png`, `BB-051-1.zip` |
| 2    | Chromium, 1280×900, light | **Pass** · Active reduced-motion preference did not prevent primary workflow, trail, or memo-station access. | `BB-051-2.png`, `BB-051-2.zip` |
| 3    | Edge, 390×844, dark       | **Pass** · Active reduced-motion preference did not prevent primary workflow, trail, or memo-station access. | `BB-051-3.png`, `BB-051-3.zip` |

### BB-052 · Accessible labels, focus and status

- **Steps.** Check semantic controls and active focus after stage changes; deselect all, inspect the live region and run a valid review to check explicit verdict labels.
- **Expected.** Important transitions move focus to meaningful content and the zero-selection explanation is programmatically announced.
- **Outcome.** **Fail** 3/3 · S2 · [New QA-01](DEFECTS.md).

| Pass | Browser and viewport      | Actual                                                                                                                                                                                                                                                                    | Local artifacts                |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 1440×960, light | **Fail** · Assumptions focus: {"tag":"H2","heading":true,"text":"Review assumptions"}; Results focus: {"tag":"H2","heading":true,"text":"Review results"}; visible zero-selection explanation in live region: {"live":false,"id":"(none)","liveText":["0 of 2 selected"]} | `BB-052-1.png`, `BB-052-1.zip` |
| 2    | Chromium, 1280×900, light | **Fail** · Assumptions focus: {"tag":"H2","heading":true,"text":"Review assumptions"}; Results focus: {"tag":"H2","heading":true,"text":"Review results"}; visible zero-selection explanation in live region: {"live":false,"id":"(none)","liveText":["0 of 2 selected"]} | `BB-052-2.png`, `BB-052-2.zip` |
| 3    | Edge, 390×844, dark       | **Fail** · Assumptions focus: {"tag":"H2","heading":true,"text":"Review assumptions"}; Results focus: {"tag":"H2","heading":true,"text":"Review results"}; visible zero-selection explanation in live region: {"live":false,"id":"(none)","liveText":["0 of 2 selected"]} | `BB-052-3.png`, `BB-052-3.zip` |

### BB-053 · Narrow results controls

- **Steps.** Set 320px, run flag, inspect the recommendation and every claim, expand evidence drawers, copy with real clipboard and export.
- **Expected.** Readable cards, no sideways scrolling, and working disclosure, clipboard and Download at 320px.
- **Outcome.** **Pass** 3/3.

| Pass | Browser and viewport     | Actual                                                                                                                          | Local artifacts                |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Chromium, 320×780, light | **Pass** · Recommendation, verdicts, expanded drawers, clipboard and file download worked without page-wide scrolling at 320px. | `BB-053-1.png`, `BB-053-1.zip` |
| 2    | Chromium, 320×780, light | **Pass** · Recommendation, verdicts, expanded drawers, clipboard and file download worked without page-wide scrolling at 320px. | `BB-053-2.png`, `BB-053-2.zip` |
| 3    | Edge, 320×780, dark      | **Pass** · Recommendation, verdicts, expanded drawers, clipboard and file download worked without page-wide scrolling at 320px. | `BB-053-3.png`, `BB-053-3.zip` |
