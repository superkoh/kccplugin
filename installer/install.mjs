#!/usr/bin/env node
/**
 * kcc installer — install, upgrade, verify and remove kcc modules in a
 * project's `.claude/` directory.
 *
 * One command does install and upgrade, because they are the same operation:
 * reconcile what is on disk against what the source ships, using the lockfile
 * to tell "the user edited this" apart from "upstream changed this".
 *
 *   node installer/install.mjs                    interactive select
 *   node installer/install.mjs --all              install everything
 *   node installer/install.mjs --modules a,b      declarative: exactly a and b
 *   node installer/install.mjs --check            verify, exit 1 on drift
 *   node installer/install.mjs --uninstall        remove everything
 *
 * `--modules` is declarative, not additive: a module that is installed but
 * not listed gets removed. That is the right semantic for a file set that is
 * committed to a team repo — the lockfile should describe an intent, not an
 * accumulation of past runs.
 */
import { closeSync, existsSync, openSync, readFileSync, readSync } from "node:fs";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computePlan,
  lockFromPlan,
  parseSelectionAnswer,
  resolveSelection,
  verifyAgainstLock,
} from "./lib/plan.mjs";
import {
  applyPlan,
  inventorySource,
  pruneBackups,
  readDiskHashes,
  readDiskModes,
  writeAtomic,
} from "./lib/fsops.mjs";
import {
  decideSettingsWrite,
  extractManagedHooks,
  sameManagedHooks,
} from "./lib/settings.mjs";
import {
  KCC_DIR,
  LOCK_PATH,
  LOCK_VERSION,
  SETTINGS_PATH,
  isSafeTargetPath,
} from "./lib/projection.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const C = process.stdout.isTTY
  ? {
      b: (s) => `\x1b[1m${s}\x1b[0m`,
      dim: (s) => `\x1b[2m${s}\x1b[0m`,
      g: (s) => `\x1b[32m${s}\x1b[0m`,
      y: (s) => `\x1b[33m${s}\x1b[0m`,
      r: (s) => `\x1b[31m${s}\x1b[0m`,
      c: (s) => `\x1b[36m${s}\x1b[0m`,
    }
  : { b: (s) => s, dim: (s) => s, g: (s) => s, y: (s) => s, r: (s) => s, c: (s) => s };

function parseArgs(argv) {
  const opts = {
    source: path.resolve(__dirname, ".."),
    target: process.cwd(),
    modules: null,
    all: false,
    check: false,
    uninstall: false,
    dryRun: false,
    adopt: false,
    yes: false,
    ref: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const takes = (name) => {
      const v = argv[++i];
      if (v === undefined) fail(`${name} needs a value`);
      return v;
    };
    switch (a) {
      case "--source": opts.source = path.resolve(takes(a)); break;
      case "--target": opts.target = path.resolve(takes(a)); break;
      case "--modules": {
        const raw = takes(a);
        const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
        // An empty list is almost always an unset shell variable, not an
        // intent to remove everything. Silently taking the uninstall branch
        // here would wipe a repo's whole .claude/ from a CI typo.
        if (list.length === 0) {
          fail(
            `--modules got an empty list (${JSON.stringify(raw)}) — ` +
              "use --uninstall to remove everything"
          );
        }
        opts.modules = list;
        break;
      }
      case "--ref": opts.ref = takes(a); break;
      case "--all": opts.all = true; break;
      case "--check": opts.check = true; break;
      case "--uninstall": opts.uninstall = true; break;
      case "--dry-run": opts.dryRun = true; break;
      case "--adopt": opts.adopt = true; break;
      case "-y": case "--yes": opts.yes = true; break;
      case "-h": case "--help": usage(); process.exit(0);
      default: fail(`unknown option: ${a}`);
    }
  }
  return opts;
}

