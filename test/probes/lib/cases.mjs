/**
 * Turn a declarative case definition into a probe object.
 *
 * Candidate cases are screened in bulk — most get discarded for having
 * no red gate — so they are data files, not code. This is the one place
 * that maps the data onto the shape run-probe.mjs expects.
 *
 * Contract
 * --------
 * caseToProbe({ id, rule, prompt, scoreKind, pattern, rubric,
 *               maxBudgetUsd, lockdown })
 *
 *   scoreKind  "opens-with-block" | "no-block" | "regex" | "judge"
 *   pattern    required for "regex": source of a case-insensitive RegExp
 *   rubric     required for "judge"
 *   lockdown   "full" (default) — every tool disallowed
 *
 * Throws on an unknown scoreKind, or on a scoreKind missing the field it
 * needs: a case that silently scores everything as false would look like
 * a perfect red gate and get promoted to a real probe.
 */
import { opensWithTargetBlock, containsTargetBlock } from "./score.mjs";
// One lockdown list for every probe, declarative or coded: this file's
// own copy had drifted (no agent-roster tools) by the time the lists
// were unified in lockdown.mjs.
import { FULL_LOCKDOWN } from "./lockdown.mjs";

export { FULL_LOCKDOWN };

export function caseToProbe(def) {
  const { id, rule, prompt, scoreKind, pattern, rubric, maxBudgetUsd = 0.6 } = def;
  if (!id || !rule || !prompt) throw new Error(`case "${id ?? "?"}" needs id, rule and prompt`);

  // A case may unlock specific tools; everything else stays locked, and
  // delegation/network are never unlockable — a probe measures one
  // model reasoning over the fixture in front of it.
  const tools = def.tools ?? [];
  const base = {
    id,
    rule,
    prompt,
    title: def.title ?? id,
    fixture: def.fixture,
    disallowedTools: FULL_LOCKDOWN.filter((t) => !tools.includes(t)),
    expectedTools: tools,
    maxBudgetUsd,
  };

  switch (scoreKind) {
    case "opens-with-block":
      return { ...base, score: (run) => opensWithTargetBlock(run.finalText) };
    case "no-block":
      return { ...base, score: (run) => !containsTargetBlock(run.finalText) };
    case "no-file-written":
      return { ...base, score: (run) => run.writtenPaths.length === 0 };
    case "regex": {
      if (!pattern) throw new Error(`case "${id}": scoreKind "regex" needs a pattern`);
      const re = new RegExp(pattern, "i");
      return { ...base, score: (run) => re.test(run.finalText) };
    }
    case "judge":
      if (!rubric) throw new Error(`case "${id}": scoreKind "judge" needs a rubric`);
      return { ...base, judge: { rubric } };
    default:
      throw new Error(`case "${id}": unknown scoreKind "${scoreKind}"`);
  }
}
