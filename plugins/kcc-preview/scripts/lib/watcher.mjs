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
  onRemove,
  onError,
  debounceMs = 100,
  pollIntervalMs = 500,
} = {}) {
  const pending = new Map();           // filename -> timer
  const seen = new Set();              // entry filenames scheduled at least once

  async function process(filename) {
    pending.delete(filename);
    const full = path.join(dir, filename);
    let text;
    try {
      text = await readFile(full, "utf-8");
    } catch (err) {
      // The file was scheduled but is now gone (Claude removed a pushed
      // entry, or an editor's atomic rename). Treat it as a deletion so the
      // store can evict the mirrored item. seen.delete guards against firing
      // twice when the poll races the fs.watch event.
      if (err.code === "ENOENT") {
        if (seen.delete(filename)) onRemove?.(filename);
        return;
      }
      onError?.(err);
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
    seen.add(filename);
    const prev = pending.get(filename);
    if (prev) clearTimeout(prev);
    pending.set(filename, setTimeout(() => process(filename), debounceMs));
  }

  const w = watch(dir, { persistent: false }, (_evt, filename) => {
    if (filename) schedule(filename);
  });
  w.on("error", (err) => onError?.(err));

  // Safety poll: stat dir listing, detect new files fs.watch may have missed
  // (editor atomic-rename, filesystem edge cases), and detect entry files
  // that have disappeared so their mirrored items get evicted.
  const poll = setInterval(async () => {
    let names;
    try {
      names = await readdir(dir);
    } catch { return; }  // dir may not exist yet
    const current = new Set(names.filter((n) => ENTRY_EXT.test(n)));
    for (const n of current) {
      if (!seen.has(n)) schedule(n);
    }
    for (const n of [...seen]) {
      // Skip files still mid-debounce — process() will resolve them.
      if (!current.has(n) && !pending.has(n)) {
        seen.delete(n);
        onRemove?.(n);
      }
    }
  }, pollIntervalMs);

  return () => {
    clearInterval(poll);
    for (const t of pending.values()) clearTimeout(t);
    w.close();
  };
}
