import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decideSettingsWrite,
  extractManagedHooks,
  isManagedHook,
  mergeManagedHooks,
  sameManagedHooks,
  stripManagedHooks,
} from "../lib/settings.mjs";

const ours = (n = "") => ({
  type: "command",
  command: `bash "$CLAUDE_PROJECT_DIR/.claude/kcc/kcc-core/scripts/s${n}.sh"`,
});
const theirs = (cmd = "npm run lint") => ({ type: "command", command: cmd });

test("ownership is decided by the .claude/kcc/ marker in the command", () => {
  assert.equal(isManagedHook(ours()), true);
  assert.equal(isManagedHook(theirs()), false);
  assert.equal(isManagedHook(theirs("bash ./scripts/kcc/other.sh")), false);
  assert.equal(isManagedHook(null), false);
  assert.equal(isManagedHook({ type: "command" }), false);
});

test("stripping removes our hooks and leaves the project's own untouched", () => {
  const settings = {
    permissions: { allow: ["Bash(npm test)"] },
    hooks: {
      SessionStart: [{ hooks: [ours()] }, { hooks: [theirs()] }],
      PreToolUse: [{ matcher: "Write", hooks: [theirs("./guard.sh")] }],
    },
  };
  const out = stripManagedHooks(settings);
  assert.deepEqual(out.permissions, settings.permissions, "unrelated keys survive");
  assert.deepEqual(out.hooks.SessionStart, [{ hooks: [theirs()] }]);
  assert.deepEqual(out.hooks.PreToolUse, settings.hooks.PreToolUse);
});

test("an entry that mixes ours and theirs loses only our half", () => {
  const out = stripManagedHooks({
    hooks: { Stop: [{ matcher: "*", hooks: [theirs(), ours(), theirs("b")] }] },
  });
  assert.deepEqual(out.hooks.Stop, [{ matcher: "*", hooks: [theirs(), theirs("b")] }]);
});

test("an event that becomes empty is dropped, and so is an empty hooks key", () => {
  const out = stripManagedHooks({ model: "opus", hooks: { SessionStart: [{ hooks: [ours()] }] } });
  assert.deepEqual(out, { model: "opus" });
  assert.ok(!("hooks" in out), "an empty hooks object must not be left behind");
});

test("an empty event array the project wrote is left alone", () => {
  // Dropping it would put a change in their settings.json diff that kcc had
  // no reason to make — the module header promises we own only our entries.
  const out = stripManagedHooks({ hooks: { PostToolUse: [], SessionStart: [{ hooks: [ours()] }] } });
  assert.deepEqual(out.hooks, { PostToolUse: [] });
});

test("stripping a settings file with no hooks at all is a no-op", () => {
  assert.deepEqual(stripManagedHooks({ model: "opus" }), { model: "opus" });
  assert.deepEqual(stripManagedHooks({}), {});
});

test("merging appends our entries after the project's own, preserving event order", () => {
  const settings = {
    hooks: {
      PreToolUse: [{ hooks: [theirs("./guard.sh")] }],
      SessionStart: [{ hooks: [theirs("./welcome.sh")] }],
    },
  };
  const managed = { SessionStart: [{ hooks: [ours()] }], Stop: [{ hooks: [ours("2")] }] };
  const out = mergeManagedHooks(settings, managed);

  assert.deepEqual(Object.keys(out.hooks), ["PreToolUse", "SessionStart", "Stop"]);
  assert.deepEqual(out.hooks.SessionStart, [{ hooks: [theirs("./welcome.sh")] }, { hooks: [ours()] }]);
  assert.deepEqual(out.hooks.PreToolUse, settings.hooks.PreToolUse);
});

test("merging is idempotent — running the installer twice cannot duplicate hooks", () => {
  const managed = { SessionStart: [{ hooks: [ours()] }] };
  const once = mergeManagedHooks({ hooks: { SessionStart: [{ hooks: [theirs()] }] } }, managed);
  const twice = mergeManagedHooks(once, managed);
  assert.deepEqual(twice, once);
});

test("an upgrade replaces our old entries rather than accumulating them", () => {
  const before = mergeManagedHooks({}, { SessionStart: [{ hooks: [ours("old")] }] });
  const after = mergeManagedHooks(before, { SessionStart: [{ hooks: [ours("new")] }] });
  assert.equal(after.hooks.SessionStart.length, 1);
  assert.ok(after.hooks.SessionStart[0].hooks[0].command.includes("snew.sh"));
});

test("merging into a null settings file produces a minimal valid object", () => {
  const out = mergeManagedHooks(null, { SessionStart: [{ hooks: [ours()] }] });
  assert.deepEqual(out, { hooks: { SessionStart: [{ hooks: [ours()] }] } });
});

test("a malformed hooks.<event> is refused rather than silently replaced", () => {
  assert.throws(
    () => mergeManagedHooks({ hooks: { SessionStart: "oops" } }, { SessionStart: [{ hooks: [ours()] }] }),
    /not an array/
  );
});

