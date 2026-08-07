import { test } from "node:test";
import assert from "node:assert/strict";
import {
  usedAnyTool,
  looksLikeHallucinatedToolUse,
  screenRun,
  classify,
} from "../../skills/ablate/scripts/score.mjs";

// With every tool locked, a model that wants one sometimes writes the
// call out as prose — complete with an invented result — and stops.
// That run answered nothing and must not be scored as a failure of the
// rule under test.
test("prose that fakes a tool call with no real call is flagged", () => {
  const text = "I'll look first.\n\n**Tool Call: Bash**\n```json\n{\"command\":\"ls\"}\n```\n\n**Tool Result:**\n```\ntotal 0\n```";
  assert.equal(looksLikeHallucinatedToolUse(text, []), true);
});

// The fabrication shows up in several shapes, so matching one literal
// header is not enough — three formats were observed in one campaign.
test("fabricated calls are caught in their other observed formats", () => {
  const forms = [
    "I'll check first.\n\n**Tool use: Bash**\n```\ncommand: ls -la\n```",
    '\n<invoke name="Bash">\n<parameter name="command">ls -la</parameter>\n</invoke>\n\ntotal 0\n',
    "让我先看看目录。\n\n<function_calls>\n<invoke name=\"Read\">\n</invoke>",
  ];
  for (const text of forms) {
    assert.equal(looksLikeHallucinatedToolUse(text, []), true, `missed: ${text.slice(0, 40)}`);
  }
});

test("a real tool call is not flagged, even when narrated", () => {
  assert.equal(
    looksLikeHallucinatedToolUse("**Tool Call: Bash** ran fine", [{ name: "Bash" }]),
    false
  );
});

test("an ordinary reply is not flagged", () => {
  assert.equal(looksLikeHallucinatedToolUse("Here is the design: ...", []), false);
});

test("usedAnyTool matches on tool name", () => {
  const calls = [{ name: "Read", input: {} }, { name: "Write", input: {} }];
  assert.equal(usedAnyTool(calls, ["Bash", "Read"]), true);
  assert.equal(usedAnyTool(calls, ["Grep"]), false);
  assert.equal(usedAnyTool([], ["Read"]), false);
});

// ---- screenRun: the void-don't-score gate --------------------------------
//
// A voided run is re-run, never counted as a failing run. Each check's
// reason string is part of the contract: campaign records are grepped by
// these strings when a batch of invalids needs triage.

const SENTINEL = "probe-B-rule1";
const cleanRun = (over = {}) => ({
  invalid: false,
  permissionDenials: 0,
  finalText: "an ordinary answer",
  toolCalls: [],
  hookInjections: { SessionStart: `…intro…\n<!-- s: ${SENTINEL} -->` },
  ...over,
});

test("a clean, attributed, in-lockdown run screens as scoreable", () => {
  assert.deepEqual(screenRun(cleanRun(), { sentinel: SENTINEL }), {
    invalid: false,
    reason: null,
    unexpectedTools: [],
  });
});

test("an extraction-invalid run is voided with the denial count in the reason", () => {
  const r = screenRun(cleanRun({ invalid: true, permissionDenials: 2 }), { sentinel: SENTINEL });
  assert.equal(r.invalid, true);
  assert.equal(r.reason, "permissionDenials=2, noResultOrError");
});

test("a run whose injections never carry the arm sentinel is unattributable", () => {
  const r = screenRun(cleanRun({ hookInjections: { SessionStart: "some other doc" } }), {
    sentinel: SENTINEL,
  });
  assert.equal(r.invalid, true);
  assert.equal(r.reason, "arm sentinel absent from injected context");
});

// The main-session principles arrive at SessionStart, a subagent variant
// at SubagentStart — the sentinel counts from whichever hook carried it.
test("the sentinel is accepted from any hook event", () => {
  const r = screenRun(
    cleanRun({ hookInjections: { SubagentStart: `x ${SENTINEL} y` } }),
    { sentinel: SENTINEL }
  );
  assert.equal(r.invalid, false);
});

