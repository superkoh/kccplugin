/**
 * Blinded rubric judging for probes whose observable needs semantics
 * rather than a regex.
 *
 * Contract
 * --------
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

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runClaude } from "../../lib/claude-runner.mjs";

const JUDGE_MODEL = "claude-sonnet-5";

/**
 * Score one reply against a binary rubric, blinded.
 *
 * The judge is told nothing about arms, ablations, or which rule is
 * under test, and runs with no plugins loaded — otherwise the judge
 * would inherit the very principles being measured.
 */
export async function runJudge({ rubric, reply, model = JUDGE_MODEL, realHome = null }) {
  const dir = await mkdtemp(path.join(tmpdir(), "kcc-judge-"));
  const cfg = path.join(dir, "cfg");
  await writeFile(path.join(dir, ".keep"), "");

  const prompt = [
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

  const res = await runClaude({
    prompt,
    model,
    disallowedTools: ["Read", "Glob", "Grep", "Bash", "Write", "Edit", "WebFetch", "WebSearch"],
    maxBudgetUsd: 0.25,
    timeoutMs: 180_000,
    cwd: dir,
    // The judge seals HOME like a probe does, so it needs the real home passed
    // through for the CLI wrapper's keychain read. Without auth the judge
    // returns nothing and every judged probe comes back UNPARSEABLE at $0.00 —
    // a failure that reads like "the rule does nothing" rather than "the judge
    // never ran".
    env: {
      CLAUDE_CONFIG_DIR: cfg,
      HOME: dir,
      ...(realHome ? { KCC_REAL_HOME: realHome } : {}),
    },
  });

  const text = res.parsed?.result ?? res.stdout ?? "";
  return { ...parseVerdict(text), costUsd: res.parsed?.total_cost_usd ?? null };
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
