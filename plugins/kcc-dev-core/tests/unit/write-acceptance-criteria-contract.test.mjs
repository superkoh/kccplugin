import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

async function readSkill() {
  return await readFile(
    path.join(pluginRoot, "skills", "write-acceptance-criteria", "SKILL.md"),
    "utf-8"
  );
}

const EXPECTED_GROUPS = ["## Functional", "## Non-functional", "## Edge Cases"];

test("write-acceptance-criteria SKILL.md declares the 3 AC groups in order", async () => {
  const body = await readSkill();
  let prev = -1;
  for (const header of EXPECTED_GROUPS) {
    const idx = body.indexOf(header);
    assert.notEqual(idx, -1, `missing AC group header: ${header}`);
    assert.ok(idx > prev, `group order violated: ${header}`);
    prev = idx;
  }
});

test("write-acceptance-criteria SKILL.md mandates the four Gherkin fields", async () => {
  const body = await readSkill();
  assert.match(body, /Traces to:/);
  assert.match(body, /\*\*Given\*\*/);
  assert.match(body, /\*\*When\*\*/);
  assert.match(body, /\*\*Then\*\*/);
});

test("write-acceptance-criteria SKILL.md documents per-group numbering (AC-F/N/E)", async () => {
  const body = await readSkill();
  assert.match(body, /AC-F01/);
  assert.match(body, /AC-N01/);
  assert.match(body, /AC-E01/);
});

test("write-acceptance-criteria SKILL.md requires full requirement coverage", async () => {
  const body = await readSkill();
  assert.match(body, /Every `FR-NN` is referenced/);
  assert.match(body, /Every `NFR-NN` is referenced/);
});

test("write-acceptance-criteria SKILL.md is standalone — no orchestrator / teammate language", async () => {
  const body = await readSkill();
  assert.doesNotMatch(body, /teammate/i);
  assert.doesNotMatch(body, /TaskUpdate/);
  assert.doesNotMatch(body, /orchestrator-only/i);
});
