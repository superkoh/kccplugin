import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makePluginVariant } from "./seal.mjs";
import { RULES } from "../rules.mjs";

const PLUGINS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "plugins"
);

const scratch = [];
after(() => Promise.all(scratch.map((d) => rm(d, { recursive: true, force: true }))));

async function variantDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "kcc-seal-test-"));
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

// The one principle the worked example ablates, quoted from the real
// SKILL.md so a rewrite of that file breaks this test rather than
// silently turning arm B into a copy of arm A.
const UT_LEAD = "**Hand-derive every expected value**";

test("resolves the plugin root from the rule's own doc, not from one fixed plugin", async () => {
  const core = await makePluginVariant(await variantDir(), {
    pluginsDir: PLUGINS_DIR,
    ruleId: "S1-whole",
    arm: "A",
  });
  const dev = await makePluginVariant(await variantDir(), {
    pluginsDir: PLUGINS_DIR,
    ruleId: "UT-paste",
    arm: "A",
  });
  assert.equal(path.basename(core.pluginDir), "kcc-core");
  assert.equal(path.basename(dev.pluginDir), "kcc-dev-core");
});

test("a context rule still ablates its own doc in place", async () => {
  const v = await makePluginVariant(await variantDir(), {
    pluginsDir: PLUGINS_DIR,
    ruleId: "W6",
    arm: "B",
  });
  const doc = await readFile(path.join(v.pluginDir, "context/thinking-principles.md"), "utf-8");
  assert.ok(v.removedLines > 0);
  assert.ok(!doc.includes("**Inline by default."));
  assert.ok(doc.includes(v.sentinel), "the arm sentinel rides in the injected doc");
});

test("a skill rule delivers the skill body through the file the SessionStart hook reads", async () => {
  const v = await makePluginVariant(await variantDir(), {
    pluginsDir: PLUGINS_DIR,
    ruleId: "UT-paste",
    arm: "A",
  });
  const injected = await readFile(
    path.join(v.pluginDir, "context/dev-principles.md"),
    "utf-8"
  );
  assert.equal(v.removedLines, 0, "arm A removes nothing");
  assert.ok(
    injected.includes("kcc-dev-core.unit-tests"),
    "the delivered text must tell the model which skill is in effect"
  );
  assert.ok(injected.includes(UT_LEAD), "arm A carries the principle");
  assert.ok(
    !injected.includes("description: Use when the user asks"),
    "the skill's YAML frontmatter is registration metadata, not instructions"
  );
  assert.ok(injected.includes(v.sentinel), "arm identity rides in the injected text");
});

test("arm B drops exactly the ablated principle from the delivered skill body", async () => {
  const v = await makePluginVariant(await variantDir(), {
    pluginsDir: PLUGINS_DIR,
    ruleId: "UT-paste",
    arm: "B",
  });
  const injected = await readFile(
    path.join(v.pluginDir, "context/dev-principles.md"),
    "utf-8"
  );
  assert.ok(v.removedLines > 0);
  assert.ok(!injected.includes(UT_LEAD), "the ablated principle must be gone");
  assert.ok(
    injected.includes("**Assert observable behavior only**"),
    "its neighbours must survive"
  );
  assert.ok(injected.includes(v.sentinel));
});

// A variant that still ships skills/ hands arm B the intact principle by
// a second route — the Skill tool, a Read, or a Grep — and the measured
// delta collapses to noise.
test("the intact skill text does not ride along anywhere else in the arm-B variant", async () => {
  const v = await makePluginVariant(await variantDir(), {
    pluginsDir: PLUGINS_DIR,
    ruleId: "UT-paste",
    arm: "B",
  });
  assert.equal(
    await exists(path.join(v.pluginDir, "skills")),
    false,
    "the skills directory must not survive into a skill-delivery variant"
  );
  for (const file of await walkFiles(v.pluginDir)) {
    const body = await readFile(file, "utf-8");
    assert.ok(
      !body.includes(UT_LEAD),
      `${path.relative(v.pluginDir, file)} leaks the ablated principle back into arm B`
    );
  }
});

