import { spawn } from "node:child_process";
import { accessSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import {
  claimSchema,
  limits,
  reportSchema,
  reviewEventSchema,
  sourceSchema,
  stageSchema,
} from "../shared/review.ts";
import type {
  Finding,
  Report,
  ReviewEvent,
  ReviewInput,
  Source,
} from "../shared/review.ts";
import { ProposalScopeError } from "./pipeline.ts";
import type { ReviewProvider } from "./provider.ts";
import { readSource } from "./source-reader.ts";
import { reviewersSchema } from "../shared/reviewers.ts";
import { evaluateEngineeringCheck } from "../shared/engineering.ts";

const envelope = z.object({
  kind: z.enum(["case", "request", "event", "error"]),
  case: z.unknown().optional(),
  event: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  id: z.number().int().optional(),
  operation: z.string().optional(),
  instructions: z.string().optional(),
  messages: z
    .array(
      z.object({ role: z.enum(["user", "assistant"]), content: z.string() }),
    )
    .optional(),
  schema: z.unknown().optional(),
  query: z.string().optional(),
  url: z.string().optional(),
});
const engineClaim = z.object({
  id: z.string(),
  statement: z.string(),
  load_bearing: z.boolean().nullish(),
  status: z.enum(["survived", "weakened", "broken", "unresolved"]).nullish(),
  terms: z.array(
    z.object({
      term: z.string(),
      resolved: z.string(),
      search_phrasing: z.string(),
    }),
  ),
  mechanism_of: z.string().nullish(),
  missing_input: z.string().nullish(),
});
const caseSchema = z.object({
  status: z.string(),
  gate_message: z.string().nullish(),
  selected_agents: reviewersSchema,
  reversibility: z.enum(["one_way", "two_way"]).nullish(),
  deadline: z.string().nullish(),
  claims: z.array(engineClaim),
  findings: z.array(
    z.object({
      claim_id: z.string(),
      evaluator: z.string(),
      result: z.string(),
      reasoning: z.string(),
      evidence: z.array(
        z.object({
          source_url: z.string(),
          title: z.string().nullish(),
          snippet: z.string(),
          stance: z.string(),
          verified: z.boolean(),
          verification: z.string(),
        }),
      ),
    }),
  ),
  consequences: z.array(
    z.object({
      claim_id: z.string(),
      verdict_reasoning: z.string(),
      recommended_change: z.string(),
      next_validation: z.string().nullish(),
      salvaged_claim: z.string().nullish(),
      tradeoff_acknowledged: z.string().nullish(),
    }),
  ),
  case_verdict: z
    .object({
      decision_state: z.enum([
        "proceed",
        "proceed_with_changes",
        "hold",
        "drop",
      ]),
      headline: z.string(),
      summary: z.string(),
      surviving_core: z.string(),
      deciding_factor: z.object({ the_fact: z.string() }).nullable(),
      dissents: z.array(z.object({ the_fact: z.string() })),
      next_actions: z.array(z.object({ action: z.string() })),
      build_spec: z
        .object({
          what_it_does: z.string(),
          what_it_omits: z.string(),
          demo_path: z.string(),
          cheapest_experiment: z.string(),
        })
        .nullable(),
    })
    .nullable(),
});
const decisionLabels = {
  proceed: "Proceed",
  proceed_with_changes: "Proceed with Changes",
  hold: "Hold",
  drop: "Drop",
} as const;
const stageByEvaluator = {
  devils_advocate: "Assumptions",
  builder: "Feasibility",
  operator: "Adoption",
  researcher: "Evidence",
  cross_examination: "Evidence",
  judge: "Verification",
} as const;
function evaluatorStage(name: unknown) {
  return typeof name === "string" && Object.hasOwn(stageByEvaluator, name)
    ? stageByEvaluator[name as keyof typeof stageByEvaluator]
    : undefined;
}

export function createCrossfireEngine(pythonPath?: string, hosted = false) {
  const dependencies =
    hosted && !pythonPath ? resolve(".crossfire-python") : undefined;
  const executable =
    pythonPath ?? (dependencies ? "python3" : resolve(".venv/bin/python"));
  const worker = resolve("server/crossfire/worker.py");
  accessSync(
    dependencies ? resolve(dependencies, "pydantic/__init__.py") : executable,
  );
  accessSync(worker);

  async function run(
    provider: ReviewProvider,
    command: object,
    signal: AbortSignal,
    onEvent?: (event: string, data: Record<string, unknown>) => void,
  ) {
    signal.throwIfAborted();
    const generate =
      provider.crossfireGenerate?.bind(provider) ??
      (() => {
        throw new Error("The configured provider cannot run Crossfire.");
      });
    const child = spawn(executable, ["-I", "-B", worker], {
      stdio: ["pipe", "pipe", "ignore"],
      env: {
        PATH: process.env.PATH,
        PYTHON_DOTENV_DISABLED: "1",
        TACTILE_CROSSFIRE_LIBS: dependencies,
      },
    });
    const abort = () => child.kill("SIGTERM");
    signal.addEventListener("abort", abort, { once: true });
    const lines = createInterface({ input: child.stdout });
    let result: z.infer<typeof caseSchema> | undefined;
    let transportError: unknown;
    const completion = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve();
        else
          reject(
            transportError ?? new Error("Crossfire worker did not complete."),
          );
      });
    });
    completion.catch(() => {});
    child.stdin.on("error", (error) => {
      transportError = error;
    });
    function write(value: unknown) {
      if (child.stdin.writable && !child.stdin.destroyed)
        child.stdin.write(JSON.stringify(value) + "\n");
    }
    async function reply(message: z.infer<typeof envelope>) {
      const { id, instructions, messages, schema, url, query } = message;
      try {
        let value;
        if (message.operation === "generate" && instructions && messages)
          value = await generate(instructions, messages, schema, signal);
        else if (message.operation === "fetch" && url)
          value = (await readSource(url, signal))?.text ?? "";
        else if (message.operation === "search" && query)
          value = (
            await provider.research(
              "Search for public sources matching the given query. Cite each sourced sentence with its original URL and copy a short verbatim passage where available. Use only public technology terms in any search.",
              { query },
              signal,
              { maxToolCalls: 1 },
            )
          ).citations;
        else throw new Error("Unknown Crossfire gateway operation.");
        write({ id, value });
      } catch {
        write({ id, error: true });
      }
    }
    try {
      write(command);
      for await (const line of lines) {
        signal.throwIfAborted();
        const message = envelope.parse(JSON.parse(line));
        if (message.kind === "request") void reply(message);
        else if (message.kind === "case")
          result = caseSchema.parse(message.case);
        else if (message.kind === "event" && message.event && message.data)
          onEvent?.(message.event, message.data);
      }
      await completion;
      signal.throwIfAborted();
      if (!result) throw new Error("Crossfire returned no case.");
      return result;
    } finally {
      signal.removeEventListener("abort", abort);
      lines.close();
      child.stdin.end();
      if (child.exitCode === null && child.signalCode === null) abort();
    }
  }

  return {
    async extract(
      provider: ReviewProvider,
      proposal: string,
      signal: AbortSignal,
    ) {
      const result = await run(
        provider,
        { operation: "extract", proposal },
        signal,
      );
      if (result.status === "needs_input")
        throw new ProposalScopeError(
          result.gate_message ??
            "Name the specific decision you are weighing, and what you would do if it went wrong.",
        );
      return result.claims.slice(0, limits.claims).map((claim) =>
        claimSchema.parse({
          id: claim.id,
          text: claim.statement.slice(0, limits.claim),
          crossfire: {
            agents: result.selected_agents,
            deadline: result.deadline,
            reversibility: result.reversibility,
            mechanism: claim.mechanism_of?.slice(0, 240),
            terms: claim.terms
              .filter(
                ({ term, resolved, search_phrasing }) =>
                  term.length <= 240 &&
                  resolved.length <= 600 &&
                  search_phrasing.length <= 360,
              )
              .slice(0, 6),
          },
        }),
      );
    },

    async review(
      provider: ReviewProvider,
      input: ReviewInput,
      emit: (event: ReviewEvent) => void,
      signal: AbortSignal,
    ): Promise<Report> {
      const metadata = input.claims.find(
        ({ crossfire }) => crossfire,
      )?.crossfire;
      const stages = new Map<
        string,
        { stage: z.infer<typeof stageSchema>; claimId: string }
      >();
      const caseData = await run(
        provider,
        {
          operation: "review",
          proposal: input.proposal,
          context:
            [
              ...(input.projectEvidence ?? []).map(
                ({ title, text }) => `${title}\n${text}`,
              ),
              ...input.claims.flatMap(({ text, engineeringCheck }) =>
                engineeringCheck
                  ? [
                      `Engineering check for "${text}": ${evaluateEngineeringCheck(engineeringCheck).observation}`,
                    ]
                  : [],
              ),
            ].join("\n\n") || undefined,
          claims: input.claims.map((claim) => ({
            id: claim.id,
            statement: claim.text,
            terms:
              claim.crossfire?.terms.filter(({ term }) =>
                claim.text.toLowerCase().includes(term.toLowerCase()),
              ) ?? [],
            mechanism_of: claim.crossfire?.mechanism,
          })),
          metadata: {
            selected_agents: input.reviewers ?? metadata?.agents,
            reversibility: metadata?.reversibility,
            deadline: metadata?.deadline,
          },
        },
        signal,
        (name, data) => {
          const finding = data.finding as Record<string, unknown> | undefined;
          const stage =
            data.tag === "Synthesis" || name === "case_verdict"
              ? "Synthesis"
              : (evaluatorStage(data.evaluator ?? finding?.evaluator) ??
                (name === "verdict_ready" ? "Verification" : undefined));
          const claimId = data.claim_id ?? data.target_claim_id;
          const active = name === "test_started" || name === "activity";
          if (
            !stage ||
            !(
              active ||
              name === "finding_ready" ||
              name === "case_verdict" ||
              name === "verdict_ready"
            )
          )
            return;
          const status = active ? "running" : "done";
          const global = reviewEventSchema.safeParse({
            type: "progress",
            stage,
            status,
          });
          if (global.success) emit(global.data);
          if (
            typeof claimId === "string" &&
            input.claims.some(({ id }) => id === claimId)
          ) {
            if (active) stages.set(`${stage}:${claimId}`, { stage, claimId });
            else stages.delete(`${stage}:${claimId}`);
            const detail =
              typeof data.text === "string"
                ? data.text.slice(0, 360)
                : undefined;
            const local = reviewEventSchema.safeParse({
              type: "progress",
              stage,
              status,
              claimId,
              detail,
            });
            if (local.success) emit(local.data);
          }
        },
      );
      if (caseData.status !== "done" || !caseData.case_verdict)
        throw new Error("Crossfire could not finish this review.");
      for (const item of stages.values())
        emit({ ...item, type: "progress", status: "done" });

      const sources: Source[] = [];
      const findings = caseData.claims.map((result) => {
        const original = input.claims.find(({ id }) => id === result.id);
        if (!original) throw new Error("Crossfire returned an unknown claim.");
        const consequence = caseData.consequences.find(
          ({ claim_id }) => claim_id === result.id,
        );
        const sourceIds: string[] = [];
        const audit: NonNullable<Finding["audit"]> = [];
        for (const finding of caseData.findings.filter(
          ({ claim_id }) => claim_id === result.id,
        )) {
          const ids: string[] = [];
          for (const evidence of finding.evidence) {
            const id = `source-${sources.length + 1}`;
            const source = sourceSchema.safeParse({
              id,
              title: evidence.title ?? evidence.source_url,
              url: evidence.source_url,
              passage: evidence.verified ? evidence.snippet : undefined,
              diagnostic: evidence.verified ? undefined : evidence.verification,
              relation:
                evidence.stance === "supports" ||
                evidence.stance === "contradicts"
                  ? evidence.stance
                  : undefined,
            });
            if (!source.success) continue;
            sources.push(source.data);
            ids.push(id);
            sourceIds.push(id);
          }
          const stage = evaluatorStage(finding.evaluator);
          if (stage)
            audit.push({
              stage,
              status:
                finding.result === "System Error / Timeout"
                  ? "failed"
                  : "complete",
              observation: `${finding.result} · ${finding.reasoning}`.slice(
                0,
                3600,
              ),
              sourceIds: ids,
            });
        }
        const verdict =
          result.status === "survived"
            ? "Survived"
            : result.status === "broken"
              ? "Broken"
              : result.status === "weakened"
                ? "Weakened"
                : "Unresolved";
        return {
          claim: { ...original, loadBearing: result.load_bearing ?? false },
          verdict,
          rationale:
            consequence?.verdict_reasoning ||
            consequence?.recommended_change ||
            "No evaluator produced a finding for this claim.",
          nextStep:
            consequence?.next_validation ||
            consequence?.recommended_change ||
            "Review the decision memo.",
          missingInformation: result.missing_input ?? undefined,
          sourceIds,
          repair:
            consequence?.salvaged_claim && consequence.tradeoff_acknowledged
              ? {
                  minimalFix: consequence.salvaged_claim,
                  tradeoff: consequence.tradeoff_acknowledged,
                }
              : undefined,
          audit,
        };
      });
      const verdict = caseData.case_verdict;
      return reportSchema.parse({
        mode: "live",
        model: provider.modelId,
        crossfireDecision: decisionLabels[verdict.decision_state],
        crossfireReviewers: caseData.selected_agents,
        recommendation: [verdict.headline, verdict.summary]
          .filter(Boolean)
          .join(" "),
        crossfireMemo: {
          survivingCore: verdict.surviving_core,
          decidingFactor: verdict.deciding_factor?.the_fact,
          dissents: verdict.dissents.map(({ the_fact }) => the_fact),
          nextActions: verdict.next_actions.map(({ action }) => action),
          buildSpec: verdict.build_spec ?? undefined,
        },
        findings,
        sources,
      });
    },
  };
}
