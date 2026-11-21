import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { reportSchema } from "../shared/review.ts";
import { corpus } from "./evaluation-cases.ts";

const baseline = z.object({
  text: z.string(),
  citations: z.array(
    z.object({ title: z.string(), url: z.string(), passage: z.string() }),
  ),
});
const scope = z.object({
  inScope: z.boolean(),
  rationale: z.string().optional(),
  reason: z.string().optional(),
});
const trialSchema = z.object({
  caseId: z.string(),
  split: z.enum(["development", "holdout"]).optional(),
  repetition: z.number().int().min(1).max(3),
  report: reportSchema.optional(),
  single: baseline.optional(),
  bestOfN: z.array(baseline.nullable()).optional(),
  researchAgent: baseline.optional(),
  rawProposal: baseline.optional(),
  tactile: scope.optional(),
  baseline: scope.optional(),
});
const systems = z.enum([
  "tactile",
  "single",
  "best-of-n",
  "research-agent",
  "raw-proposal",
]);
type System = z.infer<typeof systems>;
const category = z.enum([
  "sound",
  "mixed",
  "uncertain",
  "quantitative",
  "out-of-scope",
]);
const keyEntry = z.object({
  id: z.string(),
  caseId: z.string(),
  repetition: z.number(),
  category,
  systems: z.array(systems),
  citationCount: z.number(),
  reassurances: z.number(),
});
type KeyEntry = z.infer<typeof keyEntry>;

const originalColumns = [
  "candidate_id",
  "case_id",
  "repetition",
  "target_caught",
  "false_alarm",
  "unsupported_conclusions",
  "relevant_citations",
  "total_citations",
  "reassurance_reviewed",
  "misleading_reassurances",
];
const columns = [...originalColumns, "unresolved_findings"];

