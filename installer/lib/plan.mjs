import { IRREGULAR_PREFIX, isIrregular } from "./projection.mjs";

/**
 * Planning — the pure core of the installer.
 *
 * `computePlan` takes a description of the source, the previous lockfile and
 * the current on-disk state, and returns exactly what would change. It reads
 * nothing and writes nothing, which is what makes every corner case in the
 * design (local edits, orphans, deselected modules, a lost lockfile, a
 * partially applied run) reachable from a unit test instead of from a live
 * filesystem.
 *
 * `applyPlan` (in fsops.mjs) is the only code that touches disk, and it takes
 * a plan as its whole input.
 */

/**
 * @typedef {Object} SourceModule
 * @property {string} name
 * @property {string} version
 * @property {string} description
 * @property {Map<string, {sourceAbs: string, hash: string}>} files
 *   target-relative path → source file
 * @property {Record<string, object[]>} hooks  projected hook entries by event
 */

/**
 * @typedef {Object} PlannedFile
 * @property {string} path      target-relative
 * @property {string} module
 * @property {string} sourceAbs
 * @property {string} hash      hash of the source content
 * @property {'new'|'restored'|'updated'|'clobbered'|'unchanged'} status
 * @property {string|null} diskHash
 */

/**
 * Decide what happens to a single file.
 *
 * The three-way comparison between the source hash, the hash recorded in the
 * lock and the hash actually on disk is what separates "upstream changed" from
 * "the user edited a managed file" — the distinction the overwrite policy
 * needs in order to report (and back up) rather than silently destroy.
 */
function classifyFile({ sourceHash, lockHash, diskHash }) {
  if (diskHash === null) return lockHash == null ? "new" : "restored";
  // A directory or symlink sitting at a managed path is never something we
  // may quietly replace, even if the lockfile claims the path: we have no way
  // to know what it is or what points at it.
  if (isIrregularHash(diskHash)) return "conflict";
  if (diskHash === sourceHash) return "unchanged";
  if (lockHash == null) return "conflict"; // unmanaged file already there
  if (diskHash === lockHash) return "updated"; // clean file, upstream moved
  return "clobbered"; // locally modified AND different from what we ship
}

function isIrregularHash(hash) {
  return isIrregular(hash);
}

/**
 * Turn what someone typed at the interactive prompt into a module list.
 *
 * Pure, so the parsing is testable even though the terminal plumbing around
 * it is not: numbers, names, the `all` / `none` words, an empty answer taking
 * the default, and an out-of-range number being an error rather than
 * `undefined` silently entering the selection.
 *
 * @param {string} answer  raw input (may be empty)
 * @param {string[]} names  module names, in menu order
 * @param {string} dflt  what an empty answer means
 * @returns {string[]}
 */
export function parseSelectionAnswer(answer, names, dflt) {
  const raw = (answer ?? "").trim() === "" ? dflt : answer.trim();
  if (raw === "none") return [];
  if (raw === "all") return [...names];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tok) => {
      if (!/^\d+$/.test(tok)) return tok;
      const idx = Number(tok) - 1;
      if (idx < 0 || idx >= names.length) {
        throw new Error(`no module number ${tok} — the menu lists 1..${names.length}`);
      }
      return names[idx];
    });
}

/**
 * Close a requested module set over `requires`.
 *
 * Exported because the caller needs the *same* answer before it goes to disk:
 * it has to hash every path the install will claim, dependencies included.
 * Getting that wrong makes a pulled-in module's paths look absent, which
 * classifies a pre-existing file as `new` and destroys it without a conflict
 * or a backup.
 *
 * @param {Map<string, SourceModule>} sourceModules
 * @param {string[]} selection
 * @returns {{selected: string[], pulledIn: string[]}} both sorted
 */
