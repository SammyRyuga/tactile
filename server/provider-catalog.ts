import { z } from "zod";
import { reviewModels } from "../shared/models.ts";
import { modelIdSchema } from "../shared/providers.ts";
import type { ModelOption, ProviderId } from "../shared/providers.ts";
import {
  createGeminiProvider,
  geminiBase,
  geminiKeyHeader,
} from "./gemini-provider.ts";
import {
  createGroqProvider,
  groqBase,
  isGroqReviewModel,
} from "./groq-provider.ts";
import {
  createProvider,
  ProviderOutputError,
  providerJson,
} from "./provider.ts";
import type { ProviderConfig } from "./provider.ts";

const catalogs = {
  groq: groqBase + "/models",
  meta: "https://api.meta.ai/v1/models",
  gemini: geminiBase + "/models",
  openai: "https://api.openai.com/v1/models",
  xai: "https://api.x.ai/v1/models",
};

const listSchema = z.object({
  data: z.array(
    z.object({ id: modelIdSchema, active: z.boolean().optional() }),
  ),
});
const googleSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      displayName: z.string().max(160).optional(),
      supportedGenerationMethods: z.array(z.string()),
    }),
  ),
  nextPageToken: z.string().max(1024).optional(),
});

export function supportsReviewModel(provider: ProviderId, id: string): boolean {
  switch (provider) {
    case "groq":
      return isGroqReviewModel(id);
    case "meta":
      return (
        /^muse-(spark|ember|wonder)(?:[-.][a-z0-9.-]+)?$/.test(id) &&
        !id.includes("-open")
      );
    case "gemini":
      return (
        /^gemini-[2-9][0-9]*(?:\.[0-9]+)?-(?:flash|pro|hydrogen|carbon)(?:[-.][a-z0-9.-]+)?$/.test(
          id,
        ) &&
        !/(?:image|audio|tts|live|native|robotics|thinking-experimental)/.test(
          id,
        )
      );
    case "openai":
      return (
        /^gpt-(?:4o|[5-9][0-9]*(?:\.[0-9]+)?)(?:[-.][a-z0-9.-]+)?$/.test(id) &&
        !/(?:audio|realtime|transcribe|tts|image|search-preview|codex|chat-latest|deep-research)/.test(
          id,
        )
      );
    case "xai":
      return (
        /^grok-(?:[4-9][0-9]*)(?:[-.][a-z0-9.-]+)?$/.test(id) &&
        !/(?:image|video|voice|code|beta)/.test(id)
      );
  }
}

export async function discoverModels(
  provider: ProviderId,
  key: string,
  signal: AbortSignal,
  request = fetch,
) {
  const options: ModelOption[] = [];
  if (provider === "gemini") {
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const url = new URL(catalogs.gemini);
      url.searchParams.set("pageSize", "100");
      if (cursor) url.searchParams.set("pageToken", cursor);
      const result = googleSchema.safeParse(
        await providerJson(
          request,
          url.href,
          key,
          signal,
          undefined,
          {},
          geminiKeyHeader,
        ),
      );
      if (!result.success) throw new ProviderOutputError("malformed");
      for (const model of result.data.models) {
        const id = model.name.replace(/^models\//, "");
        if (
          modelIdSchema.safeParse(id).success &&
          model.supportedGenerationMethods.includes("generateContent") &&
          supportsReviewModel(provider, id)
        )
          options.push({ id, name: model.displayName || id });
      }
      cursor = result.data.nextPageToken;
      if (!cursor) break;
    }
  } else {
    const result = listSchema.safeParse(
      await providerJson(request, catalogs[provider], key, signal),
    );
    if (!result.success) throw new ProviderOutputError("malformed");
    for (const model of result.data.data) {
      if (model.active === false || !supportsReviewModel(provider, model.id))
        continue;
      const name =
        provider === "meta" && Object.hasOwn(reviewModels, model.id)
          ? reviewModels[model.id as keyof typeof reviewModels].name
          : model.id;
      options.push({ id: model.id, name });
    }
  }
  function ranking(id: string) {
    if (/(?:preview|experimental|exp-)/.test(id)) return 2;
    return (
      provider === "groq"
        ? id.includes("20b")
        : /(?:flash|mini|fast|muse-spark)/.test(id)
    )
      ? 0
      : 1;
  }
  const models = [
    ...new Map(options.map((model) => [model.id, model])).values(),
  ]
    .sort(
      (a, b) =>
        ranking(a.id) - ranking(b.id) ||
        b.id.localeCompare(a.id, "en", { numeric: true }),
    )
    .slice(0, 100);
  return { models, recommended: models[0]?.id };
}

export function createReviewProvider(
  provider: ProviderId,
  key: string,
  model: string,
  request = fetch,
  config: ProviderConfig = {},
) {
  const client =
    provider === "groq"
      ? createGroqProvider(key, model, request, config)
      : provider === "gemini"
        ? createGeminiProvider(key, model, request, config)
        : createProvider(key, model, request, provider, config);
  return { ...client, providerId: provider };
}
