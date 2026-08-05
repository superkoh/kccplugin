import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");
const skillDir = path.join(pluginRoot, "skills", "write-blackbox-tests");

async function readSkill() {
  return await readFile(path.join(skillDir, "SKILL.md"), "utf-8");
}

const EXPECTED_GROUPS = ["## Main Flow", "## Corner Cases", "## Non-functional"];

test("write-blackbox-tests SKILL.md declares the 3 case groups in order", async () => {
  const body = await readSkill();
  let prev = -1;
  for (const header of EXPECTED_GROUPS) {
    const idx = body.indexOf(header);
    assert.notEqual(idx, -1, `missing case group header: ${header}`);
    assert.ok(idx > prev, `group order violated: ${header}`);
    prev = idx;
  }
});

test("write-blackbox-tests SKILL.md mandates the seven case fields, in order", async () => {
  const body = await readSkill();
  assert.match(body, /seven fields in order/);
  const FIELDS = [
    "Traces to:",
    "Priority:",
    "Mode:",
    "Surface:",
    "**Given**",
    "**When**",
    "**Then**",
  ];
  // Check order inside the template's first case, not across the whole doc.
  let cursor = body.indexOf("### BB-M01");
  assert.notEqual(cursor, -1, "template case ### BB-M01 missing");
  for (const field of FIELDS) {
    const idx = body.indexOf(field, cursor);
    assert.notEqual(idx, -1, `case field missing or out of order in template: ${field}`);
    cursor = idx;
  }
});

test("write-blackbox-tests SKILL.md documents per-group numbering (BB-M/C/N)", async () => {
  const body = await readSkill();
  assert.match(body, /BB-M01/);
  assert.match(body, /BB-C01/);
  assert.match(body, /BB-N01/);
});

test("write-blackbox-tests SKILL.md documents both execution modes", async () => {
  const body = await readSkill();
  assert.match(body, /`automated`/);
  assert.match(body, /`llm-driven`/);
});

test("write-blackbox-tests SKILL.md pins the black-box contract", async () => {
  const body = await readSkill();
  assert.match(body, /before\s+any implementation exists/);
  assert.match(body, /Zero dependency on implementation/);
  assert.match(body, /No invented interfaces/);
  assert.match(body, /Red-first/);
});

test("write-blackbox-tests SKILL.md defines the in-file exception markers", async () => {
  const body = await readSkill();
  assert.match(body, /\[PRE-IMPL: green/);
  assert.match(body, /\[EXTERNAL-SETUP: blocked/);
});

test("write-blackbox-tests SKILL.md requires full requirement coverage", async () => {
  const body = await readSkill();
  assert.match(body, /Every `FR-NN` is referenced/);
  assert.match(body, /Every `NFR-NN` is referenced/);
});

test("write-blackbox-tests SKILL.md closes with the adversarial gap sweep", async () => {
  const body = await readSkill();
  assert.match(body, /Adversarial gap sweep/);
});

test("write-blackbox-tests SKILL.md hands code materialization to the sibling skill", async () => {
  const body = await readSkill();
  assert.match(body, /materialize-blackbox-tests/);
});

test("write-blackbox-tests ships and links the coverage-angles reference", async () => {
  const body = await readSkill();
  assert.match(body, /references\/coverage-angles\.md/);
  await access(path.join(skillDir, "references", "coverage-angles.md"));
});

test("write-blackbox-tests SKILL.md carries a versioned sentinel", async () => {
  const body = await readSkill();
  assert.match(body, /<!-- kcc-dev-core-write-blackbox-tests-sentinel: v\d+ -->/);
});

test("both blackbox skills agree on the case-file path convention", async () => {
  const PATH_RE = /\.kcc\/specs\/<[a-z-]+>\/blackbox\.md/;
  const writer = await readSkill();
  const materializer = await readFile(
    path.join(pluginRoot, "skills", "materialize-blackbox-tests", "SKILL.md"),
    "utf-8"
  );
  assert.match(writer, PATH_RE, "writer must name .kcc/specs/<slug>/blackbox.md");
  assert.match(materializer, PATH_RE, "materializer must read the same path");
});

test("write-blackbox-tests SKILL.md is standalone — no orchestrator / teammate language", async () => {
  const body = await readSkill();
  assert.doesNotMatch(body, /teammate/i);
  assert.doesNotMatch(body, /TaskUpdate/);
  assert.doesNotMatch(body, /orchestrator-only/i);
});
