const number = /^(?:\d{1,3}(?:,\d{3})+|\d{1,12})(?:\.\d{1,9})?/;
const rounds = /\s*\(rounded to (\d) decimal places?\)$/i;

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
  return claim.split(/[;:\n]|\.(?=\s+[^.])/).flatMap((part) => {
    const equation = part.trim().replace(/(?<=\d|\))\.$/, "");
    const rounding = rounds.exec(equation);
    const [left, right, ...extra] = equation.replace(rounds, "").split("=");
    if (!right || extra.length || left.length > 150) return [];
    const target = right.trim().replace(/^−/, "-");
    const token = number.exec(target.replace(/^[+-]/, ""))?.[0];
    if (!token || token !== target.replace(/^[+-]/, "")) return [];
    try {
      const outcome = evaluate(left);
      if (outcome === undefined) return [];
      const actual = Number.isFinite(outcome)
        ? rounding
          ? round(outcome, Number(rounding[1]))
          : outcome
        : null;
      const stated = Number(target.replaceAll(",", ""));
      return [
        {
          equation,
          actual,
          correct:
            actual !== null &&
            Math.abs(actual - stated) <=
              Number.EPSILON *
                8 *
                Math.max(1, Math.abs(actual), Math.abs(stated)),
        },
      ];
    } catch {
      return [];
    }
  });
}
