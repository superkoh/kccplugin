#!/usr/bin/env node
/**
 * L4 — Load-time / registration assertions.
 *
 * What L1 cannot prove: that the Claude Code runtime actually loads what the
 * installer put in a project, and registers it under the names people type.
 * L4 answers that by installing the modules into a throwaway project and
 * asking the CLI what it sees.
 *
 *   1. install the selected modules into a temp project (installer libs,
 *      not a subprocess — the same code path a user's `install.sh` runs)
 *   2. spawn `claude -p ping` with cwd = that project and CLAUDE_CONFIG_DIR
 *      pointed at an empty directory, so nothing of the developer's own
 *      setup leaks in
 *   3. read the `system/init` record and assert against each module's
 *      `tests/sdk/expected.json`
 *
 * One spawn covers every module, which also proves the modules coexist —
 * two modules projecting onto the same path would show up here as a missing
 * registration rather than as a silent overwrite in someone's repo.
 *
 * `expected.json` shape (every section optional):
 *
 *   {
 *     "slashCommands": { "requires": ["kcc-pm:onboard"], "forbids": [] },
 *     "skills":        { "requires": ["kcc-pm:pm-playbook"] },
 *     "agents":        { "requires": ["kcc-pm"] },
 *     "mcpServers":    { "requires": [] }
 *   }
 *
 * A module without an expected.json gets a smoke check: the CLI started and
 * emitted an init record.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  PluginFilterError,
  discoverPlugins,
  discoverTestArtifacts,
  inventoryPluginAssets,
  isNonPluginFilter,
} from "./lib/discover.mjs";
import { createInstalledProject } from "./lib/project-fixture.mjs";
import { DEFAULT_MODEL, assertClaudeAvailable } from "./lib/claude-runner.mjs";

const TINY_PROMPT = "ping";
const LOAD_BUDGET_USD = 0.02;
const LOAD_TIMEOUT_MS = 90_000;

/**
 * Spawn claude inside the installed project and return the first
 * `system/init` record. Kills the child as soon as we have it.
 */
function captureInit({ projectDir, env }) {
  return new Promise((resolve, reject) => {
    const argv = [
      "-p", TINY_PROMPT,
      "--permission-mode", "bypassPermissions",
      "--no-session-persistence",
      "--verbose",
      "--output-format", "stream-json",
      "--max-budget-usd", String(LOAD_BUDGET_USD),
      "--disallowedTools",
      "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,Agent",
      "--model", DEFAULT_MODEL,
    ];

    const child = spawn("claude", argv, {
      cwd: projectDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let buf = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        reject(new Error(`timeout waiting for init (${LOAD_TIMEOUT_MS}ms)`));
      }
    }, LOAD_TIMEOUT_MS);

    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.stdout.on("data", (d) => {
      if (settled) return;
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          continue;
        }
        if (record?.type === "system" && record?.subtype === "init") {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          resolve({ init: record, argv });
          return;
        }
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          `claude exited (code=${code}) before init message was seen.\n` +
            `stderr: ${stderr.trim().slice(-800)}`
        )
      );
    });
  });
}

async function loadExpectations(expectedPath) {
  if (!expectedPath || !existsSync(expectedPath)) return null;
  return JSON.parse(await readFile(expectedPath, "utf-8"));
}

function names(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => (typeof e === "string" ? e : e?.name)).filter(Boolean);
}

function assertList(label, actual, spec, failures) {
  if (!spec) return;
  for (const must of spec.requires ?? []) {
    if (!actual.includes(must)) {
      failures.push(`${label}: required "${must}" not registered`);
    }
  }
  for (const bad of spec.forbids ?? []) {
    if (actual.includes(bad)) failures.push(`${label}: forbidden "${bad}" is registered`);
  }
}

/**
 * Registration the installer promises even without an expected.json: every
 * command, skill and agent a module ships must appear under its projected
 * name. This is what catches a projection rule that quietly stops working
 * after a CLI upgrade — for instance if colons in skill directory names
 * were ever rejected.
 */
async function impliedRequirements(plugin) {
  const assets = await inventoryPluginAssets(plugin);
  return {
    slashCommands: assets.commands.map((c) => `${plugin.name}:${c.name}`),
    skills: assets.skills.map((s) => `${plugin.name}:${s.name}`),
    agents: assets.agents.map((a) => a.name),
  };
}

