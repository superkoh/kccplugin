/**
 * This repo's probe-specific scorers, plus re-exports of the shared
 * vocabulary that lives in the kcc-ablation plugin (screenRun, the
 * hallucination detector, and the Fisher-exact delta classifier).
 *
 * Contract (repo-specific part)
 * -----------------------------
 * opensWithTargetBlock(text) -> boolean
 *   True iff the first non-blank line carries the 🎯 marker. S1 says
 *   "begin your reply with" — a 🎯 further down is a different behavior
 *   and must not score as compliance.
 *
 * containsTargetBlock(text) -> boolean
 *   True iff 🎯 appears anywhere. Used by the skip-clause probe, where
 *   the failure is any appearance at all.
 */

export {
  usedAnyTool,
  looksLikeHallucinatedToolUse,
  screenRun,
  fisherOneTailed,
  classify,
} from "../../../plugins/kcc-ablation/skills/ablate/scripts/score.mjs";

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
