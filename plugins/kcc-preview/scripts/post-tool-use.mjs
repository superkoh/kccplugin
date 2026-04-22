#!/usr/bin/env node
// PostToolUse hook entry.
// Two branches:
//   - Write / Edit / MultiEdit  -> appendWriteSidecar (records file_path)
//   - AskUserQuestion           -> appendAskUserQuestionEvent (intent signal)
// See hooks.json for the matcher regex.

import path from "node:path";
import os from "node:os";
import {
  sessionDirFor,
  appendWriteSidecar,
  appendAskUserQuestionEvent,
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
  const sessionId = input.session_id;
  if (!sessionId) return;
  const sessionDir = sessionDirFor(ROOT, sessionId);

  if (input.tool_name === "AskUserQuestion") {
    await appendAskUserQuestionEvent(sessionDir);
    return;
  }

  const filePath = input.tool_input?.file_path;
  if (!filePath) return;
  await appendWriteSidecar(sessionDir, {
    tool: input.tool_name,
    filePath,
    cwd: input.cwd,
  });
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
});
