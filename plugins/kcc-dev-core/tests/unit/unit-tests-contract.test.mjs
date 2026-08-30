import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");
const skillDir = path.join(pluginRoot, "skills", "unit-tests");

async function readSkill() {
  return await readFile(path.join(skillDir, "SKILL.md"), "utf-8");
}

/**
 * Prose rules are asserted against whitespace-collapsed text so that
 * re-wrapping a paragraph never turns into a red test. Structural rules
 * (the size budget, the sentinel) keep using the raw body.
 */
async function readSkillProse() {
  return (await readSkill()).replace(/\s+/g, " ");
}

test("unit-tests SKILL.md pins the anti-tautology core", async () => {
  const body = await readSkillProse();
  assert.match(body, /tautological test/);
  assert.match(body, /Hand-derive every expected value/);
  assert.match(body, /never by running the implementation and pasting its output back/);
  assert.match(body, /Assert observable behavior only/);
});

test("unit-tests SKILL.md documents the three modes and their gates", async () => {
  const body = await readSkillProse();
  assert.match(body, /\(new code, backfill, or bug fix\)/);
  assert.match(body, /red first against a stub/);
  assert.match(body, /mutation probe/);
  assert.match(body, /reproduction test fails on the unfixed code/);
});

test("unit-tests SKILL.md demands assertion-level red, rejecting false reds", async () => {
  const body = await readSkillProse();
  assert.match(body, /assertion-level/);
  assert.match(body, /0 tests collected/);
  assert.match(body, /ImportError/);
});

test("unit-tests SKILL.md requires the mutation probe to be reverted", async () => {
  const body = await readSkillProse();
  assert.match(body, /confirm a test fails, revert/);
  assert.match(body, /surviving mutation is a powerless assertion/);
});

test("unit-tests SKILL.md forbids weakening a test to reach green", async () => {
  const body = await readSkillProse();
  assert.match(body, /Never weaken a test to reach green/);
  assert.match(body, /AskUserQuestion/);
});

test("unit-tests SKILL.md refuses to hand back a red suite as finished", async () => {
  // Measured: runs that found a real bug in code outside the immediate
  // task sometimes stopped at "test is red, source is wrong" and left the
  // suite failing. Finding the bug is half the job.
  const body = await readSkillProse();
  assert.match(body, /A red suite handed back as finished is not an outcome/);
});

test("unit-tests SKILL.md hard-skips glue by category, not by judgment", async () => {
  const body = await readSkillProse();
  assert.match(body, /Skip glue by category/);
  assert.match(body, /CLI entry points and argv parsing/);
  assert.match(body, /sitting next to interesting logic does not pull them back in/);
});

test("unit-tests SKILL.md requires a named blind spot per selected unit", async () => {
  const body = await readSkillProse();
  assert.match(body, /why a higher-level test would miss its bug or fail to localise it/);
  assert.match(body, /no such clause gets no test/);
});

test("unit-tests SKILL.md keeps the earns-a-test verdict inside this skill", async () => {
  // The caller cannot make this call before the units exist; the
  // description is what the router reads, so the claim lives there.
  const body = await readSkillProse();
  assert.match(body, /this skill's own per-unit call/);
  assert.match(body, /empty selection is a valid one-line outcome/);
});

test("unit-tests SKILL.md pins test doubles to declared interfaces", async () => {
  // Retained without measurement: both probe fixtures were pure
  // functions with no dependencies, so nothing here could exercise it.
  const body = await readSkillProse();
  assert.match(body, /Fake only what the contract declares/);
  assert.match(body, /the contract has a gap — fix that first/);
});

test("unit-tests SKILL.md keeps the spike exception it reports on", async () => {
  const body = await readSkillProse();
  assert.match(body, /Spikes may go implementation-first/);
});

test("unit-tests SKILL.md rejects a coverage-percentage KPI", async () => {
  const body = await readSkillProse();
  assert.match(body, /No coverage-percentage KPI/);
});

test("unit-tests SKILL.md keeps the frontend rule to one line of guidance", async () => {
  const body = await readSkillProse();
  assert.match(body, /Squeeze logic out of components/);
  assert.match(body, /"Hard to test" is a coupling signal/);
});

test("unit-tests carries no reference files", async () => {
  // Measured: the linked references were read in 5/5 runs including a
  // frontend reference on a pure backend task — fixed overhead, not lazy
  // loading.
  const body = await readSkill();
  assert.doesNotMatch(body, /references\//, "fold reference content into SKILL.md");
  await assert.rejects(
    () => access(path.join(skillDir, "references")),
    "the references directory must be gone"
  );
});

/**
 * Split the instruction body into logical units: fenced output templates
 * (verbatim, exempt from the bullet shape), and everything else with a
 * bullet's wrapped continuation lines folded back onto its first line.
 */
function parseBody(raw) {
  const close = raw.indexOf("\n---\n", 3);
  const lines = raw.slice(close + 5).split("\n");
  const bullets = [];
  const other = [];
  const template = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      template.push(line);
      continue;
    }
    if (inFence) {
      template.push(line);
      continue;
    }
    if (/^- /.test(line)) bullets.push(line);
    else if (bullets.length && /^ {2,}\S/.test(line)) {
      bullets[bullets.length - 1] += " " + line.trim();
    } else other.push(line);
  }
  return { bullets, other, template };
}

