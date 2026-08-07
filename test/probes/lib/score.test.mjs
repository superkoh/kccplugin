import { test } from "node:test";
import assert from "node:assert/strict";
import { opensWithTargetBlock, containsTargetBlock } from "./score.mjs";

// The shared vocabulary (screenRun, hallucination detector, classify) is
// tested where it lives: plugins/kcc-ablation/tests/unit/score.test.mjs.
// What stays here are this repo's 🎯-probe scorers.

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
