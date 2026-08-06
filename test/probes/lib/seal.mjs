/**
 * Sealed-environment construction for behavior probes.
 *
 * A probe compares two prompt variants, so anything the model can reach
 * that is NOT the variant is contamination. Three leaks matter, and each
 * is closed here:
 *
 *   1. the user's global plugins/settings → CLAUDE_CONFIG_DIR points at
 *      a fresh empty dir (the CLI also relocates .claude.json into it);
 *   2. the user's ~/.claude, reachable even so if the model shells out →
 *      HOME points at a fresh empty dir;
 *   3. project context → the run's cwd is a throwaway dir, never the
 *      repo. That also keeps a Write-happy probe away from real files.
 *
 * Workspace trust would otherwise block plugin loading in a brand-new
 * directory, so the sealed config gets a pre-accepted trust entry.
 *
 * Auth note: the keychain read that produces CLAUDE_CODE_OAUTH_TOKEN
 * must happen BEFORE HOME is sealed — `security` resolves the login
 * keychain through $HOME. Callers therefore export the token into the
 * parent process and this module only overrides HOME for the child.
 */
import { mkdir, writeFile, cp, readFile } from "node:fs/promises";
import path from "node:path";
import { buildVariant } from "./ablate.mjs";
import { RULES } from "../rules.mjs";

/** Fresh project + config + home triple for one run. */
export async function makeSealedWorkspace(runDir) {
  const projectDir = path.join(runDir, "proj");
  const configDir = path.join(runDir, "cfg");
  const homeDir = path.join(runDir, "home");
  await Promise.all([
    mkdir(projectDir, { recursive: true }),
    mkdir(configDir, { recursive: true }),
    mkdir(homeDir, { recursive: true }),
  ]);
  await writeFile(
    path.join(configDir, ".claude.json"),
    JSON.stringify({ projects: { [projectDir]: { hasTrustDialogAccepted: true } } })
  );
  return {
    projectDir,
    configDir,
    homeDir,
    env: { CLAUDE_CONFIG_DIR: configDir, HOME: homeDir },
  };
}

/**
 * Copy the plugin and rewrite the injected doc for one arm.
 * Arm "A" keeps the rule, arm "B" ablates it; both get an arm-unique
 * sentinel so the SessionStart hook payload identifies the arm without
 * asking the model anything.
 */
export async function makePluginVariant(variantDir, { pluginRoot, ruleId, arm }) {
  const rule = RULES[ruleId];
  if (!rule) throw new Error(`unknown rule id "${ruleId}"`);
  if (rule.retired) {
    throw new Error(
      `rule "${ruleId}" was retired in ${rule.retired} — it is no longer in the doc, so there is nothing to ablate`
    );
  }

  const dest = path.join(variantDir, path.basename(pluginRoot));
  await cp(pluginRoot, dest, { recursive: true });

  const docPath = path.join(dest, rule.doc);
  const source = await readFile(docPath, "utf-8");
  const sentinel = `probe-${arm}-${ruleId}`;
  const { text, removedLines } = buildVariant(source, {
    anchor: arm === "B" ? rule.anchor ?? null : null,
    snippet: arm === "B" ? rule.snippet ?? null : null,
    sentinel,
    label: rule.label,
  });

  if (arm === "B" && removedLines === 0) {
    throw new Error(`arm B for "${ruleId}" removed nothing — the arms would be identical`);
  }
  await writeFile(docPath, text);
  return { pluginDir: dest, sentinel, removedLines };
}
