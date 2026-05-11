// Periodically reconciles $TMPDIR/kcc-preview/* against an in-memory map of
// known sessions. Emits high-level events: session-discovered (dir present),
// session-labeled (valid label.txt + at least one content file present),
// session-relabeled (label.txt content changed for an already-labeled session),
// session-removed (dir gone). fs.watch on macOS is unreliable for nested
// changes, so the implementation is plain readdir polling — small N, cheap.

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const LABEL_MAX = 80;

async function readLabel(dir) {
  try {
    const raw = (await readFile(path.join(dir, "label.txt"), "utf-8")).trim();
    if (!raw || raw.length > LABEL_MAX) return null;
    return raw;
  } catch { return null; }
}

async function hasContentEntry(dir) {
  try {
    const entries = await readdir(path.join(dir, "content"));
    return entries.some((n) => n.endsWith(".md") || n.endsWith(".html"));
  } catch { return false; }
}

export function createRootWatcher(root, { onEvent, tickMs = 5000 } = {}) {
  const known = new Map();  // sid -> { discovered: true, label: string|null }
  let stopped = false;

  async function tick() {
    let entries;
    try { entries = await readdir(root); } catch { entries = []; }

    const seen = new Set();
    for (const sid of entries) {
      const dir = path.join(root, sid);
      let s; try { s = await stat(dir); } catch { continue; }
      if (!s.isDirectory()) continue;
      seen.add(sid);

      const prev = known.get(sid);
      if (!prev) {
        known.set(sid, { discovered: true, label: null });
        onEvent?.({ type: "session-discovered", sid });
      }

      const label = await readLabel(dir);
      const hasContent = label ? await hasContentEntry(dir) : false;
      const cur = known.get(sid);
      if (label && hasContent && cur.label !== label) {
        const wasLabeled = cur.label !== null;
        cur.label = label;
        onEvent?.({
          type: wasLabeled ? "session-relabeled" : "session-labeled",
          sid, label,
        });
      }
    }

    for (const [sid] of known) {
      if (!seen.has(sid)) {
        known.delete(sid);
        onEvent?.({ type: "session-removed", sid });
      }
    }

    if (!stopped) setTimeout(tick, tickMs);
  }

  tick();
  return () => { stopped = true; };
}
