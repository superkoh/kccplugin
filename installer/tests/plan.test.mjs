import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computePlan,
  lockFromPlan,
  parseSelectionAnswer,
  resolveSelection,
  verifyAgainstLock,
} from "../lib/plan.mjs";
import { sameManagedHooks } from "../lib/settings.mjs";

const P_SKILL = ".claude/skills/mod-a:spec/SKILL.md";
const P_SCRIPT = ".claude/kcc/mod-a/scripts/run.sh";

function mod(name, files, { version = "1.0.0", hooks = {}, requires = [] } = {}) {
  return {
    name,
    version,
    description: `${name} description`,
    requires,
    files: new Map(
      Object.entries(files).map(([p, hash]) => [p, { sourceAbs: `/src/${name}/${p}`, hash }])
    ),
    hooks,
  };
}

function source(...mods) {
  return new Map(mods.map((m) => [m.name, m]));
}

function statusOf(plan, path) {
  return plan.files.find((f) => f.path === path)?.status;
}

test("a fresh install marks every file new", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", { [P_SKILL]: "h1", [P_SCRIPT]: "h2" })),
    selection: ["mod-a"],
    lock: null,
    diskHashes: new Map(),
  });
  assert.equal(plan.files.length, 2);
  assert.ok(plan.files.every((f) => f.status === "new"));
  assert.deepEqual(plan.modules.added, ["mod-a"]);
  assert.equal(plan.removals.length, 0);
});

test("re-running with nothing changed is a no-op", () => {
  const sourceModules = source(mod("mod-a", { [P_SKILL]: "h1" }));
  const lock = { modules: { "mod-a": { version: "1.0.0", files: { [P_SKILL]: "h1" } } } };
  const plan = computePlan({
    sourceModules,
    selection: ["mod-a"],
    lock,
    diskHashes: new Map([[P_SKILL, "h1"]]),
  });
  assert.equal(statusOf(plan, P_SKILL), "unchanged");
  assert.equal(plan.writes.length, 0);
});

test("an upstream change to an untouched file is an update", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", { [P_SKILL]: "h2" }, { version: "1.1.0" })),
    selection: ["mod-a"],
    lock: { modules: { "mod-a": { version: "1.0.0", files: { [P_SKILL]: "h1" } } } },
    diskHashes: new Map([[P_SKILL, "h1"]]),
  });
  assert.equal(statusOf(plan, P_SKILL), "updated");
  assert.deepEqual(plan.modules.upgraded, [{ name: "mod-a", from: "1.0.0", to: "1.1.0" }]);
});

test("a locally modified file is overwritten, and flagged so it can be backed up", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", { [P_SKILL]: "h2" })),
    selection: ["mod-a"],
    lock: { modules: { "mod-a": { version: "1.0.0", files: { [P_SKILL]: "h1" } } } },
    diskHashes: new Map([[P_SKILL, "LOCAL-EDIT"]]),
  });
  assert.equal(statusOf(plan, P_SKILL), "clobbered");
  assert.equal(plan.clobbered.length, 1);
});

test("a local edit that happens to match the new upstream content writes nothing", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", { [P_SKILL]: "h2" })),
    selection: ["mod-a"],
    lock: { modules: { "mod-a": { version: "1.0.0", files: { [P_SKILL]: "h1" } } } },
    diskHashes: new Map([[P_SKILL, "h2"]]),
  });
  assert.equal(statusOf(plan, P_SKILL), "unchanged");
  assert.equal(plan.clobbered.length, 0);
});

test("a managed file the user deleted is restored", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", { [P_SKILL]: "h1" })),
    selection: ["mod-a"],
    lock: { modules: { "mod-a": { version: "1.0.0", files: { [P_SKILL]: "h1" } } } },
    diskHashes: new Map(),
  });
  assert.equal(statusOf(plan, P_SKILL), "restored");
});

test("an untracked file sitting at a managed path is a conflict, not a silent clobber", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", { [P_SKILL]: "h1" })),
    selection: ["mod-a"],
    lock: null,
    diskHashes: new Map([[P_SKILL, "SOMEONE-ELSES-FILE"]]),
  });
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].path, P_SKILL);
  assert.equal(plan.files.length, 0, "a conflicting file must not be planned for writing");
});

