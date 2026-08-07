import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

async function readSkill() {
  return await readFile(
    path.join(pluginRoot, "skills", "spec", "SKILL.md"),
    "utf-8"
  );
}

/**
 * Prose rules are asserted against whitespace-collapsed text so that
 * re-wrapping a principle never turns into a red test. Structural rules
 * (the flat-list shape, the output template, the sentinel) keep using
 * the raw body.
 */
async function readSkillProse() {
  return (await readSkill()).replace(/\s+/g, " ");
}

const SENTINEL_LINE = /^<!-- kcc-dev-core-spec-sentinel: v\d+ -->$/;
const PRINCIPLE_LINE = /^- \*\*([^*]+)\*\* — (.+)$/;

// The size policy, replacing the raw line-count budget: an upper bound on
// principles, not on lines, so re-wrapping is free but re-expansion is not.
// 43 principles are on disk after the 0.10.0 trim; the headroom admits a
// genuinely new rule and nothing more. Raise it only with evidence for the
// rule that needs the room.
const MAX_PRINCIPLES = 46;

async function readParts() {
  const raw = await readSkill();
  assert.ok(raw.startsWith("---\n"), "SKILL.md must open with YAML frontmatter");
  const close = raw.indexOf("\n---\n", 3);
  assert.notEqual(close, -1, "frontmatter opened with --- but never closed");
  const body = raw.slice(close + 5);

  const lines = body.split("\n");
  const principlesAt = lines.indexOf("## Principles");
  assert.notEqual(principlesAt, -1, "body must carry a `## Principles` heading");

  const principles = [];
  const strays = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (line.startsWith("```")) {
      inFence = !inFence;
      return;
    }
    if (inFence || line.trim() === "") return;
    if (/^#{1,6} /.test(line) || SENTINEL_LINE.test(line)) return;
    if (PRINCIPLE_LINE.test(line)) {
      principles.push(line);
      return;
    }
    strays.push({ line, i, beforePrinciples: i < principlesAt });
  });
  assert.equal(inFence, false, "an unterminated ``` fence in the body");

  return { frontmatter: raw.slice(4, close), body, principles, strays };
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

test("spec SKILL.md keeps its registration frontmatter", async () => {
  const { frontmatter } = await readParts();
  assert.match(frontmatter, /^description: /m, "frontmatter must carry a description");
  assert.match(frontmatter, /write a spec/, "description must keep its English triggers");
  assert.match(frontmatter, /写 spec/, "description must keep its Chinese triggers");
});

