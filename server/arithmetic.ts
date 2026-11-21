const number = /^(?:\d{1,3}(?:,\d{3})+|\d{1,12})(?:\.\d{1,9})?/;
const rounds = /\(rounded to (\d) decimal places?\)/i;
const expression =
  /(?<![\w.,])([(+−\-\d][\d.,()+−\-*/×÷ \t]{1,149})\s*=\s*([+−-]?(?:\d{1,3}(?:,\d{3})+|\d{1,12})(?:\.\d{1,9})?)(?![\w,]|\.[.\d])/g;

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

export function checkArithmetic(claim: string) {
  const text = claim.replace(/^[ \t]*\d{1,3}\.[ \t]+/gm, "");
  return [...text.matchAll(expression)].flatMap((match) => {
    const [equation, left, value] = match;
    const prefix = text.slice(0, match.index).trimEnd();
    const suffix = text.slice(match.index + equation.length);
    if (/[+−*/×÷-]$/.test(prefix) || /^\s*[%=×÷*+]/.test(suffix)) return [];
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
      const comparable =
        actual !== null && !statedRounding && printedPlaces
          ? round(actual, printedPlaces)
          : actual;
      return [
        {
          equation: statedRounding
            ? `${equation} ${statedRounding[0]}`
            : equation,
          actual,
          correct:
            comparable !== null &&
            Math.abs(comparable - stated) <=
              Math.min(
                0.25,
                Number.EPSILON *
                  8 *
                  Math.max(1, Math.abs(comparable), Math.abs(stated)),
              ),
        },
      ];
    } catch {
      return [];
    }
  });
}
