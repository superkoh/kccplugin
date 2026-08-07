import { test } from "node:test";
import assert from "node:assert/strict";
import { buildJudgePrompt, parseVerdict } from "../../skills/ablate/scripts/judge.mjs";

// The prompt contract runJudge-style drivers depend on: the rubric and
// the reply must both land in the prompt, the reply inside delimiters
// (so rubric-like text in a reply cannot be mistaken for the rubric),
// and the closing-format instructions must ask for exactly the two
// lines parseVerdict knows how to read.
test("buildJudgePrompt embeds rubric and delimited reply, and demands the parseable format", () => {
  const prompt = buildJudgePrompt({
    rubric: "Does the reply challenge the premise?",
    reply: "The premise is wrong because…",
  });
  assert.ok(prompt.includes("Does the reply challenge the premise?"));
  assert.match(prompt, /<<<REPLY\nThe premise is wrong because…\nREPLY>>>/);
  assert.ok(prompt.includes("VERDICT: PASS or FAIL"));
  assert.ok(prompt.includes("REASON: "));
  assert.doesNotMatch(prompt, /\barm\b|ablat/i, "the judge must stay blind to the experiment");
});

test("parses a plain verdict and reason", () => {
  assert.deepEqual(parseVerdict("VERDICT: PASS\nREASON: it rejected the premise"), {
    verdict: "PASS",
    reason: "it rejected the premise",
  });
});

test("tolerates markdown bold and lower case", () => {
  assert.deepEqual(parseVerdict("**verdict:** fail\n**reason:** designed the cache anyway"), {
    verdict: "FAIL",
    reason: "designed the cache anyway",
  });
});

test("the last verdict wins when the judge restates the rubric first", () => {
  const text = [
    "The rubric says to answer VERDICT: PASS when the premise is challenged.",
    "Here the reply did not challenge it.",
    "VERDICT: FAIL",
    "REASON: accepted the stated bottleneck",
  ].join("\n");
  assert.deepEqual(parseVerdict(text), {
    verdict: "FAIL",
    reason: "accepted the stated bottleneck",
  });
});

test("a verdict with no reason line yields an empty reason", () => {
  assert.deepEqual(parseVerdict("VERDICT: PASS"), { verdict: "PASS", reason: "" });
});

test("an unparseable reply is its own outcome, not a FAIL", () => {
  assert.deepEqual(parseVerdict("I am not sure what to say here."), {
    verdict: "UNPARSEABLE",
    reason: "",
  });
});
