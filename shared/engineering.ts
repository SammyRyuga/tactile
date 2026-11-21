import { z } from "zod";

type Field = { label: string; min: number; max: number; integer?: boolean };
const count = (label: string, max = 1_000_000): Field => ({
  label,
  min: 1,
  max,
  integer: true,
});
const amount = (label: string, max = 1_000_000_000): Field => ({
  label,
  min: 0,
  max,
});
const definitions = {
  retries: {
    label: "Retry amplification",
    fields: [
      count("Attempts per layer, including initial attempt", 20),
      count("Retrying layers", 10),
      count("Maximum downstream attempts"),
    ],
    calculate: ([attempts, layers, limit]: number[]) => ({
      actual: attempts ** layers,
      limit,
      unit: "downstream attempts",
      comparison: "at most",
    }),
  },
  slo: {
    label: "Serial SLO composition",
    fields: [
      amount("First dependency availability (%)", 100),
      amount("Second independent dependency availability (%)", 100),
      amount("Required availability (%)", 100),
    ],
    calculate: ([first, second, limit]: number[]) => ({
      actual: (first * second) / 100,
      limit,
      unit: "% availability",
      comparison: "at least",
    }),
  },
  timeout: {
    label: "Nested timeout budget",
    fields: [
      count("Sequential attempts", 20),
      amount("Maximum milliseconds per attempt"),
      amount("Total backoff milliseconds"),
      amount("Parent timeout milliseconds"),
    ],
    calculate: ([attempts, timeout, backoff, limit]: number[]) => ({
      actual: attempts * timeout + backoff,
      limit,
      unit: "ms",
      comparison: "at most",
    }),
  },
  throughput: {
    label: "Throughput units",
    fields: [
      amount("Jobs per minute per worker"),
      count("Workers"),
      amount("Required jobs per second"),
    ],
    calculate: ([rate, workers, limit]: number[]) => ({
      actual: (rate * workers) / 60,
      limit,
      unit: "jobs/s",
      comparison: "at least",
    }),
  },
  average: {
    label: "Weighted average",
    fields: [
      amount("First group mean"),
      count("First group sample count"),
      amount("Second group mean (same units)"),
      count("Second group sample count"),
      amount("Claimed combined mean"),
    ],
    calculate: ([first, firstCount, second, secondCount, limit]: number[]) => ({
      actual:
        (first * firstCount + second * secondCount) /
        (firstCount + secondCount),
      limit,
      unit: "in the entered units",
      comparison: "equal to",
    }),
  },
} satisfies Record<
  string,
  {
    label: string;
    fields: Field[];
    calculate: (values: number[]) => {
      actual: number;
      limit: number;
      unit: string;
      comparison: "at most" | "at least" | "equal to";
    };
  }
>;

export const engineeringChecks = definitions;
const kindSchema = z.enum([
  "retries",
  "slo",
  "timeout",
  "throughput",
  "average",
]);

export const engineeringCheckSchema = z
  .object({
    kind: kindSchema,
    values: z.array(z.number()).max(5),
  })
  .refine(({ kind, values }) => {
    const fields = engineeringChecks[kind].fields;
    return (
      fields.length === values.length &&
      fields.every(
        ({ min, max, integer }, index) =>
          values[index] >= min &&
          values[index] <= max &&
          (!integer || Number.isInteger(values[index])),
      )
    );
  }, "Enter the required numeric inputs in the displayed units.");

export type EngineeringCheck = z.infer<typeof engineeringCheckSchema>;

export function evaluateEngineeringCheck({ kind, values }: EngineeringCheck) {
  const definition = engineeringChecks[kind];
  const { actual, limit, unit, comparison } = definition.calculate(values);
  const tolerance =
    Number.EPSILON * 8 * Math.max(1, Math.abs(actual), Math.abs(limit));
  const meets =
    comparison === "at least"
      ? actual + tolerance >= limit
      : comparison === "at most"
        ? actual - tolerance <= limit
        : Math.abs(actual - limit) <= tolerance;
  const format = (value: number) => String(Number(value.toPrecision(12)));
  return {
    meets,
    observation: `${definition.label} calculated ${format(actual)} ${unit}. The stated requirement is ${comparison} ${format(limit)} ${unit}.`,
  };
}
