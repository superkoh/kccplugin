import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

async function readPlanFeature() {
  return await readFile(
    path.join(pluginRoot, "skills", "plan-feature", "SKILL.md"),
    "utf-8"
  );
}

test("plan-feature SKILL.md references TeamCreate", async () => {
  const body = await readPlanFeature();
  assert.match(body, /TeamCreate/);
});

test("plan-feature SKILL.md uses AskUserQuestion for pre-flight", async () => {
  const body = await readPlanFeature();
  assert.match(body, /AskUserQuestion/);
});

test("plan-feature SKILL.md references all 6 step skills by fully-qualified name", async () => {
  const body = await readPlanFeature();
  const stepSkills = [
    "kcc-dev-workflow:step-brainstorm",
    "kcc-dev-workflow:step-spec-writer",
    "kcc-dev-workflow:step-ac-writer",
    "kcc-dev-workflow:step-spec-ac-reviewer",
    "kcc-dev-workflow:step-test-case-writer",
    "kcc-dev-workflow:step-test-case-reviewer",
  ];
  const missing = stepSkills.filter((s) => !body.includes(s));
  assert.deepEqual(missing, [], `plan-feature SKILL.md missing step-skill references: ${missing.join(", ")}`);
});

test("plan-feature SKILL.md references both output roots", async () => {
  const body = await readPlanFeature();
  assert.match(body, /\.kcc\/specs\//);
  assert.match(body, /\.kcc\/tests\/cases\//);
});

test("plan-feature SKILL.md describes the 5-step teammate task chain (T1..T5)", async () => {
  const body = await readPlanFeature();
  for (let i = 1; i <= 5; i++) {
    assert.match(body, new RegExp(`T${i}\\b`), `missing reference to task T${i}`);
  }
});

test("plan-feature SKILL.md no longer carries a T6 task reference", async () => {
  const body = await readPlanFeature();
  assert.doesNotMatch(body, /\bT6\b/, "T6 should be removed — brainstorm is now Phase 0, chain is T1..T5");
});

test("plan-feature Phase 0 delegates to step-brainstorm via Skill tool", async () => {
  const body = await readPlanFeature();
  assert.match(body, /Phase 0 — Brainstorm/);
  assert.match(body, /Skill\(skill="kcc-dev-workflow:step-brainstorm"\)/);
});

test("plan-feature SKILL.md references kickoff.md (not _kickoff.md)", async () => {
  const body = await readPlanFeature();
  assert.match(body, /kickoff\.md/);
  assert.doesNotMatch(body, /_kickoff\.md/, "underscore-prefixed kickoff.md is stale — step-brainstorm now owns the single-file kickoff.md");
});

test("plan-feature SKILL.md references failure escalation with 4 stages", async () => {
  const body = await readPlanFeature();
  assert.match(body, /1st failure/i);
  assert.match(body, /2nd failure/i);
  assert.match(body, /3rd failure/i);
  assert.match(body, /4th failure/i);
});
