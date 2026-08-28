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
import { readFile, readdir } from "node:fs/promises";
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
import { isNonPluginFilter } from "./lib/discover.mjs";
import { projectPath } from "../installer/lib/projection.mjs";
import { walkFiles } from "../installer/lib/fsops.mjs";

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

async function validatePluginManifest(ajv, plugin, marketplace) {
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
  // Soft check: when both the marketplace entry and the manifest declare a
  // version they must agree, or the marketplace advertises a version the
  // plugin doesn't ship. Both files pass their own schemas either way, so
  // this cross-file drift is otherwise invisible to L1.
  const entry = marketplace?.json?.plugins?.find((p) => p.name === plugin.name);
  if (ok && entry?.version && manifest.version && entry.version !== manifest.version) {
    record(
      `plugins/${plugin.name}: version sync`,
      false,
      `marketplace.json version "${entry.version}" does not match plugin.json version "${manifest.version}"`
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

async function validatePlugin(ajv, plugin, marketplace) {
  await validatePluginManifest(ajv, plugin, marketplace);

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

  const modulePath = path.join(plugin.root, "kcc.module.json");
  if (existsSync(modulePath)) {
    const label = `plugins/${plugin.name}/kcc.module.json`;
    try {
      const validate = await getValidator(ajv, "kcc-module.schema.json");
      const data = JSON.parse(await readFile(modulePath, "utf-8"));
      record(label, validate(data), formatAjvErrors(validate.errors));
    } catch (err) {
      record(label, false, err.message);
    }
  }

  for (const wrong of assets.misplaced) {
    record(
      `plugins/${plugin.name}: misplaced directory`,
      false,
      `${wrong} must live at the plugin root, not under .claude-plugin/`
    );
  }
}

/**
 * Projection invariants.
 *
 * These are the rules the *installer* depends on but the plugin spec knows
 * nothing about, so nothing else would catch a violation until a project
 * silently lost a capability:
 *
 *  - Project-level agents are flat and their name comes from frontmatter, so
 *    two modules shipping `agents/pm.md` would overwrite each other, and an
 *    agent whose name contains a colon fails to register at all (verified
 *    against a live CLI). Requiring `name` to start with the module name and
 *    to match the filename makes both impossible.
 *  - No two modules may project onto the same target path, for any asset.
 */
async function validateProjection(plugins, filtered) {
  const seen = new Map(); // target path → module
  for (const plugin of plugins) {
    const assets = await inventoryPluginAssets(plugin);

    for (const agent of assets.agents) {
      const label = `plugins/${plugin.name}/agents/${agent.name}.md (projection)`;
      const parsed = await parseFrontmatterFile(agent.path);
      const name = parsed?.frontmatter?.name;
      if (typeof name !== "string") {
        record(label, false, "missing frontmatter `name`");
        continue;
      }
      if (name.includes(":")) {
        record(label, false, `agent name "${name}" contains ":" — such agents never register`);
      } else if (name !== agent.name) {
        record(label, false, `frontmatter name "${name}" must match the filename "${agent.name}.md"`);
      } else if (name !== plugin.name && !name.startsWith(`${plugin.name}-`)) {
        record(
          label,
          false,
          `agent name "${name}" must be "${plugin.name}" or start with "${plugin.name}-" — ` +
            "project-level agents are flat, so an unprefixed name can collide across modules"
        );
      } else {
        record(label, true);
      }
    }

    for (const skill of assets.skills) {
      if (skill.name.includes(":")) {
        record(
          `plugins/${plugin.name}/skills/${skill.name} (projection)`,
          false,
          "a skill directory name must not contain ':' — the installer adds the module namespace"
        );
      }
    }

    for (const rel of await walkFiles(plugin.root)) {
      const target = projectPath(plugin.name, rel);
      if (!target) continue;
      if (seen.has(target) && seen.get(target) !== plugin.name) {
        record(
          `projection collision: ${target}`,
          false,
          `both ${seen.get(target)} and ${plugin.name} project onto it`
        );
      }
      seen.set(target, plugin.name);
    }
  }

  if (filtered) {
    skip(
      "projection: cross-module collisions",
      "PLUGIN filter is set — run without it to check every module against every other"
    );
  } else {
    record(`projection: ${seen.size} target paths, no collisions`, true);
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
  if (isNonPluginFilter()) {
    console.log(`\nL1  Schema & manifest validation`);
    console.log("-".repeat(72));
    console.log(`  - skipped: "${process.env.PLUGIN}" is not a plugin (it has no L1 surface)`);
    console.log("");
    process.exit(0);
  }
  const ajv = makeAjv();

  const marketplace = await validateMarketplace(ajv);
  const plugins = await discoverPlugins();

  if (plugins.length === 0) {
    record("plugins/*", false, "no plugins found under plugins/");
  }

  for (const p of plugins) {
    await validatePlugin(ajv, p, marketplace);
  }

  await validateProjection(plugins, !!process.env.PLUGIN);

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
