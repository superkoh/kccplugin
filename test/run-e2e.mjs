#!/usr/bin/env node
/**
 * L3 — End-to-end YAML case runner.
 *
 * Each plugin can ship declarative e2e cases under:
 *
 *   plugins/<name>/tests/e2e/*.yaml
 *
 * A case looks like:
 *
 *   name: "basic greeting"
 *   prompt: "/hello-world:greeting Alice"
 *   model: "haiku"                       # optional; default: haiku
 *   maxBudgetUsd: 0.10                   # optional; hard cap
 *   allowedTools: [Read, Bash]           # optional
 *   disallowedTools: [Write, Edit]       # optional
 *   jsonSchema: |                        # optional; forces structured output
 *     { "type": "object", "properties": { "greeting": { "type": "string" } } }
 *   timeoutMs: 120000                    # optional
 *   expect:
 *     exitCode: 0
 *     stdout:
 *       contains: ["Alice"]
 *       notContains: ["error"]
 *       matches: "\\bhello\\b"
 *     parsedJson:
 *       result.greeting:
 *         matches: "Alice"
 *
 * Design notes:
 *
 * - We call `claude` via --bare so the user's ~/.claude and project
 *   .claude/ state is ignored; only --plugin-dir <plugin-root> is loaded.
 *   This keeps tests hermetic.
 *
 * - Default model is haiku. Plugin authors can override per-case when a
 *   test genuinely needs a bigger brain, but L3 should almost never reach
 *   for Opus — these are regression tests, not eval runs.
 *
 * - If ANTHROPIC_API_KEY is missing the whole layer is skipped with a
 *   clear message. Don't want CI to fail on repos that haven't wired a
 *   secret yet.
 */
import { readFile } from "node:fs/promises";
import yaml from "js-yaml";
import {
  PluginFilterError,
  discoverPlugins,
  discoverTestArtifacts,
} from "./lib/discover.mjs";
import { runClaude, assertClaudeAvailable } from "./lib/claude-runner.mjs";
import { evaluate } from "./lib/matchers.mjs";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_BUDGET = 0.25;
const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * L3 requires an authenticated `claude` CLI. Two paths are supported:
 *   1. ANTHROPIC_API_KEY in env → claude is run with --bare (fully hermetic).
 *   2. User is OAuth-logged-in via `claude auth` → --bare is dropped so
 *      the keychain can be read. Less hermetic but works for local dev.
 *
 * We can't reliably detect OAuth without invoking claude, so we just let
 * the run happen and surface "Not logged in" errors from the CLI itself.
 */
function hasEnvApiKey() {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN
  );
}

async function loadCase(file) {
  const raw = await readFile(file, "utf-8");
  const doc = yaml.load(raw);
  if (!doc || typeof doc !== "object") {
    throw new Error(`${file}: expected a YAML mapping at top level`);
  }
  if (!doc.prompt) throw new Error(`${file}: missing required field "prompt"`);
  return doc;
}

async function runCase(plugin, file) {
  const spec = await loadCase(file);
  const result = await runClaude({
    prompt: spec.prompt,
    pluginDirs: [plugin.root],
    model: spec.model || DEFAULT_MODEL,
    allowedTools: spec.allowedTools,
    disallowedTools: spec.disallowedTools,
    maxBudgetUsd: spec.maxBudgetUsd ?? DEFAULT_BUDGET,
    jsonSchema: spec.jsonSchema
      ? typeof spec.jsonSchema === "string"
        ? spec.jsonSchema
        : JSON.stringify(spec.jsonSchema)
      : undefined,
    timeoutMs: spec.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    bare: spec.bare ?? "auto",
    outputFormat: "json",
  });

  const evalResult = evaluate(spec.expect, result);
  return { spec, result, eval: evalResult, file };
}

/**
 * Extract cost/token stats from a parsed claude --output-format=json
 * result envelope. Returns zeroed metrics if fields are missing (e.g.
 * when the CLI errored out before the API responded).
 */
