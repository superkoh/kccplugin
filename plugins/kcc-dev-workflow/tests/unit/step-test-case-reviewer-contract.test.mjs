import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

async function readSkill() {
  return await readFile(
    path.join(pluginRoot, "skills", "step-test-case-reviewer", "SKILL.md"),
    "utf-8"
  );
}

test("step-test-case-reviewer SKILL.md announces multi-agent review+vote architecture", async () => {
  const body = await readSkill();
  assert.match(body, /multi-agent review \+ vote/i);
});

test("step-test-case-reviewer SKILL.md defines 3 YAML-oriented reviewer personas", async () => {
  const body = await readSkill();
  assert.match(body, /Coverage lens/);
  assert.match(body, /Testability lens/);
  assert.match(body, /Quality lens/);
});

test("step-test-case-reviewer SKILL.md declares 6 Phases R1..R6", async () => {
  const body = await readSkill();
  for (const p of ["Phase R1", "Phase R2", "Phase R3", "Phase R4", "Phase R5", "Phase R6"]) {
    assert.match(body, new RegExp(p), `missing phase header: ${p}`);
  }
});

test("step-test-case-reviewer uses tc- prefix for drafts to avoid collisions with T4", async () => {
  const body = await readSkill();
  assert.match(body, /tc-reviewer-<N>-round1\.md/);
  assert.match(body, /tc-reviewer-<N>-round2\.md/);
  assert.match(body, /tc-rewrite-plan\.md/);
});

test("step-test-case-reviewer round 2 prompt tells each reviewer to read the other two drafts", async () => {
  const body = await readSkill();
  assert.match(body, /read tc-reviewer-<A>-round1\.md and[\s\S]*?tc-reviewer-<B>-round1\.md/);
});

