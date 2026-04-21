import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

async function readSkill() {
  return await readFile(
    path.join(pluginRoot, "skills", "step-spec-writer", "SKILL.md"),
    "utf-8"
  );
}

const EXPECTED_SECTIONS = [
  "## Summary & Scope",
  "## User Stories",
  "## Functional Requirements",
  "## Non-functional Requirements",
  "## System Design",
  "## Edge Cases & Error Handling",
  "## Open Items",
];

test("step-spec-writer SKILL.md declares the 7 spec.md sections in order", async () => {
  const body = await readSkill();
  let prev = -1;
  for (const header of EXPECTED_SECTIONS) {
    const idx = body.indexOf(header);
    assert.notEqual(idx, -1, `missing section header in SKILL.md body: ${header}`);
    assert.ok(
      idx > prev,
      `section order violated: ${header} must come after the previous section`
    );
    prev = idx;
  }
});

test("step-spec-writer SKILL.md requires 4 System Design sub-sections", async () => {
  const body = await readSkill();
  for (const sub of [
    "### Architecture",
    "### Data Model",
    "### API / Interface",
    "### State Machine",
  ]) {
    assert.match(body, new RegExp(sub.replace(/\//g, "\\/")), `missing sub-section: ${sub}`);
  }
});

test("step-spec-writer SKILL.md documents numbering conventions (US-NN, FR-NN, NFR-NN)", async () => {
  const body = await readSkill();
  assert.match(body, /US-NN/);
  assert.match(body, /FR-NN/);
  assert.match(body, /NFR-NN/);
  assert.match(body, /two-digit zero-padded/i);
});

test("step-spec-writer SKILL.md enforces depth floors (≥3 US, ≥5 FR, ≥3 NFR, ≥5 edge cases)", async () => {
  const body = await readSkill();
  assert.match(body, /≥\s*3.*[Uu]ser [Ss]tor(?:y|ies)|[Uu]ser [Ss]tor(?:y|ies).*≥\s*3/s);
  assert.match(body, /≥\s*5.*[Ff]unctional|[Ff]unctional.*≥\s*5/s);
  assert.match(body, /≥\s*3.*[Nn]on-functional|[Nn]on-functional.*≥\s*3/s);
  assert.match(body, /≥\s*5.*[Ee]dge [Cc]ase|[Ee]dge [Cc]ase.*≥\s*5/s);
});

test("step-spec-writer SKILL.md documents traceability tags on FR and NFR", async () => {
  const body = await readSkill();
  assert.match(body, /\(US-<NN>, kickoff §/);
  assert.match(body, /traceability/i);
  assert.match(body, /rationale source/i);
});

test("step-spec-writer SKILL.md forbids bare TBD bullets", async () => {
  const body = await readSkill();
  assert.match(body, /No bullet is exactly `TBD`/);
});

test("step-spec-writer SKILL.md wires ASSUMPTION handling with [ASSUMED: ...] + Carried forward", async () => {
  const body = await readSkill();
  assert.match(body, /\[ASSUMED:/);
  assert.match(body, /Carried forward/);
  assert.match(body, /silently resolve/i);
});

test("step-spec-writer SKILL.md requires Mermaid stateDiagram-v2 or graph TD for non-trivial state", async () => {
  const body = await readSkill();
  assert.match(body, /stateDiagram-v2|graph TD/);
});

test("step-spec-writer SKILL.md documents Path A (leverage superpowers:brainstorming item 6 only)", async () => {
  const body = await readSkill();
  assert.match(body, /Path A/);
  assert.match(body, /superpowers:brainstorming/);
  assert.match(body, /item 6/);
  assert.match(body, /skip items 1-5/i);
});

test("step-spec-writer scope override forbids writing to docs/superpowers/specs/ and invoking writing-plans", async () => {
  const body = await readSkill();
  assert.match(body, /docs\/superpowers\/specs\//);
  assert.match(body, /writing-plans/);
  assert.match(body, /Do NOT:/);
});

test("step-spec-writer SKILL.md documents Path B (inline synthesis)", async () => {
  const body = await readSkill();
  assert.match(body, /Path B/);
  assert.match(body, /[Ii]nline synthesis/);
});

test("step-spec-writer SKILL.md documents the leak check for Path A", async () => {
  const body = await readSkill();
  assert.match(body, /[Ll]eak check/);
});

test("step-spec-writer SKILL.md reads kickoff.md (not _kickoff.md or brainstorm.md)", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/kickoff\.md/);
  assert.doesNotMatch(body, /_kickoff\.md/);
  assert.doesNotMatch(body, /brainstorm\.md/);
});

test("step-spec-writer SKILL.md writes spec.md to the canonical path", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/spec\.md/);
});

test("step-spec-writer SKILL.md declares teammate T1 execution context (no AskUserQuestion)", async () => {
  const body = await readSkill();
  assert.match(body, /teammate T1|task T1/);
  assert.match(body, /[Nn]o `?AskUserQuestion`? is available|has no user access/);
});

test("step-spec-writer SKILL.md closes with TaskUpdate(taskId=T1, status=completed)", async () => {
  const body = await readSkill();
  assert.match(body, /TaskUpdate\(taskId=T1,\s*status=completed\)/);
});

test("step-spec-writer SKILL.md sentinel is v1 (not v1-skeleton)", async () => {
  const body = await readSkill();
  assert.match(body, /kcc-dev-workflow-step-spec-writer-sentinel: v1\b/);
  assert.doesNotMatch(body, /v1-skeleton/);
});
