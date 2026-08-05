// L2 schema-coverage test for kcc-core's SessionStart hook.
//
// bats already covers shell-specific concerns (PATH stripping, exit code).
// This companion runs the script under node and routes its stdout through
// the shared hook-output schema validator, so any future drift of the
// emitted JSON shape fails loudly here before reaching Claude Code's
// runtime validator.
//
// The repo-level test/unit/hook-scripts.test.mjs covers the same ground for
// *every* plugin's hooks, plus byte-exactness and the no-external-commands
// policy; this file stays as kcc-core's own local guard.

import { test } from "node:test";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertHookOutput } from "../../../../test/lib/hook-output.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, "..", "..", "scripts", "session-start-principles.sh");

function runScript() {
  return new Promise((resolve) => {
    const p = spawn("bash", [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => out += d);
    p.stderr.on("data", (d) => err += d);
    p.on("close", (code) => resolve({ code, out, err }));
    p.stdin.end();
  });
}

test("kcc-core SessionStart hook stdout passes the hook-output schema", async () => {
  const { code, out, err } = await runScript();
  const { default: assert } = await import("node:assert/strict");
  assert.equal(code, 0, `hook exited ${code}; stderr: ${err}`);
  const j = await assertHookOutput("SessionStart", out);
  // Sanity: the script is supposed to emit the thinking-principles sentinel.
  // Unconditional now — there is no dependency left that could legitimately
  // turn this into an empty injection.
  assert.match(j.hookSpecificOutput.additionalContext, /kcc-core-thinking-principles-v\d+/);
});
