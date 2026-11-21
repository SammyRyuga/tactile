const number = /^(?:\d{1,3}(?:,\d{3})+|\d{1,12})(?:\.\d{1,9})?/;
const rounds = /\(rounded to (\d) decimal places?\)/i;
const expression =
  /(?<![\w.,])([(+−\-\d][\d.,()+−\-*/×÷ \t]{1,149})\s*=\s*(exactly[ \t]+)?([+−-]?(?:\d{1,3}(?:,\d{3})+|\d{1,12})(?:\.\d{1,9})?)(?![\w,]|\.[.\d])/gi;

function evaluate(expression: string) {
  let rest = expression
    .replaceAll("−", "-")
    .replaceAll("×", "*")
    .replaceAll("÷", "/");
  let operated = false;
  function take(pattern: RegExp) {
    rest = rest.trimStart();
    const token = pattern.exec(rest)?.[0];
    if (token) rest = rest.slice(token.length);
    return token;
  }
  function atom(): number {
    const sign = take(/^[+-]/) === "-" ? -1 : 1;
    if (take(/^\(/)) {
      const value = sum();
      if (!take(/^\)/)) throw new Error("Unclosed expression");
      return sign * value;
    }
    const token = take(number);
    if (!token) throw new Error("Expected a number");
    return sign * Number(token.replaceAll(",", ""));
  }
  function product(): number {
    let value = atom();
    for (let op = take(/^[*/]/); op; op = take(/^[*/]/)) {
      const right = atom();
      operated = true;
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }
  function sum(): number {
    let value = product();
    for (let op = take(/^[+-]/); op; op = take(/^[+-]/)) {
      const right = product();
      operated = true;
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  const value = sum();
  return operated && !rest.trim() ? value : undefined;
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  const magnitude = Math.abs(value) * factor;
  if (!Number.isSafeInteger(Math.trunc(magnitude))) return value;
  const tolerance = Number.EPSILON * magnitude;
  return (Math.sign(value) * Math.round(magnitude + tolerance)) / factor;
}

function equal(left: number, right: number) {
  const margin =
    Number.EPSILON * 8 * Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Math.min(0.25, margin);
}

export function checkArithmetic(claim: string) {
  const text = claim.replace(/^[ \t]*\d{1,3}\.[ \t]+/gm, "");
  return [...text.matchAll(expression)].flatMap((match) => {
    const [equation, left, exactQualifier, value] = match;
    const prefix = text.slice(0, match.index).trimEnd();
    const suffix = text.slice(match.index + equation.length);
    if (
      /[+−*/×÷-]$/.test(prefix) ||
      /^\s*[%=×÷*/+]/.test(suffix) ||
      /^\s*[-−]\s*(?:\d|\()/.test(suffix)
    )
      return [];
    const context = suffix.split(/[;\n]|\.(?=\s|$)/, 1)[0];
    const statedRounding = rounds.exec(context);
    try {
      const outcome = evaluate(left.trim());
      if (outcome === undefined) return [];
      const actual = Number.isFinite(outcome)
        ? statedRounding
          ? round(outcome, Number(statedRounding[1]))
          : outcome
        : null;
      const stated = Number(value.replace(/^−/, "-").replaceAll(",", ""));
      const printedPlaces = value.split(".")[1]?.length;
      const exact =
        Boolean(exactQualifier) ||
        /\bexactly$/i.test(prefix) ||
        /(?:^\s*exactly\b|,\s*exactly\s*$)/i.test(context);
      const comparable =
        actual !== null && !exact && !statedRounding && printedPlaces
          ? round(actual, printedPlaces)
          : actual;
      const correct = comparable !== null && equal(comparable, stated);
      const rounding =
        !correct &&
        !exact &&
        !statedRounding &&
        !printedPlaces &&
        actual !== null
          ? equal(round(actual, 0), stated)
            ? "nearest integer"
            : equal(Math.floor(actual), stated)
              ? "floor"
              : equal(Math.ceil(actual), stated)
                ? "ceiling"
                : undefined
          : undefined;
      return [
        {
          equation: statedRounding
            ? `${equation} ${statedRounding[0]}`
            : equation,
          actual,
          correct,
          rounding,
        },
      ];
    } catch {
      return [];
    }
  });
}
