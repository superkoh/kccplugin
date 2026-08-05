import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");
const skillDir = path.join(pluginRoot, "skills", "write-unit-tests");

async function readSkill() {
  return await readFile(path.join(skillDir, "SKILL.md"), "utf-8");
}

test("write-unit-tests SKILL.md pins the anti-tautology contract", async () => {
  const body = await readSkill();
  assert.match(body, /Contract-first, never implementation-first/);
  assert.match(body, /Expectations trace to requirements/);
  assert.match(body, /Never run the implementation and paste its output/);
  assert.match(body, /Observable behavior only/);
  assert.match(body, /Tests are frozen during implementation/);
  assert.match(body, /Spike exception/);
});

test("write-unit-tests SKILL.md documents the three modes", async () => {
  const body = await readSkill();
  assert.match(body, /\*\*new-code\*\*/);
  assert.match(body, /\*\*backfill\*\*/);
  assert.match(body, /\*\*bug-fix\*\*/);
});

test("write-unit-tests SKILL.md demands assertion-level red, rejecting false reds", async () => {
  const body = await readSkill();
  assert.match(body, /assertion-level/);
  assert.match(body, /0 tests collected/);
  assert.match(body, /ImportError/);
});

test("write-unit-tests SKILL.md replaces the red gate with a mutation probe for backfill", async () => {
  const body = await readSkill();
  assert.match(body, /mutation probe/i);
  assert.match(body, /revert/);
});

test("write-unit-tests SKILL.md sets the per-unit coverage floor", async () => {
  const body = await readSkill();
  assert.match(body, /happy path/);
  assert.match(body, /empty \/ 0 \/ max \/ null/);
  assert.match(body, /every declared error branch/);
  assert.match(body, /Happy-path-only is unfinished/);
});

test("write-unit-tests SKILL.md gates test-assertion changes behind AskUserQuestion", async () => {
  const body = await readSkill();
  assert.match(body, /AskUserQuestion/);
});

test("write-unit-tests SKILL.md enforces single-unit loop granularity", async () => {
  const body = await readSkill();
  assert.match(body, /one unit — one function or one behavior — per loop/);
  assert.match(body, /Don't batch/);
});

test("write-unit-tests ships and links both references", async () => {
  const body = await readSkill();
  assert.match(body, /references\/what-to-test\.md/);
  assert.match(body, /references\/frontend-testing\.md/);
  await access(path.join(skillDir, "references", "what-to-test.md"));
  await access(path.join(skillDir, "references", "frontend-testing.md"));
});

test("write-unit-tests SKILL.md hands black-box work to the sibling skills", async () => {
  const body = await readSkill();
  assert.match(body, /write-blackbox-tests/);
  assert.match(body, /materialize-blackbox-tests/);
});

test("both blackbox skills route unit tests to write-unit-tests", async () => {
  for (const sibling of ["write-blackbox-tests", "materialize-blackbox-tests"]) {
    const body = await readFile(
      path.join(pluginRoot, "skills", sibling, "SKILL.md"),
      "utf-8"
    );
    assert.match(
      body,
      /kcc-dev-core:write-unit-tests/,
      `${sibling} must point unit tests at write-unit-tests`
    );
  }
});

test("write-unit-tests SKILL.md carries a versioned sentinel", async () => {
  const body = await readSkill();
  assert.match(body, /<!-- kcc-dev-core-write-unit-tests-sentinel: v\d+ -->/);
});

test("write-unit-tests SKILL.md is standalone — no orchestrator / teammate language", async () => {
  const body = await readSkill();
  assert.doesNotMatch(body, /teammate/i);
  assert.doesNotMatch(body, /TaskUpdate/);
  assert.doesNotMatch(body, /orchestrator-only/i);
});
