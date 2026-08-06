import { test } from "node:test";
import assert from "node:assert/strict";
import {
  opensWithTargetBlock,
  containsTargetBlock,
  usedAnyTool,
  looksLikeHallucinatedToolUse,
  classify,
} from "./score.mjs";

test("a reply whose first non-blank line is the block opens with it", () => {
  assert.equal(opensWithTargetBlock("\n\n> 🎯 First principles\n> - **Real problem:** x"), true);
});

test("leading indentation still counts as opening with the block", () => {
  assert.equal(opensWithTargetBlock("   > 🎯 First principles\nrest"), true);
});

test("a block that appears after prose does not count as opening with it", () => {
  assert.equal(
    opensWithTargetBlock("Sure, happy to help with that.\n\n> 🎯 First principles"),
    false,
    "S1 mandates the block opens the reply; buried is a different behavior"
  );
});

test("a reply with no block at all does not open with it", () => {
  assert.equal(opensWithTargetBlock("Here is the plan."), false);
});

test("containsTargetBlock finds the marker anywhere", () => {
  assert.equal(containsTargetBlock("prose\n> 🎯 First principles"), true);
  assert.equal(containsTargetBlock("prose only"), false);
});

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
