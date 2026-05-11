// Pointer file at ~/.kcc-preview/url contains a single line — the current
// shared-daemon URL. SessionStart writes it after leader-election; other
// hooks read it. Atomic via tmp + rename so concurrent reads never see a
// torn file.

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_HOME = path.join(os.homedir(), ".kcc-preview");

export function pointerPath({ home } = {}) {
  return path.join(home || DEFAULT_HOME, "url");
}

export async function readUrlPointer({ home } = {}) {
  try {
    const raw = await readFile(pointerPath({ home }), "utf-8");
    const v = raw.trim();
    return v || null;
  } catch {
    return null;
  }
}

export async function writeUrlPointer(url, { home } = {}) {
  const dir = home || DEFAULT_HOME;
  await mkdir(dir, { recursive: true });
  const final = path.join(dir, "url");
  const tmp = path.join(dir, `url.tmp.${process.pid}.${Date.now()}`);
  await writeFile(tmp, url);
  await rename(tmp, final);
}

export async function clearUrlPointer({ home } = {}) {
  try { await rm(pointerPath({ home })); } catch { /* ignore */ }
}
