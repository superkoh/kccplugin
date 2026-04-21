import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

async function readSkill() {
  return await readFile(
    path.join(pluginRoot, "skills", "step-spec-ac-reviewer", "SKILL.md"),
    "utf-8"
  );
}

test("step-spec-ac-reviewer SKILL.md announces the multi-agent review+vote architecture", async () => {
  const body = await readSkill();
  assert.match(body, /multi-agent review \+ vote/i);
});

test("step-spec-ac-reviewer SKILL.md defines the three distinct reviewer personas", async () => {
  const body = await readSkill();
  assert.match(body, /Requirements lens/);
  assert.match(body, /Testability lens/);
  assert.match(body, /Risk\/Architecture lens/);
});

test("step-spec-ac-reviewer SKILL.md declares 6 Phases R1..R6", async () => {
  const body = await readSkill();
  for (const p of ["Phase R1", "Phase R2", "Phase R3", "Phase R4", "Phase R5", "Phase R6"]) {
    assert.match(body, new RegExp(p), `missing phase header: ${p}`);
  }
});

test("step-spec-ac-reviewer SKILL.md declares Round 1 + Round 2 reviewer drafts", async () => {
  const body = await readSkill();
  assert.match(body, /reviewer-<N>-round1\.md/);
  assert.match(body, /reviewer-<N>-round2\.md/);
  // Round 2 prompt must tell each reviewer to read the other two drafts
  assert.match(body, /read reviewer-<A>-round1\.md and[\s\S]*?reviewer-<B>-round1\.md/);
});

test("step-spec-ac-reviewer SKILL.md declares the review-drafts/ and .pre-review/ dirs", async () => {
  const body = await readSkill();
  assert.match(body, /review-drafts\//);
  assert.match(body, /\.pre-review\//);
});

test("step-spec-ac-reviewer SKILL.md specifies vote rules (majority, tie → most conservative)", async () => {
  const body = await readSkill();
  assert.match(body, /[Mm]ajority of round-2/);
  assert.match(body, /most conservative/);
  assert.match(body, /request-changes/);
});

test("step-spec-ac-reviewer SKILL.md specifies schema-level override to request-changes", async () => {
  const body = await readSkill();
  assert.match(body, /schema-level/i);
  assert.match(body, /override/i);
  assert.match(body, /automatically overrides the verdict to request-changes/);
});

test("step-spec-ac-reviewer SKILL.md specifies Phase R4.3 rewriter subagents (rewriter-spec + rewriter-ac)", async () => {
  const body = await readSkill();
  assert.match(body, /rewriter-spec/);
  assert.match(body, /rewriter-ac/);
  assert.match(body, /Apply the rewrite plan/);
});

test("step-spec-ac-reviewer SKILL.md specifies rewrite-plan.md with EDIT / ADD / REMOVE ops", async () => {
  const body = await readSkill();
  assert.match(body, /rewrite-plan\.md/);
  assert.match(body, /EDIT/);
  assert.match(body, /ADD/);
  assert.match(body, /REMOVE/);
});

test("step-spec-ac-reviewer SKILL.md blocks rewrite when verdict = request-changes", async () => {
  const body = await readSkill();
  assert.match(body, /skip[\s\S]*?phase[\s\S]*?request-changes|request-changes[\s\S]*?skip[\s\S]*?R4/i);
  assert.match(body, /Do not rewrite on verdict = request-changes/);
});

test("step-spec-ac-reviewer SKILL.md mandates post-rewrite traceability audit + rollback on failure", async () => {
  const body = await readSkill();
  assert.match(body, /[Pp]ost-rewrite traceability audit/);
  assert.match(body, /rollback|[Rr]oll back|Restore from `?\.pre-review/i);
  assert.match(body, /downgrade[\s\S]*?verdict[\s\S]*?request-changes/i);
});

test("step-spec-ac-reviewer SKILL.md specifies review.md ## spec-ac 7-subsection structure", async () => {
  const body = await readSkill();
  for (const sub of [
    "### Reviewers",
    "### Round 2 convergence highlights",
    "### Consensus findings",
    "### Traceability audit",
    "### Vote",
    "### Final verdict",
    "### Rewrite",
  ]) {
    assert.match(body, new RegExp(sub.replace(/\s+/g, "\\s+")), `missing sub-section: ${sub}`);
  }
});

test("step-spec-ac-reviewer SKILL.md requires all 4 severity headers with _none_ placeholder", async () => {
  const body = await readSkill();
  for (const s of ["#### Critical", "#### Major", "#### Minor", "#### Nit"]) {
    assert.match(body, new RegExp(s.replace(/\s+/g, "\\s+")));
  }
  assert.match(body, /_none_/);
});

test("step-spec-ac-reviewer SKILL.md reads kickoff + spec + ac (not brainstorm or _kickoff)", async () => {
  const body = await readSkill();
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/kickoff\.md/);
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/spec\.md/);
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/ac\.md/);
  assert.doesNotMatch(body, /_kickoff\.md/);
  assert.doesNotMatch(body, /brainstorm\.md/);
});

test("step-spec-ac-reviewer SKILL.md writes review.md with # Review header when missing", async () => {
  const body = await readSkill();
  assert.match(body, /# Review — <feature-name>/);
  assert.match(body, /\.kcc\/specs\/<feature-slug>\/review\.md/);
});

test("step-spec-ac-reviewer SKILL.md declares T3 + spawns Agent + no AskUserQuestion + no Path A", async () => {
  const body = await readSkill();
  assert.match(body, /teammate T3|task T3/);
  assert.match(body, /[Nn]o `?AskUserQuestion`?/);
  assert.match(body, /[Nn]o Path A|superpowers ships no standalone/i);
  assert.match(body, /`?Agent`?\s*tool|via `Agent`|Agent\(/);
});

test("step-spec-ac-reviewer SKILL.md absent-reviewer rule is documented", async () => {
  const body = await readSkill();
  assert.match(body, /absent/i);
  assert.match(body, /[Rr]etry once/);
});

test("step-spec-ac-reviewer SKILL.md removes the legacy <!-- TODO: blocker- marker rule", async () => {
  const body = await readSkill();
  assert.doesNotMatch(body, /TODO:\s*blocker-/);
});

test("step-spec-ac-reviewer SKILL.md closes with TaskUpdate(taskId=T3, status=completed)", async () => {
  const body = await readSkill();
  assert.match(body, /TaskUpdate\(taskId=T3,\s*status=completed\)/);
});

test("step-spec-ac-reviewer SKILL.md sentinel is v1 (not v1-skeleton)", async () => {
  const body = await readSkill();
  assert.match(body, /kcc-dev-workflow-step-spec-ac-reviewer-sentinel: v1\b/);
  assert.doesNotMatch(body, /v1-skeleton/);
});