// The size policy, replacing the raw line-count budget: an upper bound on
// principles, not on lines, so re-wrapping a principle is free but adding
// principles back is not. 22 are on disk after the 0.10.0 trim; the headroom
// admits a genuinely new rule and nothing more. Raise it only with evidence
// for the rule that needs the room.
const MAX_PRINCIPLES = 25;

test("unit-tests SKILL.md is a flat list of one-sentence principles", async () => {
  // A raw line budget punished legitimate one-line principles, so the bound
  // counts principles instead — and it is a ceiling, not a floor: creeping
  // prose trips the framing check, creeping rules trip MAX_PRINCIPLES.
  const raw = await readSkill();
  assert.match(raw, /^---\ndescription: /, "frontmatter must open the file");

  const { bullets, other } = parseBody(raw);
  assert.ok(
    bullets.length <= MAX_PRINCIPLES,
    `principle count ${bullets.length} exceeds the ${MAX_PRINCIPLES} budget — trim, or justify the raise`
  );

  const leads = new Set();
  for (const bullet of bullets) {
    const m = /^- \*\*([^*]+)\*\* — (.+)$/.exec(bullet);
    assert.ok(m, `not a "- **lead** — sentence." bullet: ${bullet.slice(0, 60)}`);
    const [, lead, sentence] = m;
    assert.ok(!leads.has(lead), `duplicate bold lead: ${lead}`);
    leads.add(lead);
    assert.match(sentence, /\.$/, `principle must end in a period: ${lead}`);
    assert.doesNotMatch(sentence, /\.\s/, `more than one sentence: ${lead}`);
  }

  const paragraphs = [];
  for (const line of other) {
    if (/^(#{1,6} |<!--)/.test(line) || line.trim() === "") {
      paragraphs.push("");
      continue;
    }
    paragraphs[paragraphs.length - 1] =
      (paragraphs[paragraphs.length - 1] ?? "") + " " + line.trim();
  }
  const framing = paragraphs.map((p) => p.trim()).filter(Boolean);
  assert.ok(framing.length <= 1, `expected at most one framing sentence, got ${framing.length}`);
  for (const p of framing) assert.doesNotMatch(p, /\.\s/, `framing must be one sentence: ${p}`);
});

test("unit-tests SKILL.md hands black-box work to the sibling skill", async () => {
  const body = await readSkillProse();
  assert.match(body, /kcc-dev-core.blackbox-tests/);
});

test("the blackbox skill routes unit tests back to unit-tests", async () => {
  const body = await readFile(
    path.join(pluginRoot, "skills", "blackbox-tests", "SKILL.md"),
    "utf-8"
  );
  assert.match(
    body,
    /kcc-dev-core.unit-tests/,
    "blackbox-tests must point unit tests at kcc-dev-core.unit-tests"
  );
});

test("unit-tests SKILL.md carries a versioned sentinel", async () => {
  const body = await readSkill();
  assert.match(body, /<!-- kcc-dev-core-unit-tests-sentinel: v\d+ -->/);
});

test("unit-tests SKILL.md is standalone — no orchestrator / teammate language", async () => {
  const body = await readSkillProse();
  assert.doesNotMatch(body, /teammate/i);
  assert.doesNotMatch(body, /TaskUpdate/);
  assert.doesNotMatch(body, /orchestrator-only/i);
});