export function resolveSelection(sourceModules, selection) {
  const requested = [...new Set(selection)];
  const unknown = requested.filter((name) => !sourceModules.has(name));
  if (unknown.length > 0) {
    throw new Error(
      `unknown module(s): ${unknown.join(", ")}. Available: ` +
        [...sourceModules.keys()].sort().join(", ")
    );
  }

  const closure = new Set(requested);
  const queue = [...requested];
  while (queue.length > 0) {
    const name = queue.shift();
    for (const dep of sourceModules.get(name)?.requires ?? []) {
      if (!sourceModules.has(dep)) {
        throw new Error(`module "${name}" requires "${dep}", which the source does not offer`);
      }
      if (!closure.has(dep)) {
        closure.add(dep);
        queue.push(dep);
      }
    }
  }
  const selected = [...closure].sort();
  return { selected, pulledIn: selected.filter((n) => !requested.includes(n)) };
}

/**
 * @param {Object} args
 * @param {Map<string, SourceModule>} args.sourceModules  every module the source offers
 * @param {string[]} args.selection  desired module set (declarative)
 * @param {object|null} args.lock  previous lockfile contents
 * @param {Map<string, string>} args.diskHashes  target-relative path → hash of
 *   what is on disk right now. A path absent from the map is absent on disk.
 * @param {{adopt?: boolean}} [args.opts]
 * @returns {object} plan
 */
export function computePlan({ sourceModules, selection, lock, diskHashes, opts = {} }) {
  const adopt = !!opts.adopt;
  const lockModules = lock?.modules ?? {};

  // A module that says it supplements another is useless without it, so a
  // selection is closed over `requires` before anything else happens.
  //
  // `pulledIn` is only meaningful relative to what the *user* asked for, and
  // the caller has to resolve the closure before this point anyway (to hash
  // the dependency's paths). Passing it in — rather than recomputing here
  // from an already-closed set, which always yields [] — is what keeps this
  // plan's own report honest for every caller, not just install.mjs.
  const { selected } = resolveSelection(sourceModules, selection);
  const pulledIn = opts.pulledIn ?? [];

  const files = [];
  const conflicts = [];
  const claimed = new Set(); // every target path the new state owns

  for (const name of selected) {
    const mod = sourceModules.get(name);
    const lockFiles = lockModules[name]?.files ?? {};
    for (const [path, src] of mod.files) {
      claimed.add(path);
      const diskHash = diskHashes.has(path) ? diskHashes.get(path) : null;
      const lockHash = Object.prototype.hasOwnProperty.call(lockFiles, path)
        ? lockFiles[path]
        : null;
      let status = classifyFile({ sourceHash: src.hash, lockHash, diskHash });
      if (status === "conflict") {
        if (adopt) status = "clobbered";
        else {
          conflicts.push({
            path,
            module: name,
            diskHash,
            kind: isIrregularHash(diskHash) ? diskHash.slice(IRREGULAR_PREFIX.length) : "file",
          });
          continue;
        }
      }
      files.push({
        path,
        module: name,
        sourceAbs: src.sourceAbs,
        hash: src.hash,
        mode: src.mode,
        status,
        diskHash,
      });
    }
  }

  // Everything the lock claims that the new state does not: orphaned files
  // from a module that changed shape, and every file of a deselected module.
  const removals = [];
  for (const [name, entry] of Object.entries(lockModules)) {
    const stillSelected = selected.includes(name);
    for (const [path, lockHash] of Object.entries(entry.files ?? {})) {
      if (claimed.has(path)) continue;
      const diskHash = diskHashes.has(path) ? diskHashes.get(path) : null;
      if (diskHash === null) continue; // already gone
      // The install side refuses to overwrite a directory or symlink at a
      // managed path; the removal side must refuse to `rm -rf` one. Without
      // this, deselecting a module destroys whatever the user put there —
      // backed up, but with no conflict, no prompt and a zero exit.
      if (isIrregularHash(diskHash)) {
        conflicts.push({
          path,
          module: name,
          diskHash,
          kind: diskHash.slice(IRREGULAR_PREFIX.length),
          removal: true,
        });
        continue;
      }
      removals.push({
        path,
        module: name,
        reason: stillSelected ? "orphan" : "module-removed",
        locallyModified: diskHash !== lockHash,
      });
    }
  }

  // Module-level deltas, for the human-readable report.
  const previous = Object.keys(lockModules);
  const added = selected.filter((n) => !previous.includes(n));
  const removed = previous.filter((n) => !selected.includes(n));
  const upgraded = [];
  for (const name of selected) {
    if (!previous.includes(name)) continue;
    const from = lockModules[name].version;
    const to = sourceModules.get(name).version;
    if (from !== to) upgraded.push({ name, from, to });
  }

  // Hook entries for the whole selection, in a deterministic module order.
  const managedHooks = {};
  for (const name of selected) {
    for (const [event, entries] of Object.entries(sourceModules.get(name).hooks ?? {})) {
      if (!managedHooks[event]) managedHooks[event] = [];
      managedHooks[event].push(...entries);
    }
  }

  return {
    selection: selected,
    files,
    removals,
    conflicts,
    managedHooks,
    modules: { added, removed, upgraded, pulledIn },
    get writes() {
      return files.filter((f) => f.status !== "unchanged");
    },
    get clobbered() {
      return files.filter((f) => f.status === "clobbered");
    },
  };
}