test("an executed tool outside the expected set voids the run, naming the tools", () => {
  const r = screenRun(
    cleanRun({
      toolCalls: [
        { name: "Monitor", ok: true },
        { name: "Monitor", ok: true },
        { name: "Bash", ok: true },
      ],
    }),
    { sentinel: SENTINEL, expectedTools: [] }
  );
  assert.equal(r.invalid, true);
  assert.equal(r.reason, "escaped the lockdown via Monitor,Bash");
  assert.deepEqual(r.unexpectedTools, ["Monitor", "Bash"], "deduped, in first-seen order");
});

test("an expected tool that executed is not an escape", () => {
  const r = screenRun(cleanRun({ toolCalls: [{ name: "Write", ok: true }] }), {
    sentinel: SENTINEL,
    expectedTools: ["Write"],
  });
  assert.equal(r.invalid, false);
});

// A locked-out tool the model *tried* is not an escape: the call was
// refused (ok=false) or never resolved (ok=null); nothing ran.
test("refused and unresolved calls are not escapes", () => {
  const r = screenRun(
    cleanRun({ toolCalls: [{ name: "Bash", ok: false }, { name: "Read", ok: null }] }),
    { sentinel: SENTINEL }
  );
  assert.equal(r.invalid, false);
  assert.deepEqual(r.unexpectedTools, []);
});

test("a narrated-but-never-made tool call voids the run", () => {
  const r = screenRun(
    cleanRun({ finalText: "**Tool Call: Bash**\n```\nls\n```\n**Tool Result:** total 0" }),
    { sentinel: SENTINEL }
  );
  assert.equal(r.invalid, true);
  assert.equal(r.reason, "narrated a tool call it never made");
});

// One reason per record: extraction-invalid outranks attribution, which
// outranks escapes — the earlier fault explains the later symptoms.
test("extraction-invalid outranks a missing sentinel", () => {
  const r = screenRun(
    cleanRun({ invalid: true, permissionDenials: 0, hookInjections: {} }),
    { sentinel: SENTINEL }
  );
  assert.equal(r.reason, "permissionDenials=0, noResultOrError");
});

// ---- classify: the verdict vocabulary ------------------------------------

// Arms end up with different usable counts — a voided run here, a
// thickened baseline there — so the verdict compares RATES via a
// one-tailed Fisher exact test, not raw pass counts.
test("classify: a full recovery from a fully-failing ablation is effective", () => {
  // p = 1/252 = 0.004
  assert.equal(classify({ bPass: 0, bN: 5, aPass: 5, aN: 5 }), "effective");
});

test("classify: unequal arm sizes are compared as rates, not counts", () => {
  // 0/5 vs 11/19 — p = 1287/42504 = 0.030
  assert.equal(classify({ bPass: 0, bN: 5, aPass: 11, aN: 19 }), "effective");
});

test("classify: identical rates mean the rule carries no marginal value", () => {
  assert.equal(classify({ bPass: 5, bN: 5, aPass: 5, aN: 5 }), "no-delta");
  assert.equal(classify({ bPass: 0, bN: 5, aPass: 0, aN: 5 }), "no-delta");
  assert.equal(classify({ bPass: 2, bN: 5, aPass: 4, aN: 10 }), "no-delta");
});

test("classify: a small positive delta is under-powered, not proof", () => {
  // 2/5 vs 4/5 — p = 55/252 = 0.218
  assert.equal(classify({ bPass: 2, bN: 5, aPass: 4, aN: 5 }), "inconclusive");
});

test("classify: an ablation that beats the rule significantly is harmful", () => {
  assert.equal(classify({ bPass: 5, bN: 5, aPass: 0, aN: 5 }), "harmful");
});

test("classify: scoring worse without significance is not proof of harm", () => {
  assert.equal(classify({ bPass: 4, bN: 5, aPass: 2, aN: 5 }), "inconclusive");
});

test("classify: an arm with no usable runs cannot be judged", () => {
  assert.equal(classify({ bPass: 0, bN: 0, aPass: 5, aN: 5 }), "incomplete");
});
