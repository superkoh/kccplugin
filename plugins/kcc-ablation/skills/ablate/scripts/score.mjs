/**
 * Deterministic run screening and the delta classifier the report speaks
 * in. Kept as a tiny shared vocabulary on purpose: a bug in a per-probe
 * scorer would silently produce confident wrong numbers, so there is one
 * implementation of each observable, tested once.
 *
 * Contract
 * --------
 * usedAnyTool(toolCalls, names) -> boolean
 *   True iff any recorded call names one of `names`.
 *
 * looksLikeHallucinatedToolUse(text, toolCalls) -> boolean
 *   True when a reply narrates a tool call it never made. With tools
 *   locked, a model that wants one occasionally writes the invocation
 *   and an invented result as prose, then stops — producing a reply that
 *   answered nothing. Such a run measured the lockdown, not the rule.
 *
 * screenRun(run, { sentinel, expectedTools }) ->
 *     { invalid, reason, unexpectedTools }
 *   The void-don't-score gate, applied before any scoring:
 *     - run.invalid (no result event, is_error, permission denial)
 *     - `sentinel` absent from every hook injection — the arm cannot be
 *       attributed, so the run measured an unknown document
 *     - a tool call that EXECUTED (ok === true) outside `expectedTools`
 *       — the model routed around the lockdown; an attempted-but-refused
 *       call is not an escape, nothing ran
 *     - a hallucinated tool call (see above)
 *   A voided run is re-run, never counted as a failing run: an
 *   infrastructure fault scored as "the arm failed" is a wrong number,
 *   confidently.
 *
 * classify({ bPass, bN, aPass, aN }) -> "effective" | "inconclusive"
 *                                     | "no-delta" | "harmful" | "incomplete"
 *   The screening rule encoded once. Arms end up with different usable
 *   counts — a voided run here, a thickened baseline there — so rates
 *   are compared via a one-tailed Fisher exact test at p < 0.05:
 *     equal rates            no-delta     — dead weight; deletion candidate
 *     A > B, significant     effective    — the rule visibly changed behavior
 *     B > A, significant     harmful      — the rule makes things worse
 *     otherwise              inconclusive — real but under-powered at this n
 *     an empty arm           incomplete
 *   This is screening, not significance testing: power comes from probe
 *   design, not from large N.
 */

export function usedAnyTool(toolCalls, names) {
  const wanted = new Set(names);
  return (toolCalls ?? []).some((c) => wanted.has(c.name));
}

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

export function screenRun(run, { sentinel, expectedTools = [] } = {}) {
  // Arm attribution, read off the hook payload — never off the model.
  // Which hook carries it depends on the doc under test (SessionStart
  // for main-session docs, SubagentStart for a subagent variant), so
  // the sentinel is accepted from any of them.
  const armProven = Object.values(run.hookInjections ?? {}).some((text) =>
    text.includes(sentinel)
  );

  const expected = new Set(expectedTools);
  const unexpectedTools = [
    ...new Set(
      (run.toolCalls ?? [])
        .filter((c) => c.ok === true && !expected.has(c.name))
        .map((c) => c.name)
    ),
  ];

  const faked = looksLikeHallucinatedToolUse(run.finalText, run.toolCalls);

  const reason = run.invalid
    ? `permissionDenials=${run.permissionDenials}, noResultOrError`
    : !armProven
      ? "arm sentinel absent from injected context"
      : unexpectedTools.length
        ? `escaped the lockdown via ${unexpectedTools.join(",")}`
        : faked
          ? "narrated a tool call it never made"
          : null;

  return { invalid: reason !== null, reason, unexpectedTools };
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
