import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { reportSchema } from "../shared/review.ts";
import { corpus } from "./evaluation-cases.ts";

const outputSchema = z.object({
  text: z.string(),
  citations: z.array(
    z.object({ url: z.string(), title: z.string(), passage: z.string() }),
  ),
});
const scopeSchema = z.object({
  inScope: z.boolean(),
  reason: z.string().optional(),
  rationale: z.string().optional(),
});
const trialSchema = z.object({
  caseId: z.string(),
  repetition: z.number().int().positive(),
  report: reportSchema.optional(),
  single: outputSchema.optional(),
  bestOfN: z.array(outputSchema.nullable()).optional(),
  researchAgent: outputSchema.optional(),
  rawProposal: outputSchema.optional(),
  tactile: scopeSchema.optional(),
  baseline: scopeSchema.optional(),
});
type Output = z.infer<typeof outputSchema>;

export function writeBlindReview(input: string, packet: string, key: string) {
  const cases = new Map(
    [...corpus.development, ...corpus.holdout].map((row) => [row[1], row]),
  );
  const answerKey: {
    candidateId: string;
    caseId: string;
    category: string;
    repetition: number;
    system: string;
    sample?: number;
    completePool: boolean;
  }[] = [];
  const casesForReview = [];
  for (const line of readFileSync(input, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const trial = trialSchema.safeParse(JSON.parse(line));
    if (!trial.success) continue; // Failed trials have no candidate outputs.
    const {
      caseId,
      repetition,
      report,
      single,
      bestOfN,
      rawProposal,
      researchAgent,
    } = trial.data;
    const row = cases.get(caseId);
    if (!row) throw new Error(`Unknown case ${caseId}.`);
    const [category, , proposal, target] = row;
    const candidates: (Output & { candidateId: string })[] = [];
    const completePool = Boolean(bestOfN?.length && bestOfN.every(Boolean));
    const add = (
      system: string,
      output: Output | undefined,
      sample?: number,
    ) => {
      if (!output) return;
      const candidateId = randomUUID();
      candidates.push({ candidateId, ...output });
      answerKey.push({
        candidateId,
        caseId,
        category,
        repetition,
        system,
        sample,
        completePool,
      });
    };
    if (report)
      add("tactile", {
        text: [
          report.recommendation,
          ...report.findings.map((finding) =>
            [
              finding.claim.text,
              `${finding.verdict} · ${finding.rationale}`,
              finding.proposalExcerpt,
              finding.reason,
              finding.missingInformation,
              finding.nextStep,
              finding.repair?.minimalFix,
              finding.repair?.tradeoff,
              ...finding.sourceIds.map(
                (id) => report.sources.find((source) => source.id === id)?.url,
              ),
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        ].join("\n\n"),
        citations: report.sources
          .filter(({ id }) =>
            report.findings.some(({ sourceIds }) => sourceIds.includes(id)),
          )
          .map(({ url, title, passage }) => ({
            url,
            title,
            passage: passage ?? "",
          })),
      });
    if (category === "out-of-scope") {
      for (const [system, scope] of [
        ["tactile", trial.data.tactile],
        ["single", trial.data.baseline],
      ] as const) {
        if (scope)
          add(system, {
            text: `${scope.inScope ? "Accepted" : "Declined"} · ${scope.reason ?? scope.rationale ?? ""}`,
            citations: [],
          });
      }
    }
    add("raw-proposal", rawProposal);
    add("research-agent", researchAgent);
    add("single", single, completePool ? 1 : undefined);
    if (completePool)
      bestOfN?.slice(single ? 1 : 0).forEach((output, index) => {
        add("best-of-n", output ?? undefined, index + (single ? 2 : 1));
      });
    if (candidates.length)
      casesForReview.push({
        caseId,
        repetition,
        proposal,
        target,
        candidates: candidates.sort((left, right) =>
          left.candidateId.localeCompare(right.candidateId),
        ),
      });
  }
  if (!casesForReview.length)
    throw new Error("The run file has no reviewable candidates.");
  if (packet === key)
    throw new Error("Use separate files for the packet and answer key.");
  writeFileSync(packet, JSON.stringify(casesForReview, null, 2) + "\n", {
    flag: "wx",
  });
  writeFileSync(key, JSON.stringify(answerKey, null, 2) + "\n", { flag: "wx" });
}