test("step-test-case-reviewer declares review-drafts/ and .pre-review/ backup paths", async () => {
  const body = await readSkill();
  assert.match(body, /review-drafts\//);
  assert.match(body, /\.pre-review\/tests-cases-<feature-slug>\.yaml|\.pre-review\/tests-cases-<slug>\.yaml/);
});

test("step-test-case-reviewer specifies vote rules (majority, 3-way tie → most conservative)", async () => {
  const body = await readSkill();
  assert.match(body, /[Mm]ajority of round-2/);
  assert.match(body, /most conservative/);
  assert.match(body, /request-changes/);
});

test("step-test-case-reviewer specifies schema-level override criteria (explicit list)", async () => {
  const body = await readSkill();
  assert.match(body, /schema-level override/i);
  // Key triggers (allow markdown backticks between words):
  assert.match(body, /top-level required field missing/i);
  assert.match(body, /ui_change: true[\s\S]*?zero[\s\S]*?assertions\.visual/);
  assert.match(body, /mixes Form A and Form B/);
  assert.match(body, /snapshot \/ baseline language|snapshot.*baseline/i);
});

test("step-test-case-reviewer specifies rewriter-yaml subagent in Phase R4.3", async () => {
  const body = await readSkill();
  assert.match(body, /rewriter-yaml/);
  assert.match(body, /Apply the rewrite plan/);
});

test("step-test-case-reviewer rewrite plan schema includes EDIT / ADD / REMOVE ops", async () => {
  const body = await readSkill();
  assert.match(body, /EDIT/);
  assert.match(body, /ADD/);
  assert.match(body, /REMOVE/);
});

test("step-test-case-reviewer blocks rewrite when verdict = request-changes", async () => {
  const body = await readSkill();
  assert.match(body, /skip to R5|skip[\s\S]*?request-changes|request-changes[\s\S]*?skip/i);
  assert.match(body, /Do not rewrite on verdict = request-changes/);
});

test("step-test-case-reviewer specifies post-rewrite lint with 7 kcc-testing-compatible checks", async () => {
  const body = await readSkill();
  assert.match(body, /Post-rewrite lint[\s\S]*?7 checks|7 checks[\s\S]*?lint/i);
  // Key lint items explicit:
  assert.match(body, /top-level required fields/);
  assert.match(body, /ui_change: true[\s\S]*?assertions\.visual/);
  assert.match(body, /coverage_triggers\.X[\s\S]*?tag/);
  assert.match(body, /requirement_ref[\s\S]*?non-empty/);
  assert.match(body, /testability[\s\S]*?six fields/);
  assert.match(body, /rtm_summary[\s\S]*?requirement_branches_total/);
  assert.match(body, /At least one `P0`/);
});

test("step-test-case-reviewer post-rewrite lint failure triggers rollback + verdict downgrade", async () => {
  const body = await readSkill();
  assert.match(body, /[Rr]ollback|[Rr]oll back|cp `?\.pre-review/i);
  assert.match(body, /downgrade[\s\S]*?verdict[\s\S]*?request-changes/i);
});

test("step-test-case-reviewer review.md ## test-cases 7-subsection structure", async () => {
  const body = await readSkill();
  for (const sub of [
    "### Reviewers",
    "### Round 2 convergence highlights",
    "### Consensus findings",
    "### Coverage audit",
    "### Vote",
    "### Final verdict",
    "### Rewrite",
  ]) {
    assert.match(body, new RegExp(sub.replace(/\s+/g, "\\s+")), `missing sub-section: ${sub}`);
  }
});

test("step-test-case-reviewer enforces 4 severity headers with _none_ placeholder", async () => {
  const body = await readSkill();
  for (const s of ["#### Critical", "#### Major", "#### Minor", "#### Nit"]) {
    assert.match(body, new RegExp(s.replace(/\s+/g, "\\s+")));
  }
  assert.match(body, /_none_/);
});

test("step-test-case-reviewer reads kickoff + spec + ac + yaml (not brainstorm/_kickoff)", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/kickoff\.md/);
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/spec\.md/);
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/ac\.md/);
  assert.match(body, /\.kcc\/tests\/cases\/<feature-slug>\.yaml/);
  assert.doesNotMatch(body, /_kickoff\.md/);
  assert.doesNotMatch(body, /brainstorm\.md/);
});

test("step-test-case-reviewer appends to existing review.md (does not recreate header)", async () => {
  const body = await readSkill();
  assert.match(body, /review\.md/);
  assert.match(body, /the file exists|do not recreate its top-level header/i);
});

test("step-test-case-reviewer declares T6 + Agent + no AskUserQuestion + no Path A", async () => {
  const body = await readSkill();
  assert.match(body, /teammate T6|task T6/);
  assert.match(body, /[Nn]o `?AskUserQuestion`?/);
  assert.match(body, /[Nn]o Path A|kcc-testing ships no standalone test-case review/i);
  assert.match(body, /`?Agent`?\s*tool|via `Agent`|Agent\(/);
});

test("step-test-case-reviewer absent-reviewer rule is documented", async () => {
  const body = await readSkill();
  assert.match(body, /absent/i);
  assert.match(body, /[Rr]etry once/);
});

test("step-test-case-reviewer closes with TaskUpdate(taskId=T6, status=completed)", async () => {
  const body = await readSkill();
  assert.match(body, /TaskUpdate\(taskId=T6,\s*status=completed\)/);
});

test("step-test-case-reviewer SKILL.md has Phase R0 idempotence check (resume fast-path)", async () => {
  const body = await readSkill();
  assert.match(body, /Phase R0 — Idempotence check \(resume fast-path\)/);
  assert.match(body, /already present — resumed/);
  assert.match(body, /TaskUpdate\(taskId=T6,\s*status=completed\)/);
  assert.match(body, /Partial state[\s\S]*?(counts as a fail|drop through)/);
});

test("step-test-case-reviewer sentinel is v1 (not v1-skeleton)", async () => {
  const body = await readSkill();
  assert.match(body, /kcc-dev-workflow-step-test-case-reviewer-sentinel: v1\b/);
  assert.doesNotMatch(body, /v1-skeleton/);
});