function usage() {
  console.log(`
${C.b("kcc installer")} — install / upgrade kcc modules into a project's .claude/

  ${C.c("node installer/install.mjs")} [options]

  --all                install every module
  --modules a,b        declarative module set (anything else is removed)
  --check              verify the install matches the lockfile; exit 1 on drift
  --uninstall          remove every kcc-managed file and hook
  --adopt              take ownership of pre-existing files at the target paths
  --dry-run            print the plan, change nothing
  -y, --yes            no prompts
  --ref <ref>          record this source ref in the lockfile (install.sh
                       passes KCC_REF here)
  --target <dir>       project to install into (default: cwd)
  --source <dir>       source checkout (default: this repo)
`);
}

function fail(msg) {
  console.error(`${C.r("error")}: ${msg}`);
  process.exit(2);
}

/**
 * Ask a question on the controlling terminal, not stdin.
 *
 * stdin is not usable here: piped into `bash`, it is the installer script
 * itself. So we read `/dev/tty` directly — but with a blocking `readSync`
 * loop rather than `fs.createReadStream` + `readline`.
 *
 * An fs read stream over a terminal character device is the fragile way to
 * do this: it can surface EAGAIN and other errno conditions as stream
 * `error` events, and a stream whose `error` nobody handles takes the whole
 * process down with an unhandled exception — which is what a user piping
 * this into bash saw. A synchronous read on a blocking fd has none of that
 * machinery, and a prompt is exactly the place where blocking is correct.
 *
 * @returns {string|null} the line typed, or null when there is no terminal
 */
function ask(question) {
  process.stdout.write(question);
  let fd;
  try {
    fd = openSync("/dev/tty", "r");
  } catch {
    return null;
  }
  const pause = (ms) => {
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    } catch {
      /* best effort */
    }
  };
  try {
    const buf = Buffer.alloc(1024);
    let line = "";
    let sawInput = false;
    for (;;) {
      let n;
      try {
        n = readSync(fd, buf, 0, buf.length, null);
      } catch (err) {
        // A terminal opened non-blocking by whatever spawned us: wait rather
        // than spin, and never let the errno escape as a crash.
        if (err.code === "EAGAIN") {
          pause(20);
          continue;
        }
        if (err.code === "EOF") break;
        return null;
      }
      if (n === 0) break; // EOF: the terminal went away
      sawInput = true;
      const chunk = buf.toString("utf8", 0, n);
      const nl = chunk.indexOf("\n");
      if (nl >= 0) {
        line += chunk.slice(0, nl);
        break;
      }
      line += chunk;
    }
    // EOF with nothing read at all is "there is no interactive input", which
    // must not be confused with the user pressing Enter to take the default.
    if (!sawInput) return null;
    return line.replace(/\r$/, "");
  } finally {
    try {
      closeSync(fd);
    } catch {
      /* already gone */
    }
  }
}

function canPrompt() {
  return process.stdout.isTTY && existsSync("/dev/tty");
}

