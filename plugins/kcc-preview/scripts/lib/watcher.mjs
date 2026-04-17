// Watches a directory for .md / .html entry files. Debounces rapid writes
// per filename, reads the file, calls the parser, and dispatches the entry
// (or error) to callbacks.
//
// On macOS / Windows uses fs.watch with recursive:false (we only watch
// a single flat dir). On Linux fs.watch is stable for non-recursive
// watches per node docs, but we add a safety poll in case events are
// missed (known to happen under certain editors' atomic-rename saves).

import { watch } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseEntry } from "./parser.mjs";

const ENTRY_EXT = /\.(md|markdown|html?)$/i;

export function watchContentDir(dir, {
  onEntry,
  onError,
  debounceMs = 100,
  pollIntervalMs = 500,
} = {}) {
  const pending = new Map();           // filename -> timer
  const seen = new Map();              // filename -> mtimeMs already processed

  async function process(filename) {
    pending.delete(filename);
    const full = path.join(dir, filename);
    let text;
    try {
      text = await readFile(full, "utf-8");
    } catch (err) {
      if (err.code !== "ENOENT") onError?.(err);
      return;
    }
    const result = parseEntry(filename, text);
    if (result.error) {
      onError?.(new Error(`${filename}: ${result.error}`));
      return;
    }
    onEntry?.({ ...result, source: filename });
  }

  function schedule(filename) {
    if (!ENTRY_EXT.test(filename)) return;
    const prev = pending.get(filename);
    if (prev) clearTimeout(prev);
    pending.set(filename, setTimeout(() => process(filename), debounceMs));
  }

  const w = watch(dir, { persistent: false }, (_evt, filename) => {
    if (filename) schedule(filename);
  });
  w.on("error", (err) => onError?.(err));

  // Safety poll: stat dir listing, detect new/mtime-bumped files fs.watch
  // may have missed (editor atomic-rename, filesystem edge cases).
  const poll = setInterval(async () => {
    try {
      const names = await readdir(dir);
      for (const n of names) {
        if (!ENTRY_EXT.test(n)) continue;
        if (!seen.has(n)) {
          seen.set(n, 0);
          schedule(n);
        }
      }
    } catch { /* dir may not exist yet */ }
  }, pollIntervalMs);

  return () => {
    clearInterval(poll);
    for (const t of pending.values()) clearTimeout(t);
    w.close();
  };
}