// Replaces the raw line-count budget with a bound that still fails on
// growth: prose creeping back in trips the stray check, principles
// creeping back in trip MAX_PRINCIPLES.
test("spec SKILL.md body is a flat list of one-sentence principles", async () => {
  const { principles, strays } = await readParts();
  assert.ok(
    principles.length <= MAX_PRINCIPLES,
    `principle count ${principles.length} exceeds the ${MAX_PRINCIPLES} budget — trim, or justify the raise`
  );

  const framing = strays.filter((s) => s.beforePrinciples);
  const after = strays.filter((s) => !s.beforePrinciples);
  assert.ok(
    framing.length <= 1,
    `at most one framing sentence may precede ## Principles; found ${framing.length}`
  );
  assert.deepEqual(
    after.map((s) => s.line),
    [],
    "every line under ## Principles must be a heading, blank, or a `- **lead** — sentence.` bullet"
  );

  for (const line of principles) {
    const [, lead, sentence] = line.match(PRINCIPLE_LINE);
    assert.ok(lead.trim().length > 0, `empty bold lead: ${line}`);
    // Code spans hold paths and templates whose dots are not sentence ends.
    const bare = sentence.replace(/`[^`]*`/g, "`…`");
    assert.match(bare, /\.$/, `principle must end in a period: ${line}`);
    assert.doesNotMatch(
      bare,
      /[.!?]\s+\S/,
      `principle must be exactly one sentence: ${line}`
    );
  }
});

test("spec SKILL.md bold leads are unique — the ablation harness anchors on them", async () => {
  const { principles } = await readParts();
  const leads = principles.map((line) => line.match(PRINCIPLE_LINE)[1]);
  const seen = new Set();
  const dupes = leads.filter((lead) => (seen.has(lead) ? true : (seen.add(lead), false)));
  assert.deepEqual(dupes, [], "duplicate bold leads make an ablation anchor ambiguous");
});

test("spec SKILL.md carries no nested lists and no stray HTML comments", async () => {
  const { body } = await readParts();
  assert.doesNotMatch(body, /^[ \t]+[-*] /m, "principles must be a flat list");
  const comments = body.match(/<!--[\s\S]*?-->/g) ?? [];
  assert.equal(comments.length, 1, "the sentinel must be the only HTML comment");
  assert.match(comments[0], /kcc-dev-core-spec-sentinel/);
});

test("spec SKILL.md preserves the output template verbatim", async () => {
  const { body } = await readParts();
  const template = ["```", ...EXPECTED_SECTIONS, "```"].join("\n");
  assert.ok(body.includes(template), "the fenced 7-header output template must survive verbatim");
});

// Measured: the 0.10.0 A/B named the OUTPUT CONTRACT as one of the three
// things the skill buys — the no-skill arm emitted "its own invented format".
test("spec SKILL.md declares the 7 spec.md sections in order", async () => {
  const body = await readSkill();
  let prev = -1;
  for (const header of EXPECTED_SECTIONS) {
    const idx = body.indexOf(header);
    assert.notEqual(idx, -1, `missing section header in SKILL.md body: ${header}`);
    assert.ok(idx > prev, `section order violated: ${header} must come after the previous section`);
    prev = idx;
  }
});

// The skill carries generic principles only: WHERE the spec lands is the
// project's call, so no path literal may appear — what survives is the
// invariant that the location is conventional and stable.
test("spec SKILL.md leaves the output location to project convention, no path literal", async () => {
  const body = await readSkillProse();
  assert.match(body, /Produce exactly one spec document, not a set of documents/);
  assert.doesNotMatch(body, /\.kcc\//, "no hardcoded output path — location is the project's call");
  assert.match(body, /project's own conventions/, "the location principle must survive");
  assert.match(body, /keep them stable so later stages can find the spec/);
  assert.match(body, /ASCII-only kebab-case/, "the slug must stay path-safe");
  assert.match(
    body,
    /transliterating or summarizing a CJK feature name/i,
    "the CJK clause must survive inside the slug rule"
  );
});

test("spec SKILL.md requires 4 System Design sub-sections", async () => {
  const body = await readSkillProse();
  for (const sub of [
    "### Architecture",
    "### Data Model",
    "### API / Interface",
    "### State Machine",
  ]) {
    assert.ok(body.includes(sub), `missing sub-section: ${sub}`);
  }
  // Each named sub-section must also say what goes in it, or the rule
  // names four headings a writer cannot fill.
  assert.match(body, /responsibilities, and how they fit together/i);
  assert.match(body, /entities, fields, and relationships/i);
  assert.match(body, /endpoints, signatures, and event shapes/i);
  assert.match(body, /system-side states/i);
  assert.match(body, /`N\/A — <reason>` rather than dropped/, "inapplicable is N/A, never absent");
});

test("spec SKILL.md documents numbering conventions (US-NN, FR-NN, NFR-NN)", async () => {
  const body = await readSkillProse();
  assert.match(body, /US-NN/);
  assert.match(body, /FR-NN/);
  assert.match(body, /NFR-NN/);
  assert.match(body, /two-digit zero-padded/i);
});

// Measured: REQUIREMENT TRACES — the no-skill arm emitted cases "traced to
// nothing".
test("spec SKILL.md makes every requirement traceable", async () => {
  const body = await readSkillProse();
  assert.match(
    body,
    /traceability tag `\(US-NN, §<source-section>\)`/,
    "functional requirements must carry a trace tag"
  );
  assert.match(
    body,
    /`\(§<source>\)` or `\(derived from US-NN\)`/,
    "the NFR origin form must survive inside the trace rule"
  );
  assert.match(body, /exactly one observable behavior/, "requirements stay atomic and testable");
});

test("spec SKILL.md is standalone — no orchestrator / teammate language", async () => {
  const body = await readSkill();
  assert.doesNotMatch(body, /teammate/i, "skill must not reference teammate orchestration");
  assert.doesNotMatch(body, /TaskUpdate/, "skill must not drive task orchestration");
  assert.doesNotMatch(body, /orchestrator-only/i, "skill must be directly invocable");
});

test("spec SKILL.md gates AskUserQuestion on genuine ambiguity, not unconditionally", async () => {
  const body = await readSkillProse();
  assert.match(body, /only if genuinely ambiguous/i, "scope confirmation must be conditional");
  assert.match(
    body,
    /don't manufacture a question/i,
    "must forbid manufacturing a question when context already pins scope down"
  );
  assert.match(
    body,
    /exactly one `AskUserQuestion` call before writing/,
    "asking must not degenerate into a serial interview"
  );
  assert.match(
    body,
    /recommended option plus up to three candidates/i,
    "the one question must lead with a recommendation, not a bare enumeration"
  );
});

test("spec SKILL.md requires System Design grounded in the real codebase", async () => {
  const body = await readSkillProse();
  assert.match(body, /Ground in the codebase/i, "grounding step must exist");
  assert.match(body, /real file paths/i, "must demand real paths / module names");
  assert.match(
    body,
    /architecture prose that could apply to any repo/i,
    "must name generic architecture prose as the failure this skill prevents"
  );
  assert.match(body, /note `greenfield` in Architecture/, "an empty repo must not force fabrication");
});

test("spec SKILL.md treats count floors as calibration, not quotas", async () => {
  const body = await readSkillProse();
  assert.match(
    body,
    /calibrated to a typical feature rather than targets to hit/i,
    "floors must be declared calibration, not quotas"
  );
  assert.match(
    body,
    /one-line reason instead of padding/i,
    "going under a floor must require a stated one-line reason instead of padding"
  );
});

// Measured: REFUSAL TO INVENT AN UNPINNED SURFACE — the no-skill arm
// "invented an audit endpoint the spec never pinned"; shipped-text
// verification scored the gap parked without inventing a surface 3/3.
test("spec SKILL.md refuses to invent an unpinned surface", async () => {
  const body = await readSkillProse();
  assert.match(
    body,
    /Inventing features not grounded in the input is scope creep/i,
    "ungrounded features must be named as scope creep"
  );
  assert.match(
    body,
    /park them in `### Out of scope` or Open Items/i,
    "the parking destination must survive with the prohibition"
  );
});

test("spec SKILL.md self-checks and repairs rather than reporting known gaps", async () => {
  const body = await readSkillProse();
  assert.match(body, /After writing, re-check headers and order/i, "the re-verify pass must exist");
  assert.match(
    body,
    /Repair whatever that check finds inline/i,
    "defects are fixed in place, not reported as known gaps"
  );
  assert.match(body, /closing report gives the output path/i, "the closing report must name the path");
  assert.match(body, /one line of counts/i, "the closing report must carry counts");
});

test("spec SKILL.md carries a version sentinel", async () => {
  const body = await readSkill();
  assert.match(body, /kcc-dev-core-spec-sentinel: v\d+/);
});
