import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(__dirname, "..", "..", "skills", "ablate");

async function readSkill() {
  return await readFile(path.join(skillDir, "SKILL.md"), "utf-8");
}

/**
 * Prose rules are asserted against whitespace-collapsed text so that
 * re-wrapping a principle never turns into a red test. Structural rules
 * (the flat-list shape, the sentinel) keep using the raw body.
 */
async function readSkillProse() {
  return (await readSkill()).replace(/\s+/g, " ");
}

const SENTINEL_LINE = /^<!-- kcc-ablation-ablate-sentinel: v\d+ -->$/;
const PRINCIPLE_LINE = /^- \*\*([^*]+)\*\* — (.+)$/;

// An upper bound on principles, not on lines, so re-wrapping is free but
// re-expansion is not. 30 are on disk at 0.1.0; the headroom admits a
// few genuinely new campaign lessons and nothing more.
const MAX_PRINCIPLES = 33;

async function readParts() {
  const raw = await readSkill();
  assert.ok(raw.startsWith("---\n"), "SKILL.md must open with YAML frontmatter");
  const close = raw.indexOf("\n---\n", 3);
  assert.notEqual(close, -1, "frontmatter opened with --- but never closed");
  const body = raw.slice(close + 5);

  const lines = body.split("\n");
  const principlesAt = lines.indexOf("## Principles");
  assert.notEqual(principlesAt, -1, "body must carry a `## Principles` heading");

  const bullets = [];
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
      bullets.push({ line, i });
      return;
    }
    strays.push({ line, i, beforePrinciples: i < principlesAt });
  });
  assert.equal(inFence, false, "an unterminated ``` fence in the body");

  return { frontmatter: raw.slice(4, close), body, bullets, strays };
}

test("ablate SKILL.md keeps its registration frontmatter with both trigger languages", async () => {
  const { frontmatter } = await readParts();
  assert.match(frontmatter, /^description: /m, "frontmatter must carry a description");
  assert.match(frontmatter, /消融/, "description must keep its Chinese triggers");
  assert.match(frontmatter, /prompt ablation/i, "description must keep its English triggers");
  assert.match(
    frontmatter,
    /Standalone capability/,
    "the standalone boundary must survive in the description"
  );
});

