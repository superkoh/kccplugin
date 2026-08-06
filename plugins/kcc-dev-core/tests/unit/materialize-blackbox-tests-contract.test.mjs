import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

async function readSkill() {
  return await readFile(
    path.join(pluginRoot, "skills", "materialize-blackbox-tests", "SKILL.md"),
    "utf-8"
  );
}

test("materialize-blackbox-tests SKILL.md scopes to automated cases only", async () => {
  const body = await readSkill();
  assert.match(body, /`Mode: automated`/);
  assert.match(body, /llm-driven` cases are not\s+materialized/);
  assert.match(body, /no `automated` case remains/);
});

test("materialize-blackbox-tests SKILL.md asks about case review without stopping on it", async () => {
  const body = await readSkill();
  assert.match(body, /\*\*Case review\*\*/);
  assert.match(body, /does not count/);
  assert.match(body, /"not yet" is not a stop/);
  // Only known-wrong inputs still halt the run.
  assert.match(body, /Only\s+unresolved `## Pending cases` or `\[ASSUMED: …\]` markers stop the\s+run/);
});

test("materialize-blackbox-tests SKILL.md inherits the depth tier from blackbox.md", async () => {
  const body = await readSkill();
  assert.match(body, /Note its `Depth:` line/);
  assert.match(body, /no `Depth:` line\s+counts as `full`/);
});

test("materialize-blackbox-tests SKILL.md spawns the conformance reviewer only when the batch earns it", async () => {
  const body = await readSkill();
  assert.match(body, /Conformance review — when the batch earns it/);
  assert.match(body, /exceeds ~10 tests/);
  assert.match(body, /reviewer was skipped/);
});

test("materialize-blackbox-tests SKILL.md reuses an existing isolated suite instead of scaffolding twice", async () => {
  const body = await readSkill();
  assert.match(body, /extend it instead of standing up a\s+second one/);
});

test("materialize-blackbox-tests SKILL.md derives the project location from repo conventions", async () => {
  const body = await readSkill();
  assert.match(body, /repo's conventions/);
  assert.match(body, /zero imports from implementation source/);
});

test("materialize-blackbox-tests SKILL.md classifies the red run three ways", async () => {
  const body = await readSkill();
  assert.match(body, /`expected-red`/);
  assert.match(body, /`broken-test`/);
  assert.match(body, /`unexpected-green`/);
});

test("materialize-blackbox-tests SKILL.md honors the writer's in-file markers", async () => {
  const body = await readSkill();
  assert.match(body, /\[PRE-IMPL: green/);
  assert.match(body, /\[EXTERNAL-SETUP: blocked/);
});

test("materialize-blackbox-tests SKILL.md maps Setup/Cleanup, not just Given/When/Then", async () => {
  const body = await readSkill();
  assert.match(body, /`Setup:`/);
  assert.match(body, /`Cleanup:`/);
});

test("materialize-blackbox-tests SKILL.md reads the shared case-file path and persists status", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/specs\/<slug>\/blackbox\.md/);
  assert.match(body, /blackbox-status\.md/);
});

test("materialize-blackbox-tests SKILL.md inherits the black-box contract and links the case skill", async () => {
  const body = await readSkill();
  assert.match(body, /inherits the black-box contract/);
  assert.match(body, /write-blackbox-tests/);
});

test("materialize-blackbox-tests SKILL.md confirms scope via AskUserQuestion", async () => {
  const body = await readSkill();
  assert.match(body, /AskUserQuestion/);
});

test("materialize-blackbox-tests SKILL.md carries a versioned sentinel", async () => {
  const body = await readSkill();
  assert.match(body, /<!-- kcc-dev-core-materialize-blackbox-tests-sentinel: v\d+ -->/);
});

test("materialize-blackbox-tests SKILL.md is standalone — no orchestrator / teammate language", async () => {
  const body = await readSkill();
  assert.doesNotMatch(body, /teammate/i);
  assert.doesNotMatch(body, /TaskUpdate/);
  assert.doesNotMatch(body, /orchestrator-only/i);
});