test("extract returns exactly the entries an upgrade would replace", () => {
  const settings = mergeManagedHooks(
    { hooks: { SessionStart: [{ hooks: [theirs()] }] } },
    { SessionStart: [{ hooks: [ours()] }] }
  );
  assert.deepEqual(extractManagedHooks(settings), { SessionStart: [{ hooks: [ours()] }] });
});

test("extract sees a hand-edited managed hook, which is what --check reports", () => {
  const settings = mergeManagedHooks({}, { SessionStart: [{ hooks: [ours()] }] });
  settings.hooks.SessionStart[0].hooks[0].timeout = 999;
  assert.equal(sameManagedHooks(extractManagedHooks(settings), { SessionStart: [{ hooks: [ours()] }] }), false);
});

test("hook comparison ignores key order INSIDE an entry, not just event order", () => {
  // A team running prettier or `jq -S` over settings.json reorders the keys
  // inside every hook entry. A stringify-based comparison would then report
  // drift forever, so the documented CI gate would fail on a cosmetic change.
  const a = { SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: "x/.claude/kcc/y", timeout: 5 }] }] };
  const b = { SessionStart: [{ hooks: [{ timeout: 5, command: "x/.claude/kcc/y", type: "command" }], matcher: "*" }] };
  assert.equal(sameManagedHooks(a, b), true);
});

test("hook comparison still sees a real difference under reordering", () => {
  const a = { SessionStart: [{ hooks: [{ type: "command", command: "x/.claude/kcc/y", timeout: 5 }] }] };
  const b = { SessionStart: [{ hooks: [{ timeout: 9, command: "x/.claude/kcc/y", type: "command" }] }] };
  assert.equal(sameManagedHooks(a, b), false);
});

test("hook comparison respects array order, which is execution order", () => {
  const one = { type: "command", command: "a/.claude/kcc/1" };
  const two = { type: "command", command: "b/.claude/kcc/2" };
  assert.equal(
    sameManagedHooks({ S: [{ hooks: [one, two] }] }, { S: [{ hooks: [two, one] }] }),
    false
  );
});

test("hook comparison ignores event ordering", () => {
  const a = { Stop: [{ hooks: [ours()] }], SessionStart: [{ hooks: [ours("2")] }] };
  const b = { SessionStart: [{ hooks: [ours("2")] }], Stop: [{ hooks: [ours()] }] };
  assert.equal(sameManagedHooks(a, b), true);
});

// --- decideSettingsWrite: one total function, so the missing case is a test

const managedOne = { SessionStart: [{ hooks: [ours()] }] };

test("installing into a project-owned settings.json writes our hooks in", () => {
  const d = decideSettingsWrite({
    settings: {},
    managed: managedOne,
    createdSettings: false,
    existed: true,
  });
  assert.equal(d.action, "write");
  assert.deepEqual(extractManagedHooks(d.next), managedOne);
});

test("uninstalling from a project-owned settings.json REWRITES it, stripped", () => {
  // The case that fell through the old three-branch ladder: nothing of ours
  // is left, but the project owns the file — so it must still be written, or
  // our hook commands stay behind pointing at scripts we just deleted, with
  // the lockfile gone so no later run can repair it.
  const withOurs = mergeManagedHooks({}, managedOne);
  const d = decideSettingsWrite({
    settings: withOurs,
    managed: {},
    createdSettings: false,
    existed: true,
  });
  assert.equal(d.action, "write");
  assert.deepEqual(d.next, {});
});

test("uninstalling a settings.json we created removes it", () => {
  const withOurs = mergeManagedHooks({}, managedOne);
  const d = decideSettingsWrite({
    settings: withOurs,
    managed: {},
    createdSettings: true,
    existed: true,
  });
  assert.equal(d.action, "remove");
});

test("a hookless install into a project with no settings.json creates none", () => {
  const d = decideSettingsWrite({
    settings: null,
    managed: {},
    createdSettings: false,
    existed: false,
  });
  assert.equal(d.action, "leave");
});

test("a hookless install leaves a hand-formatted settings.json untouched", () => {
  const d = decideSettingsWrite({
    settings: { model: "opus", permissions: { allow: ["Bash(npm test)"] } },
    managed: {},
    createdSettings: false,
    existed: true,
  });
  assert.equal(d.action, "leave");
});

test("re-installing the same hooks leaves the file untouched", () => {
  const withOurs = mergeManagedHooks({ model: "opus" }, managedOne);
  const d = decideSettingsWrite({
    settings: withOurs,
    managed: managedOne,
    createdSettings: true,
    existed: true,
  });
  assert.equal(d.action, "leave");
});

test("the decision is total: every input combination yields an action", () => {
  const actions = new Set();
  for (const settings of [null, {}, { model: "opus" }, mergeManagedHooks({}, managedOne)]) {
    for (const managed of [{}, managedOne]) {
      for (const createdSettings of [true, false]) {
        for (const existed of [true, false]) {
          const d = decideSettingsWrite({ settings, managed, createdSettings, existed });
          assert.ok(["write", "remove", "leave"].includes(d.action), JSON.stringify(d));
          actions.add(d.action);
        }
      }
    }
  }
  assert.deepEqual([...actions].sort(), ["leave", "remove", "write"]);
});
