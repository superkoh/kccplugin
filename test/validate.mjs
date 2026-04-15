#!/usr/bin/env node
/**
 * L1 — Structural / schema validation.
 *
 * This layer is offline, deterministic, and zero-cost. It runs every time
 * and is the first gate anything must pass.
 *
 * For each artifact in the repo we run two checks in parallel:
 *
 *   1) Our own strict JSON Schemas (test/schemas/*.json) via ajv.
 *      These are deliberately stricter than Claude Code's own validator so
 *      we catch typos and field drift early, before a plugin ships to a
 *      marketplace.
 *
 *   2) The official `claude plugin validate <path>` subcommand, invoked
 *      once for the marketplace and once for each plugin root. Its exit
 *      code and stderr are captured and treated as authoritative: if the
 *      official validator rejects something our schemas accept, we still
 *      fail.
 *
 * Exit code: 0 when everything passes, 1 otherwise. Output is a terse
 * per-artifact table plus a list of failures.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import {
  REPO_ROOT,
  MARKETPLACE_PATH,
  PluginFilterError,
  discoverPlugins,
  inventoryPluginAssets,
  loadMarketplace,
} from "./lib/discover.mjs";
import { parseFrontmatterFile } from "./lib/frontmatter.mjs";

const SCHEMAS_DIR = path.join(REPO_ROOT, "test", "schemas");

async function loadSchema(name) {
  return JSON.parse(
    await readFile(path.join(SCHEMAS_DIR, name), "utf-8")
  );
}

function makeAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

// Our schemas carry a `$id`, and ajv refuses to register the same `$id`
// twice. The per-plugin loop used to call `ajv.compile(schema)` fresh for
// every plugin, which crashed the moment a second plugin existed. Compile
// each schema at most once per run and reuse the validator.
const validatorCache = new Map();
async function getValidator(ajv, name) {
  let v = validatorCache.get(name);
  if (!v) {
    const schema = await loadSchema(name);
    v = ajv.compile(schema);
    validatorCache.set(name, v);
  }
  return v;
}

/** Format an ajv error array as a human-readable string. */
function formatAjvErrors(errors) {
  if (!errors || errors.length === 0) return "unknown validation error";
  return errors
    .map((e) => {
      const where = e.instancePath || "(root)";
      const extra = e.params ? JSON.stringify(e.params) : "";
      return `  at ${where}: ${e.message} ${extra}`.trim();
    })
    .join("\n");
}

/**
 * Run `claude plugin validate <target>` and return {ok, stderr}.
 * If the claude CLI isn't installed, we return {skipped: true}.
 */
function runOfficialValidate(target) {
  return new Promise((resolve) => {
    const child = spawn("claude", ["plugin", "validate", target], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        resolve({ skipped: true, reason: "claude CLI not on PATH" });
      } else {
        resolve({ skipped: true, reason: err.message });
      }
    });
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

/** Collected failures — we keep going after each error to surface all of them. */
const failures = [];
const checks = []; // [{ label, status: "ok"|"fail"|"skip", detail? }]
let officialSkipped = false;

function record(label, ok, detail) {
  checks.push({ label, status: ok ? "ok" : "fail", detail });
  if (!ok) failures.push({ label, detail });
}

function skip(label, reason) {
  checks.push({ label, status: "skip", detail: reason });
}

async function validateMarketplace(ajv) {
  const marketplace = await loadMarketplace();
  if (!marketplace) {
    record("marketplace.json present", false, "file not found at .claude-plugin/marketplace.json");
    return null;
  }
  const validate = await getValidator(ajv, "marketplace.schema.json");
  const ok = validate(marketplace.json);
  record(
    "marketplace.json (schema)",
    ok,
    ok ? undefined : formatAjvErrors(validate.errors)
  );
  return marketplace;
}

async function validatePluginManifest(ajv, plugin) {
  if (!existsSync(plugin.manifestPath)) {
    record(
      `plugins/${plugin.name}/.claude-plugin/plugin.json`,
      false,
      "missing manifest file"
    );
    return null;
  }
  const raw = await readFile(plugin.manifestPath, "utf-8");
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    record(
      `plugins/${plugin.name}/plugin.json (JSON parse)`,
      false,
      err.message
    );
    return null;
  }
  const validate = await getValidator(ajv, "plugin.schema.json");
  const ok = validate(manifest);
  record(
    `plugins/${plugin.name}/plugin.json (schema)`,
    ok,
    ok ? undefined : formatAjvErrors(validate.errors)
  );
  // Soft check: name inside manifest should match the directory name, or
  // else the slash command namespace will be a lie.
  if (ok && manifest.name && manifest.name !== plugin.name) {
    record(
      `plugins/${plugin.name}: manifest.name`,
      false,
      `manifest.name "${manifest.name}" does not match directory name "${plugin.name}"`
    );
  }
  return manifest;
}

