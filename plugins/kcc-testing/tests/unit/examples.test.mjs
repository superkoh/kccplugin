import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");
const examplesDir = path.join(pluginRoot, "skills", "write-test-cases", "examples");

const VALID_PLATFORMS = new Set(["web", "ios", "android", "desktop"]);
const VALID_PRIORITIES = new Set(["P0", "P1", "P2"]);
const REQUIRED_TOP = ["feature", "platform", "cases", "generated_by"];
const REQUIRED_CASE = [
  "id",
  "title",
  "priority",
  "preconditions",
  "steps",
  "testability",
];

async function loadExamples() {
  const entries = await readdir(examplesDir);
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml"));
  return Promise.all(
    yamlFiles.map(async (f) => {
      const raw = await readFile(path.join(examplesDir, f), "utf-8");
      return { file: f, doc: yaml.load(raw) };
    })
  );
}

test("at least three example YAMLs ship with the skill", async () => {
  const examples = await loadExamples();
  assert.ok(
    examples.length >= 3,
    `expected >=3 examples, got ${examples.length}: ${examples.map((e) => e.file)}`
  );
});

test("every example covers a distinct platform among web/ios/android", async () => {
  const examples = await loadExamples();
  const platforms = new Set(examples.map((e) => e.doc.platform));
  for (const p of ["web", "ios", "android"]) {
    assert.ok(
      platforms.has(p),
      `examples/ must include a ${p} platform example; have: ${[...platforms].join(", ")}`
    );
  }
});

test("each example has required top-level keys and a valid platform", async () => {
  const examples = await loadExamples();
  for (const { file, doc } of examples) {
    for (const key of REQUIRED_TOP) {
      assert.ok(key in doc, `${file} missing top-level key "${key}"`);
    }
    assert.ok(
      VALID_PLATFORMS.has(doc.platform),
      `${file} has invalid platform "${doc.platform}"`
    );
    assert.ok(Array.isArray(doc.cases), `${file} cases must be an array`);
    assert.ok(doc.cases.length > 0, `${file} must ship at least one case`);
  }
});

test("each case inside every example has the required fields", async () => {
  const examples = await loadExamples();
  for (const { file, doc } of examples) {
    for (const [i, c] of doc.cases.entries()) {
      for (const key of REQUIRED_CASE) {
        assert.ok(
          key in c,
          `${file} cases[${i}] (id=${c.id ?? "?"}) missing "${key}"`
        );
      }
      assert.ok(
        VALID_PRIORITIES.has(c.priority),
        `${file} cases[${i}] invalid priority "${c.priority}"`
      );
      assert.ok(
        Array.isArray(c.steps) && c.steps.length >= 1,
        `${file} cases[${i}] steps must be a non-empty array`
      );
      for (const [j, s] of c.steps.entries()) {
        assert.ok(
          typeof s.action === "string" && s.action.length > 0,
          `${file} cases[${i}].steps[${j}] missing "action"`
        );
        assert.ok(
          typeof s.oracle === "string" && s.oracle.length > 0,
          `${file} cases[${i}].steps[${j}] missing "oracle" — every step needs exactly one expected result`
        );
      }
    }
  }
});

test("no case contains visual-vague language in oracles or visual expected values", async () => {
  const examples = await loadExamples();
  const blacklist = [
    /看起来.*(对|正常|好)/,
    /nicely|properly|clearly|correctly|appropriate/i,
    /合适的|漂亮的|明显的/,
    /similar to|类似|差不多/,
  ];
  for (const { file, doc } of examples) {
    for (const [i, c] of doc.cases.entries()) {
      const bodies = [];
      for (const s of c.steps) bodies.push(s.oracle);
      if (c.assertions?.visual) {
        for (const v of c.assertions.visual)
          bodies.push(String(v.expected ?? ""));
      }
      for (const body of bodies) {
        for (const re of blacklist) {
          assert.ok(
            !re.test(body),
            `${file} cases[${i}] (id=${c.id}) matches vague pattern ${re}: ${body}`
          );
        }
      }
    }
  }
});