function extractMetrics(parsed) {
  const p = parsed || {};
  const usage = p.usage || {};
  return {
    costUsd: Number(p.total_cost_usd ?? 0),
    inputTokens: Number(usage.input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
    cacheReadTokens: Number(usage.cache_read_input_tokens ?? 0),
    cacheWriteTokens: Number(usage.cache_creation_input_tokens ?? 0),
    apiMs: Number(p.duration_api_ms ?? 0),
    model: p.modelUsage ? Object.keys(p.modelUsage)[0] || "" : "",
  };
}

function formatCost(usd) {
  // Render with enough precision to distinguish "real call" from "zero".
  // $0.0003 should not round to $0.00.
  if (usd === 0) return "$0.0000";
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  return `$${usd.toFixed(4)}`;
}

function formatMetricsLine(m) {
  const parts = [
    `cost=${formatCost(m.costUsd)}`,
    `in=${m.inputTokens}`,
    `out=${m.outputTokens}`,
  ];
  if (m.cacheReadTokens) parts.push(`cache_r=${m.cacheReadTokens}`);
  if (m.cacheWriteTokens) parts.push(`cache_w=${m.cacheWriteTokens}`);
  if (m.apiMs) parts.push(`api=${m.apiMs}ms`);
  return parts.join("  ");
}

function printResult(plugin, out) {
  const icon = out.eval.ok ? "✓" : "✗";
  const title = out.spec.name || out.file;
  console.log(`  ${icon} ${plugin.name}  ${title}  (${out.result.elapsedMs}ms)`);

  // Always surface the cost/token readout, both to give proof of a real
  // API call and to make regression-time drift visible.
  const metrics = extractMetrics(out.result.parsed);
  console.log(`      ${formatMetricsLine(metrics)}`);

  if (!out.eval.ok) {
    for (const f of out.eval.failures) {
      console.log(`      ${f}`);
    }
    if (out.result.stderr) {
      console.log("      --- stderr tail ---");
      for (const line of out.result.stderr.trim().split("\n").slice(-10)) {
        console.log(`      ${line}`);
      }
    }
  }
}

async function main() {
  try {
    await assertClaudeAvailable();
  } catch (err) {
    console.error("L3: cannot run", err.message);
    process.exit(2);
  }

  const plugins = await discoverPlugins();
  const toRun = [];
  for (const plugin of plugins) {
    const art = await discoverTestArtifacts(plugin);
    for (const file of art.e2e) toRun.push({ plugin, file });
  }

  const authMode = hasEnvApiKey()
    ? "hermetic (--bare + ANTHROPIC_API_KEY)"
    : "fallback (user keychain / OAuth; --bare dropped)";
  console.log("");
  console.log(`L3  End-to-end  (${toRun.length} case${toRun.length === 1 ? "" : "s"}, ${authMode})`);
  console.log("-".repeat(72));

  if (toRun.length === 0) {
    console.log("  (no e2e cases found — add plugins/<name>/tests/e2e/*.yaml)");
    console.log("");
    process.exit(0);
  }

  let failed = 0;
  const totals = {
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    apiMs: 0,
  };
  for (const { plugin, file } of toRun) {
    try {
      const out = await runCase(plugin, file);
      printResult(plugin, out);
      const m = extractMetrics(out.result.parsed);
      totals.costUsd += m.costUsd;
      totals.inputTokens += m.inputTokens;
      totals.outputTokens += m.outputTokens;
      totals.cacheReadTokens += m.cacheReadTokens;
      totals.cacheWriteTokens += m.cacheWriteTokens;
      totals.apiMs += m.apiMs;
      if (!out.eval.ok) failed++;
    } catch (err) {
      console.log(`  ✗ ${plugin.name}  ${file}`);
      console.log(`      crashed: ${err.message}`);
      failed++;
    }
  }
  console.log("-".repeat(72));
  console.log(`  ${toRun.length - failed} of ${toRun.length} e2e cases passed.`);
  console.log(`  totals: ${formatMetricsLine(totals)}`);
  if (totals.costUsd === 0 && totals.outputTokens === 0) {
    console.log("  note: zero cost/tokens — no real API call happened this run.");
  }
  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  if (err instanceof PluginFilterError) {
    console.error(err.message);
    process.exit(2);
  }
  console.error("L3 runner crashed:", err);
  process.exit(2);
});
