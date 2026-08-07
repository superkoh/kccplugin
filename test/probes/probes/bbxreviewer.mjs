/**
 * Round 4 — is the reviewer SUBAGENT worth what it costs?
 *
 * `BBX-reviewer-subagents` is seven principles of the black-box skill that
 * have never been measured. Both files that own the block declared it
 * unprobeable, for two stated reasons. One of them is no longer true:
 *
 *   "every probe disallows the Agent tool, so 'did it spawn a fresh-context
 *    reviewer' cannot be read off any run"
 *
 * That is a property of `NO_DELEGATION`, not of the harness. probes/sub.mjs
 * has run Agent-allowed probes since stage 3 — `// Agent must stay available
 * — it is the mechanism under test.` — and lib/extract.mjs records every
 * `tool_use` with its `input`, so the spawn and the task it carried are as
 * deterministic an observable as a written file. The lockdown is per-probe;
 * the mechanism is observable wherever a probe opens it.
 *
 * The SECOND reason stands, and it is what shapes the arms here. The block's
 * second-order residue on disk is restated by BBX-fidelity-and-lint, so
 * deleting the block wholesale and finding no artifact delta would be the
 * paste-pair confound, not evidence. These probes sidestep it entirely by
 * never asking whether the review helps.
 *
 * They ask the narrower question that is actually expensive. This block's
 * cost is not seven lines of markdown — it is up to two extra fresh-context
 * subagents on every run of the skill. So arm B keeps every review
 * obligation the doc states and rewrites only the delegation out of them
 * (`BBX4-reviewer-delegation`). Both arms are told to close over the draft,
 * at both depths, on the same conformance triggers, with the same per-test
 * question, fixing findings before running; `Pipeline order`'s own `review`
 * phase is untouched in both. The only difference is who holds the pen — so
 * a delta is attributable to delegation and to nothing else, and no
 * surviving rule can hand arm B the mechanism back.
 *
 * RESULTS (claude-opus-5, 25 sealed runs, 0 void, $28.68):
 *
 *   shape                          A (intact)  B (no delegation)  verdict
 *   S11 authoring, full depth       5/5         0/5               effective
 *   FL2 materializing, 12 cases     1/5         0/5               inconclusive
 *   FL2 ceiling, max imperative     1/5         —                 at ceiling
 *
 * The block is half-working, and a block-level ablation would have averaged
 * that away. On the authoring shape the closing reviewer fires every time and
 * earns it — one run's reviewer caught that every replay case had a stored
 * and a recomputed balance that are numerically identical, so an
 * implementation recomputing at replay time passes the whole suite. Arm A
 * also runs ~13 turns to arm B's 5-7 and lands ~15.6 cases to ~13.2.
 *
 * On the materializing shape the same block is at its ceiling at 1/5.
 * Rewriting cannot raise it: an arm reading "MUST be delegated, never
 * performed by you. Call the Agent tool to spawn exactly one general-purpose
 * subagent" also spawned 1/5. The model computes the trigger correctly out
 * loud ("12 tests, depth full, money + concurrency + permissions — well over
 * the bar") and then declines, citing a session rule forbidding subagents
 * that is in neither the injected context nor the CLI arguments.
 *
 * A follow-up edit merged `Self-review below the bar` into `One fresh-context
 * reviewer`, so the doc would stop stating a mechanism it gets one run in
 * five. It was verified before shipping and reverted: over 10 further runs
 * the AUTHORING shape fell 5/5 -> 1/5 (Fisher p≈0.024) and the MATERIALIZING
 * shape 1/5 -> 0/5, with authoring run length dropping from ~13 turns to
 * arm B's 7-9. An escape hatch stated once, in the materializing half,
 * switched off a near-deterministic behaviour in the writing half. Members of
 * this document are not independent, and per-member edits need per-member
 * verification even when the edit looks locally harmless.
 *
 * Shapes are cloned by id from the two campaign files so prompt, fixture and
 * lockdown stay byte-identical to the runs that produced the round-1
 * numbers. Only the delegation denial and the scorer change.
 */
import { PROBES as CASES } from "./bbxcases.mjs";
import { PROBES as MAT } from "./bbxmaterialize.mjs";

const byId = new Map([...CASES, ...MAT].map((p) => [p.id, p]));

const clone = (id) => {
  const base = byId.get(id);
  if (!base) throw new Error(`round-4 references unknown probe: ${id}`);
  return base;
};

/**
 * Re-open Agent/Task on a cloned probe's lockdown, leaving every other
 * denial exactly where the round-1 run had it.
 *
 * Skill and Workflow stay denied: the model must not reach the intact
 * SKILL.md on disk, which would hand arm B the rewritten rule straight back.
 */
const DELEGATION_UNDER_TEST = new Set(["Agent", "Task"]);
const allowDelegation = (base) => ({
  disallowedTools: (base.disallowedTools ?? []).filter(
    (t) => !DELEGATION_UNDER_TEST.has(t)
  ),
  expectedTools: [...new Set([...(base.expectedTools ?? []), "Agent", "Task"])],
});

