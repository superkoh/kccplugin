/**
 * Runs the blinded judge for this repo's campaigns. The judge's prompt
 * shape and reply parser live in the kcc-ablation plugin; what stays
 * here is the plumbing that actually spawns a sealed `claude -p` via
 * this repo's runner.
 *
 * The judge is told nothing about arms, ablations, or which rule is
 * under test, and runs with no plugins loaded — otherwise the judge
 * would inherit the very principles being measured.
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runClaude } from "../../lib/claude-runner.mjs";
import {
  buildJudgePrompt,
  parseVerdict,
} from "../../../plugins/kcc-ablation/skills/ablate/scripts/judge.mjs";

export { parseVerdict };

const JUDGE_MODEL = "claude-sonnet-5";

/** Score one reply against a binary rubric, blinded. */
export async function runJudge({ rubric, reply, model = JUDGE_MODEL, realHome = null }) {
  const dir = await mkdtemp(path.join(tmpdir(), "kcc-judge-"));
  const cfg = path.join(dir, "cfg");
  await writeFile(path.join(dir, ".keep"), "");

  const res = await runClaude({
    prompt: buildJudgePrompt({ rubric, reply }),
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
