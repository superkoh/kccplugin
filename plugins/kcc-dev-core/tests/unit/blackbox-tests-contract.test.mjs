import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");
const skillDir = path.join(pluginRoot, "skills", "blackbox-tests");

async function readSkill() {
  return await readFile(path.join(skillDir, "SKILL.md"), "utf-8");
}

/**
 * Prose rules are asserted against whitespace-collapsed text so that
 * re-wrapping a paragraph never turns into a red test. Structural rules
 * (the output template, the Depth line, the principle shape) keep using
 * the raw body, where line breaks are the thing under test.
 */
async function readSkillProse() {
  return (await readSkill()).replace(/\s+/g, " ");
}

const PRINCIPLE_RE = /^- \*\*(.+?)\*\* — (.+)$/;
const SUBHEADINGS = ["### Writing the cases", "### Materializing them"];

/**
 * Upper bound on the principle list. The structural pass took the merged
 * doc from 100 to 92 — template-narrating prose, one mapping stated three
 * times, and restated oracle/red-run claims folded. Measured: the
 * 2026-08-07 block campaign then cut 92 to 83, deleting the two blocks
 * whose ablated arm passed every task shape designed for it —
 * BBX-no-backdoors (4 shapes, 20/0) and BBX-coverage-accounting (2 shapes,
 * 10/0). The headroom absorbs a restored rule without letting sprawl creep
 * back in unnoticed. It has to be a ceiling: a floor cannot fail on growth,
 * which is the only direction this doc drifts.
 */
const MAX_PRINCIPLES = 89;

/** Body lines split into the output template and everything around it. */
function splitTemplate(body) {
  const fence = body.match(/```markdown\n([\s\S]*?)```/);
  assert.ok(fence, "output template fence missing");
  const [before, after] = body.split(fence[0]);
  return { template: fence[1], outside: before + after };
}

/**
 * Parses the principle list outside the output template. `claims` is keyed by
 * bold lead so a test can assert what a named principle *says*, rather than
 * grepping the whole doc for a literal that a passing mention would satisfy.
 */
function parsePrinciples(body) {
  const { outside } = splitTemplate(body);
  const [, afterFrontmatter] = outside.split(/^---\n[\s\S]*?\n---\n/m);
  const leads = [];
  const claims = new Map();
  const prose = [];
  const perSection = new Map();
  let section = null;
  for (const line of afterFrontmatter.split("\n")) {
    if (line.trim() === "") continue;
    if (/^#{1,6} \S/.test(line)) {
      if (/^### /.test(line)) {
        section = line.trim();
        perSection.set(section, 0);
      }
      continue;
    }
    if (/^<!-- kcc-dev-core-blackbox-tests-sentinel: v\d+ -->$/.test(line)) continue;
    assert.doesNotMatch(line, /^\s+[-*] /, `nested list item: ${line}`);
    const m = line.match(PRINCIPLE_RE);
    if (!m) {
      assert.doesNotMatch(line, /^[-*] /, `list item is not a principle: ${line}`);
      prose.push(line);
      continue;
    }
    leads.push(m[1]);
    claims.set(m[1], m[2]);
    if (section) perSection.set(section, perSection.get(section) + 1);
  }
  return { leads, claims, prose, perSection };
}

const EXPECTED_GROUPS = ["## Main Flow", "## Corner Cases", "## Non-functional"];

test("blackbox-tests SKILL.md declares the 3 case groups in order", async () => {
  const body = await readSkill();
  let prev = -1;
  for (const header of EXPECTED_GROUPS) {
    const idx = body.indexOf(header);
    assert.notEqual(idx, -1, `missing case group header: ${header}`);
    assert.ok(idx > prev, `group order violated: ${header}`);
    prev = idx;
  }
});

