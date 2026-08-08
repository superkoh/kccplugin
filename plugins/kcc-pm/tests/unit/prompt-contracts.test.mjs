/**
 * L2 contract tests for kcc-pm's three prompt documents — the charter
 * (injected), the onboard command, and the playbook skill — plus the
 * bundled methodology references.
 *
 * These invariants are what future edits (including ablation-driven
 * trims) must not lose. Prose assertions run against
 * whitespace-collapsed text so re-wrapping never turns into a red test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");
const referencesDir = path.join(pluginRoot, "skills", "pm-playbook", "references");

const read = (...p) => readFile(path.join(pluginRoot, ...p), "utf-8");
const collapse = (s) => s.replace(/\s+/g, " ");

// ------------------------------------------------- charter (in the skill)

test("skill charter carries its sections in order", async () => {
  const text = await read("skills", "pm-playbook", "SKILL.md");
  const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const want = [
    "铁律（每个任务开始前默过一遍）",
    "证据纪律",
    "输出规范",
    "工作台规约",
    "任务 → 工作流",
    "角色手册",
  ];
  assert.deepEqual(
    headings,
    want,
    "skill sections changed — if deliberate, update this contract"
  );
});

test("skill charter has exactly 10 iron laws (post-ablation)", async () => {
  const text = await read("skills", "pm-playbook", "SKILL.md");
  const section = text.split("## 铁律")[1].split("## ")[0];
  const laws = section.match(/^\d+\. \*\*/gm) ?? [];
  assert.equal(
    laws.length,
    10,
    "铁律 count is measured, not stylistic — changing it means a new ablation round, then update this contract"
  );
});

// Zero session-start footprint is the load-bearing design decision:
// PM prompts must never auto-load in a non-PM session, so the plugin
// ships NO hooks at all and the persona reaches context only via the
// task-scoped skill, the dispatchable agent, or the explicit command.
test("plugin ships no hooks — no session-start injection channel exists", async () => {
  await assert.rejects(
    stat(path.join(pluginRoot, "hooks")),
    "a hooks/ directory would reintroduce session-scoped injection — that design was deliberately removed"
  );
});

test("pm agent is a thin shell that defers to the single-source charter", async () => {
  const text = await read("agents", "pm.md");
  assert.match(text, /kcc-pm:pm-playbook/, "the agent must load the charter via the skill");
  assert.match(text, /\.kcc-pm\.json/, "the agent must locate the workspace context");
  assert.ok(
    text.length < 1500,
    `agent shell must stay thin (${text.length} chars) — charter content belongs in the skill only`
  );
  assert.doesNotMatch(
    text,
    /产品的 CEO|二选一是陷阱|数字必须带籍贯/,
    "charter rules must not be duplicated into the agent — single source in SKILL.md"
  );
});

// The invariants below are the rules the pm-r2 campaign measured as
// load-bearing (or rewrote after measuring the original text as
// ineffective) — each anchor here was paid for in ~400 Opus runs.
test("skill charter keeps the measured load-bearing rules", async () => {
  const prose = collapse(await read("skills", "pm-playbook", "SKILL.md"));
  assert.match(prose, /反指标/, "counter-metric rule measured effective (A 5/5 vs B 0/5) — must survive");
  assert.match(prose, /当场沉淀/, "persist-facts rule measured effective (9/10 vs 1/10) — must survive");
  assert.match(prose, /数字必须带籍贯/, "the E02 rewrite measured effective (9/10 vs 3/10) — must survive");
  assert.match(prose, /二选一是陷阱/, "the L11 rewrite measured effective (4/5 vs 0/5) — must survive");
});

// ---------------------------------------------------------------- onboard

test("onboard command keeps the field-tested interview mechanics", async () => {
  const prose = collapse(await read("commands", "onboard.md"));
  assert.match(prose, /每批 ≤5 个问题/, "question batching must survive");
  assert.match(prose, /材料清单单独列，不占问题预算/, "materials-list separation must survive");
  assert.match(prose, /Mom Test/, "interview discipline must survive");
  assert.match(prose, /'没有'本身也是重要信息/, "absence-is-information must survive");
  assert.match(prose, /增量模式/, "re-run incremental mode must survive");
});

test("onboard command writes the five context slots plus the marker", async () => {
  const prose = collapse(await read("commands", "onboard.md"));
  for (const f of ["org.md", "baselines.md", "market.md", "findings.md", "capabilities.md"]) {
    assert.match(prose, new RegExp(`pm/${f}`), `${f} slot must survive`);
  }
  assert.match(prose, /\.kcc-pm\.json/, "the injection marker must survive");
});

// ---------------------------------------------------------------- playbook

test("playbook description keeps bilingual triggers and the standalone boundary", async () => {
  const raw = await read("skills", "pm-playbook", "SKILL.md");
  assert.ok(raw.startsWith("---\n"));
  const frontmatter = raw.slice(4, raw.indexOf("\n---\n", 3));
  assert.match(frontmatter, /排优先级/, "Chinese triggers must survive");
  assert.match(frontmatter, /prioritize/i, "English triggers must survive");
  assert.match(frontmatter, /Standalone capability/);
});

test("playbook router table has 12 task rows and every cited reference exists", async () => {
  const raw = await read("skills", "pm-playbook", "SKILL.md");
  const rows = raw
    .split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("| 接到的任务") && !l.startsWith("|---"));
  assert.equal(rows.length, 12, "router must keep 12 task rows — deliberate changes update this contract");

  const cited = new Set();
  for (const row of rows) {
    for (const m of row.matchAll(/([a-z][a-z-]*\.md)/g)) cited.add(m[1]);
  }
  assert.ok(cited.size >= 8, "router rows must cite reference files");
  for (const f of cited) {
    await stat(path.join(referencesDir, f)).catch(() => {
      assert.fail(`router cites references/${f}, which does not exist`);
    });
  }
});

test("playbook sentinel is present", async () => {
  const raw = await read("skills", "pm-playbook", "SKILL.md");
  assert.match(raw, /kcc-pm-playbook-sentinel: v\d+/);
});

// ------------------------------------------------------------- references

test("the 11 methodology references exist and no stale cross-links remain", async () => {
  const expected = [
    "product-manager.md",
    "product-operations.md",
    "discovery.md",
    "strategy.md",
    "prioritization.md",
    "metrics-experiments.md",
    "growth-operations.md",
    "monetization.md",
    "gtm-launch.md",
    "writing.md",
    "ai-era.md",
  ];
  const onDisk = (await readdir(referencesDir)).filter((f) => f.endsWith(".md"));
  assert.deepEqual(onDisk.sort(), [...expected].sort());

  for (const f of onDisk) {
    const text = await readFile(path.join(referencesDir, f), "utf-8");
    assert.doesNotMatch(
      text,
      /\]\(\.\.\//,
      `${f} still links outside references/ — the library must be self-contained`
    );
  }
});