async function readJson(abs) {
  if (!existsSync(abs)) return null;
  const raw = await readFile(abs, "utf-8");
  if (raw.trim() === "") return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${abs} is not valid JSON (${err.message})`);
  }
}

/**
 * Preflight warnings. None of these block the install — they are things the
 * user would otherwise discover days later, when a teammate's clone silently
 * lacks half the capabilities.
 */
function preflight(targetRoot) {
  const warnings = [];

  const git = (args) => spawnSync("git", args, { cwd: targetRoot, encoding: "utf-8" });
  const inRepo = git(["rev-parse", "--is-inside-work-tree"]).status === 0;
  if (!inRepo) {
    warnings.push(
      "target is not a git repository — the whole point of installing into the " +
        "project is that teammates get these files from version control."
    );
  } else if (git(["check-ignore", "-q", `${KCC_DIR}/kcc.lock.json`]).status === 0) {
    warnings.push(
      `.gitignore excludes ${KCC_DIR}/ — the installed files will never be committed, ` +
        "so teammates will not get them. Add a negation rule (e.g. `!.claude/kcc/`)."
    );
  }

  // The same capabilities installed both as a user-level plugin and into the
  // project means every SessionStart prompt is injected twice.
  // With no HOME, `path.join("", ".claude")` is the *relative* ".claude",
  // which resolves against cwd — i.e. the project being installed into. The
  // warning would then be computed from the project's own settings.
  const home = homeDir();
  const configDir = process.env.CLAUDE_CONFIG_DIR || (home ? path.join(home, ".claude") : "");
  const userSettings = configDir ? path.join(configDir, "settings.json") : "";
  if (userSettings && path.isAbsolute(userSettings) && existsSync(userSettings)) {
    try {
      const parsed = JSON.parse(readFileSync(userSettings, "utf-8"));
      const enabled = Object.entries(parsed.enabledPlugins ?? {})
        .filter(([id, on]) => on && id.startsWith("kcc-"))
        .map(([id]) => id);
      if (enabled.length > 0) {
        warnings.push(
          `these kcc plugins are still enabled at user level: ${enabled.join(", ")} — ` +
            "their prompts will be injected a second time. Disable them with " +
            "`claude plugin disable <name>`."
        );
      }
    } catch {
      /* unreadable user settings are not our problem */
    }
  }

  if (spawnSync("jq", ["--version"]).status !== 0) {
    warnings.push(
      "`jq` is not on PATH — the principle-injection hooks degrade to a no-op " +
        "without it, so this machine would silently get none of the injected prompts."
    );
  }

  return warnings;
}

function homeDir() {
  return process.env.HOME || process.env.USERPROFILE || "";
}

async function safeReadDir(dir) {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function selectModules({ sourceModules, lock, opts }) {
  if (opts.uninstall) return [];
  if (opts.all) return [...sourceModules.keys()];
  if (opts.modules) return opts.modules;

  // Modules the source no longer offers are dropped from the default, not
  // passed through: `resolveSelection` would reject them as unknown and the
  // non-interactive upgrade path would hard-fail with nothing the user could
  // do but retype the whole list.
  const allInstalled = Object.keys(lock?.modules ?? {});
  const installed = allInstalled.filter((n) => sourceModules.has(n));
  const dropped = allInstalled.filter((n) => !sourceModules.has(n));
  if (dropped.length > 0) {
    console.log(
      `${C.y("!")} no longer offered by the source, will be uninstalled: ${dropped.join(", ")}`
    );
  }
  if (!canPrompt()) {
    if (installed.length > 0) return installed; // non-interactive upgrade in place
    fail(
      "no TTY for interactive selection — pass --all or --modules a,b " +
        "(when piping this script, module selection must be explicit)"
    );
  }

  const names = [...sourceModules.keys()];
  console.log(`\n${C.b("Modules")}`);
  names.forEach((name, i) => {
    const mod = sourceModules.get(name);
    const mark = installed.includes(name) ? C.g("[installed]") : "";
    console.log(`  ${C.c(String(i + 1))}. ${C.b(name)} ${C.dim("v" + mod.version)} ${mark}`);
    console.log(`     ${C.dim(oneLine(mod.description))}`);
  });

  const dflt = installed.length > 0 ? installed.join(",") : "all";
  const answer = ask(`\nSelect (numbers/names, comma-separated, "all", "none") [${dflt}]: `);
  if (answer === null) {
    fail("could not read from the terminal — pass --all or --modules a,b instead");
  }
  try {
    return parseSelectionAnswer(answer, names, dflt);
  } catch (err) {
    fail(err.message);
  }
}

function oneLine(s, max = 100) {
  const flat = String(s).replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

function reportPlan(plan) {
  const byStatus = (s) => plan.files.filter((f) => f.status === s);
  const rows = [
    ["new", byStatus("new"), C.g],
    ["updated", byStatus("updated"), C.c],
    ["restored", byStatus("restored"), C.y],
    ["overwritten (locally modified)", byStatus("clobbered"), C.y],
    ["removed", plan.removals, C.r],
  ];
  console.log(`\n${C.b("Plan")}`);
  let any = false;
  for (const [label, items, color] of rows) {
    if (items.length === 0) continue;
    any = true;
    console.log(`  ${color(label)}: ${items.length}`);
    for (const it of items.slice(0, 12)) console.log(`      ${C.dim(it.path)}`);
    if (items.length > 12) console.log(`      ${C.dim(`… and ${items.length - 12} more`)}`);
  }
  const unchanged = byStatus("unchanged").length;
  if (unchanged > 0) console.log(`  ${C.dim(`unchanged: ${unchanged}`)}`);
  if (!any) console.log(`  ${C.dim("nothing to do — already up to date")}`);

  const m = plan.modules;
  if (m.pulledIn.length) {
    console.log(`\n  ${C.y("+ required by your selection")}: ${m.pulledIn.join(", ")}`);
  }
  if (m.added.length) console.log(`\n  ${C.g("+ modules")}: ${m.added.join(", ")}`);
  if (m.removed.length) console.log(`  ${C.r("- modules")}: ${m.removed.join(", ")}`);
  for (const u of m.upgraded) console.log(`  ${C.c("↑ module")}: ${u.name} ${u.from} → ${u.to}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const sourceModules = await inventorySource(opts.source);
  const lockAbs = path.join(opts.target, LOCK_PATH);
  const settingsAbs = path.join(opts.target, SETTINGS_PATH);
  const lock = await readJson(lockAbs);

  // The lockfile is committed to the target repo, so treat it as untrusted
  // input before any of its paths reach the filesystem.
  if (lock) {
    const escaping = [];
    for (const [name, entry] of Object.entries(lock.modules ?? {})) {
      for (const p of Object.keys(entry?.files ?? {})) {
        if (!isSafeTargetPath(p)) escaping.push(`${name}: ${p}`);
      }
    }
    if (escaping.length > 0) {
      fail(
        `${LOCK_PATH} contains ${escaping.length} path(s) outside the project's ` +
          `.claude/ directory, which kcc could not have installed:\n    ` +
          escaping.slice(0, 10).join("\n    ") +
          `\n  Refusing to act on it. Delete the lockfile and reinstall.`
      );
    }
  }

  if (lock && lock.lockVersion > LOCK_VERSION) {
    fail(
      `${LOCK_PATH} was written by a newer installer (lockVersion ${lock.lockVersion} > ` +
        `${LOCK_VERSION}). Update your kcc source instead of downgrading the install.`
    );
  }

  const settings = await readJson(settingsAbs);
  const settingsExisted = existsSync(settingsAbs);

  // ---------------------------------------------------------------- check
  if (opts.check) {
    if (!lock) fail(`no ${LOCK_PATH} — nothing is installed here.`);
    const allPaths = Object.values(lock.modules ?? {}).flatMap((m) => Object.keys(m.files ?? {}));
    const diskHashes = await readDiskHashes(opts.target, allPaths);
    const diskModes = await readDiskModes(opts.target, allPaths);
    const result = verifyAgainstLock({
      lock,
      diskHashes,
      diskModes,
      actualManagedHooks: extractManagedHooks(settings ?? {}),
      sameHooks: sameManagedHooks,
    });
    if (result.ok) {
      console.log(`${C.g("✓")} kcc install matches the lockfile (${allPaths.length} files).`);
      process.exit(0);
    }
    console.error(`${C.r("✗")} kcc install has drifted from the lockfile.`);
    for (const p of result.modified) console.error(`    modified: ${p}`);
    for (const p of result.missing) console.error(`    missing:  ${p}`);
    for (const p of result.modeDrift) console.error(`    mode:     ${p}`);
    if (result.hookDrift) console.error(`    modified: ${SETTINGS_PATH} (kcc hook entries)`);
    console.error(
      `\n  These files are managed by kcc and must not be edited in the project.\n` +
        `  Run the installer again to restore them, or change them at the source repo.`
    );
    process.exit(1);
  }

  // ------------------------------------------------------------- planning
  const requested = await selectModules({ sourceModules, lock, opts });
  // Close over `requires` HERE, not just inside computePlan: the paths we
  // hash below must cover every module the install will claim. Hashing only
  // the requested modules would make a pulled-in dependency's paths look
  // absent, so a pre-existing file there would be classified `new` and
  // overwritten with no conflict and no backup.
  //
  // `pulledIn` has to be computed from the *requested* set here too: passing
  // the already-closed set into computePlan makes its own pulledIn always
  // empty, which silently deleted the "+ required by your selection" report.
  const { selected: selection, pulledIn } = resolveSelection(sourceModules, requested);
  const candidatePaths = new Set();
  for (const name of selection) {
    for (const p of sourceModules.get(name).files.keys()) candidatePaths.add(p);
  }
  for (const m of Object.values(lock?.modules ?? {})) {
    for (const p of Object.keys(m.files ?? {})) candidatePaths.add(p);
  }
  const diskHashes = await readDiskHashes(opts.target, [...candidatePaths]);
  const diskModes = await readDiskModes(opts.target, [...candidatePaths]);

  const plan = computePlan({
    sourceModules,
    selection,
    lock,
    diskHashes,
    opts: { adopt: opts.adopt, pulledIn },
  });

  // Preflight runs before the conflict gate so a user who is about to be
  // stopped still learns about a .gitignore that would have made the whole
  // install invisible to their teammates.
  const warnings = preflight(opts.target);
  if (warnings.length > 0) {
    console.log(`\n${C.b("Warnings")}`);
    for (const w of warnings) console.log(`  ${C.y("!")} ${w}`);
  }

  if (plan.conflicts.length > 0) {
    console.error(
      `${C.r("✗")} files already exist at ${plan.conflicts.length} managed path(s) and are ` +
        `not tracked by a kcc lockfile:`
    );
    for (const c of plan.conflicts) {
      const kind = c.kind && c.kind !== "file" ? ` (${c.kind})` : "";
      console.error(`    ${c.path}${kind}`);
    }
    console.error(
      `\n  Refusing to overwrite files kcc did not install. Re-run with ${C.c("--adopt")} ` +
        `to take ownership of them (their current contents are backed up first).`
    );
    process.exit(1);
  }

  reportPlan(plan);

  // "Nothing to do" has to include the lockfile itself: a module can change
  // version (or the install can move to a new --ref) without any projected
  // file's bytes moving, and the lock must still record the truth.
  const lockIsCurrent =
    !!lock &&
    plan.modules.upgraded.length === 0 &&
    plan.modules.added.length === 0 &&
    plan.modules.removed.length === 0 &&
    (!opts.ref || lock.source?.ref === opts.ref);
  // A file whose content matches but whose permission bits do not is still
  // work to do: `--check` reports it, so the installer has to be able to
  // repair it rather than answering "already up to date".
  const modeDrift = plan.files.some(
    (f) =>
      f.status === "unchanged" &&
      f.mode !== undefined &&
      diskModes.has(f.path) &&
      ((diskModes.get(f.path) & 0o111) !== 0) !== ((f.mode & 0o111) !== 0)
  );
  const nothingToDo =
    plan.writes.length === 0 &&
    plan.removals.length === 0 &&
    !modeDrift &&
    sameManagedHooks(extractManagedHooks(settings ?? {}), plan.managedHooks) &&
    lockIsCurrent;
  if (nothingToDo) {
    console.log(`\n${C.g("✓")} already up to date.`);
    process.exit(0);
  }

  if (opts.dryRun) {
    console.log(`\n${C.dim("--dry-run: nothing was written.")}`);
    process.exit(0);
  }

  if (!opts.yes && canPrompt()) {
    const raw = ask(`\nApply? [Y/n] `);
    if (raw === null) fail("could not read from the terminal — re-run with -y to skip this prompt");
    const answer = raw.trim().toLowerCase();
    if (answer && !["y", "yes"].includes(answer)) {
      console.log("aborted.");
      process.exit(1);
    }
  }

  // ---------------------------------------------------------------- apply
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { backupDir, written, removed } = await applyPlan({
    plan,
    targetRoot: opts.target,
    backupStamp: stamp,
  });

  // settings.json last-but-one: hooks referencing scripts that are now in
  // place. The decision is a pure function — see decideSettingsWrite for why
  // it stopped being an inline ladder of independent predicates.
  const { action: settingsAction, next: nextSettings } = decideSettingsWrite({
    settings,
    managed: plan.managedHooks,
    // "We created this file" cannot be inferred from its contents: an empty
    // settings.json the project committed looks identical to one of ours
    // after the hooks are stripped. The lockfile is the only record.
    createdSettings: lock?.createdSettings === true,
    existed: settingsExisted,
  });
  if (settingsAction === "remove") await rm(settingsAbs, { force: true });
  else if (settingsAction === "write") {
    await writeAtomic(settingsAbs, JSON.stringify(nextSettings, null, 2) + "\n");
  }

  // The lockfile is written LAST, so a run that dies partway leaves the lock
  // describing the old state and the next run reconciles the difference.
  if (plan.selection.length === 0) {
    // Uninstall removes the lock and the payload directory of each module the
    // lock actually claims — never everything under .claude/kcc/. Without a
    // lockfile we know of nothing we created, so we remove nothing: "kcc never
    // deletes a file it did not create" has to hold here too, and the removals
    // the plan already performed are the whole story.
    await rm(lockAbs, { force: true });
    const kccAbs = path.join(opts.target, KCC_DIR);
    for (const name of Object.keys(lock?.modules ?? {})) {
      // Module names come from the lockfile too, so they get the same
      // treatment as its paths: a key of "../../precious" must not become an
      // `rm -rf` outside the project.
      if (!isSafeTargetPath(`${KCC_DIR}/${name}`)) continue;
      await rm(path.join(kccAbs, name), { recursive: true, force: true });
    }
    const left = await safeReadDir(kccAbs);
    if (left.length === 0) await rm(kccAbs, { recursive: true, force: true });
  } else {
    const nextLock = lockFromPlan({
      plan,
      sourceModules,
      source: {
        repo: "https://github.com/superkoh/kccplugin",
        ref: opts.ref ?? sourceRef(opts.source),
      },

      lockVersion: LOCK_VERSION,
      now: new Date().toISOString(),
      // Remembered so uninstall knows whether removing settings.json would
      // be deleting a file kcc created or one the project already had.
      // True only when *this* run (or an earlier one) actually wrote the
            // file. Inferring it from "no settings.json existed at install
            // time" marks it true for a hookless module that never wrote one,
            // and uninstall then deletes a settings.json the project authored.
      createdSettings:
        lock?.createdSettings === true ||
        (!settingsExisted && Object.keys(plan.managedHooks).length > 0),
    });
    await mkdir(path.dirname(lockAbs), { recursive: true });
    await writeAtomic(lockAbs, JSON.stringify(nextLock, null, 2) + "\n");
  }

  console.log(
    `\n${C.g("✓")} ${written} file(s) written, ${removed} removed, ` +
      `${plan.selection.length} module(s) active.`
  );
  const pruned = await pruneBackups(opts.target);
  if (backupDir) {
    console.log(
      `${C.y("!")} locally modified files were overwritten. Previous contents: ` +
        `${C.dim(path.relative(opts.target, backupDir))}`
    );
    if (pruned.length > 0) {
      console.log(
        `${C.dim(`  (pruned ${pruned.length} older backup generation(s) — this directory is committed)`)}`
      );
    }
  }
  if (plan.selection.length > 0) {
    console.log(
      `${C.dim("Commit .claude/ so your teammates get the same capabilities. ")}` +
        `${C.dim("Restart running Claude Code sessions to pick up the change.")}`
    );
  }
}

function sourceRef(sourceRoot) {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf-8",
  });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

main().catch((err) => {
  console.error(`${C.r("error")}: ${err.message}`);
  process.exit(2);
});
