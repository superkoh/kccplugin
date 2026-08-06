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

/**
 * Prose rules are asserted against whitespace-collapsed text so that
 * re-wrapping a paragraph never turns into a red test. Structural rules
 * (the output template, the Depth line, the size budget) keep using the
 * raw body, where line breaks are the thing under test.
 */
async function readSkillProse() {
  return (await readSkill()).replace(/\s+/g, " ");
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
  assert.match(body, /Seven fields per case, in that order/);
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
  const body = await readSkillProse();
  assert.match(body, /BB-M01/);
  assert.match(body, /BB-C01/);
  assert.match(body, /BB-N01/);
});

test("write-blackbox-tests SKILL.md documents both execution modes", async () => {
  const body = await readSkillProse();
  assert.match(body, /`Mode: automated`/);
  assert.match(body, /`llm-driven`/);
  assert.match(body, /Mode: automated /, "the template must show a concrete Mode value");
});

test("write-blackbox-tests SKILL.md pins the black-box contract", async () => {
  const body = await readSkillProse();
  assert.match(body, /Never read implementation/);
  assert.match(body, /contracted external surfaces/);
  assert.match(body, /no invented endpoints/);
  assert.match(body, /Red-first/);
});

test("write-blackbox-tests SKILL.md defines the in-file exception markers", async () => {
  const body = await readSkillProse();
  assert.match(body, /\[PRE-IMPL: green/);
  assert.match(body, /\[EXTERNAL-SETUP: blocked/);
});

test("write-blackbox-tests SKILL.md requires per-requirement coverage, never a case count", async () => {
  const body = await readSkillProse();
  assert.match(body, /Coverage is per requirement, never per count/);
  assert.doesNotMatch(
    body,
    /Total cases ≥/,
    "a case-count floor manufactures low-value cases"
  );
});

test("write-blackbox-tests SKILL.md forbids invented thresholds for unquantified NFRs", async () => {
  // Measured: with this rule both skill arms parked the unquantified NFR
  // in Pending 3/3; the no-skill arm invented numbers or dropped it 3/3.
  const body = await readSkillProse();
  assert.match(body, /no number in the spec → Pending, never an invented threshold/i);
});

test("write-blackbox-tests SKILL.md rejects Thens that cannot fail", async () => {
  // Measured: blind judges scored oracle decidability 2.00 for the full
  // skill against 1.44 for a draft that only said "pass/fail-decidable" —
  // the "document the actual behavior" non-oracle needs naming.
  const body = await readSkillProse();
  assert.match(body, /A \*\*Then\*\* that cannot fail is not a case/);
  assert.match(body, /document the actual behavior/);
});

test("write-blackbox-tests SKILL.md requires every Given to name its setup surface", async () => {
  // Measured: external-setup purity fell to 1.56 when the rule only
  // banned DB backdoors; judges flagged unrouted "a paid order exists".
  const body = await readSkillProse();
  assert.match(body, /Every \*\*Given\*\* names the surface that prepares it/);
  assert.match(body, /setup dependency/);
});

test("write-blackbox-tests SKILL.md keeps the boundary-pair rule", async () => {
  // Measured: dropping the equivalence/boundary angle cost the reason
  // -field boundary row (2.00 -> 1.67).
  const body = await readSkillProse();
  assert.match(body, /boundary pair — at the cap and one past it — plus the empty value/);
});

test("write-blackbox-tests SKILL.md names the three gaps specs omit", async () => {
  // Idempotency, concurrency and vertical authz are the angles the spec
  // under test never mentions and the ones that cost money when missed.
  const body = await readSkillProse();
  assert.match(body, /repeat the same mutating action twice/i);
  assert.match(body, /two actors on one resource at once/i);
  assert.match(body, /lower-privileged actor attempting the privileged action/i);
  assert.match(body, /never timing or ordering/i);
});

test("write-blackbox-tests SKILL.md keeps both depth tiers", async () => {
  const body = await readSkillProse();
  assert.match(body, /`Depth: focused`/);
  assert.match(body, /`Depth: full`/);
  assert.match(body, /when in doubt, full/);
});

test("write-blackbox-tests SKILL.md closes with the adversarial gap sweep at both depths", async () => {
  const body = await readSkillProse();
  assert.match(body, /fresh-context reviewer subagent/);
  assert.match(body, /Run it at both depths/);
});

test("write-blackbox-tests SKILL.md pins the Depth line to a bare tier", async () => {
  // Measured: "state the tier and what triggered it" put prose on the
  // Depth: line in 3/3 runs, which downstream has to parse around.
  const body = await readSkill();
  assert.match(body, /^Depth: full$/m, "template must show a bare tier value");
  assert.match(body, /carries exactly `focused` or `full` — no trailing prose/);
});

test("write-blackbox-tests SKILL.md keeps HTML comments out of the output template", async () => {
  // Measured: comments annotating the template were copied verbatim into
  // blackbox.md by 2 of 3 runs, one of them onto the Depth: line.
  const body = await readSkill();
  const fence = body.match(/```markdown\n([\s\S]*?)```/);
  assert.ok(fence, "output template fence missing");
  assert.doesNotMatch(fence[1], /<!--/, "template must not contain HTML comments");
  assert.match(body.replace(/\s+/g, " "), /write no HTML comments into it/);
});

test("write-blackbox-tests SKILL.md hands code materialization to the sibling skill", async () => {
  const body = await readSkillProse();
  assert.match(body, /materialize-blackbox-tests/);
});

test("write-blackbox-tests carries no reference files", async () => {
  // Measured: linked references were read in 3/3 runs regardless of
  // relevance, so a reference is fixed overhead, not lazy loading.
  const body = await readSkill();
  assert.doesNotMatch(body, /references\//, "fold reference content into SKILL.md");
  await assert.rejects(
    () => access(path.join(skillDir, "references")),
    "the references directory must be gone"
  );
});

test("write-blackbox-tests SKILL.md stays inside its size budget", async () => {
  const body = await readSkill();
  const lines = body.split("\n").length;
  assert.ok(lines <= 125, `SKILL.md grew to ${lines} lines; budget is 125`);
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
  const body = await readSkillProse();
  assert.doesNotMatch(body, /teammate/i);
  assert.doesNotMatch(body, /TaskUpdate/);
  assert.doesNotMatch(body, /orchestrator-only/i);
});
