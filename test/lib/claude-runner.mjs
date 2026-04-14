/**
 * Thin wrapper around `claude -p` for hermetic, scriptable test runs.
 *
 * Design notes:
 *
 * - `--bare` strips the user's environment (hooks, LSP, auto-memory,
 *   CLAUDE.md auto-discovery, plugin sync) so the test only sees what we
 *   explicitly loaded via --plugin-dir. The catch: --bare also refuses to
 *   read the OS keychain for auth, so OAuth-logged-in users won't be able
 *   to run it without ANTHROPIC_API_KEY. The runner supports three modes:
 *     bare: true   → always use --bare (hermetic, needs ANTHROPIC_API_KEY)
 *     bare: false  → never use --bare (uses keychain auth if available)
 *     bare: "auto" → --bare IFF ANTHROPIC_API_KEY is set in env (default)
 *
 * - `--no-session-persistence` keeps test runs from cluttering /resume.
 *
 * - `--permission-mode bypassPermissions` is required or a --print session
 *   would hang waiting for tool permission prompts that have no UI.
 *
 * - `--output-format json` gives us a single JSON object at the end instead
 *   of freeform text, which is what matchers parse.
 *
 * - `--max-budget-usd` is a hard cost cap so a runaway test can't burn money.
 *
 * - We do NOT hardcode a model here. Individual e2e cases pick one.
 *
 * - We never set CLAUDE_CODE_* env flags — those go through CLI args so
 *   every choice is visible in stderr when --debug is on.
 */
import { spawn } from "node:child_process";

/**
 * @typedef {Object} RunOptions
 * @property {string}   prompt                 Prompt to send to --print mode.
 * @property {string[]} [pluginDirs]           Absolute plugin roots to load.
 * @property {string}   [model]                Model alias (e.g. "haiku") or full id.
 * @property {string[]} [allowedTools]
 * @property {string[]} [disallowedTools]
 * @property {number}   [maxBudgetUsd]         Hard cost cap. Default: 0.25.
 * @property {boolean|"auto"} [bare]           true | false | "auto". Default: "auto".
 * @property {string}   [outputFormat]         "json" (default) or "stream-json".
 * @property {string}   [jsonSchema]           Optional JSON schema string for structured output.
 * @property {boolean}  [includeHookEvents]    Only meaningful with stream-json.
 * @property {number}   [timeoutMs]            Default: 120_000.
 * @property {string}   [cwd]                  Working dir for the child. Default: repo root.
 * @property {object}   [env]                  Extra env vars merged onto process.env.
 */

/**
 * @param {RunOptions} opts
 * @returns {Promise<{ exitCode: number|null, stdout: string, stderr: string,
 *                     parsed: any | null, elapsedMs: number, cmdArgv: string[] }>}
 */
export function runClaude(opts) {
  const {
    prompt,
    pluginDirs = [],
    model,
    allowedTools,
    disallowedTools,
    maxBudgetUsd = 0.25,
    bare = "auto",
    outputFormat = "json",
    jsonSchema,
    includeHookEvents = false,
    timeoutMs = 120_000,
    cwd,
    env,
  } = opts;

  const resolvedBare =
    bare === "auto" ? !!process.env.ANTHROPIC_API_KEY : !!bare;

  const argv = ["-p", prompt];
  if (resolvedBare) argv.push("--bare");
  argv.push("--permission-mode", "bypassPermissions");
  argv.push("--no-session-persistence");
  argv.push("--output-format", outputFormat);
  argv.push("--max-budget-usd", String(maxBudgetUsd));

  if (model) argv.push("--model", model);
  if (allowedTools && allowedTools.length)
    argv.push("--allowedTools", allowedTools.join(","));
  if (disallowedTools && disallowedTools.length)
    argv.push("--disallowedTools", disallowedTools.join(","));
  for (const dir of pluginDirs) argv.push("--plugin-dir", dir);
  if (jsonSchema) argv.push("--json-schema", jsonSchema);
  if (includeHookEvents) argv.push("--include-hook-events");

  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn("claude", argv, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killedByTimeout = false;

    const killer = setTimeout(() => {
      killedByTimeout = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      clearTimeout(killer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(killer);
      const elapsedMs = Date.now() - started;
      let parsed = null;
      if (outputFormat === "json" && stdout.trim().length > 0) {
        try {
          parsed = JSON.parse(stdout);
        } catch {
          // leave null — matchers can still inspect stdout directly
        }
      }
      resolve({
        exitCode: killedByTimeout ? null : code,
        stdout,
        stderr,
        parsed,
        elapsedMs,
        cmdArgv: ["claude", ...argv],
      });
    });
  });
}

/**
 * Quick check: does the `claude` CLI exist on PATH?
 * Use before firing L3 to produce a nice error instead of an ENOENT trace.
 */
export async function assertClaudeAvailable() {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["--version"], { stdio: "ignore" });
    child.on("error", () =>
      reject(new Error("`claude` CLI not found on PATH"))
    );
    child.on("close", (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`\`claude --version\` exited with code ${code}`));
    });
  });
}
