import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

async function readSkill() {
  return await readFile(
    path.join(pluginRoot, "skills", "step-brainstorm", "SKILL.md"),
    "utf-8"
  );
}

const EXPECTED_SECTIONS = [
  "## Metadata",
  "## Original material",
  "## Problem Statement",
  "## Users & Personas",
  "## Goals & Non-goals",
  "## Key Scenarios",
  "## Considered Alternatives",
  "## Constraints",
  "## Open Questions & Risks",
];

test("step-brainstorm SKILL.md declares the 9 kickoff.md sections in order", async () => {
  const body = await readSkill();
  // The 9 expected section headers must appear as literal strings in the
  // body (they document the produced kickoff.md schema). Their first
  // occurrence indices must be strictly increasing.
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

test("step-brainstorm SKILL.md enforces ≥ 3 substantive bullets per thinking section", async () => {
  const body = await readSkill();
  assert.match(body, /≥\s*3\s+substantive bullet/i);
});

test("step-brainstorm SKILL.md forbids bare TBD bullets", async () => {
  const body = await readSkill();
  assert.match(body, /No bare `TBD`/);
});

test("step-brainstorm SKILL.md wires ASSUMPTION ↔ Open Questions pairing", async () => {
  const body = await readSkill();
  assert.match(body, /ASSUMPTION:/);
  assert.match(body, /needs user confirmation/);
});

test("step-brainstorm SKILL.md documents Path A (leverage superpowers:brainstorming)", async () => {
  const body = await readSkill();
  assert.match(body, /Path A/);
  assert.match(body, /superpowers:brainstorming/);
});

test("step-brainstorm scope override contains HARD STOP and docs/superpowers/specs/ exclusion", async () => {
  const body = await readSkill();
  assert.match(body, /HARD STOP/);
  assert.match(body, /docs\/superpowers\/specs\//);
  assert.match(body, /Do NOT:/);
});

test("step-brainstorm SKILL.md documents Path B (inline probing fallback)", async () => {
  const body = await readSkill();
  assert.match(body, /Path B/);
  assert.match(body, /inline probing/i);
});

test("step-brainstorm SKILL.md caps total questions at 10", async () => {
  const body = await readSkill();
  assert.match(body, /≤\s*10/, "must document the 10-question ceiling");
});

test("step-brainstorm SKILL.md documents the leak check for Path A", async () => {
  const body = await readSkill();
  assert.match(body, /[Ll]eak check/);
});

test("step-brainstorm SKILL.md sentinel is v1 (not v1-skeleton)", async () => {
  const body = await readSkill();
  assert.match(body, /kcc-dev-workflow-step-brainstorm-sentinel: v1\b/);
  assert.doesNotMatch(body, /v1-skeleton/);
});

test("step-brainstorm SKILL.md states it runs in the main session (not as a teammate)", async () => {
  const body = await readSkill();
  assert.match(body, /[Mm]ain session/);
  assert.match(body, /not as a teammate|not a teammate/);
});

test("step-brainstorm SKILL.md specifies the single-file kickoff.md output", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/kickoff\.md/);
});
