import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

async function readSkill() {
  return await readFile(
    path.join(pluginRoot, "skills", "step-test-case-writer", "SKILL.md"),
    "utf-8"
  );
}

test("step-test-case-writer SKILL.md documents Path A (leverage kcc-testing:write-test-cases)", async () => {
  const body = await readSkill();
  assert.match(body, /Path A/);
  assert.match(body, /kcc-testing:write-test-cases/);
});

test("step-test-case-writer scope override tells kcc-testing to SKIP Step 2 AskUserQuestion", async () => {
  const body = await readSkill();
  assert.match(body, /SKIP[\s\S]*?Step 2/);
  assert.match(body, /AskUserQuestion/);
  assert.match(body, /do NOT call AskUserQuestion/);
});

test("step-test-case-writer documents the 5 pre-answers derived before dispatch", async () => {
  const body = await readSkill();
  for (const f of [
    "feature",
    "platform",
    "design_tokens_source",
    "ui_change",
    "coverage_triggers",
  ]) {
    assert.match(body, new RegExp(`\\b${f}\\b`), `missing pre-answer field: ${f}`);
  }
  assert.match(body, /[Pp]re-answer derivation/);
});

test("step-test-case-writer documents Path B inline minimum-viable synthesis", async () => {
  const body = await readSkill();
  assert.match(body, /Path B/);
  assert.match(body, /inline minimum-viable|minimum required fields/i);
});

test("step-test-case-writer Path B sets generated_by with kcc-dev-workflow provenance", async () => {
  const body = await readSkill();
  assert.match(body, /kcc-dev-workflow\/step-test-case-writer\/v1 \(Path B fallback\)/);
});

test("step-test-case-writer top-level required fields match kcc-testing schema", async () => {
  const body = await readSkill();
  for (const f of [
    "feature",
    "platform",
    "design_tokens_source",
    "ui_change",
    "coverage_triggers",
    "generated_at",
    "generated_by",
    "cases",
    "rtm_summary",
  ]) {
    assert.match(body, new RegExp(`\`${f}\``), `missing top-level field reference: ${f}`);
  }
});

test("step-test-case-writer per-case required fields include the full schema set", async () => {
  const body = await readSkill();
  // Allow optional "[]" suffix for array fields (e.g. `steps[]`).
  for (const f of [
    "id",
    "title",
    "priority",
    "requirement_ref",
    "tags",
    "preconditions.state",
    "preconditions.data_setup",
    "steps",
    "cleanup",
    "testability",
  ]) {
    const esc = f.replace(".", "\\.");
    assert.match(
      body,
      new RegExp(`\`${esc}(\\[\\])?\``),
      `missing per-case field reference: ${f}`
    );
  }
});

test("step-test-case-writer testability block enumerates all 6 fields", async () => {
  const body = await readSkill();
  for (const f of [
    "oracle_present",
    "state_reachable",
    "deterministic",
    "isolated",
    "has_explicit_wait",
    "wait_spec",
  ]) {
    assert.match(body, new RegExp(`\`${f}\``), `missing testability field: ${f}`);
  }
});

test("step-test-case-writer documents rtm_summary with 4 fields + deferred-open-item rule", async () => {
  const body = await readSkill();
  assert.match(body, /requirement_branches_total/);
  assert.match(body, /requirement_branches_covered/);
  assert.match(body, /uncovered_branches/);
  assert.match(body, /unreferenced_cases/);
  assert.match(body, /deferred — blocked by open item/);
});

test("step-test-case-writer documents case-generation coverage rules (AC-F/N/E + triggers + P0)", async () => {
  const body = await readSkill();
  assert.match(body, /Every `AC-F\*`[\s\S]*?at least 1 case/);
  assert.match(body, /Every `AC-E\*`[\s\S]*?at least 1 edge case/);
  assert.match(body, /Every `AC-N\*`[\s\S]*?at least 1 case/);
  assert.match(body, /coverage_triggers\.X[\s\S]*?tag/);
  assert.match(body, /at least 1.*P0|least one `P0`/i);
});

test("step-test-case-writer documents Path A post-invocation checks + fallback reasons", async () => {
  const body = await readSkill();
  assert.match(body, /post-invocation check/i);
  assert.match(body, /Output path check/);
  assert.match(body, /[Ll]eak check/);
  assert.match(body, /[Ss]chema sanity/);
  assert.match(body, /Path A fallback condition/);
});

test("step-test-case-writer requires explicit 'fell back to Path B' reply on downgrade", async () => {
  const body = await readSkill();
  assert.match(body, /fell back to Path B/);
  assert.match(body, /[Nn]o silent downgrade/);
});

test("step-test-case-writer reads kickoff + spec + ui + ac (not brainstorm or _kickoff)", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/kickoff\.md/);
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/spec\.md/);
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/ui\.md/);
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/ac\.md/);
  assert.doesNotMatch(body, /_kickoff\.md/);
  assert.doesNotMatch(body, /brainstorm\.md/);
});

test("step-test-case-writer allows requirement_ref to cite ui §... entries", async () => {
  const body = await readSkill();
  assert.match(body, /ui §Component ApplyButton|ui §Component/);
  assert.match(body, /ui §User Flows/);
});

test("step-test-case-writer design_tokens_source falls back to ui-kickoff.html when present", async () => {
  const body = await readSkill();
  assert.match(body, /ui-kickoff\.html/);
  assert.match(body, /approved concrete palette|carries the approved concrete palette/);
});

test("step-test-case-writer writes YAML to .kcc/tests/cases/<slug>.yaml", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/tests\/cases\/<feature-slug>\.yaml|\.kcc\/tests\/cases\/<slug>\.yaml/);
});

test("step-test-case-writer declares T5 + no AskUserQuestion + Skill tool available for Path A", async () => {
  const body = await readSkill();
  assert.match(body, /teammate T5|task T5/);
  assert.match(body, /[Nn]o `?AskUserQuestion`?/);
  assert.match(body, /`Skill` tool IS available|Skill tool/);
});

test("step-test-case-writer closes with TaskUpdate(taskId=T5, status=completed)", async () => {
  const body = await readSkill();
  assert.match(body, /TaskUpdate\(taskId=T5,\s*status=completed\)/);
});

test("step-test-case-writer SKILL.md has idempotence check (resume fast-path)", async () => {
  const body = await readSkill();
  assert.match(body, /Idempotence check \(resume fast-path\)/);
  assert.match(body, /already present — resumed/);
  assert.match(body, /TaskUpdate\(taskId=T5,\s*status=completed\)/);
  assert.match(body, /Do NOT[\s\S]*?(derive|dispatch|write)/i);
});

test("step-test-case-writer sentinel is v1 (not v1-skeleton)", async () => {
  const body = await readSkill();
  assert.match(body, /kcc-dev-workflow-step-test-case-writer-sentinel: v1\b/);
  assert.doesNotMatch(body, /v1-skeleton/);
});
