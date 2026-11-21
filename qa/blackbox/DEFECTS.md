# Confirmed black-box defects

Baseline `e31372e0ee50ac2a0501bad65f856c3a89a831d2`, public demo on the Windows development server. “New” means no matching issue was identified in the checkout’s progress record. These findings are queued for user and Ryan review.

| Priority | ID                                                                    | Cases  | Reproduction                                              | Evidence                                                                         |
| -------- | --------------------------------------------------------------------- | ------ | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| S2       | QA-01 · Zero-selection guidance is omitted from the live announcement | BB-052 | 3/3 matrix runs plus the independent reused-session check | `BB-052-{1,2,3}.zip`, `reused-session.json`, `reused-session-zero-selection.png` |
| S3       | QA-02 · Browser history skips intermediate review stages              | BB-005 | 3/3 matrix runs plus the independent reused-session check | `BB-005-{1,2,3}.zip`, `reused-session.json`                                      |
| S3       | QA-03 · Double-clicking Export Markdown triggers duplicate downloads  | BB-036 | 3/3 matrix runs plus the independent reused-session check | `BB-036-{1,2,3}.zip`, `reused-session.json`                                      |

## QA-01 · Zero-selection guidance is omitted from the live announcement (S2, new)

1. Open `/demo?example=flag` and select **Review example**.
2. Clear both **Include assumption** checkboxes, using Space if navigating by keyboard.
3. Observe the selection summary, the guidance beside the disabled **Run checks** button, and the accessible status.

The status exposes “0 of 2 selected.” Sighted users also see “Include at least one assumption to run checks.” The guidance is outside the live region. In the reused-session CI check it had no ID, and the disabled Run control had no accessible description referencing it. Focus correctly moved to the Assumptions and Results headings. The separate blank-text validation uses an alert. This finding concerns the zero-selection instructions exposed by browser semantics. No NVDA or other screen-reader speech was captured.

For review, include the actionable instructions in the accessible status or otherwise associate and announce them when the selection becomes invalid. Verify both zero-selection and restored-selection transitions.

## QA-02 · Browser history skips intermediate review stages (S3, new)

1. Open the flag example, select **CI coverage** from the library, and select **Review example**.
2. Edit claim 1, then select **Run checks**.
3. Press browser Back, then Forward, then Back again.

Back goes from CI Results to the flag Plan, bypassing CI Assumptions and Plan. Forward restores CI Results and **Edit assumptions** restores the entered text. The same behavior reproduced after earlier reviews in the same tab. This is a navigation surprise with a working draft recovery path and no demonstrated data loss.

For review, decide whether browser Back should follow the product’s steps or whether step navigation should be clearer while browser history stays scoped to examples.

## QA-03 · Double-clicking Export Markdown triggers duplicate downloads (S3, new)

1. Run any bundled example.
2. Double-click **Export Markdown**.
3. Observe the downloads.

Two downloads of the same report start. The independent reused-session CI run captured two files with the same suggested filename and matching SHA-256 hashes. Separate deliberate exports continue to work and were tested in BB-032.

For review, consider suppressing overlapping activation while one download starts, with a separate deliberate click still able to export again.

## Verdict integrity and evidence

No false reassurance or fabricated citation reproduced in the tested recorded paths. When the critical flag claim was edited, omitted or removed, the original appeared as unchecked, with no inferred verdict. Unrelated and conflicting newly included claims stayed Unresolved without sources. Portable exports included the applicable published excerpts and their provenance.

## Recorded observations outside defect counts

- The bare demo URL opens the default example. Invalid, empty and differently cased IDs display “Demo case unavailable” with functional recovery links.
- Normal claim text in a Markdown heading preserves tested Unicode, emoji, quotes and notation. The two-line claim’s wording survived, with its line boundary flattened in the Markdown heading. Inert markup remained escaped. The sampled wording stayed intact.
- A 240-character claim remained complete in the report and memo. On Windows the clipboard’s line endings differed from those of the file. Comparing both with the same newline convention yielded identical content.

## Verification on the repair branch

| Case           | Verified change                                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BB-052 · QA-01 | The atomic status includes the recovery instruction when the selection reaches zero. The disabled Run checks button is described by the visible guidance. Reselecting a claim removes the guidance and enables the button.         |
| BB-005 · QA-02 | Public demo history moves through Plan, Assumptions and Results. Running uses the Assumptions entry, so cancellation and restore do not create extra entries. Editing state and recorded results survive Back, Forward and reload. |
| BB-036 · QA-03 | A native double-click downloads once. Keyboard activation and deliberate later clicks still export the current memo, including after editing. Copy Markdown remains independent.                                                   |

Each case passed in two fresh Chromium contexts and one Edge mobile-emulated context. Both Chromium projects also passed the regression test that runs an earlier example in the same tab before exercising all three repairs. Browser accessibility semantics were verified. Screen-reader speech was outside this run.

The full rerun recorded 52 passing cases and one blocked case, or 156 passes and three blocked executions out of 159. BB-043 remains blocked because anonymous users have no evidence URL editor.
