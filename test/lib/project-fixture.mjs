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
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { computePlan } from "../../installer/lib/plan.mjs";
import { applyPlan, inventorySource, readDiskHashes } from "../../installer/lib/fsops.mjs";
import { mergeManagedHooks } from "../../installer/lib/settings.mjs";
import { writeAtomic } from "../../installer/lib/fsops.mjs";
import { SETTINGS_PATH } from "../../installer/lib/projection.mjs";
import { REPO_ROOT } from "./discover.mjs";

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

  // The fixture is a real software project, not an empty directory: modules
  // whose hooks only fire inside a dev scene (kcc-dev-core walks up looking
  // for package.json / .git / ...) would otherwise silently no-op, and the
  // e2e cases that assert their injection would fail for the wrong reason.
  await writeAtomic(
    path.join(projectDir, "package.json"),
    JSON.stringify({ name: "kcc-fixture", version: "0.0.0", private: true }, null, 2) + "\n"
  );
  spawnSync("git", ["init", "-q", "."], { cwd: projectDir });

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
  // tree is a different scenario, and one that changes hook behaviour.
  const git = (...args) => spawnSync("git", args, { cwd: projectDir });
  git("add", "-A");
  git("-c", "user.email=fixture@kcc", "-c", "user.name=kcc fixture", "commit", "-qm", "install kcc");

  return {
    projectDir,
    configDir,
    plan,
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
