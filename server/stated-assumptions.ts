import { createHash } from "node:crypto";
import { limits } from "../shared/review.ts";
import type { Claim } from "../shared/review.ts";

export const assumptionGuidance =
  "Prioritize the author's explicit assumptions, dependencies and engineering guarantees. Preserve the conditions, negations, timing and units that limit a guarantee. Use declared configuration and implementation steps as context for testing the expected outcome. Do not extract them as assumptions unless the author is relying on an uncertain assertion about them.";

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");

export function prioritizeStatedAssumptions(
  proposal: string,
  claims: Claim[],
): Claim[] {
  const result: Claim[] = [];
  const seen = new Set<string>();
  function add(claim: Claim) {
    const text = normalize(claim.text);
    if (seen.has(text)) return;
    seen.add(text);
    result.push(claim);
  }

  const statements = new Intl.Segmenter("en", {
    granularity: "sentence",
  }).segment(proposal);
  const implementation = new Set<string>();
  for (const { segment } of statements) {
    const plan = segment.trim().match(/^(?:I|we)\s+plan\s+to\s+(.+)$/is);
    if (plan) {
      implementation.add(normalize(segment));
      implementation.add(normalize(plan[1]));
    }
    const match = segment
      .trim()
      .match(
        /^(?:(?:I|we)\s+(?:assume|are assuming|guarantee|rely on the assumption)\s+that|(?:our|the)\s+(?:assumption|guarantee)\s+is\s+that|(?:this|the)\s+(?:plan|rollout|design)\s+depends\s+on\s+the\s+assumption\s+that)\s+(.+)$/is,
      );
    if (!match) continue;
    const body = match[1].replace(/\s+/g, " ").trim();
    if (body.length > limits.claim || body.split(" ").length < 4) continue;
    const text = body.charAt(0).toUpperCase() + body.slice(1);
    const existing = claims.find((claim) =>
      [normalize(text), normalize(segment)].includes(normalize(claim.text)),
    );
    if (existing) {
      add(existing);
      continue;
    }
    const suffix = createHash("sha256")
      .update(normalize(text))
      .digest("hex")
      .slice(0, 16);
    let id = "stated-" + suffix;
    while (claims.some((claim) => claim.id === id)) id += "-s";
    add({
      id,
      text,
      crossfire: claims[0]?.crossfire && {
        ...claims[0].crossfire,
        terms: [],
        mechanism: undefined,
      },
    });
  }
  const hasExplicitAssumption = result.length > 0;
  for (const claim of claims) {
    if (!hasExplicitAssumption || !implementation.has(normalize(claim.text)))
      add(claim);
  }
  return result.slice(0, limits.claims);
}
