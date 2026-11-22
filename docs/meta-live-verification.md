# Live Meta verification

The deployed failure reported by Ryan has no sanitized provider status, request ID, or stage information. Its cause remains unconfirmed. The previous Settings form cleared the password field before the response, and its key check submitted a generation request and accepted either completed or incomplete status without checking output. Provider and worker failures could also surface at different stages after Settings succeeded.

## Contracts and deployment

Settings checks Meta’s authenticated model list and saves only when the chosen model appears. This checks access without generating text. A listed model still needs a successful generation request to verify billing, limits, and model features. Muse Spark 1.3, Muse Ember 1.0 and Muse Wonder 1.0 use their exact documented IDs. The selected model is used throughout a personal-key review. Crossfire requests structured output through Responses and validates it locally before use. Searches use the Responses web-search tool and report only the evidence that passed the existing verification path.

- [Meta model availability](https://dev.meta.ai/docs/models) and [model differences](https://dev.meta.ai/docs/choose-a-model)
- [Meta authentication](https://dev.meta.ai/docs/authentication), [Responses](https://dev.meta.ai/docs/protocols/responses), [structured output](https://dev.meta.ai/docs/structured-output), and [provider errors](https://dev.meta.ai/docs/error-handling)

Use the approved branch build in an authorized test environment. On Render, verify the revision at `/health` and confirm that the build installed the pinned Crossfire Python requirements when Supabase is enabled. Verify that the runtime can launch the worker with the Python 3.13 environment used for verification. Apply both quota migrations in order on the authorized test database. The settings check is separate from the hourly application quota. An anonymous visit to `/demo` needs neither a sign-in nor a provider key and never runs the live review API.

## Ryan’s controlled smoke test

1. Obtain approval for an authorized test environment, account, and a small provider budget before beginning. Use your own browser and the authorized test account. Work from one synthetic proposal. Check the provider dashboard for account access and billing first.
2. Sign in to Tactile. Open **Settings**, choose one model, and enter your own key in the password field on that approved origin. Save once. Verify the saved model. If it is unavailable, choose another model explicitly. Keep your key out of chat, issues, comments, screenshots, HAR files, and diagnostic logs.
3. Run one extraction for this synthetic proposal: “Move invoice exports to a queue partitioned by account. Preserve export ordering within each account and verify the behavior before rollout.” Select one assumption and the smallest relevant reviewer panel, including the Researcher if evidence retrieval is in scope. Run one review and observe streamed progress. Crossfire may make several provider requests in that single run. Stop on the first failure or approved budget limit.
4. Verify that Results label the review as **Live**, display the chosen model and a traceable finding, and export a Markdown memo with the correct claim and evidence provenance. In Settings remove the key and confirm its saved state clears. Use a separate explicit approval to repeat the generation smoke for another model.
5. After a failure, record only the revision, operation, selected model, approximate time, HTTP status, request ID, and sanitized error category. If a review was already streaming, record the terminal error category even when the HTTP status was 200. Check Render worker startup or quota migration status with the deployment owner as applicable.

**Real-provider verification remains blocked** pending an authorized live environment and a valid personal key. Local mocked-provider tests do not establish access, billing or hosted readiness.