test("--adopt converts a conflict into a backed-up overwrite", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", { [P_SKILL]: "h1" })),
    selection: ["mod-a"],
    lock: null,
    diskHashes: new Map([[P_SKILL, "SOMEONE-ELSES-FILE"]]),
    opts: { adopt: true },
  });
  assert.equal(plan.conflicts.length, 0);
  assert.equal(statusOf(plan, P_SKILL), "clobbered");
});

test("an untracked file with identical content is adopted silently", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", { [P_SKILL]: "h1" })),
    selection: ["mod-a"],
    lock: null,
    diskHashes: new Map([[P_SKILL, "h1"]]),
  });
  assert.equal(plan.conflicts.length, 0);
  assert.equal(statusOf(plan, P_SKILL), "unchanged");
});

test("a file that vanished upstream is removed as an orphan", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", { [P_SKILL]: "h1" })),
    selection: ["mod-a"],
    lock: {
      modules: {
        "mod-a": { version: "1.0.0", files: { [P_SKILL]: "h1", ".claude/skills/mod-a:old/SKILL.md": "h9" } },
      },
    },
    diskHashes: new Map([[P_SKILL, "h1"], [".claude/skills/mod-a:old/SKILL.md", "h9"]]),
  });
  assert.deepEqual(
    plan.removals.map((r) => [r.path, r.reason]),
    [[".claude/skills/mod-a:old/SKILL.md", "orphan"]]
  );
});

test("deselecting a module removes its files (the selection is declarative)", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", { [P_SKILL]: "h1" }), mod("mod-b", { "x": "h5" })),
    selection: ["mod-a"],
    lock: {
      modules: {
        "mod-a": { version: "1.0.0", files: { [P_SKILL]: "h1" } },
        "mod-b": { version: "1.0.0", files: { x: "h5" } },
      },
    },
    diskHashes: new Map([[P_SKILL, "h1"], ["x", "h5"]]),
  });
  assert.deepEqual(plan.modules.removed, ["mod-b"]);
  assert.deepEqual(plan.removals.map((r) => [r.path, r.reason]), [["x", "module-removed"]]);
});

test("a module deleted upstream is still uninstallable from the lock alone", () => {
  // The source no longer offers mod-b at all; the removal must come from the
  // lockfile, not from the (now absent) source module.
  const plan = computePlan({
    sourceModules: source(mod("mod-a", { [P_SKILL]: "h1" })),
    selection: ["mod-a"],
    lock: {
      modules: {
        "mod-a": { version: "1.0.0", files: { [P_SKILL]: "h1" } },
        "mod-b": { version: "1.0.0", files: { "gone.md": "h5" } },
      },
    },
    diskHashes: new Map([[P_SKILL, "h1"], ["gone.md", "h5"]]),
  });
  assert.deepEqual(plan.removals.map((r) => r.path), ["gone.md"]);
});

test("removing a locally modified file flags it for backup", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", {})),
    selection: ["mod-a"],
    lock: { modules: { "mod-a": { version: "1.0.0", files: { "z.md": "h1" } } } },
    diskHashes: new Map([["z.md", "EDITED"]]),
  });
  assert.equal(plan.removals[0].locallyModified, true);
});

test("a file already gone is not scheduled for removal", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", {})),
    selection: ["mod-a"],
    lock: { modules: { "mod-a": { version: "1.0.0", files: { "z.md": "h1" } } } },
    diskHashes: new Map(),
  });
  assert.equal(plan.removals.length, 0);
});

test("an unknown module name is a hard error, not a silent no-op", () => {
  assert.throws(
    () =>
      computePlan({
        sourceModules: source(mod("mod-a", {})),
        selection: ["typo"],
        lock: null,
        diskHashes: new Map(),
      }),
    /unknown module/
  );
});

test("hook entries from every selected module are aggregated in module order", () => {
  const hooksA = { SessionStart: [{ hooks: [{ type: "command", command: "a" }] }] };
  const hooksB = {
    SessionStart: [{ hooks: [{ type: "command", command: "b" }] }],
    Stop: [{ hooks: [{ type: "command", command: "s" }] }],
  };
  const plan = computePlan({
    sourceModules: source(
      mod("mod-b", {}, { hooks: hooksB }),
      mod("mod-a", {}, { hooks: hooksA })
    ),
    selection: ["mod-b", "mod-a"],
    lock: null,
    diskHashes: new Map(),
  });
  assert.deepEqual(
    plan.managedHooks.SessionStart.map((e) => e.hooks[0].command),
    ["a", "b"],
    "selection is sorted, so hook order is deterministic across machines"
  );
  assert.equal(plan.managedHooks.Stop.length, 1);
});

