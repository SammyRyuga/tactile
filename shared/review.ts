import { z } from "zod";
import { engineeringCheckSchema } from "./engineering.ts";

export const limits = {
  proposal: 3000,
  claim: 240,
  claims: 6,
  selected: 3,
  evidenceItems: 3,
  evidenceText: 2400,
} as const;
export const verdictSchema = z.enum([
  "Supported",
  "No credible break found",
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

export const projectEvidenceSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(100),
  text: z.string().trim().min(12).max(limits.evidenceText),
});
export const evidenceListSchema = z
  .array(projectEvidenceSchema)
  .max(limits.evidenceItems)
  .refine(
    (entries) => new Set(entries.map(({ id }) => id)).size === entries.length,
    "Evidence IDs must be unique.",
  );

export const claimSchema = z.object({
  id: idSchema,
  text: z.string().trim().min(1).max(limits.claim),
  risk: riskSchema.optional(),
  loadBearing: z.boolean().optional(),
  engineeringCheck: engineeringCheckSchema.optional(),
});

export const reviewInputSchema = z.object({
  proposal: proposalSchema,
  projectEvidence: evidenceListSchema.optional(),
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
  "Engineering check",
  "Project evidence",
  "Evidence critique",
  "Evidence",
  "Source retrieval",
  "Verification",
  "Synthesis",
] as const;
export const stageSchema = z.enum(stages);
const modeSchema = z.enum(["demo", "live"]);

export const sourceSchema = z.object({
  id: idSchema,
  title: z.string(),
  passage: z.string().optional(),
  diagnostic: z.string().optional(),
  passageOrigin: z.literal("source").optional(),
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

export function uniqueSourcesByUrl<T extends { url: string }>(sources: T[]) {
  const seen = new Set<string>();
  return sources.filter(({ url }) => {
    let key = url;
    if (!url.startsWith("/")) {
      const address = new URL(url);
      address.hash = "";
      for (const param of [...address.searchParams.keys()]) {
        if (/^(?:utm_.+|gclid|fbclid|msclkid)$/i.test(param)) {
          address.searchParams.delete(param);
        }
      }
      address.searchParams.sort();
      key = address.href;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const findingSchema = z.object({
  claim: claimSchema,
  verdict: verdictSchema,
  basis: z
    .enum(["proposal", "arithmetic", "source", "project", "engineering"])
    .optional(),
  verificationDisagreement: z.boolean().optional(),
  projectCitations: z
    .array(
      z.object({
        id: idSchema,
        title: z.string(),
        quote: z.string(),
        relation: z.enum(["supports", "contradicts", "qualifies"]),
      }),
    )
    .optional(),
  proposalExcerpt: z.string().optional(),
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
  model: z.string().optional(),
  verifier: z.object({ model: z.string(), distinct: z.boolean() }).optional(),
  recommendation: z.string(),
  findings: z.array(findingSchema),
  sources: z.array(sourceSchema),
});

export const reviewEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("progress"),
    stage: stageSchema,
    claimId: idSchema.optional(),
    detail: z.string().max(360).optional(),
    status: z.enum(["running", "done", "unavailable", "skipped"]),
  }),
  z.object({ type: z.literal("report"), report: reportSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type ProjectEvidence = z.infer<typeof projectEvidenceSchema>;
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

function markdownSource(source: Source, origin?: string): string {
  const address = URL.parse(source.url, origin);
  const destination = (address?.href ?? source.url).replace(
    /[<>\s\\]/g,
    encodeURIComponent,
  );
  return `[${markdownText(source.title)}](<${destination}>)`;
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
    if (finding.proposalExcerpt)
      lines.push(
        "",
        "**Verified proposal excerpt**",
        "",
        markdownBlock(finding.proposalExcerpt),
      );
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
    if (finding.verificationDisagreement)
      lines.push(
        "",
        "**Verifier disagreement** The verifier did not find that the supplied premise established the specialist’s concern.",
      );
    if (finding.projectCitations?.length) {
      lines.push("", "**Project evidence supplied by the reviewer**");
      for (const { title, relation, quote } of finding.projectCitations) {
        lines.push(
          "",
          `- ${markdownText(title)} · ${relation}`,
          `  - ${markdownText(quote)}`,
        );
      }
    }
    if (finding.audit?.length) {
      lines.push("", "#### Review trail", "");
      for (const check of finding.audit) {
        const titles = uniqueSourcesByUrl(
          (check.sourceIds ?? []).flatMap((id) => sources.get(id) ?? []),
        ).map((source) => markdownSource(source, origin));
        lines.push(
          `- **${check.stage} · ${check.status}** ${markdownText(check.observation)}${titles.length ? ` (${titles.join(", ")})` : ""}`,
        );
      }
    }
    const referenced = new Set([
      ...finding.sourceIds,
      ...(finding.audit ?? []).flatMap(({ sourceIds }) => sourceIds ?? []),
    ]);
    for (const source of uniqueSourcesByUrl(
      [...referenced].flatMap((id) => sources.get(id) ?? []),
    )) {
      lines.push(`- ${markdownSource(source, origin)}`);
      if (!source.passage && source.diagnostic)
        lines.push(
          `  - Source unreadable · ${markdownText(source.diagnostic)}`,
        );
      if (source.passage)
        lines.push(
          `  - ${source.passageOrigin === "source" ? "Fetched source excerpt" : "Cited research excerpt"} · ${markdownText(source.passage)}`,
        );
    }
  }
  return lines.join("\n") + "\n";
}