// ---- observable -------------------------------------------------------
//
// A spawn alone is not the mechanism: a model that hands the WRITING to a
// subagent has delegated, not reviewed. The task text has to read as a
// review for the call to count, so the match runs over the Agent call's own
// input rather than over anything the orchestrator said about it.
const REVIEW_TASK =
  /review|reviewer|conformance|critique|audit|审查|评审|复核|校验|检查/i;

const reviewerSpawns = (run) =>
  (run.toolCalls ?? []).filter(
    (c) =>
      DELEGATION_UNDER_TEST.has(c.name) &&
      REVIEW_TASK.test(JSON.stringify(c.input ?? {}))
  );

const delegatedTheReview = (run) => reviewerSpawns(run).length > 0;

const on = (id, rest) => {
  const base = clone(id);
  return { ...base, ...allowDelegation(base), ...rest };
};

// Budgets are circuit breakers, not spend targets: a run that trips one dies
// mid-stream with no result event and lands invalid at out=0, which reads in
// a tally exactly like a rule that does nothing. Both shapes now carry a
// second model's context on top of the base shape's own, so the caps are set
// well clear of it rather than close to it.
export const PROBES = [
  // ---- shape FL2 (materializing) --------------------------------------
  //
  // Twelve automated cases at full depth over money limits — above all three
  // `Conformance review triggers` at once, so this is the shape where the
  // doc's own text says the conformance review is required. bbxmaterialize
  // picked it for the fidelity probes precisely because "above it the review
  // is a subagent, which NO_DELEGATION forbids in both arms, so the reviewer
  // block contributes nothing executable" — the sentence this probe exists
  // to stop being true.
  {
    ...on("bx-fidelity-beyondthen-fl2", {
      id: "r4-delegation-conformance-fl2",
      rule: "BBX4-reviewer-delegation",
      title:
        "FL2: twelve full-depth money cases, above every conformance trigger — was the review delegated to a subagent?",
      maxBudgetUsd: 12.0,
      score: delegatedTheReview,
    }),
  },

  // ---- shape S11 (authoring) ------------------------------------------
  //
  // The second task shape the asymmetric evidence bar requires before any
  // no-delta deletion, and it exercises the other end of the pipeline:
  // the closing check fires after WRITING the cases, where there is no test
  // batch and no conformance trigger at all.
  {
    ...on("bbx-depth-full-s11", {
      id: "r4-delegation-closing-s11",
      rule: "BBX4-reviewer-delegation",
      title:
        "S11: full-depth authoring run — was the closing check delegated to a fresh context?",
      maxBudgetUsd: 10.0,
      score: delegatedTheReview,
    }),
  },

  // ---- ceiling control, FL2 shape — POLARITY INVERTED -----------------
  //
  // Run arm B ONLY: this rule's arm A is the shipped doc, which is already
  // arm A of r4-delegation-conformance-fl2, and paying for it twice buys
  // nothing. Arm B here is the STRONGER document, not the weaker one.
  //
  // It answers the one question that decides what the round-4 numbers mean:
  // can an injected instruction make this model delegate at all in a sealed
  // `claude -p` session? If B spawns, self-initiated delegation is reachable
  // and arm A's silence is a property of the shipped wording. If B does not
  // spawn either, the harness cannot see the mechanism and no deletion may
  // be licensed off round 4 — the block goes back to unmeasured, for a
  // different and better-evidenced reason than the one it carried before.
  {
    ...on("bx-fidelity-beyondthen-fl2", {
      id: "r4-ceiling-conformance-fl2",
      rule: "BBX4-reviewer-ceiling",
      title:
        "CEILING (arm B only, inverted): with delegation stated as an unmissable order, does it spawn?",
      maxBudgetUsd: 12.0,
      score: delegatedTheReview,
    }),
  },
];

/**
 * Kept next to the claim it corrects, so a reader of bbx2.mjs or
 * bbxmaterialize.mjs is not left with a stale reason for an absent probe.
 */
export const CORRECTS = [
  {
    block: "BBX-reviewer-subagents",
    claim:
      "UNPROBEABLE reason (1) in probes/bbxmaterialize.mjs and probes/bbx2.mjs: " +
      "'every probe disallows the Agent tool, so did it spawn a fresh-context " +
      "reviewer is not observable under this harness.'",
    correction:
      "Stale. probes/sub.mjs already runs three Agent-allowed probes, and " +
      "extract.mjs records every tool_use with its input. The lockdown is " +
      "per-probe, so the mechanism is observable wherever a probe opens it. " +
      "Reason (2), the paste-pair confound, is real and is why these probes " +
      "score delegation rather than artifact quality — BBX-fidelity-and-lint " +
      "restates the review's CONTENT but cannot spawn a subagent, so it " +
      "cannot hand arm B this observable back.",
  },
];
