// Pure helpers used by the SessionStart / UserPromptSubmit / SessionEnd / Stop
// hook entry scripts. Kept stateless so they are easy to unit-test.

import { appendFile, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "..", "prompts");

// The Stop hook's noise-gate threshold. Mirrors the "code blocks under ~40
// lines" cutoff from prompts/rules-core.md — changing one should change both.
export const PUSHABLE_MIN_LINES = 40;
// File extensions that we treat as long-form, browser-worth-reading artifacts.
// Source code and binaries are intentionally excluded — the prompt's guidance
// there is "use kind:file", but auto-blocking every .ts write would be noise.
export const PUSHABLE_EXTS = new Set([".md", ".mdx", ".html", ".mmd", ".svg"]);

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

export async function buildSessionStartContext({ url, contentDir, vcStateDir, reason, claudeHome }) {
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

// -- Stop-hook helpers -------------------------------------------------------

// The session's own record of every file-write tool call this session has
// made, written by the PostToolUse hook. The file is session-scoped, but
// Stop evaluates it turn-scoped: scanSidecarForPushableFiles(..., {
// sinceLastTurnStart: true }) only returns writes after the most recent
// turn_start marker so unpushed files from earlier turns don't re-trigger
// Stop on every subsequent turn (v0.2.0 regression). Claude Code's native
// transcript would be a tempting source, but it's only flushed to disk
// when session-persistence is on, which breaks --no-session-persistence
// test runs — and leaves us at the mercy of an undocumented JSONL format
// we don't own.
export const WRITE_SIDECAR = "tool-writes.jsonl";

// Called by the PostToolUse hook entry for each Write / Edit / MultiEdit.
// Records absolute paths only so the Stop-side reconciler never has to
// re-resolve cwd. Errors are swallowed — we'd rather miss one line than
// break a tool call because the disk is full.
export async function appendWriteSidecar(sessionDir, { tool, filePath, cwd }) {
  if (!sessionDir || !filePath) return;
  const abs = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.normalize(path.join(cwd || process.cwd(), filePath));
  const line = JSON.stringify({ event: "write", ts: Date.now(), tool, file_path: abs }) + "\n";
  try { await appendFile(path.join(sessionDir, WRITE_SIDECAR), line); } catch {}
}

// Read the write sidecar and return absolute paths of files the session has
// touched that currently qualify as push-worthy. "Pushable" means:
//   - extension in PUSHABLE_EXTS
//   - not inside contentDir (those are push entries, not candidates)
//   - file currently on disk has ≥ PUSHABLE_MIN_LINES lines
// The line-count check uses live file state so Edits that shrank a file
// below threshold are correctly filtered out.
//
// `sinceLastTurnStart: true` scopes the scan to writes after the most recent
// `turn_start` marker — Stop evaluates "did the AI forget to push in THIS
// turn", not "are there any historical unpushed files". If no marker is
// present (legacy session, or server died before UserPromptSubmit could write
// it) the scan silently falls back to the whole sidecar so old sessions
// still get the v0.2.0 behavior instead of a silent no-op.
export async function scanSidecarForPushableFiles(sessionDir, { contentDir, sinceLastTurnStart } = {}) {
  if (!sessionDir) return [];
  let raw;
  try { raw = await readFile(path.join(sessionDir, WRITE_SIDECAR), "utf-8"); }
  catch { return []; }

  const lines = raw.split("\n");
  let startIdx = 0;
  if (sinceLastTurnStart) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i]) continue;
      let e; try { e = JSON.parse(lines[i]); } catch { continue; }
      if (e.event === "turn_start") { startIdx = i + 1; break; }
    }
  }

  const normContent = contentDir ? path.normalize(contentDir) + path.sep : null;
  const seen = new Set();
  const candidates = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.event && e.event !== "write") continue;   // 跳过 turn_start / ask_user_question
    const fp = e.file_path;
    if (!fp || seen.has(fp)) continue;
    seen.add(fp);
    if (normContent && fp.startsWith(normContent)) continue;
    if (!PUSHABLE_EXTS.has(path.extname(fp).toLowerCase())) continue;
    candidates.push(fp);
  }

  const pushable = [];
  for (const fp of candidates) {
    try {
      const content = await readFile(fp, "utf-8");
      if (content.split("\n").length >= PUSHABLE_MIN_LINES) pushable.push(fp);
    } catch { /* file gone post-write, skip */ }
  }
  return pushable;
}

