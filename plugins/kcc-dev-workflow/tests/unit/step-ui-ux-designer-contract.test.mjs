import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

async function readSkill() {
  return await readFile(
    path.join(pluginRoot, "skills", "step-ui-ux-designer", "SKILL.md"),
    "utf-8"
  );
}

const EXPECTED_SECTIONS = [
  "## Summary & UI Scope",
  "## User Flows",
  "## Component Catalog",
  "## Interaction Specs",
  "## Visual Hierarchy & Design Tokens",
  "## Accessibility Targets",
  "## Open UX Questions",
];

test("step-ui-ux-designer SKILL.md declares the 7 ui.md sections in order", async () => {
  const body = await readSkill();
  let prev = -1;
  for (const header of EXPECTED_SECTIONS) {
    const idx = body.indexOf(header);
    assert.notEqual(idx, -1, `missing section header: ${header}`);
    assert.ok(idx > prev, `section order violated: ${header} must come after the previous section`);
    prev = idx;
  }
});

test("step-ui-ux-designer SKILL.md requires User Flows to be in Mermaid", async () => {
  const body = await readSkill();
  assert.match(body, /Mermaid/);
  assert.match(body, /flowchart|graph TD|sequenceDiagram/);
});

test("step-ui-ux-designer SKILL.md requires Component Catalog table with States/Events/Emits columns", async () => {
  const body = await readSkill();
  assert.match(body, /\| Component \| States \| Events \| Emits \|/);
});

test("step-ui-ux-designer SKILL.md enforces Interaction Specs fields (event / reaction / feedback latency / failure mode)", async () => {
  const body = await readSkill();
  assert.match(body, /On <event>/);
  assert.match(body, /feedback latency/i);
  assert.match(body, /failure mode/i);
});

test("step-ui-ux-designer SKILL.md requires 3 accessibility sub-bullets (WCAG / keyboard / screen-reader)", async () => {
  const body = await readSkill();
  assert.match(body, /WCAG level/i);
  assert.match(body, /[Kk]eyboard nav/);
  assert.match(body, /[Ss]creen-reader/);
});

test("step-ui-ux-designer SKILL.md forbids bare TBD + propagates ASSUMPTION markers", async () => {
  const body = await readSkill();
  assert.match(body, /No bare `TBD`/);
  assert.match(body, /ASSUMPTION:/);
  assert.match(body, /needs user confirmation/);
});

test("step-ui-ux-designer SKILL.md requires the 7-section self-check before TaskUpdate", async () => {
  const body = await readSkill();
  assert.match(body, /[Ss]tructural self-check/);
  assert.match(body, /Exactly 7 `##` headers/);
});

test("step-ui-ux-designer SKILL.md has idempotence check (resume fast-path)", async () => {
  const body = await readSkill();
  assert.match(body, /Idempotence check \(resume fast-path\)/);
  assert.match(body, /already present — resumed/);
  assert.match(body, /TaskUpdate\(taskId=T2,\s*status=completed\)/);
});

test("step-ui-ux-designer SKILL.md states it runs as teammate T2 + no AskUserQuestion + no Path A", async () => {
  const body = await readSkill();
  assert.match(body, /teammate T2|task T2/);
  assert.match(body, /[Nn]o `?AskUserQuestion`?/);
  assert.match(body, /no Path A|frontend-design:frontend-design generates UI code/i);
});

test("step-ui-ux-designer SKILL.md reads kickoff.md + spec.md (no ac / yaml)", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/kickoff\.md/);
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/spec\.md/);
  // Should not claim ac.md or yaml as inputs
  assert.doesNotMatch(body, /\.kcc\/specs\/<feature-slug>\/ac\.md/);
  assert.doesNotMatch(body, /\.kcc\/tests\/cases\/<feature-slug>\.yaml/);
});

test("step-ui-ux-designer SKILL.md writes ui.md to the canonical path", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/ui\.md/);
});

test("step-ui-ux-designer SKILL.md closes with TaskUpdate(taskId=T2, status=completed)", async () => {
  const body = await readSkill();
  assert.match(body, /TaskUpdate\(taskId=T2,\s*status=completed\)/);
});

test("step-ui-ux-designer SKILL.md sentinel is v1 (not v1-skeleton)", async () => {
  const body = await readSkill();
  assert.match(body, /kcc-dev-workflow-step-ui-ux-designer-sentinel: v1\b/);
  assert.doesNotMatch(body, /v1-skeleton/);
});
