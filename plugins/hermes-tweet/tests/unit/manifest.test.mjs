import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

test("plugin manifest identifies Hermes Tweet", async () => {
  const raw = await readFile(
    path.join(pluginRoot, ".claude-plugin", "plugin.json"),
    "utf-8"
  );
  const manifest = JSON.parse(raw);
  assert.equal(manifest.name, "hermes-tweet");
  assert.equal(manifest.repository, "https://github.com/Xquik-dev/hermes-tweet");
  assert.ok(manifest.keywords.includes("hermes-agent"));
});
