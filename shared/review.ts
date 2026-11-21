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

export const riskSchema = z.enum([
  "logic",
  "technical",
  "adoption",
  "evidence",
]);
export const unresolvedReasonSchema = z.enum([
  "Evidence insufficient",
  "Sources conflict",
  "Check failed",
]);

export const claimSchema = z.object({
  id: idSchema,
  text: z.string().trim().min(1).max(limits.claim),
  risk: riskSchema.optional(),
  loadBearing: z.boolean().optional(),
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
  "Adoption",
  "Arithmetic",
  "Evidence",
  "Verification",
  "Synthesis",
] as const;
export const stageSchema = z.enum(stages);
const modeSchema = z.enum(["demo", "live"]);

export const sourceSchema = z.object({
  id: idSchema,
  title: z.string(),
  passage: z.string().optional(),
  startIndex: z.number().int().optional(),
  endIndex: z.number().int().optional(),
  relation: z
    .enum(["supports", "contradicts", "qualifies", "unrelated"])
    .optional(),
  url: z.union([
    z.url({ protocol: /^https?$/ }),
    z.string().regex(/^\/(?:demo|example)-evidence\.html#[a-z-]+$/),
  ]),
});

export const findingSchema = z.object({
  claim: claimSchema,
  verdict: verdictSchema,
  rationale: z.string(),
  nextStep: z.string(),
  sourceIds: z.array(idSchema),
  reason: unresolvedReasonSchema.optional(),
  missingInformation: z.string().optional(),
  repair: z.object({ minimalFix: z.string(), tradeoff: z.string() }).optional(),
  audit: z
    .array(
      z.object({
        stage: stageSchema,
        status: z.enum(["complete", "failed", "skipped"]),
        observation: z.string(),
        sourceIds: z.array(idSchema).optional(),
      }),
    )
    .optional(),
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
    status: z.enum(["running", "done", "unavailable", "skipped"]),
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

function markdownBlock(text: string): string {
  const longest = Math.max(
    0,
    ...Array.from(text.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  return [fence, text, fence].join("\n");
}

export function toMarkdown(
  proposal: string,
  report: Report,
  origin?: string,
): string {
  const sources = new Map(report.sources.map((source) => [source.id, source]));
  const lines = [
    "# Tactile decision review",
    "",
    report.mode === "demo" ? "Mode: Bundled example" : "Mode: Live review",
    "",
    "## Proposal",
    "",
    markdownBlock(proposal),
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
    if (finding.reason)
      lines.push("", `**Resolution status** ${finding.reason}`);
    if (finding.missingInformation)
      lines.push(
        "",
        `**What would settle it** ${markdownText(finding.missingInformation)}`,
      );
    if (finding.repair)
      lines.push(
        "",
        `**Smallest viable change** ${markdownText(finding.repair.minimalFix)}`,
        "",
        `**Tradeoff** ${markdownText(finding.repair.tradeoff)}`,
      );
    if (finding.audit?.length) {
      lines.push("", "#### Review trail", "");
      for (const check of finding.audit) {
        const titles = (check.sourceIds ?? []).flatMap((id) => {
          const source = sources.get(id);
          if (!source) return [];
          const href =
            source.url.startsWith("/") && origin
              ? new URL(source.url, origin).href
              : source.url;
          return [`[${markdownText(source.title)}](<${href}>)`];
        });
        lines.push(
          `- **${check.stage} · ${check.status}** ${markdownText(check.observation)}${titles.length ? ` (${titles.join(", ")})` : ""}`,
        );
      }
    }
    const referenced = new Set([
      ...finding.sourceIds,
      ...(finding.audit ?? []).flatMap(({ sourceIds }) => sourceIds ?? []),
    ]);
    for (const id of referenced) {
      const source = sources.get(id);
      if (!source) continue;
      const title = markdownText(source.title);
      const url =
        source.url.startsWith("/") && origin
          ? new URL(source.url, origin).href
          : source.url;
      lines.push(`- [${title}](<${url}>)`);
      if (source.passage)
        lines.push(
          `  - Cited research excerpt · ${markdownText(source.passage)}`,
        );
    }
  }
  return lines.join("\n") + "\n";
}