// A ceiling control strengthens the doc instead of cutting it, so arm B
// removes no lines while still differing from arm A. The guard has to
// admit that: the invariant it protects is "the arms differ", and line
// count is only a proxy for it.
test("an arm B that only ADDS text is a real arm, not a no-op", async () => {
  RULES["UT-additive-fixture"] = {
    doc: RULES["UT-paste"].doc,
    label: "inverted: arm B carries a stronger instruction",
    inverted: true,
    snippet: [{ find: UT_LEAD, with: `${UT_LEAD} — and never skip it` }],
  };
  try {
    const v = await makePluginVariant(await variantDir(), {
      pluginsDir: PLUGINS_DIR,
      ruleId: "UT-additive-fixture",
      arm: "B",
    });
    const injected = await readFile(
      path.join(v.pluginDir, RULES["UT-paste"].doc.via),
      "utf-8"
    );
    assert.equal(v.removedLines, 0, "nothing was cut — that is the point");
    assert.ok(injected.includes("and never skip it"), "the stronger text landed");
    assert.ok(injected.includes(v.sentinel), "arm B stays attributable");
  } finally {
    delete RULES["UT-additive-fixture"];
  }
});

// The measured-content guard exists to stop an accidental RE-ABLATION.
// Arm A ablates nothing, so there is nothing for it to protect there —
// and blocking it makes the intact document unmeasurable, which is how a
// verification run of freshly shipped text died at 5/5 unusable.
test("the measured-content guard does not block arm A", async () => {
  const guarded = Object.entries(RULES).find(
    ([, r]) => r.measuredContent && !r.retired
  );
  assert.ok(guarded, "registry must carry at least one measured-content rule");
  const prev = process.env.KCC_ABLATE_MEASURED;
  delete process.env.KCC_ABLATE_MEASURED;
  try {
    const v = await makePluginVariant(await variantDir(), {
      pluginsDir: PLUGINS_DIR,
      ruleId: guarded[0],
      arm: "A",
    });
    assert.equal(v.removedLines, 0, "arm A is the intact doc");
  } finally {
    if (prev !== undefined) process.env.KCC_ABLATE_MEASURED = prev;
  }
});

test("the measured-content guard still blocks arm B", async () => {
  const guarded = Object.entries(RULES).find(
    ([, r]) => r.measuredContent && !r.retired
  );
  const prev = process.env.KCC_ABLATE_MEASURED;
  delete process.env.KCC_ABLATE_MEASURED;
  try {
    await assert.rejects(
      makePluginVariant(await variantDir(), {
        pluginsDir: PLUGINS_DIR,
        ruleId: guarded[0],
        arm: "B",
      }),
      /measured as load-bearing/
    );
  } finally {
    if (prev !== undefined) process.env.KCC_ABLATE_MEASURED = prev;
  }
});

// The property that stops a drifted anchor from producing two identical
// arms and a confident, wrong "no-delta" verdict.
test("a skill-delivery arm B that removes nothing throws", async () => {
  RULES["UT-noop-fixture"] = {
    doc: RULES["UT-paste"].doc,
    label: "a rule whose ablation was never written",
  };
  try {
    await assert.rejects(
      makePluginVariant(await variantDir(), {
        pluginsDir: PLUGINS_DIR,
        ruleId: "UT-noop-fixture",
        arm: "B",
      }),
      /removed nothing|identical/i
    );
  } finally {
    delete RULES["UT-noop-fixture"];
  }
});

// Every registered skill rule is executed against the real SKILL.md it
// names. An anchor that drifts out of the doc fails here, offline and
// free, instead of at campaign time after the API spend.
for (const [id, rule] of Object.entries(RULES)) {
  if (rule.doc?.deliver !== "skill" || rule.retired) continue;
  test(`${id} still ablates a real block of ${rule.doc.path}`, async () => {
    // A measured-content rule is guarded against accidental campaign use, but
    // checking its anchor still matches is exactly the deliberate act the
    // guard's escape hatch is for — drift there should fail here, offline,
    // not at campaign time.
    const guarded = Boolean(rule.measuredContent);
    const prev = process.env.KCC_ABLATE_MEASURED;
    if (guarded) process.env.KCC_ABLATE_MEASURED = "1";
    let v;
    try {
      v = await makePluginVariant(await variantDir(), {
        pluginsDir: PLUGINS_DIR,
        ruleId: id,
        arm: "B",
      });
    } finally {
      if (guarded) {
        if (prev === undefined) delete process.env.KCC_ABLATE_MEASURED;
        else process.env.KCC_ABLATE_MEASURED = prev;
      }
    }
    const injected = await readFile(path.join(v.pluginDir, rule.doc.via), "utf-8");
    // No line-count assertion here on purpose. "Arm B removed lines" is a
    // proxy, and a wrong one for the two shapes that legitimately cut
    // nothing: a ceiling control that only strengthens the doc, and a rule
    // whose ablation rewrites a clause in place. The invariant that matters
    // — arm B differs from arm A — is enforced inside makeDocVariant, which
    // throws, so reaching this line already proves it. The test above
    // ("removes nothing throws") is what guards that check itself.
    assert.ok(injected.includes(v.sentinel), "arm B stays attributable");
  });
}