test("uninstall (empty selection) removes everything the lock claims", () => {
  const plan = computePlan({
    sourceModules: source(mod("mod-a", { [P_SKILL]: "h1" })),
    selection: [],
    lock: { modules: { "mod-a": { version: "1.0.0", files: { [P_SKILL]: "h1" } } } },
    diskHashes: new Map([[P_SKILL, "h1"]]),
  });
  assert.equal(plan.files.length, 0);
  assert.deepEqual(plan.removals.map((r) => r.path), [P_SKILL]);
  assert.deepEqual(plan.managedHooks, {});
});

test("the lockfile records source hashes, sorted, per module", () => {
  const sourceModules = source(
    mod("mod-a", { [P_SCRIPT]: "h2", [P_SKILL]: "h1" }, { version: "2.0.0" })
  );
  const plan = computePlan({
    sourceModules,
    selection: ["mod-a"],
    lock: null,
    diskHashes: new Map(),
  });
  const lock = lockFromPlan({
    plan,
    sourceModules,
    source: { repo: "r", ref: "v1" },
    lockVersion: 1,
    now: "2026-01-01T00:00:00Z",
  });
  assert.equal(lock.modules["mod-a"].version, "2.0.0");
  assert.deepEqual(Object.keys(lock.modules["mod-a"].files), [P_SKILL, P_SCRIPT].sort());
  assert.equal(lock.modules["mod-a"].files[P_SKILL], "h1");
});

const MENU = ["kcc-ablation", "kcc-core", "kcc-dev-core", "kcc-pm"];

test("the interactive prompt accepts numbers, names, and a mix", () => {
  assert.deepEqual(parseSelectionAnswer("2", MENU, "all"), ["kcc-core"]);
  assert.deepEqual(parseSelectionAnswer("kcc-pm", MENU, "all"), ["kcc-pm"]);
  assert.deepEqual(parseSelectionAnswer(" 2 , kcc-pm ", MENU, "all"), ["kcc-core", "kcc-pm"]);
});

test("an empty answer takes the default, which is the installed set on re-run", () => {
  assert.deepEqual(parseSelectionAnswer("", MENU, "all"), MENU);
  assert.deepEqual(parseSelectionAnswer("   ", MENU, "kcc-core,kcc-pm"), ["kcc-core", "kcc-pm"]);
});

test("`none` is how the prompt expresses uninstall", () => {
  assert.deepEqual(parseSelectionAnswer("none", MENU, "all"), []);
});

test("an out-of-range number is an error, not a silent undefined in the selection", () => {
  assert.throws(() => parseSelectionAnswer("9", MENU, "all"), /no module number 9/);
  assert.throws(() => parseSelectionAnswer("0", MENU, "all"), /no module number 0/);
});

test("trailing commas and blanks do not produce empty module names", () => {
  assert.deepEqual(parseSelectionAnswer("kcc-core,,", MENU, "all"), ["kcc-core"]);
});

test("resolveSelection is the closure the caller must hash paths for", () => {
  // The caller hashes the target paths of every module the install will
  // claim. If it hashed only the requested modules, a pre-existing file at a
  // pulled-in dependency's path would look absent, be classified `new`, and
  // be destroyed with no conflict and no backup.
  const sourceModules = source(
    mod("mod-core", { "core.md": "hc" }),
    mod("mod-dev", { "dev.md": "hd" }, { requires: ["mod-core"] })
  );
  assert.deepEqual(resolveSelection(sourceModules, ["mod-dev"]), {
    selected: ["mod-core", "mod-dev"],
    pulledIn: ["mod-core"],
  });
});