test("blackbox-tests SKILL.md mandates the seven case fields, in order", async () => {
  const body = await readSkill();
  // The field list and its order are demonstrated by the template below;
  // where the two optional fields sit is not, so that stays a rule.
  assert.match(
    body.replace(/\s+/g, " "),
    /`Setup:` and `Cleanup:`, when present, sitting between `Surface:` and \*\*Given\*\*/
  );
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

test("blackbox-tests SKILL.md documents per-group numbering (BB-M/C/N) once", async () => {
  // The ID format is defined on the case side; the materializing side only
  // carries it into the test name, so there is exactly one definition.
  const body = await readSkillProse();
  assert.match(body, /BB-M01/);
  assert.match(body, /BB-C01/);
  assert.match(body, /BB-N01/);
  assert.match(body, /name carries that case's BB-ID/);
  assert.match(body, /no test exists without a BB-ID/i);
});

test("blackbox-tests SKILL.md states the trace identifiers as a rule, not only in the template", async () => {
  // Measured: requirement traces are one of the three things this skill buys
  // over a no-skill arm (14.0 vs 20.8), which traced its cases to nothing.
  // The identifiers used to survive only inside the output template, so a
  // template edit could drop them with every principle still passing.
  const { claims } = parsePrinciples(await readSkill());
  const principleText = [...claims.values()].join(" ").replace(/\s+/g, " ");
  for (const id of ["FR-NN", "US-NN", "NFR-NN", "§Edge Cases item #N"]) {
    assert.ok(
      principleText.includes(id),
      `trace identifier stated only in the template, not as a rule: ${id}`
    );
  }
  assert.match(principleText, /`Traces to:` names every requirement the case covers/);
  // The marker line rides on the same field, so it is pinned here too.
  assert.match(principleText, /marker for the case rides on the same line/);
});

test("blackbox-tests SKILL.md documents both execution modes and what happens to each", async () => {
  const body = await readSkillProse();
  assert.match(body, /`Mode: automated`/);
  assert.match(body, /`llm-driven`/);
  assert.match(body, /Mode: automated /, "the template must show a concrete Mode value");
  // An llm-driven case is left behind on purpose; saying so is what keeps it
  // from being silently dropped or wrongly materialized.
  assert.match(
    body,
    /deliberately left unmaterialized and stays in the cases file/,
    "the doc must say llm-driven cases are left behind on purpose"
  );
});

test("blackbox-tests SKILL.md pins the black-box contract", async () => {
  // Measured: the 2026-08-07 block campaign deleted `Contracted surfaces
  // only` with the rest of BBX-no-backdoors (4 shapes, arm B 20/0), so the
  // surface-binding half of the contract is no longer asserted here. The
  // no-backdoor invariant survives on the test-code side as the two lint
  // checks, covered by "defines all three black-box lint checks".
  const body = await readSkillProse();
  assert.match(body, /Never read implementation/);
  assert.match(body, /no invented endpoints/);
  assert.match(body, /Red-first/);
});

test("blackbox-tests SKILL.md defines the in-file exception markers and consumes both", async () => {
  const body = await readSkillProse();
  assert.match(body, /\[PRE-IMPL: green/);
  assert.match(body, /\[EXTERNAL-SETUP: blocked/);
  // Measured: the 2026-08-07 block campaign deleted `Unpreparable state`,
  // which introduced the EXTERNAL-SETUP marker, so that marker is now
  // consume-only — deliberately. Arm B of BBX-no-backdoors was exactly this
  // document, and its `blocked` shape scored 5/0; do not re-add a defining
  // principle to tidy the reference.
  // Defined on the case side, consumed on the materializing side.
  assert.match(body, /Carry `\[PRE-IMPL: green — existing behavior\]` annotations into the test/);
  assert.match(body, /A case marked `\[EXTERNAL-SETUP: blocked — <reason>\]` is not materialized/);
});

test("blackbox-tests SKILL.md forbids invented thresholds for unquantified NFRs", async () => {
  // Measured: with this rule both skill arms parked the unquantified NFR
  // in Pending 3/3; the no-skill arm invented numbers or dropped it 3/3.
  const body = await readSkillProse();
  assert.match(body, /no number in the spec → Pending, never an invented threshold/i);
});

test("blackbox-tests SKILL.md rejects Thens that cannot fail", async () => {
  // Measured: blind judges scored oracle decidability 2.00 for the full
  // skill against 1.44 for a draft that only said "pass/fail-decidable" —
  // the "document the actual behavior" non-oracle needs naming.
  const body = await readSkillProse();
  assert.match(body, /A \*\*Then\*\* that cannot fail is not a case/);
  assert.match(body, /document the actual behavior/);
});

test("blackbox-tests SKILL.md requires every Given to name its setup surface", async () => {
  // Measured: external-setup purity fell to 1.56 when the rule only
  // banned DB backdoors; judges flagged unrouted "a paid order exists".
  // Measured: the 2026-08-07 block campaign deleted `Setup dependency` with
  // the rest of BBX-no-backdoors (4 shapes, arm B 20/0), so only the
  // names-its-surface half is still a rule.
  const body = await readSkillProse();
  assert.match(body, /Every \*\*Given\*\* names the surface that prepares it/);
});

test("blackbox-tests SKILL.md keeps the boundary-pair rule", async () => {
  // Measured: dropping the equivalence/boundary angle cost the reason
  // -field boundary row (2.00 -> 1.67). Both halves are load-bearing —
  // the cap pair AND the empty value.
  const body = await readSkillProse();
  assert.match(body, /earns a case at the cap and one past it/);
  assert.match(body, /also earns a case for the empty value/);
});

test("blackbox-tests SKILL.md names the three gaps specs omit, each with its oracle", async () => {
  // Idempotency, concurrency and vertical authz are the angles the spec
  // under test never mentions and the ones that cost money when missed.
  // An angle without its oracle yields a Then that cannot fail, so each
  // angle must carry what to assert.
  const body = await readSkillProse();
  assert.match(body, /repeat the same mutating action twice/i);
  assert.match(body, /exactly one effect/i);
  assert.match(body, /two actors on one resource at once/i);
  assert.match(body, /one winner and no lost update/i);
  assert.match(body, /lower-privileged actor attempting the privileged action/i);
  assert.match(body, /both the rejection and that nothing changed/i);
  assert.match(body, /never timing or ordering/i);
});

test("blackbox-tests SKILL.md keeps both depth tiers, and reads a missing one as full", async () => {
  const body = await readSkillProse();
  assert.match(body, /`Depth: focused`/);
  assert.match(body, /`Depth: full`/);
  assert.match(body, /When in doubt, full/);
  assert.match(body, /A file with no `Depth:` line counts as `full`/);
});

test("blackbox-tests SKILL.md closes the case draft with the adversarial gap sweep at both depths", async () => {
  const body = await readSkillProse();
  assert.match(body, /fresh-context reviewer subagent/);
  assert.match(body, /Run it at both depths/);
});

test("blackbox-tests SKILL.md pins the Depth line to a bare tier", async () => {
  // Measured: "state the tier and what triggered it" put prose on the
  // Depth: line in 3/3 runs, which downstream has to parse around.
  const body = await readSkill();
  assert.match(body, /^Depth: full$/m, "template must show a bare tier value");
  assert.match(body, /carries exactly `focused` or `full` — no trailing prose/);
});

test("blackbox-tests SKILL.md keeps HTML comments out of the output template", async () => {
  // Measured: comments annotating the template were copied verbatim into
  // blackbox.md by 2 of 3 runs, one of them onto the Depth: line.
  const body = await readSkill();
  const fence = body.match(/```markdown\n([\s\S]*?)```/);
  assert.ok(fence, "output template fence missing");
  assert.doesNotMatch(fence[1], /<!--/, "template must not contain HTML comments");
  assert.match(body.replace(/\s+/g, " "), /write no HTML comments into it/);
});

test("blackbox-tests SKILL.md hands white-box tests to kcc-dev-core:unit-tests", async () => {
  const body = await readSkillProse();
  assert.match(body, /kcc-dev-core:unit-tests/);
  // Both halves live here now; a pointer at either pre-merge skill is a
  // dangling reference.
  assert.doesNotMatch(body, /materialize-blackbox-tests/);
  assert.doesNotMatch(body, /write-blackbox-tests/);
});

test("blackbox-tests carries no reference files", async () => {
  // Measured: linked references were read in 3/3 runs regardless of
  // relevance, so a reference is fixed overhead, not lazy loading.
  const body = await readSkill();
  assert.doesNotMatch(body, /references\//, "fold reference content into SKILL.md");
  await assert.rejects(
    () => access(path.join(skillDir, "references")),
    "the references directory must be gone"
  );
});

test("blackbox-tests SKILL.md frontmatter fires on both halves", async () => {
  const body = await readSkill();
  const fm = body.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, "SKILL.md must open with YAML frontmatter");
  assert.match(fm[1], /^description: \S/, "frontmatter must carry a description");
  // Case-writing triggers.
  assert.match(fm[1], /写黑盒用例/);
  assert.match(fm[1], /出 AC/);
  assert.match(fm[1], /write black-box test cases/);
  // Materializing triggers.
  assert.match(fm[1], /落地黑盒测试/);
  assert.match(fm[1], /写黑盒测试代码/);
  assert.match(fm[1], /materialize black-box tests/);
});

test("blackbox-tests SKILL.md is a flat list of one-sentence principles under both subheadings", async () => {
  // A line budget policed prose creep by proxy and fired on legitimate
  // one-line principles instead; the shape plus a principle ceiling is the
  // real invariant. Note the ceiling — a floor cannot fail on growth.
  const body = await readSkill();
  const { leads, claims, prose, perSection } = parsePrinciples(body);

  for (const [lead, claim] of claims) {
    const sentence = claim.replace(/`[^`]*`/g, "…").replace(/\[[^\]]*\]/g, "…");
    assert.match(sentence, /\.$/, `principle must end in one period: ${lead}`);
    assert.doesNotMatch(
      sentence.slice(0, -1),
      /[.;]/,
      `principle must be one sentence, no semicolon-chained claims: ${lead}`
    );
  }

  assert.ok(leads.length > 0, "no principles found");
  assert.ok(
    leads.length <= MAX_PRINCIPLES,
    `principle list must stay at or under ${MAX_PRINCIPLES}; found ${leads.length}`
  );
  assert.equal(
    new Set(leads).size,
    leads.length,
    "bold leads must be unique — the ablation harness anchors on them"
  );
  assert.ok(
    prose.length <= 1,
    `at most one framing sentence outside the principles; found ${prose.length}: ${prose.join(" | ")}`
  );
  for (const heading of SUBHEADINGS) {
    assert.ok(
      (perSection.get(heading) ?? 0) > 0,
      `subheading missing or empty inside ## Principles: ${heading}`
    );
  }
});

test("blackbox-tests SKILL.md preserves the output template verbatim", async () => {
  const { template } = splitTemplate(await readSkill());
  for (const line of [
    "# Black-box Test Cases — <feature-name>",
    "Depth: full",
    "### BB-M01: <short title>",
    "- Traces to: FR-03, US-02",
    "- Priority: P0",
    "- Mode: automated",
    "- Surface: `POST /orders` (spec §System Design)",
    "- **Given** <state, prepared through external surfaces>",
    "- **When** <action on the surface>",
    "- **Then** <observable outcome>",
    "### BB-C01: <short title>",
    "### BB-N01: <short title>",
    "## Pending cases (blocked by open items)",
    "- <sketch>, blocked by <open item / unpinned surface>",
  ]) {
    assert.ok(
      template.split("\n").includes(line),
      `output template lost its line: ${line}`
    );
  }
});

test("blackbox-tests SKILL.md carries a versioned sentinel and no other HTML comment", async () => {
  const body = await readSkill();
  assert.match(body, /<!-- kcc-dev-core-blackbox-tests-sentinel: v\d+ -->/);
  const comments = body.match(/<!--[\s\S]*?-->/g) ?? [];
  assert.equal(comments.length, 1, "the sentinel is the only HTML comment allowed");
});

test("blackbox-tests SKILL.md couples both halves to one cases file without pinning a path", async () => {
  const body = await readSkill();
  assert.doesNotMatch(body, /\.kcc\//, "no hardcoded case-file path — location is the project's call");
  assert.match(body, /materializing reads back that same file/, "the write/read coupling must survive");
  assert.match(body, /location and name follow the project's own conventions/);
});

test("blackbox-tests SKILL.md scopes materialization to automated cases only", async () => {
  const body = await readSkillProse();
  assert.match(body, /Materialize only the `Mode: automated` cases/);
});

test("blackbox-tests SKILL.md answers the zero-automated-case path", async () => {
  // Without this, a blackbox.md of purely llm-driven cases sends the run
  // into scaffolding a project with nothing to put in it.
  const body = await readSkillProse();
  assert.match(
    body,
    /no `Mode: automated` case skips scaffolding through the red run and produces the report alone/
  );
});

test("blackbox-tests SKILL.md asks about case review without stopping on it", async () => {
  const body = await readSkillProse();
  assert.match(body, /\*\*Case review\*\*/);
  // Only known-wrong inputs still halt the run.
  assert.match(
    body,
    /Only unresolved `## Pending cases` or `\[ASSUMED: …\]` markers stop the run/
  );
});

test("blackbox-tests SKILL.md spawns the conformance reviewer on all three triggers", async () => {
  // Batch size alone lets a 6-case money or permissions batch skip the
  // reviewer, which is exactly the batch that cannot afford to.
  const body = await readSkillProse();
  assert.match(
    body,
    /The conformance review is required when the batch exceeds ~10 tests, when depth is `full`, or when any case involves concurrency, money, or permissions/
  );
  assert.match(body, /single reviewer subagent spawned with fresh context/);
});

test("blackbox-tests SKILL.md reuses an existing isolated suite instead of scaffolding twice", async () => {
  const body = await readSkillProse();
  assert.match(body, /extend it instead of standing up a second one/);
});

test("blackbox-tests SKILL.md keeps the test project isolated from implementation source", async () => {
  const body = await readSkillProse();
  assert.match(body, /zero imports from implementation source/);
  // Isolation is a packaging property, not just an import rule: a project
  // sharing the implementation's manifest is not isolated.
  assert.match(body, /its own dependency manifest and lockfile/);
});

test("blackbox-tests SKILL.md proposes test project locations rather than only asking", async () => {
  const body = await readSkillProse();
  assert.match(body, /Ask about test project location and harness only on the first run/);
  assert.match(
    body,
    /Propose 1–3 test project locations derived from this repo's own conventions/
  );
  assert.match(body, /with your recommendation first/);
});

test("blackbox-tests SKILL.md hands the blocked-setup and deferred-red decisions onward", async () => {
  const body = await readSkillProse();
  // A blocked case is the user's call, not the agent's, because approving a
  // fixture backdoor trades away the black-box guarantee.
  assert.match(
    body,
    /the user decides whether to approve a documented fixture backdoor/
  );
  // A deferred red run is owed, not waived.
  assert.match(body, /the first act of the implementation phase/);
});

test("blackbox-tests SKILL.md defines all three black-box lint checks", async () => {
  // "Run the lint" without saying what it checks leaves the boundary to
  // taste — the two source-reach checks are the ones a suite fails silently.
  const body = await readSkillProse();
  assert.match(body, /Run the black-box lint over the written tests before running them/);
  assert.match(
    body,
    /any path or module reference from the test project into the system under test/
  );
  assert.match(
    body,
    /any database client, ORM, or internal queue client in setup or cleanup/
  );
  // Both directions: the reverse check alone passes a suite that silently
  // dropped half its cases, since every surviving test still has a BB-ID.
  assert.match(
    body,
    /The lint fails when an automated BB-ID has no test or carries more than one/
  );
  assert.match(body, /no test exists without a BB-ID/i);
});

test("blackbox-tests SKILL.md defines each red-run status, with a disposition", async () => {
  // A status that is demanded but never defined (unexpected-green was) gets
  // past a literal grep, so assert what the named principle actually claims.
  const { claims } = parsePrinciples(await readSkill());
  for (const status of ["expected-red", "broken-test", "unexpected-green"]) {
    assert.ok(claims.has(status), `red-run status is not defined as its own principle: ${status}`);
  }
  assert.match(
    claims.get("expected-red"),
    /fails because the surface or behavior doesn't exist yet/,
    "expected-red must be defined"
  );
  assert.match(claims.get("expected-red"), /healthy state to record/, "expected-red needs a disposition");
  assert.match(
    claims.get("broken-test"),
    /crash, config error, syntax error, or harness timeout/,
    "broken-test must be defined"
  );
  assert.match(claims.get("broken-test"), /fixed on the spot and rerun/, "broken-test needs a disposition");
  assert.match(
    claims.get("unexpected-green"),
    /passes before the implementation exists/,
    "unexpected-green must be defined, not merely mentioned"
  );
  assert.match(
    claims.get("unexpected-green"),
    /legitimate if and only if that case is annotated `\[PRE-IMPL: green\]`/,
    "unexpected-green needs its legitimacy rule"
  );
  const prose = (await readSkill()).replace(/\s+/g, " ");
  assert.match(
    prose,
    /the assertion is vacuous or the case is not testing the new behavior, so investigate it and report/,
    "an unannotated unexpected-green needs a disposition"
  );
});

test("blackbox-tests SKILL.md persists the status table beside the case file", async () => {
  const body = await readSkillProse();
  assert.match(body, /status file beside the cases file/, "persistence must survive without a filename literal");
  // The status table is this skill's output contract; its columns are the
  // shape a downstream reader depends on.
  assert.match(body, /status table carries BB-ID, status, and reason/);
});

test("blackbox-tests SKILL.md carries the full output contract", async () => {
  // The status table alone is not the report: what was left unmaterialized,
  // what never ran, and where the project lives are the parts a reader
  // cannot reconstruct from the repo.
  const body = await readSkillProse();
  assert.match(body, /Report the status table back at the end of the run/);
  assert.match(body, /Report as not materialized every `llm-driven` case/);
  assert.match(body, /every case blocked by `\[EXTERNAL-SETUP: blocked — <reason>\]`/);
  assert.match(body, /Report every `deferred` red run/);
  assert.match(body, /every lint exception, every conformance-review finding/);
  assert.match(body, /whether the conformance reviewer was skipped/);
  assert.match(body, /State the test project path in the report/);
  // The case-writing half reports too. Measured: the 2026-08-07 block
  // campaign deleted `Report the uncovered` with the rest of
  // BBX-coverage-accounting (2 shapes, arm B 10/0), so the uncovered-
  // requirement line is no longer part of the contract.
  assert.match(body, /Report the path written, the depth and what triggered it/);
});

test("blackbox-tests SKILL.md confirms scope via AskUserQuestion", async () => {
  const body = await readSkillProse();
  assert.match(body, /AskUserQuestion/);
});

test("blackbox-tests SKILL.md is standalone — no orchestrator / teammate language", async () => {
  const body = await readSkillProse();
  assert.doesNotMatch(body, /teammate/i);
  assert.doesNotMatch(body, /TaskUpdate/);
  assert.doesNotMatch(body, /orchestrator-only/i);
});
