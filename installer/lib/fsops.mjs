/**
 * Filesystem side of the installer: reading the source, hashing the target,
 * and applying a plan. Everything here is I/O; all the decisions live in
 * plan.mjs.
 */
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import {
  chmod,
  copyFile,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  rmdir,
  symlink,
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
      files.set(target, {
        sourceAbs: abs,
        hash: await hashFile(abs),
        mode: statSync(abs).mode & 0o777,
      });
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
 * Marker hashes for things occupying a managed path that are not regular
 * files. A sha256 is 64 hex characters, so these can never collide with a
 * real hash.
 *
 * They exist because "not a regular file" must not be confused with "not
 * there": treating a directory or a symlink as absent classifies it as a new
 * file, which skips the conflict gate and then either destroys the symlink or
 * dies mid-apply on `rename` with EISDIR.
 */
export const IRREGULAR = {
  dir: "irregular:directory",
  symlink: "irregular:symlink",
  other: "irregular:other",
  unreadable: "irregular:unreadable",
};

export function isIrregular(hash) {
  return typeof hash === "string" && hash.startsWith("irregular:");
}

/**
 * Hash the target-side state of a set of paths. Paths that do not exist are
 * simply absent from the result (which is how plan.mjs recognizes them);
 * paths occupied by something that is not a regular file get an IRREGULAR
 * marker so the planner can refuse them.
 */
/** Permission bits of each path that exists as a regular file. */
export async function readDiskModes(targetRoot, paths) {
  const out = new Map();
  for (const rel of paths) {
    try {
      const st = await lstat(path.join(targetRoot, rel));
      if (st.isFile()) out.set(rel, st.mode & 0o777);
    } catch {
      /* absent */
    }
  }
  return out;
}

export async function readDiskHashes(targetRoot, paths) {
  const out = new Map();
  for (const rel of paths) {
    const abs = path.join(targetRoot, rel);
    let st;
    try {
      st = await lstat(abs);
    } catch {
      continue; // genuinely absent
    }
    if (st.isSymbolicLink()) out.set(rel, IRREGULAR.symlink);
    else if (st.isDirectory()) out.set(rel, IRREGULAR.dir);
    else if (!st.isFile()) out.set(rel, IRREGULAR.other);
    else {
      // A file that exists but cannot be read (mode 0000, EPERM, a failing
      // network mount) must not be reported as absent: that would classify
      // it `new` and destroy its contents with no conflict and no backup.
      try {
        out.set(rel, await hashFile(abs));
      } catch {
        out.set(rel, IRREGULAR.unreadable);
      }
    }
  }
  return out;
}

/**
 * Write a file atomically: temp file in the same directory, then rename.
 *
 * `mode` is applied explicitly because the default would be 0644, which
 * silently drops the executable bit off every shipped script — the installed
 * tree would then differ from the source in a way `--check` cannot see, since
 * it hashes content only.
 */
async function writeAtomic(abs, data, mode) {
  await mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.kcc-tmp-${process.pid}`;
  try {
    await writeFile(tmp, data);
    if (mode !== undefined) await chmod(tmp, mode);
    await rename(tmp, abs);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/**
 * Remove directories that became empty, walking up to (not past) `stopAt`.
 *
 * The bound is a path-boundary test, not a string prefix: `<t>/.claude-plugin`
 * starts with `<t>/.claude` but is a different tree, and this guard is the
 * only thing standing between a removal and an unbounded upward `rmdir`.
 */
function isInside(child, parent) {
  return child === parent || child.startsWith(parent + path.sep);
}

async function pruneEmptyDirs(dir, stopAt) {
  let cur = dir;
  while (isInside(cur, stopAt) && cur !== stopAt) {
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
/** Keep only the most recent `keep` backup generations. */
export async function pruneBackups(targetRoot, keep = 5) {
  const root = path.join(targetRoot, KCC_DIR, ".backup");
  let entries;
  try {
    entries = (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort(); // ISO timestamps sort chronologically
  } catch {
    return [];
  }
  const doomed = entries.slice(0, Math.max(0, entries.length - keep));
  for (const name of doomed) {
    await rm(path.join(root, name), { recursive: true, force: true });
  }
  return doomed;
}

export async function applyPlan({ plan, targetRoot, backupStamp }) {
  const backupRoot = path.join(targetRoot, KCC_DIR, ".backup", backupStamp);
  let backupUsed = false;

  // Back up whatever is there, preserving its kind: a symlink is copied as a
  // symlink (following it would silently duplicate its target instead of
  // preserving the thing being replaced), a directory recursively.
  const backup = async (rel) => {
    const from = path.join(targetRoot, rel);
    let st;
    try {
      st = await lstat(from);
    } catch {
      return;
    }
    const to = path.join(backupRoot, rel);
    await mkdir(path.dirname(to), { recursive: true });
    if (st.isSymbolicLink()) await symlink(await readlink(from), to);
    else if (st.isDirectory()) await cp(from, to, { recursive: true });
    else await copyFile(from, to);
    backupUsed = true;
  };

  let written = 0;
  for (const f of plan.files) {
    if (f.status === "unchanged") {
      // Content matches but the bits may not: a lost executable bit is
      // exactly the drift `--check` used to be blind to, so repair it here
      // rather than leaving the tree subtly different from the source.
      if (f.mode !== undefined) {
        const abs = path.join(targetRoot, f.path);
        try {
          // Only the executable bit is normative — the rest of the mode comes
          // from the checkout's umask and is not portable.
          const current = (await lstat(abs)).mode & 0o777;
          const wantExec = (f.mode & 0o111) !== 0;
          const hasExec = (current & 0o111) !== 0;
          if (wantExec !== hasExec) {
            await chmod(abs, wantExec ? current | 0o111 : current & ~0o111);
          }
        } catch {
          /* the verify path reports a missing file */
        }
      }
      continue;
    }
    const abs = path.join(targetRoot, f.path);
    if (f.status === "clobbered") await backup(f.path);
    // A directory or symlink cannot be renamed over; it has already been
    // backed up above, so clear it before writing the real file.
    if (isIrregular(f.diskHash)) await rm(abs, { recursive: true, force: true });
    await writeAtomic(abs, await readFile(f.sourceAbs), f.mode);
    written++;
  }

  let removed = 0;
  const claudeRoot = path.join(targetRoot, ".claude");
  for (const r of plan.removals) {
    if (r.locallyModified) await backup(r.path);
    const abs = path.join(targetRoot, r.path);
    // `recursive` matters: a directory standing at a managed path would
    // otherwise throw ERR_FS_EISDIR here and abort the run mid-apply, after
    // files were written and before the lockfile was rewritten.
    await rm(abs, { recursive: true, force: true });
    await pruneEmptyDirs(path.dirname(abs), claudeRoot);
    removed++;
  }

  return { backupDir: backupUsed ? backupRoot : null, written, removed };
}

export { writeAtomic };
