/**
 * L2 smoke test for the kcc-pm plugin scaffold: manifest shape and
 * marketplace registration consistency.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");
const repoRoot = path.resolve(pluginRoot, "..", "..");

async function readJson(p) {
  return JSON.parse(await readFile(p, "utf-8"));
}

test("plugin.json parses, is named kcc-pm, and carries a semver version", async () => {
  const manifest = await readJson(
    path.join(pluginRoot, ".claude-plugin", "plugin.json")
  );
  assert.equal(manifest.name, "kcc-pm");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("marketplace.json registers kcc-pm with the same version", async () => {
  const manifest = await readJson(
    path.join(pluginRoot, ".claude-plugin", "plugin.json")
  );
  const marketplace = await readJson(
    path.join(repoRoot, ".claude-plugin", "marketplace.json")
  );
  const entry = marketplace.plugins.find((p) => p.name === "kcc-pm");
  assert.ok(entry, "kcc-pm must be registered in marketplace.json");
  assert.equal(entry.source, "./plugins/kcc-pm");
  assert.equal(
    entry.version,
    manifest.version,
    "marketplace entry version must match plugin.json"
  );
});
