/**
 * L2 smoke test for the kcc-ablation plugin scaffold: the manifest
 * parses and declares the expected plugin name (the directory name is
 * the slash-command namespace, so the two must agree).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

test("plugin.json parses and has the expected name", async () => {
  const raw = await readFile(
    path.join(pluginRoot, ".claude-plugin", "plugin.json"),
    "utf-8"
  );
  const manifest = JSON.parse(raw);
  assert.equal(manifest.name, "kcc-ablation");
});