async function validateFrontmatter(ajv, filePath, schemaName, label) {
  let parsed;
  try {
    parsed = await parseFrontmatterFile(filePath);
  } catch (err) {
    record(label, false, err.message);
    return;
  }
  if (!parsed.frontmatter) {
    record(label, false, "file has no YAML frontmatter (expected `---` block at top)");
    return;
  }
  const validate = await getValidator(ajv, schemaName);
  const ok = validate(parsed.frontmatter);
  record(label, ok, ok ? undefined : formatAjvErrors(validate.errors));
}

async function validateHooksJson(ajv, hooksPath, label) {
  const raw = await readFile(hooksPath, "utf-8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    record(label, false, `invalid JSON: ${err.message}`);
    return;
  }
  const validate = await getValidator(ajv, "hooks.schema.json");
  const ok = validate(data);
  record(label, ok, ok ? undefined : formatAjvErrors(validate.errors));
}

async function validatePlugin(ajv, plugin) {
  await validatePluginManifest(ajv, plugin);

  const assets = await inventoryPluginAssets(plugin);

  for (const cmd of assets.commands) {
    await validateFrontmatter(
      ajv,
      cmd.path,
      "command-frontmatter.schema.json",
      `plugins/${plugin.name}/commands/${cmd.name}.md (frontmatter)`
    );
  }

  for (const agent of assets.agents) {
    await validateFrontmatter(
      ajv,
      agent.path,
      "agent-frontmatter.schema.json",
      `plugins/${plugin.name}/agents/${agent.name}.md (frontmatter)`
    );
  }

  for (const skill of assets.skills) {
    await validateFrontmatter(
      ajv,
      skill.path,
      "skill-frontmatter.schema.json",
      `plugins/${plugin.name}/skills/${skill.name}/SKILL.md (frontmatter)`
    );
  }

  if (assets.hooksJson) {
    await validateHooksJson(
      ajv,
      assets.hooksJson,
      `plugins/${plugin.name}/hooks/hooks.json`
    );
  }

  for (const wrong of assets.misplaced) {
    record(
      `plugins/${plugin.name}: misplaced directory`,
      false,
      `${wrong} must live at the plugin root, not under .claude-plugin/`
    );
  }
}

async function runOfficialValidators(marketplace, plugins) {
  const targets = [];
  if (marketplace) targets.push({ label: "marketplace", path: REPO_ROOT });
  for (const p of plugins) {
    targets.push({ label: `plugins/${p.name}`, path: p.root });
  }
  for (const t of targets) {
    const res = await runOfficialValidate(t.path);
    if (res.skipped) {
      officialSkipped = true;
      skip(`claude plugin validate ${t.label}`, res.reason);
      continue;
    }
    const detail =
      res.ok ? undefined : (res.stderr || res.stdout || `exit ${res.code}`);
    record(`claude plugin validate ${t.label}`, res.ok, detail);
  }
}

function printReport() {
  const pad = (s, n) => (s + " ".repeat(Math.max(0, n - s.length)));
  const icon = { ok: "✓", fail: "✗", skip: "-" };
  console.log("");
  console.log("L1  Schema & manifest validation");
  console.log("-".repeat(72));
  for (const c of checks) {
    console.log(`  ${icon[c.status]} ${pad(c.label, 60)} ${c.status === "skip" ? `(${c.detail})` : ""}`);
  }
  console.log("-".repeat(72));

  if (failures.length === 0) {
    const passed = checks.filter((c) => c.status === "ok").length;
    console.log(`  ${passed} check(s) passed.`);
    if (officialSkipped) {
      console.log(
        "  note: `claude plugin validate` was skipped (CLI unavailable)."
      );
    }
  } else {
    console.log(`  ${failures.length} failure(s):`);
    for (const f of failures) {
      console.log(`    • ${f.label}`);
      if (f.detail) {
        for (const line of f.detail.split("\n")) {
          console.log(`        ${line}`);
        }
      }
    }
  }
  console.log("");
}

async function main() {
  const ajv = makeAjv();

  const marketplace = await validateMarketplace(ajv);
  const plugins = await discoverPlugins();

  if (plugins.length === 0) {
    record("plugins/*", false, "no plugins found under plugins/");
  }

  for (const p of plugins) {
    await validatePlugin(ajv, p);
  }

  await runOfficialValidators(marketplace, plugins);

  printReport();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  if (err instanceof PluginFilterError) {
    console.error(err.message);
    process.exit(2);
  }
  console.error("L1 validator crashed:", err);
  process.exit(2);
});
