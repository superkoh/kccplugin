/**
 * Deterministic scorers shared by probes, plus the delta classifier the
 * report speaks in. Kept as a tiny shared vocabulary on purpose: a bug
 * in a per-probe scorer would silently produce confident wrong numbers,
 * so there is one implementation of each observable, tested once.
 *
 * Contract
 * --------
 * opensWithTargetBlock(text) -> boolean
 *   True iff the first non-blank line carries the 🎯 marker. S1 says
 *   "begin your reply with" — a 🎯 further down is a different behavior
 *   and must not score as compliance.
 *
 * containsTargetBlock(text) -> boolean
 *   True iff 🎯 appears anywhere. Used by the skip-clause probe, where
 *   the failure is any appearance at all.
 *
 * usedAnyTool(toolCalls, names) -> boolean
 *   True iff any recorded call names one of `names`.
 *
 * classify({ bPass, aPass, n }) -> "effective" | "inconclusive"
 *                                | "no-delta" | "harmful"
 *   The screening rule stated up front, encoded once:
 *     delta < 0        harmful      — the rule makes things worse
 *     delta = 0        no-delta     — ablation changed nothing; dead weight
 *     0 < delta < n-1  inconclusive — real but under-powered at this n
 *     delta >= n-1     effective    — at n=5 that is 5-vs-1, Fisher p≈0.048
 */

const MARKER = "🎯";

export function opensWithTargetBlock(text) {
  const first = String(text ?? "")
    .split("\n")
    .find((l) => l.trim().length > 0);
  return first !== undefined && first.includes(MARKER);
}

export function containsTargetBlock(text) {
  return String(text ?? "").includes(MARKER);
}

export function usedAnyTool(toolCalls, names) {
  const wanted = new Set(names);
  return (toolCalls ?? []).some((c) => wanted.has(c.name));
}

/**
 * True when a reply narrates a tool call it never made. With tools
 * locked, a model that wants one occasionally writes the invocation and
 * an invented result as prose, then stops — producing a reply that
 * answered nothing. Such a run measured the lockdown, not the rule.
 */
export function looksLikeHallucinatedToolUse(text, toolCalls) {
  if ((toolCalls ?? []).length > 0) return false;
  const t = String(text ?? "");
  return (
    /\*\*Tool (Call|Result|use)/i.test(t) ||
    /<invoke\s+name=/i.test(t) ||
    /<function_calls>/i.test(t) ||
    /<parameter\s+name=/i.test(t)
  );
}

const logFactorial = (n) => {
  let acc = 0;
  for (let i = 2; i <= n; i++) acc += Math.log(i);
  return acc;
};
const logChoose = (n, k) => logFactorial(n) - logFactorial(k) - logFactorial(n - k);

/**
 * One-tailed Fisher exact p for "arm A's success rate exceeds arm B's",
 * summing the hypergeometric tail from the observed count upward.
 */
export function fisherOneTailed({ bPass, bN, aPass, aN }) {
  const successes = aPass + bPass;
  const total = aN + bN;
  // Denominator pairs with the C(aN,k)·C(bN,successes−k) numerator:
  // it counts every way of placing the successes across both arms.
  const logDenom = logChoose(total, successes);
  let p = 0;
  for (let k = aPass; k <= Math.min(successes, aN); k++) {
    const other = successes - k;
    if (other < 0 || other > bN) continue;
    p += Math.exp(logChoose(aN, k) + logChoose(bN, other) - logDenom);
  }
  return Math.min(1, p);
}

export function classify({ bPass, bN, aPass, aN }) {
  if (!aN || !bN) return "incomplete";
  const aRate = aPass / aN;
  const bRate = bPass / bN;
  if (aRate === bRate) return "no-delta";

  if (aRate > bRate) {
    return fisherOneTailed({ bPass, bN, aPass, aN }) < 0.05 ? "effective" : "inconclusive";
  }
  // Mirror the test to ask whether the ABLATED arm scores higher.
  const p = fisherOneTailed({ bPass: aPass, bN: aN, aPass: bPass, aN: bN });
  return p < 0.05 ? "harmful" : "inconclusive";
}
