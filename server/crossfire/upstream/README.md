# Crossfire review engine

The Python sources here come from [hriday-singh/crossfire at 50209fc](https://github.com/hriday-singh/crossfire/tree/50209fc6639d3c2c5daccfec9793046ee821cd25/backend). The original [MIT license](LICENSE) applies to the vendored code.

The parent directory contains Tactile’s adapter. It runs Crossfire’s extraction, input gate, evaluator selection, load-bearing ranking, isolated panel, targeted cross-examination, evidence checks, Steelman reconciliation, and decision synthesis. Tactile supplies authenticated model calls, public search, and protected page fetching. A worker exists only for the current request, so Tactile’s existing saved reports remain the persistence boundary.

The vendored file ingestion modules read PDFs and screenshots. Tactile uses its own bounded, public-only HTTPS reader for URL attachments and its authenticated provider gateway for Crossfire’s original Steelman rewrite. File parts and the truncated excerpts have separate size limits.
