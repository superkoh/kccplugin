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
const VALID_MATCH = new Set(["exact-string", "color-equal", "numeric", "regex"]);
const TRIGGER_KEYS = ["security", "i18n", "performance"];
const REQUIRED_TOP = [
  "feature",
  "platform",
  "ui_change",
  "cases",
  "generated_by",
  "design_tokens_source",
  "coverage_triggers",
  "rtm_summary",
];
const REQUIRED_CASE = [
  "id",
  "title",
  "priority",
  "requirement_ref",
  "tags",
  "preconditions",
  "steps",
  "testability",
  "cleanup",
];
const REQUIRED_TESTABILITY = [
  "oracle_present",
  "state_reachable",
  "deterministic",
  "isolated",
  "has_explicit_wait",
  "wait_spec",
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

test("each example has required top-level keys, a valid platform, and trigger flags", async () => {
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
    for (const k of TRIGGER_KEYS) {
      assert.equal(
        typeof doc.coverage_triggers[k],
        "boolean",
        `${file} coverage_triggers.${k} must be a boolean`
      );
    }
    assert.ok(
      doc.rtm_summary &&
        typeof doc.rtm_summary.requirement_branches_total === "number" &&
        typeof doc.rtm_summary.requirement_branches_covered === "number" &&
        Array.isArray(doc.rtm_summary.uncovered_branches) &&
        Array.isArray(doc.rtm_summary.unreferenced_cases),
      `${file} rtm_summary missing one of its required fields`
    );
    assert.ok(
      doc.rtm_summary.requirement_branches_covered <=
        doc.rtm_summary.requirement_branches_total,
      `${file} rtm_summary.requirement_branches_covered > total`
    );
    assert.equal(
      doc.rtm_summary.unreferenced_cases.length,
      0,
      `${file} rtm_summary.unreferenced_cases must be empty — every case must cite a requirement sub-clause`
    );
  }
});

test("each case inside every example has the required fields and a non-empty requirement_ref", async () => {
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
        typeof c.requirement_ref === "string" && c.requirement_ref.length > 0,
        `${file} cases[${i}] (id=${c.id}) requirement_ref must be a non-empty string`
      );
      assert.ok(
        c.requirement_ref !== doc.requirement_ref,
        `${file} cases[${i}] (id=${c.id}) requirement_ref must cite a sub-clause, not duplicate the file-level ref`
      );
      assert.ok(
        Array.isArray(c.tags) && c.tags.length >= 1,
        `${file} cases[${i}] (id=${c.id}) tags must be a non-empty array`
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
        const oracleIsString = typeof s.oracle === "string" && s.oracle.length > 0;
        const oracleIsArray =
          Array.isArray(s.oracle) &&
          s.oracle.length >= 1 &&
          s.oracle.every((o) => typeof o === "string" && o.length > 0);
        assert.ok(
          oracleIsString || oracleIsArray,
          `${file} cases[${i}].steps[${j}] oracle must be a non-empty string or non-empty string array`
        );
      }
      for (const tk of REQUIRED_TESTABILITY) {
        assert.ok(
          tk in c.testability,
          `${file} cases[${i}] (id=${c.id}) testability missing "${tk}"`
        );
      }
      assert.equal(
        typeof c.testability.has_explicit_wait,
        "boolean",
        `${file} cases[${i}] (id=${c.id}) testability.has_explicit_wait must be a boolean`
      );
      assert.ok(
        typeof c.testability.wait_spec === "string" &&
          c.testability.wait_spec.length > 0,
        `${file} cases[${i}] (id=${c.id}) testability.wait_spec must be a non-empty string`
      );
    }
  }
});

test("ui_change is boolean and the visual-assertion presence is consistent with it", async () => {
  const examples = await loadExamples();
  for (const { file, doc } of examples) {
    assert.equal(
      typeof doc.ui_change,
      "boolean",
      `${file} ui_change must be a boolean, got ${typeof doc.ui_change}`
    );
    const casesWithVisual = doc.cases.filter(
      (c) => Array.isArray(c.assertions?.visual) && c.assertions.visual.length > 0
    );
    if (doc.ui_change === true) {
      assert.ok(
        casesWithVisual.length >= 1,
        `${file} declares ui_change=true but no case carries assertions.visual[]`
      );
    } else {
      assert.equal(
        casesWithVisual.length,
        0,
        `${file} declares ui_change=false but ${casesWithVisual.length} case(s) carry assertions.visual[]: ${casesWithVisual.map((c) => c.id).join(", ")}`
      );
    }
  }
});

