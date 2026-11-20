import { z } from "zod";

export const limits = {
  proposal: 3000,
  claim: 240,
  claims: 6,
  selected: 3,
} as const;
export const verdictSchema = z.enum([
  "Supported",
  "Weakened",
  "Contradicted",
  "Unresolved",
]);
export const proposalSchema = z.string().trim().min(20).max(limits.proposal);
const idSchema = z.string().regex(/^[a-zA-Z0-9-]{1,40}$/);

export const claimSchema = z.object({
  id: idSchema,
  text: z.string().trim().min(1).max(limits.claim),
});

export const reviewInputSchema = z.object({
  proposal: proposalSchema,
  claims: z
    .array(claimSchema)
    .min(1)
    .max(limits.selected)
    .refine(
      (claims) => new Set(claims.map(({ id }) => id)).size === claims.length,
      "Claim IDs must be unique.",
    ),
});

export const stages = [
  "Assumptions",
  "Feasibility",
  "Evidence",
  "Synthesis",
] as const;
export const stageSchema = z.enum(stages);
const modeSchema = z.enum(["demo", "live"]);

export const sourceSchema = z.object({
  id: idSchema,
  title: z.string(),
  url: z.union([
    z.url({ protocol: /^https?$/ }),
    z.string().regex(/^\/demo-evidence\.html#[a-z-]+$/),
  ]),
});

export const findingSchema = z.object({
  claim: claimSchema,
  verdict: verdictSchema,
  rationale: z.string(),
  nextStep: z.string(),
  sourceIds: z.array(idSchema),
});

export const reportSchema = z.object({
  mode: modeSchema,
  recommendation: z.string(),
  findings: z.array(findingSchema),
  sources: z.array(sourceSchema),
});

export const reviewEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("progress"),
    stage: stageSchema,
    status: z.enum(["running", "done", "unavailable"]),
  }),
  z.object({ type: z.literal("report"), report: reportSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type Claim = z.infer<typeof claimSchema>;
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type ReviewEvent = z.infer<typeof reviewEventSchema>;
export type ProgressEvent = Extract<ReviewEvent, { type: "progress" }>;
export type Finding = z.infer<typeof findingSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Report = z.infer<typeof reportSchema>;

function markdownText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\`*_{}\[\]()#+.!|<>~&-]/g, "\\$&");
}

export function toMarkdown(proposal: string, report: Report): string {
  const sources = new Map(report.sources.map((source) => [source.id, source]));
  const lines = [
    "# Tactile decision review",
    "",
    report.mode === "demo" ? "Mode: Bundled demo" : "Mode: Live review",
    "",
    "## Proposal",
    "",
    markdownText(proposal),
    "",
    "## Recommended next step",
    "",
    markdownText(report.recommendation),
  ];

  for (const finding of report.findings) {
    lines.push(
      "",
      `### ${finding.verdict} · ${markdownText(finding.claim.text)}`,
      "",
      markdownText(finding.rationale),
      "",
      `**Next step** \n${markdownText(finding.nextStep)}`,
    );
    for (const id of finding.sourceIds) {
      const source = sources.get(id);
      if (!source) continue;
      const title = markdownText(source.title);
      const url = source.url.startsWith("/")
        ? "https://github.com/SammyRyuga/tactile/blob/main/public" +
          source.url.split("#")[0]
        : source.url;
      lines.push(`- [${title}](<${new URL(url).href}>)`);
    }
  }
  return lines.join("\n") + "\n";
}
