# Local provider preview

Run the local preview from the feature checkout with Node 22.19+ or 24+ and the pinned Crossfire Python environment. Set `TACTILE_PYTHON` if that environment is outside `.venv`.

```sh
npm ci
node scripts/local-provider-preview.ts
```

The preview binds to loopback and prints the location of a temporary sign-in file. Use it to sign in at [localhost Settings](http://127.0.0.1:5173/settings). The sign-in service uses a generated password, expiring sessions, and a local review quota. It runs separately from the production authentication path.

1. Select **GroqCloud** and paste your key into **API key**.
2. Select **Load models**. Choose the recommended model returned for your key and select **Validate & save key**.
3. Open **Workspace** and analyze a short proposal. For a first Groq free-tier run, select one assumption and a small reviewer panel.
4. Inspect the evidence and decision memo. Open the Operator Room if your browser supports WebGL 2.

Catalog checks use metadata endpoints. Meta's separate **Test model and save** action can make a generation request when metadata is inconclusive. Tactile stores only one active provider key per verified session. Switching the selection clears the unsubmitted input. A successful save replaces the entry and its claim cache. The request carries the active provider and model so changes in another tab cannot silently redirect a review.

| Provider      | Structured generation                                                  | Evidence discovery                                          |
| ------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| GroqCloud     | Chat Completions JSON schema with local validation                     | Browser Search on catalog models that support both features |
| Meta          | Existing Meta Responses integration                                    | Meta web search                                             |
| Google Gemini | GenerateContent JSON schema with local validation                      | Wikipedia's public reference index and attached sources     |
| OpenAI        | Responses structured output or JSON mode for Crossfire's schema prompt | OpenAI web search                                           |
| xAI Grok      | Responses structured output or JSON mode for Crossfire's schema prompt | xAI web search                                              |

Provider search citations are leads. Tactile still retrieves and verifies evidence before using it to support a finding. Gemini reviews use the reference index because Google Search grounding limits using its results as inputs to a separate automated evidence pipeline. Attach primary technical sources when the index does not cover a claim. Groq limits vary by key and organization. A rate limit stops the request and preserves the provider's valid retry delay. Reviews can also time out.

Provider behavior is tested with mocked HTTP responses and the real Python review worker. Live credentials are needed to establish account access and complete a genuine review.

[Groq structured output](https://console.groq.com/docs/structured-outputs) · [Groq rate limits](https://console.groq.com/docs/rate-limits) · [Meta Responses](https://dev.meta.ai/docs/protocols/responses) · [Gemini GenerateContent](https://ai.google.dev/api/generate-content) · [Google Search grounding terms](https://ai.google.dev/gemini-api/terms#grounding-with-google-search) · [MediaWiki search](https://www.mediawiki.org/wiki/API:REST_API/Reference#Search_pages) · [OpenAI Responses](https://developers.openai.com/api/reference/responses/overview) · [xAI citations](https://docs.x.ai/developers/tools/citations)

Provider marks come from [Lobe Icons](https://github.com/lobehub/lobe-icons) version 1.106.0. Their [license](../public/provider-icons/LICENSE.txt) accompanies the SVGs.
