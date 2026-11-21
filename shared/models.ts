import { z } from "zod";

export const reviewModelSchema = z.enum([
  "muse-spark-1.3",
  "muse-ember-1.0",
  "muse-wonder-1.0",
]);
export type ReviewModel = z.infer<typeof reviewModelSchema>;
export const defaultReviewModel: ReviewModel = "muse-spark-1.3";
export const reviewModels: Record<
  ReviewModel,
  { name: string; use: string; tone: string }
> = {
  "muse-spark-1.3": {
    name: "Muse Spark 1.3",
    use: "Start here for most reviews.",
    tone: "blue",
  },
  "muse-ember-1.0": {
    name: "Muse Ember 1.0",
    use: "For quick checks and smaller proposals.",
    tone: "lime",
  },
  "muse-wonder-1.0": {
    name: "Muse Wonder 1.0",
    use: "For complex plans with more tradeoffs.",
    tone: "apricot",
  },
};
