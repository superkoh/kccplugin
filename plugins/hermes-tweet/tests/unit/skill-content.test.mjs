import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

test("workflow skill documents read and action gates", async () => {
  const skill = await readFile(
    path.join(pluginRoot, "skills", "workflow", "SKILL.md"),
    "utf-8"
  );
  assert.match(skill, /tweet_explore/);
  assert.match(skill, /tweet_read/);
  assert.match(skill, /tweet_action/);
  assert.match(skill, /HERMES_TWEET_ENABLE_ACTIONS=true/);
});
