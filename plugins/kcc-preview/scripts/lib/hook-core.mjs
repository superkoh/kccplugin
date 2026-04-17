// Pure helpers used by the SessionStart / UserPromptSubmit / SessionEnd
// hook entry scripts. Kept stateless so they are easy to unit-test.

import { readFile, readdir, rm, stat } from "node:fs/promises";
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
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === "EPERM"; }
}

export async function sweepStale(root, activeIds = new Set()) {
  let entries;
  try { entries = await readdir(root); } catch { return; }
  for (const name of entries) {
    if (activeIds.has(name)) continue;
    const dir = path.join(root, name);
    let pid = null;
    try {
      const s = await stat(dir);
      if (!s.isDirectory()) continue;
      pid = Number(await readFile(path.join(dir, "server.pid"), "utf-8").catch(() => ""));
    } catch { /* fall through */ }

    // A sibling Claude Code session's server — leave it alone. The owning
    // session's own SessionEnd hook will clean it up. Wiping it here would
    // kill the peer's preview mid-session.
    if (pid && isPidAlive(pid)) continue;

    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
}

export async function buildSessionStartContext({ url, contentDir, vcStateDir, reason }) {
  if (!url) {
    return `<!-- kcc-preview: unavailable (${reason || "unknown"}) -->`;
  }
  const tpl = await readFile(path.join(PROMPTS_DIR, "rules.md"), "utf-8");
  return tpl
    .replace(/\{\{URL\}\}/g, url)
    .replace(/\{\{CONTENT_DIR\}\}/g, contentDir)
    .replace(/\{\{VC_STATE_DIR\}\}/g, vcStateDir);
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
