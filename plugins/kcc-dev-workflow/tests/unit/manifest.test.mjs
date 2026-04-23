import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

const EXPECTED_SKILLS = [
  "plan-feature",
  "build-feature",
  "step-brainstorm",
  "step-spec-writer",
  "step-ui-ux-designer",
  "step-ac-writer",
  "step-spec-ac-reviewer",
  "step-test-case-writer",
  "step-test-case-reviewer",
];

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error("no frontmatter block");
  return yaml.load(m[1]);
}

test("plugin.json parses and name matches directory", async () => {
  const raw = await readFile(
    path.join(pluginRoot, ".claude-plugin", "plugin.json"),
    "utf-8"
  );
  const manifest = JSON.parse(raw);
  assert.equal(manifest.name, "kcc-dev-workflow");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("all 8 expected skills exist as SKILL.md files", async () => {
  for (const name of EXPECTED_SKILLS) {
    const skillPath = path.join(pluginRoot, "skills", name, "SKILL.md");
    const st = await stat(skillPath);
    assert.ok(st.isFile(), `expected skill file at ${skillPath}`);
  }
});

test("step-* skills are marked orchestrator-only in description", async () => {
  const stepSkills = EXPECTED_SKILLS.filter((n) => n.startsWith("step-"));
  for (const name of stepSkills) {
    const raw = await readFile(
      path.join(pluginRoot, "skills", name, "SKILL.md"),
      "utf-8"
    );
    const fm = parseFrontmatter(raw);
    assert.ok(typeof fm.description === "string", `${name}: description must be a string`);
    assert.ok(
      /orchestrator-only|do not invoke directly/i.test(fm.description),
      `${name}: description must mark as orchestrator-only; got: ${fm.description}`
    );
  }
});

test("plan-feature description contains Chinese and English trigger keywords", async () => {
  const raw = await readFile(
    path.join(pluginRoot, "skills", "plan-feature", "SKILL.md"),
    "utf-8"
  );
  const fm = parseFrontmatter(raw);
  const desc = fm.description;
  assert.ok(typeof desc === "string", "description must be a string");
  assert.ok(desc.length >= 60, `description should be substantive (>=60 chars); got ${desc.length}`);
  assert.ok(/规划|spec/i.test(desc), "description must include a Chinese or 'spec' trigger");
  assert.ok(/plan/i.test(desc), "description must include an English 'plan' trigger");
});

test("build-feature description marks it as placeholder / not yet implemented", async () => {
  const raw = await readFile(
    path.join(pluginRoot, "skills", "build-feature", "SKILL.md"),
    "utf-8"
  );
  const fm = parseFrontmatter(raw);
  assert.ok(
    /placeholder|not yet implemented|尚未实现/i.test(fm.description),
    `build-feature description must mark as placeholder; got: ${fm.description}`
  );
});
