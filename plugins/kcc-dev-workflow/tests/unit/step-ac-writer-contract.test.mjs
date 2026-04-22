import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

async function readSkill() {
  return await readFile(
    path.join(pluginRoot, "skills", "step-ac-writer", "SKILL.md"),
    "utf-8"
  );
}

test("step-ac-writer SKILL.md specifies the top-level Acceptance Criteria header pattern", async () => {
  const body = await readSkill();
  assert.match(body, /# Acceptance Criteria — <feature-name>/);
});

test("step-ac-writer SKILL.md declares the three group sub-headers", async () => {
  const body = await readSkill();
  for (const h of ["## Functional", "## Non-functional", "## Edge Cases"]) {
    assert.match(body, new RegExp(h.replace(/\s+/g, "\\s+")), `missing group header: ${h}`);
  }
});

test("step-ac-writer SKILL.md enforces the AC-F / AC-N / AC-E numbering prefixes", async () => {
  const body = await readSkill();
  assert.match(body, /AC-F01/);
  assert.match(body, /AC-N01/);
  assert.match(body, /AC-E01/);
  assert.match(body, /two-digit zero/i);
});

test("step-ac-writer SKILL.md mandates the 4 Gherkin fields per AC", async () => {
  const body = await readSkill();
  assert.match(body, /Traces to:/);
  assert.match(body, /\*\*Given\*\*/);
  assert.match(body, /\*\*When\*\*/);
  assert.match(body, /\*\*Then\*\*/);
});

test("step-ac-writer SKILL.md states coverage rules for FR / US / NFR / edge cases", async () => {
  const body = await readSkill();
  // Use non-greedy cross-line matching; the skill file wraps long bullets
  // across multiple lines, so spaces in the prose may be newlines+indent.
  assert.match(body, /[Ee]very FR-NN[\s\S]*?`AC-F/);
  assert.match(body, /[Ee]very US-NN[\s\S]*?at least one AC/);
  assert.match(body, /[Ee]very NFR-NN[\s\S]*?`AC-N/);
  assert.match(body, /[Ee]very edge-case entry[\s\S]*?`AC-E/);
});

test("step-ac-writer SKILL.md documents ASSUMPTION propagation from spec.md", async () => {
  const body = await readSkill();
  assert.match(body, /\[ASSUMED:/);
  assert.match(body, /propagat/i);
});

test("step-ac-writer SKILL.md conditionally emits the Pending AC section when open items exist", async () => {
  const body = await readSkill();
  assert.match(body, /## Pending AC \(blocked by open items\)/);
  assert.match(body, /Carried forward/);
});

test("step-ac-writer SKILL.md forbids bare TBD bullets", async () => {
  const body = await readSkill();
  assert.match(body, /No bullet is exactly `TBD`/);
});

test("step-ac-writer SKILL.md reads kickoff.md + spec.md (not brainstorm.md or _kickoff.md)", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/kickoff\.md/);
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/spec\.md/);
  assert.doesNotMatch(body, /_kickoff\.md/);
  assert.doesNotMatch(body, /brainstorm\.md/);
});

test("step-ac-writer SKILL.md writes ac.md to the canonical path", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/ac\.md/);
});

test("step-ac-writer SKILL.md declares teammate T2 + no AskUserQuestion + no Path A", async () => {
  const body = await readSkill();
  assert.match(body, /teammate T2|task T2/);
  assert.match(body, /[Nn]o `?AskUserQuestion`? is available/);
  assert.match(body, /no Path A|superpowers does not ship an AC/i);
});

test("step-ac-writer SKILL.md closes with TaskUpdate(taskId=T2, status=completed)", async () => {
  const body = await readSkill();
  assert.match(body, /TaskUpdate\(taskId=T2,\s*status=completed\)/);
});

test("step-ac-writer SKILL.md has idempotence check (resume fast-path)", async () => {
  const body = await readSkill();
  assert.match(body, /Idempotence check \(resume fast-path\)/);
  assert.match(body, /already present — resumed/);
  assert.match(body, /TaskUpdate\(taskId=T2,\s*status=completed\)/);
});

test("step-ac-writer SKILL.md sentinel is v1 (not v1-skeleton)", async () => {
  const body = await readSkill();
  assert.match(body, /kcc-dev-workflow-step-ac-writer-sentinel: v1\b/);
  assert.doesNotMatch(body, /v1-skeleton/);
});
