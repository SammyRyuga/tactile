# Tactile black-box QA · November 22, 2026

The public recorded demo passed 49 of 53 cases. Three cases exposed reproducible usability or accessibility issues, and one case was blocked by the absence of an anonymous evidence URL editor. No S0 or S1 issue was observed in this campaign.

| Unit              | Pass | Fail | Blocked | Inconclusive | Total |
| ----------------- | ---: | ---: | ------: | -----------: | ----: |
| Cases             |   49 |    3 |       1 |            0 |    53 |
| Matrix executions |  147 |    9 |       3 |            0 |   159 |

A separate reused-session spot check reproduced all three defects and is outside the matrix totals. Calibration runs used to correct browser selectors, excerpt comparisons and platform-specific link gestures are also outside those totals.

## Environment and method

- Windows checkout, baseline `e31372e0ee50ac2a0501bad65f856c3a89a831d2`, on the existing tracking branch `qa/blackbox-2026-11-22`. The QA harness points at the existing local server at `http://127.0.0.1:5173`. Node.js 24.19.0 and the installed repository Playwright dependency were used.
- Pass 1 used fresh Chromium 159.0.8154.6 contexts at 1440 × 960 in light mode. Pass 2 used separate Chromium contexts at 1280 × 900 in light mode. Pass 3 used fresh Microsoft Edge 158.0.4370.33 contexts at 390 × 844 with mobile/touch emulation, dark mode and reduced motion. Session, responsive and zoom cases applied their case-specific conditions.
- BB-047 ran each of six widths (1440, 1280, 1024, 768, 390 and 320 CSS px) in both themes on every pass, for 36 full workflows. It checked page overflow and control bounds with opened Results drawers. BB-053 tested full narrow results, clipboard and download at 320 px on each pass.
- BB-048 used actual per-tab zoom in isolated Chromium profiles. The browser reported zoom factor 2, and the CSS widths went from 1422 to 711, 1262 to 631 and 1006 to 503. All three runs passed.
- The keyboard-only pass used Tab, Shift+Tab, Enter and Space. It checked visible focus and the full path through a review trail. Theme tests measured ten text samples per pass. Ratios ranged from 7.59:1 to 17.38:1 across the sampled controls and verdict labels. Screen-reader speech and full WCAG conformance were outside this campaign.
- Each matrix case used an isolated browser context. Multiple reviews or tabs shared a context only where that case required it. Clipboard cases ran serially with permission for the local origin. The harness used a paused browser clock for interruption timing, browser offline mode and a browser storage restriction for their respective cases. The local app supplied all report content.
- Browser request observation was scoped to localhost. Outbound links were activated with off-origin requests stopped before transmission. The test verified browser targets and opener handling where relevant. Third-party redirect chains were outside scope.

## Verdicts, evidence and public boundaries

- The flag fixture contradicted restoration of existing records and supported prevention of later flagged writes. The CI example distinguished contradicted consumer coverage, unresolved timing, weakened post-merge fallback and supported command selection. The replica fixture contradicted immediate reads and left p95 benefit unresolved.
- In the tested flag paths, replacing, removing or deselecting the critical claim did not approve rollback or assign a verdict to the unchecked assumption. Unsupported new or conflicting claims remained Unresolved without invented evidence. All tested claim verdicts and actions agreed with the exported memo.
- Actual downloaded files for all three defaults included the proposal, recommendation, findings, and verbatim excerpts with provenance from four bundled source anchors. The CI dependency excerpt preserved the two relevant assertions from the longer published snippet. Portable files contained no localhost links. Modified exports kept the coverage warning and cited only evidence applicable to checked claims.
- The recorded demo ran and exported offline after loading. Source navigation failed with the browser's offline error and recovered after reconnecting. No provider or protected review API request appeared during the recorded review flow.
- Anonymous Review and Settings navigations displayed sign-in. The local review POST returned HTTP 503 with the provider-key configuration message. The same collection path with GET returned HTTP 404. These are anonymous no-key observations. Authenticated access control, live reasoning, private evidence and live station failure transitions remain blocked pending authorization. See [the live test matrix](LIVE_TESTS_PENDING.md).

## Priorities for review

1. Expose the zero-selection recovery explanation through accessible feedback (S2).
2. Decide whether browser Back should navigate workflow steps, and clarify the recovery path in the existing history model (S3).
3. Suppress duplicate exports on rapid activation while retaining deliberate repeated downloads (S3).

See [DEFECTS.md](DEFECTS.md) for exact repro steps and [TEST_MATRIX.md](TEST_MATRIX.md) for the outcome and artifacts of each execution.

## Replay and artifacts

Run with the existing zero-key Windows development server healthy on port 5173. Pass an artifact directory outside the checkout. A nonzero exit status is expected while confirmed regressions reproduce.

```powershell
node qa/blackbox/run.mjs ..\..\outputs\blackbox-replay --all-artifacts
node qa/blackbox/run.mjs ..\..\outputs\blackbox-focused BB-005 BB-036 BB-052 --all-artifacts
```

The original artifact directory relative to the checkout was `../../outputs/blackbox-2026-11-22/final/`. It contains browser screenshots, Playwright ZIP traces, downloaded memos, `results.json`, and the reused-session verification. For a local replay of an individual trace, use `npx playwright show-trace <local-trace.zip>`.

The repository check also passed formatting, lint, type checking, all 60 Node tests and the production build. The build emitted bundler notices about Framer Motion module directives. The existing Windows development server still served a healthy response on port 5173 from Node PID 13680.

The files in `qa/blackbox/` are the QA harness and sanitized documentation. Browser profiles, traces, screenshots and downloaded files are local artifacts. No product implementation, provider configuration, hosting, production tests, or dependency definitions were changed.