test("ablate SKILL.md body is a flat list of one-sentence bullets", async () => {
  const { bullets, strays } = await readParts();
  const framing = strays.filter((s) => s.beforePrinciples);
  const after = strays.filter((s) => !s.beforePrinciples);
  assert.ok(
    framing.length <= 1,
    `at most one framing sentence may precede ## Principles; found ${framing.length}`
  );
  assert.deepEqual(
    after.map((s) => s.line),
    [],
    "every body line must be a heading, blank, or a `- **lead** — sentence.` bullet"
  );

  for (const { line } of bullets) {
    const [, lead, sentence] = line.match(PRINCIPLE_LINE);
    assert.ok(lead.trim().length > 0, `empty bold lead: ${line}`);
    // Code spans hold paths and identifiers whose dots are not sentence ends.
    const bare = sentence.replace(/`[^`]*`/g, "`…`");
    assert.match(bare, /\.$/, `bullet must end in a period: ${line}`);
    assert.doesNotMatch(bare, /[.!?]\s+\S/, `bullet must be exactly one sentence: ${line}`);
  }
});

test("ablate SKILL.md stays within its principle budget", async () => {
  const { body } = await readParts();
  const principlesSection = body.split("## Bundled mechanics")[0];
  const count = principlesSection
    .split("\n")
    .filter((l) => PRINCIPLE_LINE.test(l)).length;
  assert.ok(
    count <= MAX_PRINCIPLES,
    `principle count ${count} exceeds the ${MAX_PRINCIPLES} budget — trim, or justify the raise`
  );
});

test("ablate SKILL.md bold leads are unique — its own harness anchors on bold leads", async () => {
  const { bullets } = await readParts();
  const leads = bullets.map(({ line }) => line.match(PRINCIPLE_LINE)[1]);
  const seen = new Set();
  const dupes = leads.filter((lead) => (seen.has(lead) ? true : (seen.add(lead), false)));
  assert.deepEqual(dupes, [], "duplicate bold leads make an ablation anchor ambiguous");
});

test("ablate SKILL.md carries exactly one HTML comment: its version sentinel", async () => {
  const { body } = await readParts();
  assert.doesNotMatch(body, /^[ \t]+[-*] /m, "bullets must be a flat list");
  const comments = body.match(/<!--[\s\S]*?-->/g) ?? [];
  assert.equal(comments.length, 1, "the sentinel must be the only HTML comment");
  assert.match(comments[0], /kcc-ablation-ablate-sentinel: v\d+/);
});

test("every bundled file the skill names exists on disk", async () => {
  const { body } = await readParts();
  const named = [...body.matchAll(/`(scripts\/[\w./-]+|references\/[\w./-]+)`/g)].map(
    (m) => m[1]
  );
  assert.ok(named.includes("scripts/ablate.mjs"), "the arm builder must be named");
  assert.ok(named.includes("references/sealed-run.md"), "the sealing recipe must be named");
  for (const rel of new Set(named)) {
    await stat(path.join(skillDir, rel)).catch(() => {
      assert.fail(`SKILL.md names ${rel}, which does not exist in the skill directory`);
    });
  }
});

// The invariants a future edit must not lose — each one was paid for in
// a real campaign before it became a sentence.
test("ablate SKILL.md keeps the marginal A-vs-B framing", async () => {
  const prose = await readSkillProse();
  assert.match(prose, /full document \(arm A\)/i);
  assert.match(prose, /minus exactly one rule \(arm B\)/i);
  assert.match(prose, /never "injected vs not injected"/i);
});

test("ablate SKILL.md keeps B-first ordering and its cost rationale", async () => {
  const prose = await readSkillProse();
  assert.match(prose, /B runs first/);
  assert.match(prose, /arm A never needs to be paid for/i);
});

test("ablate SKILL.md keeps the void-don't-score gate", async () => {
  const prose = await readSkillProse();
  assert.match(prose, /Void, don't score/);
  assert.match(prose, /never counted as a failure of the rule/i);
});

test("ablate SKILL.md keeps deterministic arm attribution", async () => {
  const prose = await readSkillProse();
  assert.match(prose, /unique sentinel token/i);
  assert.match(prose, /never off model narration/i);
});

test("ablate SKILL.md keeps the asymmetric evidence bar for deletions", async () => {
  const prose = await readSkillProse();
  assert.match(prose, /`no-delta` licenses an irreversible deletion/i);
  assert.match(prose, /two or three distinct task shapes/i);
});

test("ablate SKILL.md keeps the smoke-first rule", async () => {
  const prose = await readSkillProse();
  assert.match(prose, /Smoke the harness first/);
  assert.match(prose, /confident wrong numbers/i);
});

test("ablate SKILL.md is standalone — no orchestrator / teammate language", async () => {
  const body = await readSkill();
  assert.doesNotMatch(body, /teammate/i, "skill must not reference teammate orchestration");
  assert.doesNotMatch(body, /TaskUpdate/, "skill must not drive task orchestration");
});

// The sealing recipe is the part future campaigns copy verbatim; these
// strings are the load-bearing facts that must survive an edit.
test("sealed-run.md keeps its load-bearing recipe facts", async () => {
  const ref = (
    await readFile(path.join(skillDir, "references", "sealed-run.md"), "utf-8")
  ).replace(/\s+/g, " ");
  assert.match(ref, /--permission-mode bypassPermissions/);
  assert.match(ref, /hookSpecificOutput\.additionalContext/);
  assert.match(ref, /hasTrustDialogAccepted/);
  assert.match(ref, /permission_denials.*array/i, "the array-not-number shape must survive");
  assert.match(
    ref,
    /before.*sealing.*`HOME`|Read credentials \*\*before\*\* sealing/i,
    "the auth-before-seal ordering must survive"
  );
  assert.match(ref, /never inside any repository/i, "the cwd rule must survive");
  assert.match(ref, /--bare/, "the why-not---bare note must survive");
});
