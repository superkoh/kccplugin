/**
 * L2 — marketplace-wide policy for hook scripts.
 *
 * These assertions belong to the repo, not to any one plugin: they encode a
 * rule every plugin here must obey, and they discover their subjects from
 * each plugin's hooks.json rather than naming scripts. A new plugin with
 * hooks is covered the moment it lands.
 *
 * The rule: **a hook script may not depend on anything outside bash.**
 *
 * These plugins used to shell out to `jq` and, when it was missing, emit an
 * empty additionalContext plus a stderr warning. On the machine of someone
 * who chose to install the plugin that is a survivable degrade. Once a
 * project vendors the plugin into its repo (install.sh), the same code runs
 * on teammates' and CI machines that never opted into anything — and a
 * silent no-op there is indistinguishable from "the plugin isn't installed",
 * which is the worst possible failure for a plugin whose entire job is to
 * inject context. So the dependency is gone, and this file is what keeps it
 * gone: every hook is executed a second time with PATH="" and must produce
 * byte-identical output.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { discoverPlugins, REPO_ROOT } from "../lib/discover.mjs";
import { assertHookOutput } from "../lib/hook-output.mjs";

/**
 * Every command hook across every plugin, as
 * {plugin, root, event, script}. `${CLAUDE_PLUGIN_ROOT}` is resolved the
 * way Claude Code resolves it: to the plugin directory.
 */
function allHookScripts(plugins) {
  const out = [];
  for (const plugin of plugins) {
    const hooksJson = path.join(plugin.root, "hooks", "hooks.json");
    let config;
    try {
      config = JSON.parse(readFileSync(hooksJson, "utf-8"));
    } catch {
      continue; // hooks are opt-in
    }
    for (const [event, entries] of Object.entries(config.hooks || {})) {
      for (const entry of entries) {
        for (const hook of entry.hooks || []) {
          if (hook.type !== "command") continue;
          const m = hook.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"']+)/);
          if (!m) continue;
          out.push({
            plugin: plugin.name,
            root: plugin.root,
            event,
            script: path.join(plugin.root, m[1]),
          });
        }
      }
    }
  }
  return out;
}

/** Run a hook script; `bare` strips PATH so nothing external can be reached. */
function runHook(script, { bare = false, stdin = "", cwd = REPO_ROOT } = {}) {
  return new Promise((resolve) => {
    const p = spawn("/bin/bash", [script], {
      cwd,
      env: bare ? { PATH: "", HOME: process.env.HOME || "" } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out, err }));
    p.stdin.end(stdin);
  });
}

const plugins = await discoverPlugins();
const hooks = allHookScripts(plugins);

test("every plugin's hooks.json points at a real, resolvable script", () => {
  assert.ok(hooks.length > 0, "expected at least one command hook to exist");
  for (const h of hooks) {
    assert.ok(
      readFileSync(h.script, "utf-8").length > 0,
      `${h.plugin} ${h.event}: ${h.script} is missing or empty`
    );
  }
});

for (const h of hooks) {
  const label = `${h.plugin} ${h.event}`;

  test(`${label}: stdout satisfies the hook-output schema`, async () => {
    const { code, out, err } = await runHook(h.script);
    assert.equal(code, 0, `non-zero exit; stderr: ${err}`);
    await assertHookOutput(h.event, out);
  });

  test(`${label}: runs with PATH stripped, byte-identically`, async () => {
    const normal = await runHook(h.script);
    const bare = await runHook(h.script, { bare: true });
    assert.equal(bare.code, 0, `non-zero exit with PATH=""; stderr: ${bare.err}`);
    assert.equal(
      bare.err,
      "",
      `PATH="" run wrote to stderr — something external was reached: ${bare.err}`
    );
    assert.equal(
      bare.out,
      normal.out,
      `PATH="" output differs from the normal run, so this hook still ` +
        `depends on an external command`
    );
  });

  test(`${label}: additionalContext is a byte-exact copy of a context file`, async () => {
    const { out } = await runHook(h.script);
    const injected = JSON.parse(out).hookSpecificOutput.additionalContext;
    assert.ok(
      injected.length > 0,
      `nothing was injected — the repo root is a dev scene, so every hook ` +
        `here is expected to fire`
    );

    const contextDir = path.join(h.root, "context");
    const candidates = readdirSync(contextDir).map((f) =>
      readFileSync(path.join(contextDir, f), "utf-8")
    );
    assert.ok(
      candidates.some((text) => text === injected),
      `injected text matches no file in ${path.relative(REPO_ROOT, contextDir)} ` +
        `byte-for-byte — the JSON escaping is lossy (trailing newline, quote, ` +
        `backslash, or tab handling)`
    );
  });
}

test("context files carry no control characters the escaper doesn't handle", () => {
  // kcc_json_escape covers \\, ", \t, \r and \n. Any other C0 character
  // would emit raw and produce invalid JSON. Cheaper to forbid them in the
  // shipped files than to loop per character on every session start.
  for (const plugin of plugins) {
    const contextDir = path.join(plugin.root, "context");
    let files;
    try {
      files = readdirSync(contextDir);
    } catch {
      continue;
    }
    for (const f of files) {
      const text = readFileSync(path.join(contextDir, f), "utf-8");
      // C0 minus the three the escaper handles: \t (09), \n (0A), \r (0D).
      const bad = text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
      assert.equal(
        bad,
        null,
        `${plugin.name}/context/${f} contains control character ` +
          `U+${bad?.[0].charCodeAt(0).toString(16).padStart(4, "0")}, which ` +
          `hook-lib.sh does not escape`
      );
    }
  }
});

test("every plugin ships the same hook-lib.sh — copies must not drift", () => {
  const libs = plugins
    .map((p) => ({ name: p.name, file: path.join(p.root, "scripts", "hook-lib.sh") }))
    .filter((l) => {
      try {
        readFileSync(l.file);
        return true;
      } catch {
        return false;
      }
    });
  assert.ok(libs.length > 1, "expected more than one plugin to ship hook-lib.sh");

  // Plugins must be independently installable, so the file is duplicated on
  // purpose. Duplication is fine; divergence is not.
  const [first, ...rest] = libs;
  const reference = readFileSync(first.file, "utf-8");
  for (const other of rest) {
    assert.equal(
      readFileSync(other.file, "utf-8"),
      reference,
      `${other.name}/scripts/hook-lib.sh has drifted from ${first.name}'s copy`
    );
  }
});
