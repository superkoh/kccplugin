/**
 * A throwaway project with kcc modules actually installed into it.
 *
 * This is the fixture L3 and L4 run against, and it exists because the
 * shipped artifact is no longer a plugin directory — it is a project's
 * `.claude/` tree. Testing `--plugin-dir` would test a mode nobody uses.
 *
 * Hermeticity comes from `CLAUDE_CONFIG_DIR`, not `--bare`: verified against
 * a live CLI, `--bare` drops the *project's* `.claude/` as well as the
 * user's, so a project-installed capability is invisible under it. Pointing
 * CLAUDE_CONFIG_DIR at an empty directory gives the same isolation (the init
 * record reports `plugins: []` and none of the user's skills) while leaving
 * the project tree intact.
 */
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { computePlan } from "../../installer/lib/plan.mjs";
import { applyPlan, inventorySource, readDiskHashes } from "../../installer/lib/fsops.mjs";
import { mergeManagedHooks } from "../../installer/lib/settings.mjs";
import { writeAtomic } from "../../installer/lib/fsops.mjs";
import { SETTINGS_PATH } from "../../installer/lib/projection.mjs";
import { REPO_ROOT } from "./discover.mjs";

/**
 * Run git in the fixture, loudly.
 *
 * A silently failed `git init` or `commit` produces a fixture in a different
 * state than the one the cases assume — uncommitted files change what the
 * stop audit and the dev-scene detection see — and that then surfaces as an
 * unexplained model-behaviour failure. Signing and repo-level hooks are
 * disabled so a developer's global git config cannot break the fixture.
 */
function git(cwd, args) {
  const res = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (res.status !== 0) {
    throw new Error(
      `fixture: git ${args.join(" ")} failed (${res.status}): ` +
        `${(res.stderr || res.stdout || "").trim().slice(0, 400)}`
    );
  }
  return res;
}

/**
 * Carry the user's credentials into the isolated config dir.
 *
 * Isolation is about the developer's *plugins and skills*, not their login.
 * On platforms where the OAuth token lives in the config dir rather than an
 * OS keychain, an empty CLAUDE_CONFIG_DIR would also remove the auth that the
 * repo promises is enough to run L3/L4 — the layer would then look "skipped"
 * on every Linux machine without an API key.
 */
async function carryCredentials(configDir) {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const from = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, ".claude"), ".credentials.json");
  if (!existsSync(from)) return;
  await copyFile(from, path.join(configDir, ".credentials.json"));
}

/**
 * Install `moduleNames` into a fresh temp project.
 *
 * @param {string[]} moduleNames
 * @returns {Promise<{projectDir: string, configDir: string, env: object, cleanup: () => Promise<void>}>}
 */
export async function createInstalledProject(moduleNames) {
  const root = await mkdtemp(path.join(tmpdir(), "kcc-fixture-"));
  const projectDir = path.join(root, "project");
  const configDir = path.join(root, "config");
  await writeAtomic(path.join(configDir, ".keep"), "");
  await carryCredentials(configDir);

  // The fixture is a real software project, not an empty directory: modules
  // whose hooks only fire inside a dev scene (kcc-dev-core walks up looking
  // for package.json / .git / ...) would otherwise silently no-op, and the
  // e2e cases that assert their injection would fail for the wrong reason.
  await writeAtomic(
    path.join(projectDir, "package.json"),
    JSON.stringify({ name: "kcc-fixture", version: "0.0.0", private: true }, null, 2) + "\n"
  );
  git(projectDir, ["init", "-q", "."]);

  const sourceModules = await inventorySource(REPO_ROOT);
  const plan = computePlan({
    sourceModules,
    selection: moduleNames,
    lock: null,
    diskHashes: await readDiskHashes(projectDir, []),
  });
  if (plan.conflicts.length > 0) {
    throw new Error(`fixture install hit conflicts in a fresh dir: ${JSON.stringify(plan.conflicts)}`);
  }
  await applyPlan({ plan, targetRoot: projectDir, backupStamp: "fixture" });
  await writeAtomic(
    path.join(projectDir, SETTINGS_PATH),
    JSON.stringify(mergeManagedHooks({}, plan.managedHooks), null, 2) + "\n"
  );

  // Commit the install, the way a team actually adopts it. An uncommitted
  // tree is a different scenario, and one that changes hook behaviour — so a
  // failure here has to be loud, not a silently different fixture that shows
  // up later as an unexplained model-behaviour regression.
  git(projectDir, ["add", "-A"]);
  git(projectDir, [
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "user.email=fixture@kcc",
    "-c",
    "user.name=kcc fixture",
    "commit",
    "-qm",
    "install kcc",
  ]);

  return {
    projectDir,
    configDir,
    plan,
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
