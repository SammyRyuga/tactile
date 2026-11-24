import { z } from "zod";

export const providerSchema = z.enum([
  "groq",
  "meta",
  "gemini",
  "openai",
  "xai",
]);
export type ProviderId = z.infer<typeof providerSchema>;

export const providers = {
  groq: {
    name: "GroqCloud",
    keys: "https://console.groq.com/keys",
    tone: "apricot",
  },
  meta: {
    name: "Meta",
    keys: "https://dev.meta.ai/docs/authentication#get-an-api-key",
    tone: "blue",
  },
  gemini: {
    name: "Google Gemini",
    keys: "https://aistudio.google.com/apikey",
    tone: "violet",
  },
  openai: {
    name: "OpenAI",
    keys: "https://platform.openai.com/api-keys",
    tone: "lime",
  },
  xai: { name: "xAI Grok", keys: "https://console.x.ai/", tone: "neutral" },
} satisfies Record<ProviderId, { name: string; keys: string; tone: string }>;

export const modelIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
export const modelOptionSchema = z.object({
  id: modelIdSchema,
  name: z.string(),
});
export type ModelOption = z.infer<typeof modelOptionSchema>;

export const activeProviderSchema = z.object({
  id: providerSchema,
  model: modelIdSchema,
});
export type ActiveProvider = z.infer<typeof activeProviderSchema>;