function printReport(results) {
  console.log("");
  console.log("L4  Load-time / registration (project install)");
  console.log("-".repeat(72));
  let failed = 0;
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    console.log(`  ${icon} ${r.plugin}  (${r.mode})`);
    if (r.ok) {
      if (r.registered.length) console.log(`      registered: ${JSON.stringify(r.registered)}`);
    } else {
      failed++;
      for (const f of r.failures) console.log(`      ${f}`);
      console.log(`      (observed skills:   ${JSON.stringify(r.observed.skills)})`);
      console.log(`      (observed commands: ${JSON.stringify(r.observed.slashCommands)})`);
      console.log(`      (observed agents:   ${JSON.stringify(r.observed.agents)})`);
    }
  }
  console.log("-".repeat(72));
  console.log(`  ${results.length - failed} of ${results.length} module(s) register cleanly.`);
  console.log("");
  return failed;
}

async function main() {
  if (isNonPluginFilter()) {
    console.log(`\nL4  Load-time / registration`);
    console.log("-".repeat(72));
    console.log(`  - skipped: "${process.env.PLUGIN}" is not a plugin (nothing to register)`);
    console.log("");
    process.exit(0);
  }

  // Distinguish "the CLI is missing/broken" from "there is no auth" BEFORE
  // guessing at stderr wording: an ENOENT must not be reported as a skip, and
  // a CLI error-message reword must not turn a no-auth machine into a failure.
  try {
    await assertClaudeAvailable();
  } catch (err) {
    console.error("L4: cannot run —", err.message);
    process.exit(2);
  }

  const plugins = await discoverPlugins();
  if (plugins.length === 0) {
    console.log("L4: no modules found under plugins/");
    process.exit(0);
  }

  const fixture = await createInstalledProject(plugins.map((p) => p.name));
  let code;
  try {
    code = await runAssertions(plugins, fixture);
  } finally {
    // runAssertions must RETURN, never process.exit: an exit here would skip
    // this cleanup, and the fixture may hold a copy of the user's credentials.
    await fixture.cleanup();
  }
  process.exit(code);
}

async function runAssertions(plugins, fixture) {
  let init;
  try {
    ({ init } = await captureInit(fixture));
  } catch (err) {
    const msg = String(err.message);
    if (/credit balance|authentication|log ?in|API key/i.test(msg)) {
      console.log("");
      console.log("L4  Load-time / registration (skipped)");
      console.log("-".repeat(72));
      console.log(`  no usable auth: ${msg.split("\n")[0]}`);
      console.log("");
      return 0;
    }
    console.error("L4: cannot run —", msg);
    return 2;
  }

  const observed = {
    slashCommands: names(init.slash_commands ?? init.slashCommands ?? init.commands),
    skills: names(init.skills),
    agents: names(init.agents),
    mcpServers: names(init.mcp_servers ?? init.mcpServers),
  };

  // Nothing user-level should have leaked into a hermetic fixture.
  const leaked = names(init.plugins);
  const results = [];

  for (const plugin of plugins) {
    const artifacts = await discoverTestArtifacts(plugin);
    const expected = await loadExpectations(artifacts.sdkExpected);
    const implied = await impliedRequirements(plugin);
    const failures = [];

    assertList("slashCommands", observed.slashCommands, { requires: implied.slashCommands }, failures);
    assertList("skills", observed.skills, { requires: implied.skills }, failures);
    assertList("agents", observed.agents, { requires: implied.agents }, failures);

    if (expected) {
      assertList("slashCommands", observed.slashCommands, expected.slashCommands, failures);
      assertList("skills", observed.skills, expected.skills, failures);
      assertList("agents", observed.agents, expected.agents, failures);
      assertList("mcpServers", observed.mcpServers, expected.mcpServers, failures);
    }

    const registered = [
      ...implied.skills.filter((n) => observed.skills.includes(n)),
      ...implied.slashCommands.filter((n) => observed.slashCommands.includes(n)),
      ...implied.agents.filter((n) => observed.agents.includes(n)),
    ];

    results.push({
      plugin: plugin.name,
      ok: failures.length === 0,
      mode: expected ? "asserted" : registered.length > 0 ? "implied" : "smoke",
      failures,
      registered,
      observed,
    });
  }

  if (leaked.length > 0) {
    results.push({
      plugin: "(fixture hermeticity)",
      ok: false,
      mode: "asserted",
      failures: [`user-level plugins leaked into the fixture: ${JSON.stringify(leaked)}`],
      registered: [],
      observed,
    });
  }

  const failed = printReport(results);
  return failed > 0 ? 1 : 0;
}

main().catch((err) => {
  if (err instanceof PluginFilterError) {
    console.error(err.message);
    process.exit(2);
  }
  console.error("L4 runner crashed:", err);
  process.exit(2);
});
