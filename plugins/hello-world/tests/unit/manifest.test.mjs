/**
 * Example L2 unit test using `node --test`. Zero dependencies — the
 * Node runtime ships the test runner and assertions out of the box.
 *
 * This is what a plugin author would typically write to test JS/TS
 * helper libraries or an MCP server written in Node.
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
  assert.equal(manifest.name, "hello-world");
});

test("SKILL.md has a YAML frontmatter description", async () => {
  const raw = await readFile(
    path.join(pluginRoot, "skills", "greeting", "SKILL.md"),
    "utf-8"
  );
  assert.match(raw, /^---\r?\n/);
  assert.match(raw, /\bdescription:/);
});
