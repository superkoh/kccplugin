// Pure helpers used by the SessionStart / UserPromptSubmit / SessionEnd / Stop
// hook entry scripts. Kept stateless so they are easy to unit-test.

import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "..", "prompts");

export function sessionDirFor(root, sessionId) {
  return path.join(root, sessionId);
}

function isPidAlive(pid) {
  // POSIX kill(pid, 0) throws ESRCH when the process is truly gone, and
  // EPERM when it exists but is owned by a different uid. Treating EPERM
  // as "dead" would let sweepStale wipe a sibling-uid live session dir.
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === "EPERM"; }
}

// `cc.pid` is the Claude Code parent process pid, written by SessionStart.
// Missing file = legacy 0.2.x dir → leave alone (will age out via tmpdir
// clean / next reboot). Present + alive → leave. Present + dead → rm.
export async function sweepStale(root, activeIds = new Set()) {
  let entries;
  try { entries = await readdir(root); } catch { return; }
  for (const name of entries) {
    if (activeIds.has(name)) continue;
    const dir = path.join(root, name);
    try {
      const s = await stat(dir);
      if (!s.isDirectory()) continue;
    } catch { continue; }

    let raw;
    try { raw = await readFile(path.join(dir, "cc.pid"), "utf-8"); }
    catch { continue; }  // no cc.pid → unknown, do not delete

    const pid = Number(raw.trim());
    if (isPidAlive(pid)) continue;
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
}

// Records the Claude Code parent process pid into <sessionDir>/cc.pid.
// SessionStart calls this once per session so sweepStale can later decide
// whether the owning CC parent is still alive.
export async function writeCcPid(sessionDir, pid = process.ppid) {
  await writeFile(path.join(sessionDir, "cc.pid"), String(pid));
}

// Probe a local preview server's /health endpoint. Returns true iff the
// server responds with HTTP 200 within timeoutMs. Used by UserPromptSubmit
// to detect a dead daemon before re-running leader election.
export function pingHealth(port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/health", timeout: timeoutMs },
      (res) => { resolve(res.statusCode === 200); res.resume(); },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

// Check whether superpowers is installed via any marketplace under the user's
// plugin cache. Used to gate the superpowers brainstorming compatibility
// appendix so users who don't have superpowers don't pay ~1KB of dead-weight
// context on every session. The check is a cache-dir glob, not a runtime
// probe — fast, no side effects, no false positives on inactive installs.
// `claudeHome` is overridable for tests; defaults to ~/.claude.
export async function isSuperpowersInstalled({ claudeHome } = {}) {
  const root = path.join(claudeHome || path.join(os.homedir(), ".claude"), "plugins", "cache");
  let marketplaces;
  try { marketplaces = await readdir(root); } catch { return false; }
  for (const mp of marketplaces) {
    try {
      const plugins = await readdir(path.join(root, mp));
      if (plugins.includes("superpowers")) return true;
    } catch {}
  }
  return false;
}

export async function buildSessionStartContext({ url, contentDir, vcStateDir, labelFile, reason, claudeHome }) {
  if (!url) {
    return `<!-- kcc-preview: unavailable (${reason || "unknown"}) -->`;
  }
  let tpl = await readFile(path.join(PROMPTS_DIR, "rules-core.md"), "utf-8");
  if (await isSuperpowersInstalled({ claudeHome })) {
    const appendix = await readFile(path.join(PROMPTS_DIR, "rules-superpowers.md"), "utf-8");
    tpl = tpl + appendix;
  }
  return tpl
    .replace(/\{\{URL\}\}/g, url)
    .replace(/\{\{CONTENT_DIR\}\}/g, contentDir)
    .replace(/\{\{VC_STATE_DIR\}\}/g, vcStateDir)
    .replace(/\{\{LABEL_FILE\}\}/g, labelFile || "");
}

export async function buildReminderContext({ url }) {
  if (!url) return "";
  const tpl = await readFile(path.join(PROMPTS_DIR, "reminder.md"), "utf-8");
  return tpl.replace(/\{\{URL\}\}/g, url);
}

// Per-event emitters. Claude Code's hook-output schema differs by event:
// SessionStart / UserPromptSubmit accept hookSpecificOutput.additionalContext,
// but SessionEnd does not — emitting hookSpecificOutput there fails schema
// validation at runtime.
export function emitSessionStart(additionalContext) {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
    suppressOutput: false,
  });
}

export function emitUserPromptSubmit(additionalContext) {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext },
    suppressOutput: false,
  });
}

export function emitSessionEnd() {
  return JSON.stringify({ continue: true, suppressOutput: true });
}
