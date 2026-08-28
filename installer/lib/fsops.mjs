/**
 * Filesystem side of the installer: reading the source, hashing the target,
 * and applying a plan. Everything here is I/O; all the decisions live in
 * plan.mjs.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { KCC_DIR, projectHooks, projectPath } from "./projection.mjs";

/**
 * Content hash used for drift detection.
 *
 * CRLF is normalized away first: a teammate on a checkout with
 * `core.autocrlf=true` would otherwise show every managed file as locally
 * modified, and the installer would "restore" files on every run.
 */
export function hashContent(buf) {
  const normalized = Buffer.from(buf).toString("binary").replace(/\r\n/g, "\n");
  return createHash("sha256").update(Buffer.from(normalized, "binary")).digest("hex");
}

export async function hashFile(abs) {
  return hashContent(await readFile(abs));
}

/** Recursively list files under `dir`, as POSIX-relative paths. */
export async function walkFiles(dir, base = dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(abs, base)));
    else if (e.isFile()) out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out.sort();
}

/**
 * Read every module the source offers, already projected into target paths.
 *
 * @param {string} sourceRoot  a checkout of this repo
 * @returns {Promise<Map<string, import('./plan.mjs').SourceModule>>}
 */
export async function inventorySource(sourceRoot) {
  const pluginsDir = path.join(sourceRoot, "plugins");
  const modules = new Map();
  let entries;
  try {
    entries = await readdir(pluginsDir, { withFileTypes: true });
  } catch {
    throw new Error(`no plugins/ directory under source root: ${sourceRoot}`);
  }

  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const name = e.name;
    const root = path.join(pluginsDir, name);
    const manifestPath = path.join(root, ".claude-plugin", "plugin.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    if (manifest.name !== name) {
      throw new Error(
        `module "${name}": manifest.name is "${manifest.name}" — they must match`
      );
    }

    const files = new Map();
    for (const rel of await walkFiles(root)) {
      const target = projectPath(name, rel);
      if (!target) continue;
      const abs = path.join(root, rel);
      files.set(target, { sourceAbs: abs, hash: await hashFile(abs) });
    }

    let hooks = {};
    const hooksJson = path.join(root, "hooks", "hooks.json");
    if (existsSync(hooksJson)) {
      hooks = projectHooks(JSON.parse(await readFile(hooksJson, "utf-8")), name);
    }

    // Dependencies live outside plugin.json: that manifest follows the
    // official plugin spec, whose validator rejects unknown keys.
    let requires = [];
    const modulePath = path.join(root, "kcc.module.json");
    if (existsSync(modulePath)) {
      const meta = JSON.parse(await readFile(modulePath, "utf-8"));
      requires = Array.isArray(meta.requires) ? meta.requires : [];
    }

    modules.set(name, {
      name,
      version: manifest.version ?? "0.0.0",
      description: manifest.description ?? "",
      requires,
      files,
      hooks,
    });
  }

  if (modules.size === 0) throw new Error(`no modules found under ${pluginsDir}`);
  return modules;
}

/**
 * Hash the target-side state of a set of paths. Paths that do not exist are
 * simply absent from the result (which is how plan.mjs recognizes them).
 */
export async function readDiskHashes(targetRoot, paths) {
  const out = new Map();
  for (const rel of paths) {
    const abs = path.join(targetRoot, rel);
    try {
      const st = await lstat(abs);
      if (!st.isFile()) continue;
      out.set(rel, await hashFile(abs));
    } catch {
      /* absent */
    }
  }
  return out;
}

/** Write a file atomically: temp file in the same directory, then rename. */
async function writeAtomic(abs, data) {
  await mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.kcc-tmp-${process.pid}`;
  await writeFile(tmp, data);
  await rename(tmp, abs);
}

/** Remove directories that became empty, walking up to (not past) `stopAt`. */
async function pruneEmptyDirs(dir, stopAt) {
  let cur = dir;
  while (cur.startsWith(stopAt) && cur !== stopAt) {
    try {
      await rmdir(cur); // fails unless empty — exactly the guard we want
    } catch {
      return;
    }
    cur = path.dirname(cur);
  }
}

/**
 * Apply a plan. Files are copied one at a time with atomic renames; local
 * modifications are backed up before being overwritten, per the "managed
 * files are overwritten on upgrade" policy — the policy stands, but nobody's
 * work disappears without a copy and a printed path.
 *
 * @returns {Promise<{backupDir: string|null, written: number, removed: number}>}
 */
export async function applyPlan({ plan, targetRoot, backupStamp }) {
  const backupRoot = path.join(targetRoot, KCC_DIR, ".backup", backupStamp);
  let backupUsed = false;

  const backup = async (rel) => {
    const from = path.join(targetRoot, rel);
    if (!existsSync(from)) return;
    const to = path.join(backupRoot, rel);
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
    backupUsed = true;
  };

  let written = 0;
  for (const f of plan.files) {
    if (f.status === "unchanged") continue;
    if (f.status === "clobbered") await backup(f.path);
    await writeAtomic(path.join(targetRoot, f.path), await readFile(f.sourceAbs));
    written++;
  }

  let removed = 0;
  const claudeRoot = path.join(targetRoot, ".claude");
  for (const r of plan.removals) {
    if (r.locallyModified) await backup(r.path);
    const abs = path.join(targetRoot, r.path);
    await rm(abs, { force: true });
    await pruneEmptyDirs(path.dirname(abs), claudeRoot);
    removed++;
  }

  return { backupDir: backupUsed ? backupRoot : null, written, removed };
}

export { writeAtomic };