test("a pre-existing file at a PULLED-IN module's path is still a conflict", () => {
  const sourceModules = source(
    mod("mod-core", { "core.md": "hc" }),
    mod("mod-dev", { "dev.md": "hd" }, { requires: ["mod-core"] })
  );
  // Exactly what the caller must supply: hashes for the whole closure.
  const paths = resolveSelection(sourceModules, ["mod-dev"]).selected.flatMap((n) => [
    ...sourceModules.get(n).files.keys(),
  ]);
  assert.ok(paths.includes("core.md"), "the closure must contribute the dependency's paths");

  const plan = computePlan({
    sourceModules,
    selection: ["mod-dev"],
    lock: null,
    diskHashes: new Map([["core.md", "SOMEONE-ELSES-FILE"]]),
  });
  assert.deepEqual(plan.conflicts.map((c) => c.path), ["core.md"]);
});

test("selecting a module pulls in what it requires, and says so", () => {
  const plan = computePlan({
    sourceModules: source(
      mod("mod-core", { "core.md": "hc" }),
      mod("mod-dev", { "dev.md": "hd" }, { requires: ["mod-core"] })
    ),
    selection: ["mod-dev"],
    lock: null,
    diskHashes: new Map(),
  });
  assert.deepEqual(plan.selection, ["mod-core", "mod-dev"]);
  assert.deepEqual(plan.modules.pulledIn, ["mod-core"]);
  assert.equal(plan.files.length, 2);
});

test("a dependency the user asked for explicitly is not reported as pulled in", () => {
  const plan = computePlan({
    sourceModules: source(
      mod("mod-core", { "core.md": "hc" }),
      mod("mod-dev", { "dev.md": "hd" }, { requires: ["mod-core"] })
    ),
    selection: ["mod-dev", "mod-core"],
    lock: null,
    diskHashes: new Map(),
  });
  assert.deepEqual(plan.modules.pulledIn, []);
});

test("requires is resolved transitively", () => {
  const plan = computePlan({
    sourceModules: source(
      mod("a", { a: "1" }),
      mod("b", { b: "2" }, { requires: ["a"] }),
      mod("c", { c: "3" }, { requires: ["b"] })
    ),
    selection: ["c"],
    lock: null,
    diskHashes: new Map(),
  });
  assert.deepEqual(plan.selection, ["a", "b", "c"]);
});

test("a requires cycle terminates instead of hanging", () => {
  const plan = computePlan({
    sourceModules: source(
      mod("a", { a: "1" }, { requires: ["b"] }),
      mod("b", { b: "2" }, { requires: ["a"] })
    ),
    selection: ["a"],
    lock: null,
    diskHashes: new Map(),
  });
  assert.deepEqual(plan.selection, ["a", "b"]);
});

test("a dangling requires is a hard error", () => {
  assert.throws(
    () =>
      computePlan({
        sourceModules: source(mod("a", {}, { requires: ["nope"] })),
        selection: ["a"],
        lock: null,
        diskHashes: new Map(),
      }),
    /requires "nope"/
  );
});

test("uninstall is not blocked by requires", () => {
  const plan = computePlan({
    sourceModules: source(
      mod("mod-core", { "core.md": "hc" }),
      mod("mod-dev", { "dev.md": "hd" }, { requires: ["mod-core"] })
    ),
    selection: [],
    lock: {
      modules: {
        "mod-core": { version: "1.0.0", files: { "core.md": "hc" } },
        "mod-dev": { version: "1.0.0", files: { "dev.md": "hd" } },
      },
    },
    diskHashes: new Map([["core.md", "hc"], ["dev.md", "hd"]]),
  });
  assert.deepEqual(plan.selection, []);
  assert.equal(plan.removals.length, 2);
});

test("verify reports modified, missing and hook drift separately", () => {
  const lock = {
    modules: { "mod-a": { files: { a: "h1", b: "h2" } } },
    managedHooks: { SessionStart: [{ hooks: [{ type: "command", command: "x/.claude/kcc/y" }] }] },
  };
  const clean = verifyAgainstLock({
    lock,
    diskHashes: new Map([["a", "h1"], ["b", "h2"]]),
    actualManagedHooks: lock.managedHooks,
    sameHooks: sameManagedHooks,
  });
  assert.equal(clean.ok, true);

  const dirty = verifyAgainstLock({
    lock,
    diskHashes: new Map([["a", "EDITED"]]),
    actualManagedHooks: {},
    sameHooks: sameManagedHooks,
  });
  assert.equal(dirty.ok, false);
  assert.deepEqual(dirty.modified, ["a"]);
  assert.deepEqual(dirty.missing, ["b"]);
  assert.equal(dirty.hookDrift, true);
});
