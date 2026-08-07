import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { makeDocVariant, makeSealedWorkspace } from "../../skills/ablate/scripts/seal.mjs";

// A synthetic plugin fixture, so these tests pin the variant-builder's
// contract without coupling to any real plugin's rule registry.

// Deliberately shares no rule text with the SKILL.md fixture below: the
// arm-B leak check walks every file in the variant, and a fixture that
// duplicated a rule across docs would report a false leak.
const PRINCIPLES = [
  "# Demo principles",
  "",
  "- **Alpha** — State assumptions before acting on them.",
  "- **Beta** — Prefer the smallest reversible step.",
  "",
  "<!-- demo-plugin-sentinel: v1 -->",
  "",
].join("\n");

const SKILL = [
  "---",
  "description: Use when tidying.",
  "---",
  "# Tidying",
  "",
  "- **Tidy first** — Leave the campsite cleaner than you found it.",
  "- **Small steps** — Ship one reviewable change at a time.",
  "",
  "<!-- demo-plugin-tidy-sentinel: v1 -->",
  "",
].join("\n");

const CONTEXT_RULE = {
  doc: { plugin: "demo-plugin", path: "context/principles.md", deliver: "context" },
  label: "alpha (context)",
  anchor: /^- \*\*Alpha\*\*/,
};

const SKILL_RULE = {
  doc: {
    plugin: "demo-plugin",
    path: "skills/tidy/SKILL.md",
    deliver: "skill",
    via: "context/injected.md",
    skill: "demo-plugin:tidy",
  },
  label: "tidy-first (skill)",
  anchor: /^- \*\*Tidy first\*\*/,
};

let pluginsDir;
const scratch = [];
before(async () => {
  pluginsDir = await mkdtemp(path.join(tmpdir(), "kcc-ablation-fixture-"));
  scratch.push(pluginsDir);
  const root = path.join(pluginsDir, "demo-plugin");
  await mkdir(path.join(root, "context"), { recursive: true });
  await mkdir(path.join(root, "skills", "tidy"), { recursive: true });
  await writeFile(path.join(root, "context", "principles.md"), PRINCIPLES);
  await writeFile(path.join(root, "context", "injected.md"), "placeholder the hook injects\n");
  await writeFile(path.join(root, "skills", "tidy", "SKILL.md"), SKILL);
});
after(() => Promise.all(scratch.map((d) => rm(d, { recursive: true, force: true }))));

async function variantDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "kcc-ablation-seal-test-"));
  scratch.push(dir);
  return dir;
}

async function walkFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(full)));
    else out.push(full);
  }
  return out;
}

const exists = (p) =>
  stat(p).then(
    () => true,
    () => false
  );

test("a context rule ablates its own doc in place, leaving neighbours intact", async () => {
  const v = await makeDocVariant(await variantDir(), {
    pluginsDir,
    rule: CONTEXT_RULE,
    ruleId: "tidy",
    arm: "B",
  });
  const doc = await readFile(path.join(v.pluginDir, "context/principles.md"), "utf-8");
  assert.ok(v.removedLines > 0);
  assert.ok(!doc.includes("**Alpha**"), "the ablated rule must be gone");
  assert.ok(doc.includes("**Beta**"), "its neighbour must survive");
  assert.ok(doc.includes(v.sentinel), "the arm sentinel rides in the injected doc");
});

test("arm A keeps the rule and removes nothing, but still gets its own sentinel", async () => {
  const v = await makeDocVariant(await variantDir(), {
    pluginsDir,
    rule: CONTEXT_RULE,
    ruleId: "tidy",
    arm: "A",
  });
  const doc = await readFile(path.join(v.pluginDir, "context/principles.md"), "utf-8");
  assert.equal(v.removedLines, 0, "arm A removes nothing");
  assert.ok(doc.includes("**Alpha**"));
  assert.ok(doc.includes(v.sentinel));
});

test("the two arms of one rule carry distinct sentinels", async () => {
  const a = await makeDocVariant(await variantDir(), {
    pluginsDir,
    rule: CONTEXT_RULE,
    ruleId: "tidy",
    arm: "A",
  });
  const b = await makeDocVariant(await variantDir(), {
    pluginsDir,
    rule: CONTEXT_RULE,
    ruleId: "tidy",
    arm: "B",
  });
  assert.notEqual(a.sentinel, b.sentinel, "identical sentinels make the arms indistinguishable");
});

test("a skill rule delivers the body through the file the hook injects, frontmatter stripped", async () => {
  const v = await makeDocVariant(await variantDir(), {
    pluginsDir,
    rule: SKILL_RULE,
    ruleId: "tidy-skill",
    arm: "A",
  });
  const injected = await readFile(path.join(v.pluginDir, "context/injected.md"), "utf-8");
  assert.ok(
    injected.includes("demo-plugin:tidy"),
    "the delivered text must tell the model which skill is in effect"
  );
  assert.ok(injected.includes("**Tidy first**"), "arm A carries the principle");
  assert.ok(
    !injected.includes("description: Use when tidying."),
    "the skill's YAML frontmatter is registration metadata, not instructions"
  );
  assert.ok(injected.includes(v.sentinel), "arm identity rides in the injected text");
});

// A variant that still ships skills/ hands arm B the intact principle by
// a second route — the Skill tool, a Read, or a Grep — and the measured
// delta collapses to noise.
test("the intact skill text does not ride along anywhere else in the arm-B variant", async () => {
  const v = await makeDocVariant(await variantDir(), {
    pluginsDir,
    rule: SKILL_RULE,
    ruleId: "tidy-skill",
    arm: "B",
  });
  assert.ok(v.removedLines > 0);
  assert.equal(
    await exists(path.join(v.pluginDir, "skills")),
    false,
    "the skills directory must not survive into a skill-delivery variant"
  );
  for (const file of await walkFiles(v.pluginDir)) {
    const body = await readFile(file, "utf-8");
    assert.ok(
      !body.includes("**Tidy first**"),
      `${path.relative(v.pluginDir, file)} leaks the ablated principle back into arm B`
    );
  }
});

// The property that stops a drifted anchor from producing two identical
// arms and a confident, wrong "no-delta" verdict.
test("an arm B that removes nothing throws", async () => {
  await assert.rejects(
    makeDocVariant(await variantDir(), {
      pluginsDir,
      rule: { doc: SKILL_RULE.doc, label: "a rule whose ablation was never written" },
      ruleId: "noop",
      arm: "B",
    }),
    /removed nothing|identical/i
  );
});

test("a sealed workspace pre-accepts trust for exactly its own project dir", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "kcc-ablation-ws-test-"));
  scratch.push(runDir);
  const ws = await makeSealedWorkspace(runDir);
  assert.equal(ws.env.CLAUDE_CONFIG_DIR, ws.configDir);
  assert.equal(ws.env.HOME, ws.homeDir);
  const cfg = JSON.parse(await readFile(path.join(ws.configDir, ".claude.json"), "utf-8"));
  assert.deepEqual(cfg, { projects: { [ws.projectDir]: { hasTrustDialogAccepted: true } } });
});
