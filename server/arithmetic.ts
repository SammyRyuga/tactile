// Only evaluate equations explicitly written in the claim. Units and
// assumptions still need a specialist review.
export function checkArithmetic(claim: string) {
  const number = String.raw`-?\d{1,12}(?:\.\d{1,9})?`;
  const equations = new RegExp(
    `(?<![\\w.])(${number})\\s*([+*×/÷−-])\\s*(${number})\\s*=\\s*(${number})(?![\\w]|\\.\\d)`,
    "g",
  );
  return Array.from(
    claim.matchAll(equations),
    ([equation, left, operator, right, expected]) => {
      const a = Number(left);
      const b = Number(right);
      const outcome =
        operator === "+"
          ? a + b
          : operator === "-" || operator === "−"
            ? a - b
            : operator === "*" || operator === "×"
              ? a * b
              : a / b;
      const actual = Number.isFinite(outcome) ? outcome : null;
      const stated = Number(expected);
      return {
        equation,
        actual,
        correct:
          actual !== null &&
          Math.abs(actual - stated) <=
            Number.EPSILON *
              8 *
              Math.max(1, Math.abs(actual), Math.abs(stated)),
      };
    },
  );
}
