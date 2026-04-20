#!/usr/bin/env node
// PostToolUse hook entry.
//
// Records every Write / Edit / MultiEdit call to a session-scoped sidecar
// (<sessionDir>/tool-writes.jsonl). The Stop hook reads that sidecar to
// reconcile "AI wrote X" against "AI pushed a preview entry for X". We own
// the sidecar format end-to-end, which keeps us independent of Claude
// Code's native transcript (which is absent under --no-session-persistence
// and whose JSONL schema is undocumented and subject to change).
//
// Matches on the Write/Edit/MultiEdit tool_name via hooks.json, so this
// entry trusts that filter and always appends. Silent output; any error
// exits 0 to avoid breaking the user's tool call.

import path from "node:path";
import os from "node:os";
import { sessionDirFor, appendWriteSidecar } from "./lib/hook-core.mjs";

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
  const sessionId = input.session_id;
  if (!sessionId) return;
  const filePath = input.tool_input?.file_path;
  if (!filePath) return;

  await appendWriteSidecar(sessionDirFor(ROOT, sessionId), {
    tool: input.tool_name,
    filePath,
    cwd: input.cwd,
  });
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
});
