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
  "## UX Direction",
  "## Goals & Non-goals",
  "## Key Scenarios",
  "## Considered Alternatives",
  "## Constraints",
  "## Open Questions & Risks",
];

test("step-brainstorm SKILL.md declares the 10 kickoff.md sections in order (includes UX Direction)", async () => {
  const body = await readSkill();
  // The 10 expected section headers must appear as literal strings in the
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

test("step-brainstorm SKILL.md declares the conditional ui-kickoff.html output", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/ui-kickoff\.html/);
  assert.match(body, /[Cc]onditional|UX Visual Direction sub-phase/);
});

test("step-brainstorm SKILL.md defines the UX Visual Direction sub-phase trigger (platform + UI signals)", async () => {
  const body = await readSkill();
  assert.match(body, /UX Visual Direction/);
  assert.match(body, /Trigger|trigger/);
  assert.match(body, /platform.*web.*ios.*android.*desktop|{web, ios, android, desktop}/s);
  assert.match(body, /UI-surface signal/);
});

test("step-brainstorm sub-phase is an unbounded Approve/Request-changes/Abort loop with no round cap", async () => {
  const body = await readSkill();
  assert.match(body, /unbounded|no round cap|There is no round cap/i);
  assert.match(body, /Approve/);
  assert.match(body, /Request changes/);
  assert.match(body, /Abort/);
  assert.match(body, /Iterate until the user picks Approve or\s+Abort/);
});

test("step-brainstorm sub-phase has a soft nudge at >=3 iterations on same dimension", async () => {
  const body = await readSkill();
  assert.match(body, /[Ss]oft nudge/);
  assert.match(body, /three or more times|round N of iteration/);
  assert.match(body, /advisory only/);
});

test("step-brainstorm ui-kickoff.html structural requirements documented", async () => {
  const body = await readSkill();
  for (const section of [
    "<section class=\"palette\">",
    "<section class=\"typography\">",
    "<section class=\"density\">",
    "<section class=\"components\">",
  ]) {
    assert.ok(body.includes(section), `ui-kickoff.html should document section ${section}`);
  }
  assert.match(body, /self-contained|inline CSS/);
  assert.match(body, /approved_at/);
});

test("step-brainstorm UX Direction section specifies 6 required bullets + N/A form", async () => {
  const body = await readSkill();
  for (const label of [
    "Visual pillar:",
    "Accessibility priority:",
    "Interaction archetypes:",
    "Anti-patterns to avoid:",
    "Reference:",
    "Status:",
  ]) {
    assert.ok(body.includes(label), `UX Direction bullet missing: ${label}`);
  }
  assert.match(body, /N\/A — <one-line reason>|Status: N\/A/);
});

test("step-brainstorm push to kcc-preview is attempted, with file:// fallback when unavailable", async () => {
  const body = await readSkill();
  assert.match(body, /kcc-preview/);
  assert.match(body, /file:\/\//);
  assert.match(body, /pushed to preview|fallback/i);
});

test("step-brainstorm idempotence check covers UX Direction Status and ui-kickoff.html pairing", async () => {
  const body = await readSkill();
  assert.match(body, /Idempotence check \(resume fast-path\)/);
  assert.match(body, /Status: approved/);
  assert.match(body, /ui-kickoff\.html`? exists/);
});
