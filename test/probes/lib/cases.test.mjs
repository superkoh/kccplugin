import { test } from "node:test";
import assert from "node:assert/strict";
import { caseToProbe } from "./cases.mjs";

const base = { id: "c1", rule: "S1-whole", prompt: "hi" };

test("opens-with-block scores on the reply's first line", () => {
  const p = caseToProbe({ ...base, scoreKind: "opens-with-block" });
  assert.equal(p.score({ finalText: "> 🎯 First principles\nx" }), true);
  assert.equal(p.score({ finalText: "prose\n> 🎯 First principles" }), false);
});

test("no-block scores true only when the marker is absent anywhere", () => {
  const p = caseToProbe({ ...base, scoreKind: "no-block" });
  assert.equal(p.score({ finalText: "plain answer" }), true);
  assert.equal(p.score({ finalText: "answer\n🎯" }), false);
});

test("regex scoring is case-insensitive on the final text", () => {
  const p = caseToProbe({ ...base, scoreKind: "regex", pattern: "payload|回表" });
  assert.equal(p.score({ finalText: "问题在回表和网络传输" }), true);
  assert.equal(p.score({ finalText: "建议分库分表" }), false);
});

test("no-file-written scores on disk artifacts, not on reply text", () => {
  const p = caseToProbe({ ...base, scoreKind: "no-file-written", tools: ["Write"] });
  assert.equal(p.score({ writtenPaths: [], finalText: "here is the write-up" }), true);
  assert.equal(p.score({ writtenPaths: ["/tmp/proj/postmortem.md"], finalText: "done" }), false);
});

test("judge cases carry the rubric and no deterministic scorer", () => {
  const p = caseToProbe({ ...base, scoreKind: "judge", rubric: "R" });
  assert.equal(p.judge.rubric, "R");
  assert.equal(p.score, undefined);
});

test("every case is fully tool-locked by default", () => {
  const p = caseToProbe({ ...base, scoreKind: "no-block" });
  for (const t of ["Bash", "Read", "Agent", "Monitor", "WebSearch"]) {
    assert.ok(p.disallowedTools.includes(t), `${t} must be locked`);
  }
  assert.deepEqual(p.expectedTools, []);
});

// Rules about reading real output need real output to read, so a case
// can seed files and unlock the tools that reach them.
test("a case can seed a fixture and unlock exactly the tools it needs", () => {
  const p = caseToProbe({
    ...base,
    scoreKind: "regex",
    pattern: "x",
    fixture: { "a.log": "boom" },
    tools: ["Read", "Bash"],
  });
  assert.deepEqual(p.fixture, { "a.log": "boom" });
  assert.deepEqual(p.expectedTools, ["Read", "Bash"]);
  for (const t of ["Read", "Bash"]) {
    assert.ok(!p.disallowedTools.includes(t), `${t} must be reachable`);
  }
  assert.ok(p.disallowedTools.includes("Agent"), "delegation stays locked");
  assert.ok(p.disallowedTools.includes("WebSearch"), "the network stays locked");
});

test("an unknown scoreKind throws instead of scoring everything false", () => {
  assert.throws(() => caseToProbe({ ...base, scoreKind: "vibes" }), /unknown scoreKind/);
});

test("a regex case with no pattern throws", () => {
  assert.throws(() => caseToProbe({ ...base, scoreKind: "regex" }), /needs a pattern/);
});

test("a judge case with no rubric throws", () => {
  assert.throws(() => caseToProbe({ ...base, scoreKind: "judge" }), /needs a rubric/);
});
