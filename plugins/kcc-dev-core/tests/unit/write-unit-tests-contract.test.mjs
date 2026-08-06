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

test("write-unit-tests SKILL.md keeps the earns-a-test verdict per unit", async () => {
  const body = await readSkill();
  assert.match(body, /\*\*one unit at a time\*\*/);
  assert.match(body, /not reachable for the change as a whole/);
  assert.match(body, /the caller must not pre-decide it/);
});

test("write-unit-tests SKILL.md hard-skips glue by category, not by judgment", async () => {
  const body = await readSkill();
  assert.match(body, /\*\*Hard skip — no weighing\.\*\*/);
  assert.match(body, /CLI entry points and argument\s+parsing/);
  assert.match(body, /Sitting next to interesting logic does not pull them back in/);
});

test("write-unit-tests SKILL.md requires a named blind spot per selected unit", async () => {
  const body = await readSkill();
  assert.match(body, /\*\*Name the blind spot\.\*\*/);
  assert.match(body, /why an existing higher-level test would miss/);
  assert.match(body, /No\s+such clause, no selection/);
});

test("write-unit-tests SKILL.md exits in one line when no unit earns a test", async () => {
  const body = await readSkill();
  assert.match(body, /\*\*An empty selection is\s+a finished run\*\*/);
  assert.match(body, /steps 2–7 don't apply/);
});

test("write-unit-tests SKILL.md batches the loop by contract group", async () => {
  const body = await readSkill();
  assert.match(body, /Granularity is a \*\*contract group\*\*/);
  assert.match(body, /one contract block, one red gate and one\s+green run/);
  assert.match(body, /roughly 5 units or a single file/);
});

test("write-unit-tests SKILL.md keeps the freeze rule as the anti-cheat, not loop size", async () => {
  const body = await readSkill();
  assert.match(body, /freeze rule, not loop size/);
  assert.match(body, /every\s+test in the group is frozen/);
});

test("write-unit-tests SKILL.md scopes gate and green runs to the group", async () => {
  const body = await readSkill();
  assert.match(body, /scoped to the group/);
  assert.match(body, /once per unit/);
  // A single-group change must not pay for a redundant full-suite run:
  // the scoped run already covers everything that changed.
  assert.match(body, /the scoped run \*is\* the suite run,\s+so don't add another/);
  assert.match(body, /two or more groups ran does the full\s+suite run once/);
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