function prepare(raw: string, directory: string, split: keyof typeof corpus) {
  const lines = readFileSync(raw, "utf8").trim().split("\n");
  const lookup = new Map<string, z.infer<typeof trialSchema>>();
  for (const line of lines) {
    const trial = trialSchema.parse(JSON.parse(line));
    if (trial.split && trial.split !== split)
      throw new Error(
        `Case ${trial.caseId} belongs to the ${trial.split} split.`,
      );
    const id = `${trial.caseId}:${trial.repetition}`;
    if (lookup.has(id)) throw new Error(`Duplicate trial ${id}.`);
    lookup.set(id, trial);
  }
  const cases = corpus[split];
  if (lookup.size !== cases.length * 3)
    throw new Error(
      `The full ${split} grading packet requires ${cases.length * 3} distinct trials.`,
    );
  const packet = join(directory, "blind");
  mkdirSync(packet, { recursive: true });
  const key: KeyEntry[] = [];
  const csv = [columns.join(",")];

  for (const [category, caseId, proposal, expected] of cases) {
    const sections = [
      `# ${caseId}`,
      "",
      "## Proposal",
      "",
      proposal,
      "",
      "## Expected finding",
      "",
      expected,
    ];
    for (let repetition = 1; repetition <= 3; repetition++) {
      const trial = lookup.get(`${caseId}:${repetition}`);
      if (!trial) throw new Error(`Missing trial ${caseId}:${repetition}.`);
      const records: { entry: KeyEntry; text: string }[] = [];
      function record(
        aliases: System[],
        text: string,
        citations = 0,
        reassurances = 0,
      ) {
        const id = randomUUID();
        records.push({
          entry: {
            id,
            caseId,
            repetition,
            category,
            systems: aliases,
            citationCount: citations,
            reassurances,
          },
          text,
        });
      }
      function addBaseline(
        aliases: System[],
        result: z.infer<typeof baseline>,
      ) {
        const passages = result.citations.map(
          ({ title, url, passage }) =>
            `- ${title} — ${url}\n  - Provider-reported passage: ${passage}`,
        );
        record(
          aliases,
          [result.text, ...passages].join("\n"),
          result.citations.length,
        );
      }
      if (trial.report) {
        const { report } = trial;
        if (
          !trial.researchAgent ||
          !trial.rawProposal ||
          !trial.single ||
          !trial.bestOfN?.length ||
          trial.bestOfN.some((sample) => !sample) ||
          JSON.stringify(trial.single) !== JSON.stringify(trial.bestOfN[0])
        ) {
          throw new Error(
            `Incomplete or inconsistent baseline pool for ${caseId}:${repetition}.`,
          );
        }
        const cited = report.findings.flatMap((finding) =>
          finding.sourceIds.flatMap(
            (id) => report.sources.find((source) => source.id === id) ?? [],
          ),
        );
        const entries = report.findings.map((finding) => {
          const links = finding.sourceIds
            .flatMap(
              (id) => report.sources.find((source) => source.id === id) ?? [],
            )
            .map(
              ({ title, url, passage }) =>
                `- ${title} — ${url}${passage ? `\n  - Fetched excerpt: ${passage}` : ""}`,
            );
          return [
            `**${finding.verdict} · ${finding.claim.text}**`,
            finding.rationale,
            finding.proposalExcerpt
              ? `Verified proposal excerpt: ${finding.proposalExcerpt}`
              : "",
            `Next step: ${finding.nextStep}`,
            finding.missingInformation
              ? `Missing information: ${finding.missingInformation}`
              : "",
            finding.repair
              ? `Repair: ${finding.repair.minimalFix}\n\nTradeoff: ${finding.repair.tradeoff}`
              : "",
            ...links,
            ...(finding.projectCitations ?? []).map(
              ({ title, quote }) =>
                `- Project evidence · ${title}\n  - Verified excerpt: ${quote}`,
            ),
          ]
            .filter(Boolean)
            .join("\n\n");
        });
        record(
          ["tactile"],
          [report.recommendation, ...entries].join("\n\n"),
          cited.length +
            report.findings.reduce(
              (count, finding) =>
                count + (finding.projectCitations?.length ?? 0),
              0,
            ),
          report.findings.filter(
            ({ verdict }) => verdict === "No credible break found",
          ).length,
        );
        addBaseline(["raw-proposal"], trial.rawProposal);
        addBaseline(["research-agent"], trial.researchAgent);
        trial.bestOfN.forEach((sample, index) => {
          if (sample)
            addBaseline(
              index === 0 ? ["single", "best-of-n"] : ["best-of-n"],
              sample,
            );
        });
      } else if (trial.tactile && trial.baseline) {
        for (const [system, result] of [
          ["tactile", trial.tactile],
          ["single", trial.baseline],
        ] as const) {
          record(
            [system],
            `In engineering scope: ${result.inScope ? "yes" : "no"}\n\n${result.rationale ?? result.reason ?? ""}`,
          );
        }
      } else
        throw new Error(`Missing scope results for ${caseId}:${repetition}.`);
      for (const { entry, text } of records.sort((a, b) =>
        a.entry.id.localeCompare(b.entry.id),
      )) {
        key.push(entry);
        csv.push(
          [
            entry.id,
            caseId,
            repetition,
            "",
            "",
            "",
            "",
            entry.citationCount,
            "",
            "",
            "",
          ].join(","),
        );
        sections.push(
          "",
          `## Repetition ${repetition} · ${entry.id}`,
          "",
          text,
        );
      }
    }
    writeFileSync(join(packet, `${caseId}.md`), sections.join("\n") + "\n");
  }
  writeFileSync(join(packet, "marks.csv"), csv.join("\n") + "\n");
  writeFileSync(
    join(directory, "system-key.json"),
    JSON.stringify(key, null, 2) + "\n",
  );
  writeFileSync(
    join(packet, "README.md"),
    `# Human grading

Read each case packet and fill the matching row in marks.csv. The systems are hidden. Keep system-key.json closed until grading is finished.

- target_caught: true if the response captures the expected finding without a material error.
- false_alarm: true if it asserts a substantive defect that is unsupported or absent.
- unsupported_conclusions: count substantive conclusions that lack appropriate support.
- relevant_citations: count citations whose destination directly supports the associated statement. Review the destination, since a provider-reported excerpt may be unreliable.
- reassurance_reviewed and misleading_reassurances: for “No credible break found” findings, record how many you reviewed and how many should have stayed unresolved or been challenged. Leave these empty for other answers.
- unresolved_findings: count distinct material questions the candidate explicitly leaves open.

Enter true/false and nonnegative integers. Leave candidate ID and prefilled citation counts intact. All three repetitions are included. Out-of-scope cases compare scope handling.
`,
  );
  console.log(
    `Prepared ${key.length} blinded candidates across ${lookup.size} trials.`,
  );
}

