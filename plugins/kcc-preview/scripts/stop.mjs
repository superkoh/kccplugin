#!/usr/bin/env node
// Stop hook entry.
//
// Job: when Claude tries to end a turn, check whether it generated a long-form
// file (spec / plan / doc) this session but forgot to push a `kind:file`
// entry into the preview's content/ dir. If so, return decision="block" so
// Claude Code keeps Claude in the same turn and feeds `reason` back —
// nudging it to create the entry. Next time we run, Claude Code sets
// `stop_hook_active=true`, at which point we exit 0 silently to avoid
// infinite loops (upstream anti-loop pattern documented at
// code.claude.com/docs/en/hooks).
//
// Ground truth for "what was written" is the sidecar written by our own
// PostToolUse hook, not Claude Code's native transcript — the native one
// is absent under --no-session-persistence and the format is undocumented.
//
// Any failure path — no session dir, malformed stdin, crash — must exit 0
// silently. The hook must never break the user's session.

import path from "node:path";
import os from "node:os";
import {
  sessionDirFor,
  scanSidecarForPushableFiles,
  listPushedEntryPaths,
  buildStopBlockReason,
  emitStopBlock,
} from "./lib/hook-core.mjs";

const ROOT = process.env.KCC_PREVIEW_ROOT || path.join(os.tmpdir(), "kcc-preview");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks).toString("utf-8").trim();
  if (!buf) return {};
  try { return JSON.parse(buf); } catch { return {}; }
}

async function main() {
  const input = await readStdin();

  // Anti-loop gate, checked first. If Claude Code is already asking us again
  // after we blocked on the previous attempt, let this turn end — one retry
  // is the contract.
  if (input.stop_hook_active === true) return;

  const sessionId = input.session_id;
  if (!sessionId) return;

  const sessionDir = sessionDirFor(ROOT, sessionId);
  const contentDir = path.join(sessionDir, "content");

  const written = await scanSidecarForPushableFiles(sessionDir, { contentDir });
  if (written.length === 0) return;

  const pushed = await listPushedEntryPaths(contentDir);
  const missing = written.filter((p) => !pushed.has(path.normalize(p)));
  if (missing.length === 0) return;

  const reason = buildStopBlockReason({ missingPaths: missing, contentDir });
  process.stdout.write(emitStopBlock(reason));
}

main().catch((err) => {
  // Last-ditch: surface the failure to stderr for debugging but still exit 0.
  // Blocking a session because our own hook crashed would be indefensible.
  process.stderr.write(String(err?.stack || err) + "\n");
});
