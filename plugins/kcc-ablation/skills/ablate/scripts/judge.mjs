/**
 * Blinded rubric judging for probes whose observable needs semantics
 * rather than a regex — the prompt the judge model receives, and the
 * parser for its reply. Running the judge is the campaign driver's job;
 * these two stay pure so they can be tested offline.
 *
 * Contract
 * --------
 * buildJudgePrompt({ rubric, reply }) -> string
 *
 *   The judge is told nothing about arms, ablations, or which rule is
 *   under test, and must run with no plugins loaded — otherwise the
 *   judge would inherit the very principles being measured.
 *
 * parseVerdict(judgeText) -> { verdict, reason }
 *
 *   verdict  "PASS" | "FAIL" | "UNPARSEABLE"
 *   reason   text of the matching REASON line, "" when absent.
 *
 * The judge is instructed to close with `VERDICT: PASS|FAIL` and
 * `REASON: …`. Matching is case-insensitive and tolerates markdown
 * bold. The LAST verdict line wins — judges routinely restate the
 * rubric before answering, and an early quote is not the answer.
 *
 * An unparseable reply is its own outcome, never silently folded into
 * FAIL: counting judge failures as rule failures would bias every
 * semantically-judged rule toward "the rule does nothing".
 */

export function buildJudgePrompt({ rubric, reply }) {
  return [
    "You are grading one reply against a single binary rubric.",
    "Judge only what the rubric asks. Ignore style, length and politeness.",
    "",
    "RUBRIC:",
    rubric,
    "",
    "REPLY UNDER TEST (delimited):",
    "<<<REPLY",
    reply,
    "REPLY>>>",
    "",
    "Answer with exactly two lines:",
    "VERDICT: PASS or FAIL",
    "REASON: one sentence, quoting the decisive phrase from the reply.",
  ].join("\n");
}

const VERDICT_RE = /\**verdict\**\s*:\s*\**\s*(pass|fail)\b/gi;
const REASON_RE = /\**reason\**\s*:\s*\**\s*(.+)/gi;

export function parseVerdict(judgeText) {
  const text = String(judgeText ?? "");
  const verdicts = [...text.matchAll(VERDICT_RE)];
  if (verdicts.length === 0) return { verdict: "UNPARSEABLE", reason: "" };

  const last = verdicts[verdicts.length - 1];
  const reasons = [...text.matchAll(REASON_RE)].filter((m) => m.index > last.index);
  const reason = reasons.length ? reasons[reasons.length - 1][1] : "";

  return {
    verdict: last[1].toUpperCase(),
    reason: reason.replace(/\s*\*+\s*$/, "").trim(),
  };
}
