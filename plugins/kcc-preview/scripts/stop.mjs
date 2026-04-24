#!/usr/bin/env node
// Stop hook entry (v0.2.1 semantics).
//
// Blocks the turn only when the LLM is about to pause and wait for the user —
// not just because it wrote a long .md. Two signals, union of either triggers:
//   B (intent) — hasAskUserQuestionThisTurn: the AI called AskUserQuestion
//                somewhere in the current turn.
//   C (path)   — matchReviewPath: the file is under a review-by-convention
//                directory (contains "specs" or "plans" substring).
//
// Both signals are evaluated over THIS turn's writes only — files the AI
// wrote in earlier turns that were never pushed don't keep re-triggering
// Stop on every subsequent turn (v0.2.0 regression). scanSidecarForPushableFiles
// handles the windowing via sinceLastTurnStart.
//
// If neither fires, the unpushed write is treated as a display-only
// deliverable (README / CHANGELOG / analysis summary) and the turn is allowed
// to end. The old "block on any ≥40-line md write" rule is gone.
//
// Anti-loop: stop_hook_active=true skips the check on retry. Any failure path
// exits 0 silently — a crashing hook must never strand a session.

import path from "node:path";
import os from "node:os";
import {
  sessionDirFor,
  scanSidecarForPushableFiles,
  listPushedEntryPaths,
  buildStopBlockReason,
  emitStopBlock,
  hasAskUserQuestionThisTurn,
  matchReviewPath,
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
  if (input.stop_hook_active === true) return;
  const sessionId = input.session_id;
  if (!sessionId) return;

  const sessionDir = sessionDirFor(ROOT, sessionId);
  const contentDir = path.join(sessionDir, "content");

  const written = await scanSidecarForPushableFiles(sessionDir, { contentDir, sinceLastTurnStart: true });
  if (written.length === 0) return;

  const pushed = await listPushedEntryPaths(contentDir);
  const unpushed = written.filter((p) => !pushed.has(path.normalize(p)));
  if (unpushed.length === 0) return;

  const intent = await hasAskUserQuestionThisTurn(sessionDir);
  const missing = intent ? unpushed : unpushed.filter((p) => matchReviewPath(p));
  if (missing.length === 0) return;

  const reason = buildStopBlockReason({ missingPaths: missing, contentDir });
  process.stdout.write(emitStopBlock(reason));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
});