/**
 * Build the lockfile that describes the state a plan produces.
 *
 * Only files the plan actually claims are recorded, and hashes are the
 * *source* hashes — after a successful apply that is exactly what is on disk.
 */
export function lockFromPlan({ plan, sourceModules, source, lockVersion, now, createdSettings }) {
  const modules = {};
  for (const name of plan.selection) {
    const mod = sourceModules.get(name);
    const files = {};
    for (const f of plan.files) {
      if (f.module === name) files[f.path] = f.hash;
    }
    // Only the *executable bit* is recorded, never the absolute mode. Raw
    // permission bits come from the source checkout's umask and git does not
    // preserve them, so a lock written under `umask 077` would make `--check`
    // — the documented CI gate — fail on every teammate's machine with no
    // way to fix it. The exec bit is the one git carries.
    const exec = [];
    for (const f of plan.files) {
      if (f.module === name && f.mode !== undefined && (f.mode & 0o111) !== 0) {
        exec.push(f.path);
      }
    }
    modules[name] = {
      version: mod.version,
      description: mod.description,
      files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1))),
      ...(exec.length > 0 ? { exec: exec.sort() } : {}),
    };
  }
  return {
    lockVersion,
    source,
    installedAt: now,
    // Whether kcc created .claude/settings.json. Uninstall cannot infer this
    // from the file's contents — a project-committed `{}` looks identical to
    // one of ours after the hooks are stripped — so it has to be remembered.
    createdSettings: !!createdSettings,
    modules: Object.fromEntries(Object.entries(modules).sort(([a], [b]) => (a < b ? -1 : 1))),
    managedHooks: plan.managedHooks,
  };
}

/**
 * Verify an installed tree against its lockfile. Used by `--check`, which is
 * what turns "don't edit these files" from a request into a CI gate.
 *
 * @returns {{ok: boolean, modified: string[], missing: string[], hookDrift: boolean}}
 */
export function verifyAgainstLock({
  lock,
  diskHashes,
  diskModes,
  actualManagedHooks,
  sameHooks,
}) {
  const modified = [];
  const missing = [];
  const modeDrift = [];
  for (const entry of Object.values(lock?.modules ?? {})) {
    const shouldExec = new Set(entry.exec ?? []);
    for (const [path, hash] of Object.entries(entry.files ?? {})) {
      if (!diskHashes.has(path)) {
        missing.push(path);
        continue;
      }
      if (diskHashes.get(path) !== hash) modified.push(path);
      // Both directions: a script that lost its executable bit, and a plain
      // file that gained one. Checking only the recorded set would miss the
      // second, since a non-executable file has no entry to compare against.
      if (diskModes && diskModes.has(path)) {
        const isExec = (diskModes.get(path) & 0o111) !== 0;
        if (isExec !== shouldExec.has(path)) modeDrift.push(path);
      }
    }
  }
  const hookDrift = !sameHooks(lock?.managedHooks ?? {}, actualManagedHooks ?? {});
  return {
    ok:
      modified.length === 0 &&
      missing.length === 0 &&
      modeDrift.length === 0 &&
      !hookDrift,
    modified: modified.sort(),
    missing: missing.sort(),
    modeDrift: modeDrift.sort(),
    hookDrift,
  };
}