// Read all push-entry files in contentDir, parse their YAML frontmatter, and
// return the set of absolute `path:` values (kind:file entries). Used to
// reconcile "AI wrote X.md" against "did AI also create an entry pointing
// at X.md?". Does a minimal regex parse; matches the server's parser for
// the fields it cares about, without taking a dependency.
export async function listPushedEntryPaths(contentDir) {
  const out = new Set();
  let names;
  try { names = await readdir(contentDir); } catch { return out; }
  for (const name of names) {
    if (!name.endsWith(".md") && !name.endsWith(".html")) continue;
    let body;
    try { body = await readFile(path.join(contentDir, name), "utf-8"); } catch { continue; }
    const m = body.match(/^---\n([\s\S]*?)\n---/);
    if (!m) continue;
    const fm = m[1];
    const kind = fm.match(/^kind:\s*(\w+)/m)?.[1];
    const p = fm.match(/^path:\s*"?([^"\n]+?)"?\s*$/m)?.[1];
    if (kind === "file" && p) out.add(path.normalize(p.trim()));
  }
  return out;
}

export function buildStopBlockReason({ missingPaths, contentDir }) {
  const list = missingPaths.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const firstTitle = path.basename(missingPaths[0] || "").replace(/\.[^.]+$/, "") || "generated file";
  return [
    "[kcc-preview] You generated long-form file(s) this turn but did not push them to the preview:",
    "",
    list,
    "",
    `These meet the push threshold (≥${PUSHABLE_MIN_LINES} lines, .md/.html/.svg/.mmd). ` +
    `Create a kind:file entry in ${contentDir}/ for each before finishing. ` +
    "Example for the first:",
    "",
    "```markdown",
    "---",
    `title: "${firstTitle}"`,
    "kind: file",
    `path: "${missingPaths[0]}"`,
    "---",
    "```",
    "",
    "Use the Write tool — one entry file per referenced file. Then finish your reply ",
    "with the single-line push announcement (`👀 已推送到 preview: …`).",
  ].join("\n");
}

export function emitStopBlock(reason) {
  return JSON.stringify({ decision: "block", reason });
}

// Turn boundary marker, written by the UserPromptSubmit hook. The Stop hook
// reads the sidecar backward to find the most recent turn_start, then scans
// forward to decide if `ask_user_question` happened "this turn". Errors are
// swallowed — missing markers degrade to "no intent signal", never to a
// broken hook.
export async function appendTurnStart(sessionDir) {
  if (!sessionDir) return;
  const line = JSON.stringify({ event: "turn_start", ts: Date.now() }) + "\n";
  try { await appendFile(path.join(sessionDir, WRITE_SIDECAR), line); } catch {}
}

// Intent signal: AI just called AskUserQuestion. Written by the PostToolUse
// hook matching on tool_name="AskUserQuestion". One event per call is enough
// — Stop only asks "was at least one call made this turn?".
export async function appendAskUserQuestionEvent(sessionDir) {
  if (!sessionDir) return;
  const line = JSON.stringify({ event: "ask_user_question", ts: Date.now() }) + "\n";
  try { await appendFile(path.join(sessionDir, WRITE_SIDECAR), line); } catch {}
}

// C-signal: is the file path review-worthy by convention? Case-insensitive
// substring match on "specs" or "plans" (path separators normalized). Matches
// docs/specs/, docs/plans/, docs/feature-specs/, archives/Plans/, etc.
// Substring match (not path-segment equality) is deliberate — it catches
// common variants without forcing a canonical directory name. Words like
// "specifications" or "planning" do not match because they lack the trailing
// "s" / don't contain "plans" respectively.
export function matchReviewPath(absPath) {
  if (!absPath || typeof absPath !== "string") return false;
  const p = absPath.replace(/\\/g, "/").toLowerCase();
  return p.includes("specs") || p.includes("plans");
}

// B-signal: was AskUserQuestion invoked since the most recent turn boundary?
// Read the sidecar as JSONL, find the last "event: turn_start" line, and scan
// forward for any "event: ask_user_question". Absent turn boundaries -> false
// (conservative: legacy sessions don't trigger B).
export async function hasAskUserQuestionThisTurn(sessionDir) {
  if (!sessionDir) return false;
  let raw;
  try { raw = await readFile(path.join(sessionDir, WRITE_SIDECAR), "utf-8"); }
  catch { return false; }

  const lines = raw.split("\n").filter(Boolean);
  let lastTurnIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    let e; try { e = JSON.parse(lines[i]); } catch { continue; }
    if (e.event === "turn_start") { lastTurnIdx = i; break; }
  }
  if (lastTurnIdx < 0) return false;

  for (let i = lastTurnIdx + 1; i < lines.length; i++) {
    let e; try { e = JSON.parse(lines[i]); } catch { continue; }
    if (e.event === "ask_user_question") return true;
  }
  return false;
}
