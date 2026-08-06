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

/**
 * Prose rules are asserted against whitespace-collapsed text so that
 * re-wrapping a paragraph never turns into a red test. Structural rules
 * (the size budget, the sentinel) keep using the raw body.
 */
async function readSkillProse() {
  return (await readSkill()).replace(/\s+/g, " ");
}

test("write-unit-tests SKILL.md pins the anti-tautology core", async () => {
  const body = await readSkillProse();
  assert.match(body, /tautological test/);
  assert.match(body, /Hand-derive every expected value/);
  assert.match(body, /Never run the implementation and paste its output/);
  assert.match(body, /Assert observable behavior only/);
});

test("write-unit-tests SKILL.md documents the three modes and their gates", async () => {
  const body = await readSkillProse();
  assert.match(body, /\*new code\*/);
  assert.match(body, /\*backfill\*/);
  assert.match(body, /\*bug fix\*/);
  assert.match(body, /red first against a stub/);
  assert.match(body, /mutation probe/);
  assert.match(body, /reproduction test fails on the unfixed code/);
});

test("write-unit-tests SKILL.md demands assertion-level red, rejecting false reds", async () => {
  const body = await readSkillProse();
  assert.match(body, /assertion-level/);
  assert.match(body, /0 tests collected/);
  assert.match(body, /ImportError/);
});

test("write-unit-tests SKILL.md requires the mutation probe to be reverted", async () => {
  const body = await readSkillProse();
  assert.match(body, /confirm a test fails, revert/);
  assert.match(body, /surviving mutation is a powerless assertion/);
});

test("write-unit-tests SKILL.md forbids weakening a test to reach green", async () => {
  const body = await readSkillProse();
  assert.match(body, /Never weaken a test to reach green/);
  assert.match(body, /AskUserQuestion/);
});

test("write-unit-tests SKILL.md refuses to hand back a red suite as finished", async () => {
  // Measured: runs that found a real bug in code outside the immediate
  // task sometimes stopped at "test is red, source is wrong" and left the
  // suite failing. Finding the bug is half the job.
  const body = await readSkillProse();
  assert.match(body, /a red suite handed back as finished is not an outcome/);
});

test("write-unit-tests SKILL.md hard-skips glue by category, not by judgment", async () => {
  const body = await readSkillProse();
  assert.match(body, /Skip glue by category, no weighing/);
  assert.match(body, /CLI entry points and argv parsing/);
  assert.match(body, /Sitting next to interesting logic does not pull them back in/);
});

test("write-unit-tests SKILL.md requires a named blind spot per selected unit", async () => {
  const body = await readSkillProse();
  assert.match(body, /why a higher-level test would miss its bug or fail to localise it/);
  assert.match(body, /no clause, no test/);
});

test("write-unit-tests SKILL.md keeps the earns-a-test verdict inside this skill", async () => {
  // The caller cannot make this call before the units exist; the
  // description is what the router reads, so the claim lives there.
  const body = await readSkillProse();
  assert.match(body, /this skill's own per-unit call/);
  assert.match(body, /empty selection is a valid one-line outcome/);
});

test("write-unit-tests SKILL.md pins test doubles to declared interfaces", async () => {
  // Retained without measurement: both probe fixtures were pure
  // functions with no dependencies, so nothing here could exercise it.
  const body = await readSkillProse();
  assert.match(body, /Fake only what the contract declares/);
  assert.match(body, /the contract has a gap — fix that first/);
});

test("write-unit-tests SKILL.md keeps the spike exception it reports on", async () => {
  const body = await readSkillProse();
  assert.match(body, /Spike exception/);
  assert.match(body, /backfill once the interface settles/);
});

test("write-unit-tests SKILL.md rejects a coverage-percentage KPI", async () => {
  const body = await readSkillProse();
  assert.match(body, /No coverage-percentage KPI/);
});

test("write-unit-tests SKILL.md keeps the frontend rule to one line of guidance", async () => {
  const body = await readSkillProse();
  assert.match(body, /squeeze logic out of components/);
  assert.match(body, /"Hard to test" is a coupling signal/);
});

test("write-unit-tests carries no reference files", async () => {
  // Measured: the linked references were read in 5/5 runs including a
  // frontend reference on a pure backend task — fixed overhead, not lazy
  // loading.
  const body = await readSkill();
  assert.doesNotMatch(body, /references\//, "fold reference content into SKILL.md");
  await assert.rejects(
    () => access(path.join(skillDir, "references")),
    "the references directory must be gone"
  );
});

test("write-unit-tests SKILL.md stays inside its size budget", async () => {
  const body = await readSkill();
  const lines = body.split("\n").length;
  assert.ok(lines <= 70, `SKILL.md grew to ${lines} lines; budget is 70`);
});

test("write-unit-tests SKILL.md hands black-box work to the sibling skills", async () => {
  const body = await readSkillProse();
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
  const body = await readSkillProse();
  assert.doesNotMatch(body, /teammate/i);
  assert.doesNotMatch(body, /TaskUpdate/);
  assert.doesNotMatch(body, /orchestrator-only/i);
});