test("every visual assertion is pure Form A or pure Form B (no mixed fields, no missing required fields)", async () => {
  const examples = await loadExamples();
  const formAKeys = ["property", "expected_value", "match"];
  const formBKeys = ["description", "judge_by"];
  for (const { file, doc } of examples) {
    for (const c of doc.cases) {
      const vs = c.assertions?.visual ?? [];
      for (const [k, v] of vs.entries()) {
        const hasA = formAKeys.some((x) => x in v);
        const hasB = formBKeys.some((x) => x in v);
        assert.ok(
          hasA !== hasB,
          `${file} ${c.id} visual[${k}] must be pure Form A or Form B, not mixed/empty`
        );
        assert.ok(
          typeof v.target === "string" && v.target.length > 0,
          `${file} ${c.id} visual[${k}] missing non-empty "target"`
        );
        if (hasA) {
          for (const x of formAKeys) {
            assert.ok(
              x in v,
              `${file} ${c.id} visual[${k}] Form A missing "${x}"`
            );
          }
          assert.ok(
            VALID_MATCH.has(v.match),
            `${file} ${c.id} visual[${k}] invalid match "${v.match}"`
          );
        } else {
          for (const x of formBKeys) {
            assert.ok(
              x in v,
              `${file} ${c.id} visual[${k}] Form B missing "${x}"`
            );
          }
          assert.equal(
            v.judge_by,
            "llm-vision",
            `${file} ${c.id} visual[${k}] Form B judge_by must be "llm-vision"`
          );
          assert.ok(
            typeof v.description === "string" && v.description.length > 20,
            `${file} ${c.id} visual[${k}] Form B description must be an operational prose string`
          );
        }
      }
    }
  }
});

test("no oracle or Form B description matches the three language blacklists", async () => {
  const examples = await loadExamples();
  const L1 = [
    /看起来.*(对|正常|好)/,
    /nicely|properly|clearly|correctly|appropriate/i,
    /合适的|漂亮的|明显的/,
  ];
  const L2 = [
    /仍然|没变化|和之前一样|保持原样|没改/,
    /similar to|same as (before|the previous)|unchanged/i,
    /类似|差不多|一样的/,
  ];
  const L3 = [
    /更(紧凑|柔和|大|小|明显|清晰)/,
    /(略|稍微)(大|小|紧|宽|窄)/,
    /slightly (larger|smaller|tighter|wider|narrower)/i,
    /a bit (more|less)/i,
  ];
  const allLists = [
    ["L1 vague", L1],
    ["L2 baseline-implying", L2],
    ["L3 reference-free comparative", L3],
  ];
  for (const { file, doc } of examples) {
    for (const c of doc.cases) {
      const bodies = [];
      for (const s of c.steps) {
        if (Array.isArray(s.oracle)) bodies.push(...s.oracle);
        else bodies.push(s.oracle);
      }
      for (const v of c.assertions?.visual ?? []) {
        if (typeof v.description === "string") bodies.push(v.description);
      }
      for (const body of bodies) {
        for (const [label, list] of allLists) {
          for (const re of list) {
            assert.ok(
              !re.test(body),
              `${file} ${c.id} oracle/description matches ${label} pattern ${re}: ${body}`
            );
          }
        }
      }
    }
  }
});

test("coverage_triggers.true implies at least one case tagged with the matching keyword", async () => {
  const examples = await loadExamples();
  for (const { file, doc } of examples) {
    for (const k of TRIGGER_KEYS) {
      if (doc.coverage_triggers[k] === true) {
        const tagged = doc.cases.filter((c) => (c.tags ?? []).includes(k));
        assert.ok(
          tagged.length >= 1,
          `${file} coverage_triggers.${k}=true but no case has tags including "${k}"`
        );
      }
    }
  }
});
