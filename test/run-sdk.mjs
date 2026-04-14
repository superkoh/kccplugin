#!/usr/bin/env node
/**
 * L4 — Load-time / registration assertions.
 *
 * What L1 cannot prove: that the Claude Code runtime actually loads a
 * plugin, that its slash commands are registered with the right names,
 * that its MCP servers spawn, etc. L4 answers those questions by
 * actually asking the CLI to load the plugin and emit its init message.
 *
 * How it works:
 *
 *   claude -p "<tiny prompt>" \
 *     --bare \
 *     --plugin-dir <plugin-root> \
 *     --output-format stream-json \
 *     --disallowedTools "<everything>" \
 *     --max-budget-usd 0.02 \
 *     --include-partial-messages=false
 *
 * The first line of stream-json is always a `{"type":"system",
 * "subtype":"init", ...}` record listing slash_commands, mcp_servers,
 * and tools. We consume it and kill the child — we don't need the
 * model's reply.
 *
 * Assertions come from:
 *
 *   plugins/<name>/tests/sdk/expected.json
 *
 * Minimal shape:
 *
 *   {
 *     "slashCommands": {
 *       "requires": ["/hello-world:hello"],
 *       "forbids":  []
 *     },
 *     "mcpServers": {
 *       "requires": []
 *     }
 *   }
 *
 * Plugins without an expected.json get a load-only smoke check: we just
 * verify the CLI starts and emits an init message without error.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  PluginFilterError,
  discoverPlugins,
  discoverTestArtifacts,
} from "./lib/discover.mjs";
import { assertClaudeAvailable } from "./lib/claude-runner.mjs";

const TINY_PROMPT = "ping";
const LOAD_BUDGET_USD = 0.02;
const LOAD_TIMEOUT_MS = 60_000;

function hasApiKey() {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.CLAUDE_CODE_OAUTH_TOKEN ||
    process.env.ANTHROPIC_AUTH_TOKEN
  );
}

/**
 * Spawn claude and return the first `system/init` record from its
 * stream-json output. Kills the child as soon as we have it.
 */
function captureInit(pluginRoot) {
  return new Promise((resolve, reject) => {
    const argv = [
      "-p", TINY_PROMPT,
      "--bare",
      "--permission-mode", "bypassPermissions",
      "--no-session-persistence",
      // stream-json + --print requires --verbose per the CLI.
      "--verbose",
      "--output-format", "stream-json",
      "--max-budget-usd", String(LOAD_BUDGET_USD),
      "--plugin-dir", pluginRoot,
      // Lock the model out of doing anything expensive while we wait for init.
      "--disallowedTools",
      "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,Agent",
      "--model", "claude-haiku-4-5-20251001",
    ];

    const child = spawn("claude", argv, {
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
          continue; // ignore non-JSON noise
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
  const raw = await readFile(expectedPath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Pull slash command names out of the init record. We accept two shapes
 * because the CLI's stream-json schema has evolved: an array of strings,
 * or an array of objects with a `name` field.
 */
function extractSlashCommands(init) {
  const raw = init.slash_commands ?? init.slashCommands ?? init.commands ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => (typeof entry === "string" ? entry : entry?.name))
    .filter(Boolean);
}

function extractMcpServers(init) {
  const raw = init.mcp_servers ?? init.mcpServers ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => (typeof entry === "string" ? entry : entry?.name))
    .filter(Boolean);
}

function assertList(name, actual, spec, failures) {
  if (!spec) return;
  if (Array.isArray(spec.requires)) {
    for (const must of spec.requires) {
      if (!actual.includes(must)) {
        failures.push(
          `${name}: required "${must}" not registered (saw: ${JSON.stringify(actual)})`
        );
      }
    }
  }
  if (Array.isArray(spec.forbids)) {
    for (const bad of spec.forbids) {
      if (actual.includes(bad)) {
        failures.push(`${name}: forbidden "${bad}" is registered`);
      }
    }
  }
}

async function runForPlugin(plugin) {
  const artifacts = await discoverTestArtifacts(plugin);
  const expected = await loadExpectations(artifacts.sdkExpected);

  let init;
  try {
    const out = await captureInit(plugin.root);
    init = out.init;
  } catch (err) {
    return { plugin: plugin.name, ok: false, failures: [err.message] };
  }

  const failures = [];
  const slashCommands = extractSlashCommands(init);
  const mcpServers = extractMcpServers(init);

  if (expected) {
    assertList("slashCommands", slashCommands, expected.slashCommands, failures);
    assertList("mcpServers", mcpServers, expected.mcpServers, failures);
  }
  // If the plugin's manifest claims commands/agents/skills but *none* of
  // them ended up in the init message, the plugin almost certainly failed
  // to load silently. Worth flagging even without explicit expectations.
  // (We only warn if the plugin has no sdk expectations at all.)

  return {
    plugin: plugin.name,
    ok: failures.length === 0,
    failures,
    slashCommands,
    mcpServers,
    hadExpectations: !!expected,
  };
}

function printReport(results) {
  console.log("");
  console.log("L4  Load-time / registration");
  console.log("-".repeat(72));
  let failed = 0;
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    const mode = r.hadExpectations ? "asserted" : "smoke";
    console.log(`  ${icon} ${r.plugin}  (${mode})`);
    if (r.ok) {
      // Filter noise: only list commands in this plugin's namespace.
      // The rest belong to the user's global skill set and aren't the
      // responsibility of this plugin.
      const ns = r.plugin + ":";
      const own = r.slashCommands.filter(
        (c) => c.startsWith(ns) || c.startsWith("/" + ns)
      );
      console.log(`      slash_commands: ${JSON.stringify(own)}`);
      if (r.mcpServers.length) {
        console.log(`      mcp_servers:    ${JSON.stringify(r.mcpServers)}`);
      }
    } else {
      failed++;
      for (const f of r.failures) console.log(`      ${f}`);
      // When asserting fails, dump the full list so the author can see
      // exactly what the CLI actually registered.
      console.log(
        `      (observed slash_commands: ${JSON.stringify(r.slashCommands)})`
      );
    }
  }
  console.log("-".repeat(72));
  console.log(`  ${results.length - failed} of ${results.length} plugin(s) load cleanly.`);
  console.log("");
  return failed;
}

async function main() {
  if (!hasApiKey()) {
    console.log("");
    console.log("L4  Load-time / registration (skipped)");
    console.log("-".repeat(72));
    console.log("  no ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN in env.");
    console.log("  run with `ANTHROPIC_API_KEY=... npm run test:l4` to enable.");
    console.log("");
    process.exit(0);
  }

  try {
    await assertClaudeAvailable();
  } catch (err) {
    console.error("L4: cannot run", err.message);
    process.exit(2);
  }

  const plugins = await discoverPlugins();
  if (plugins.length === 0) {
    console.log("L4: no plugins found under plugins/");
    process.exit(0);
  }

  const results = [];
  for (const plugin of plugins) {
    results.push(await runForPlugin(plugin));
  }
  const failed = printReport(results);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  if (err instanceof PluginFilterError) {
    console.error(err.message);
    process.exit(2);
  }
  console.error("L4 runner crashed:", err);
  process.exit(2);
});
