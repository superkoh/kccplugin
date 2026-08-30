/**
 * L2 smoke test for the kcc-pm plugin scaffold: manifest shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

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
