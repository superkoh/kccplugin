/**
 * L2 smoke test for the kcc-core plugin scaffold. Intentionally minimal:
 * there are no commands / skills / agents yet, so we only assert that the
 * manifest parses and declares the expected plugin name.
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
  assert.equal(manifest.name, "kcc-core");
});
