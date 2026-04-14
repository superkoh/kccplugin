#!/usr/bin/env node
/**
 * L2 — Unit test dispatcher.
 *
 * For each plugin we scan `plugins/<name>/tests/unit/` and dispatch:
 *
 *   *.bats            → bats-core
 *   *.test.mjs / .js  → node --test (built into Node 18+)
 *   test_*.py         → pytest (via `python3 -m pytest`)
 *
 * Each language bucket runs in its own child process, and we fail fast only
 * within a bucket; the outer loop always runs every plugin so that one
 * plugin's broken tests don't hide another plugin's failures.
 *
 * Rationale:
 *
 * - node --test is zero-install (we already depend on Node). It's the
 *   recommended path for TS/JS MCP servers and library code.
 *
 * - bats-core is the standard for shell scripts (hooks). We don't bundle it;
 *   the dispatcher will skip+warn if `bats` isn't on PATH.
 *
 * - pytest is optional and only tried if `python3 -m pytest --version`
 *   works. Same skip+warn behavior.
 *
 * - Plugins without a tests/unit/ directory are silently OK — unit tests
 *   are opt-in.
 */
import { spawn } from "node:child_process";
import {
  PluginFilterError,
  discoverPlugins,
  discoverTestArtifacts,
} from "./lib/discover.mjs";

const results = []; // [{ plugin, runner, ok, output, skipped, reason }]

function spawnCaptured(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let stdout = "";
    let stderr = "";
    child.on("error", (err) => {
      resolve({ ok: false, code: null, stdout, stderr: stderr + err.message, spawnError: err });
    });
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ ok: code === 0, code, stdout, stderr }));
  });
}

async function hasCommand(cmd, args = ["--version"]) {
  const res = await spawnCaptured(cmd, args);
  return res.code === 0;
}

async function runBats(plugin, files) {
  if (files.length === 0) return;
  const available = await hasCommand("bats");
  if (!available) {
    results.push({
      plugin: plugin.name,
      runner: "bats",
      skipped: true,
      reason: "`bats` not on PATH — install from https://github.com/bats-core/bats-core",
      files,
    });
    return;
  }
  const res = await spawnCaptured("bats", files);
  results.push({
    plugin: plugin.name,
    runner: "bats",
    ok: res.ok,
    output: res.stdout + res.stderr,
    files,
  });
}

async function runNodeTest(plugin, files) {
  if (files.length === 0) return;
  const res = await spawnCaptured("node", ["--test", ...files]);
  results.push({
    plugin: plugin.name,
    runner: "node --test",
    ok: res.ok,
    output: res.stdout + res.stderr,
    files,
  });
}

async function runPytest(plugin, files) {
  if (files.length === 0) return;
  const available = await hasCommand("python3", ["-m", "pytest", "--version"]);
  if (!available) {
    results.push({
      plugin: plugin.name,
      runner: "pytest",
      skipped: true,
      reason: "`python3 -m pytest` not available — install with `pip install pytest`",
      files,
    });
    return;
  }
  const res = await spawnCaptured("python3", ["-m", "pytest", ...files]);
  results.push({
    plugin: plugin.name,
    runner: "pytest",
    ok: res.ok,
    output: res.stdout + res.stderr,
    files,
  });
}

function printReport() {
  console.log("");
  console.log("L2  Unit tests");
  console.log("-".repeat(72));
  if (results.length === 0) {
    console.log("  (no unit tests found — add files under plugins/<name>/tests/unit/)");
    console.log("");
    return 0;
  }
  let failed = 0;
  for (const r of results) {
    const icon = r.skipped ? "-" : r.ok ? "✓" : "✗";
    const tag = `${r.plugin} [${r.runner}]`;
    console.log(`  ${icon} ${tag}  (${r.files.length} file${r.files.length === 1 ? "" : "s"})`);
    if (r.skipped) {
      console.log(`      skipped: ${r.reason}`);
    } else if (!r.ok) {
      failed++;
      const output = (r.output || "").trim();
      for (const line of output.split("\n").slice(-30)) {
        console.log(`      ${line}`);
      }
    }
  }
  console.log("-".repeat(72));
  console.log(`  ${results.length - failed} of ${results.length} unit suites passed.`);
  console.log("");
  return failed;
}

async function main() {
  const plugins = await discoverPlugins();
  for (const plugin of plugins) {
    const art = await discoverTestArtifacts(plugin);
    await runNodeTest(plugin, art.unit.nodeTest);
    await runBats(plugin, art.unit.bats);
    await runPytest(plugin, art.unit.pytest);
  }
  const failed = printReport();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  if (err instanceof PluginFilterError) {
    console.error(err.message);
    process.exit(2);
  }
  console.error("L2 dispatcher crashed:", err);
  process.exit(2);
});