function unblind(csvPath: string, keyPath: string) {
  const key = z
    .array(keyEntry)
    .parse(JSON.parse(readFileSync(keyPath, "utf8")));
  const remaining = new Map(key.map((entry) => [entry.id, entry]));
  const cells = (line: string) =>
    line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
  const [header, ...lines] = readFileSync(csvPath, "utf8")
    .trim()
    .split(/\r?\n/);
  const headings = cells(header).join(",");
  if (headings !== columns.join(",") && headings !== originalColumns.join(","))
    throw new Error("Keep the original marks CSV columns.");
  function boolean(value: string) {
    if (!/^(true|false)$/i.test(value))
      throw new Error("Enter true or false in each boolean column.");
    return value.toLowerCase() === "true";
  }
  function count(value: string) {
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw new Error("Enter nonnegative integer counts.");
    return Number(value);
  }
  const marked = lines.map((line) => {
    const [
      id,
      caseId,
      repetition,
      caught,
      falseAlarm,
      unsupported,
      relevant,
      total,
      reviewed,
      misleading,
      unresolved,
    ] = cells(line);
    const entry = remaining.get(id);
    if (
      !entry ||
      caseId !== entry.caseId ||
      Number(repetition) !== entry.repetition
    )
      throw new Error(`Invalid or repeated candidate ${id}.`);
    remaining.delete(id);
    const mark = {
      caseId,
      category: entry.category,
      repetition: entry.repetition,
      caught: boolean(caught),
      falseAlarm: boolean(falseAlarm),
      unsupportedConclusions: count(unsupported),
      relevantCitations: count(relevant),
      totalCitations: count(total),
      unresolvedFindings: unresolved ? count(unresolved) : undefined,
      reassurance:
        reviewed || misleading
          ? { reviewed: count(reviewed), misleading: count(misleading) }
          : undefined,
    };
    if (
      mark.relevantCitations > entry.citationCount ||
      mark.totalCitations !== entry.citationCount ||
      (mark.reassurance &&
        (mark.reassurance.reviewed > entry.reassurances ||
          mark.reassurance.misleading > mark.reassurance.reviewed))
    )
      throw new Error(`Counts exceed the candidate material for ${id}.`);
    return { entry, mark };
  });
  if (remaining.size)
    throw new Error(`${remaining.size} candidates are unscored.`);
  const pooled = new Map<string, (typeof marked)[number]>();
  const marks: ((typeof marked)[number]["mark"] & { system: System })[] =
    marked.flatMap((row) =>
      row.entry.systems.flatMap((system) => {
        if (system !== "best-of-n") return [{ ...row.mark, system }];
        const group = `${row.entry.caseId}:${row.entry.repetition}`;
        const current = pooled.get(group);
        const difference =
          current &&
          (Number(row.mark.caught) - Number(current.mark.caught) ||
            Number(current.mark.falseAlarm) - Number(row.mark.falseAlarm) ||
            current.mark.unsupportedConclusions -
              row.mark.unsupportedConclusions ||
            row.mark.relevantCitations - current.mark.relevantCitations);
        if (!current || (difference ?? 0) > 0) pooled.set(group, row);
        return [];
      }),
    );
  for (const { mark } of pooled.values())
    marks.push({ ...mark, system: "best-of-n" });
  console.log(JSON.stringify(marks, null, 2));
}

const [, , command, input, output, split = "development"] = process.argv;
if (
  command === "prepare" &&
  input &&
  output &&
  (split === "development" || split === "holdout")
)
  prepare(input, output, split);
else if (command === "unblind" && input && output) unblind(input, output);
else
  throw new Error(
    "Use grading.ts prepare <comparison.jsonl> <directory> [development|holdout] or unblind <marks.csv> <system-key.json>.",
  );
