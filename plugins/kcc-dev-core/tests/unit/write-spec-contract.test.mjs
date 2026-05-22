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
