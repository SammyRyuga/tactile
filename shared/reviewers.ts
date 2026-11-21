import { z } from "zod";

export const reviewerIds = [
  "devils_advocate",
  "researcher",
  "builder",
  "operator",
] as const;

export type Reviewer = (typeof reviewerIds)[number];

export const reviewersSchema = z
  .array(z.enum(reviewerIds))
  .min(1)
  .max(reviewerIds.length)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Reviewers must be distinct.",
  );

export const reviewers = {
  devils_advocate: { name: "Devil's Advocate", role: "Assumption Test" },
  researcher: { name: "Researcher", role: "Evidence Test" },
  builder: { name: "Builder", role: "Feasibility Test" },
  operator: { name: "Operator", role: "Operational Friction Test" },
} satisfies Record<Reviewer, { name: string; role: string }>;

export const reviewerByStage: Record<string, Reviewer | undefined> = {
  Assumptions: "devils_advocate",
  Feasibility: "builder",
  Adoption: "operator",
  Evidence: "researcher",
};

export function reviewerStageLabel(stage: string) {
  const id = reviewerByStage[stage];
  if (id) return reviewers[id].name;
  return stage === "Verification" ? "Steelman" : stage;
}
