import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

async function readSkill() {
  return await readFile(
    path.join(pluginRoot, "skills", "write-spec", "SKILL.md"),
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

test("write-spec SKILL.md declares the 7 spec.md sections in order", async () => {
  const body = await readSkill();
  let prev = -1;
  for (const header of EXPECTED_SECTIONS) {
    const idx = body.indexOf(header);
    assert.notEqual(idx, -1, `missing section header in SKILL.md body: ${header}`);
    assert.ok(idx > prev, `section order violated: ${header} must come after the previous section`);
    prev = idx;
  }
});

test("write-spec SKILL.md requires 4 System Design sub-sections", async () => {
  const body = await readSkill();
  for (const sub of [
    "### Architecture",
    "### Data Model",
    "### API / Interface",
    "### State Machine",
  ]) {
    assert.ok(body.includes(sub), `missing sub-section: ${sub}`);
  }
});

test("write-spec SKILL.md documents numbering conventions (US-NN, FR-NN, NFR-NN)", async () => {
  const body = await readSkill();
  assert.match(body, /US-NN/);
  assert.match(body, /FR-NN/);
  assert.match(body, /NFR-NN/);
  assert.match(body, /two-digit zero-padded/i);
});

test("write-spec SKILL.md is standalone — no orchestrator / teammate language", async () => {
  const body = await readSkill();
  assert.doesNotMatch(body, /teammate/i, "skill must not reference teammate orchestration");
  assert.doesNotMatch(body, /TaskUpdate/, "skill must not drive task orchestration");
  assert.doesNotMatch(body, /orchestrator-only/i, "skill must be directly invocable");
});

test("write-spec SKILL.md gates AskUserQuestion on genuine ambiguity, not unconditionally", async () => {
  const body = await readSkill();
  assert.match(body, /only if genuinely ambiguous/i, "scope confirmation must be conditional");
  assert.match(
    body,
    /don't\s+manufacture a question/i,
    "must forbid manufacturing a question when context already pins scope down"
  );
});

test("write-spec SKILL.md requires System Design grounded in the real codebase", async () => {
  const body = await readSkill();
  assert.match(body, /Ground in the codebase/i, "grounding step must exist");
  assert.match(body, /real file paths/i, "must demand real paths / module names");
  assert.match(
    body,
    /could\s+apply to any repo is a defect/i,
    "must declare generic architecture prose a defect"
  );
});

test("write-spec SKILL.md treats count floors as calibration, not quotas", async () => {
  const body = await readSkill();
  assert.match(body, /not quotas/i, "floors must be declared non-quotas");
  assert.match(
    body,
    /one-line reason/i,
    "going under a floor must require a stated one-line reason"
  );
  assert.match(
    body,
    /Inventing\s+requirements to hit a floor is scope creep/i,
    "padding to hit a floor must be named as scope creep"
  );
});

test("write-spec SKILL.md carries a version sentinel", async () => {
  const body = await readSkill();
  assert.match(body, /kcc-dev-core-write-spec-sentinel: v\d+/);
});
