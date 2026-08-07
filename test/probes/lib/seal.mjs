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
import { mkdir, writeFile, cp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { buildVariant, stripFrontmatter } from "./ablate.mjs";
import { RULES } from "../rules.mjs";

// A skill normally reaches the model only when the model invokes it, and
// every probe disallows the Skill tool. This preamble puts the body in
// force instead; it is byte-identical in both arms, so it cannot itself
// produce a delta.
const skillPreamble = (skill) =>
  `# Skill in effect: ${skill}\n\n` +
  "The instructions below are this session's active skill. Follow them " +
  "as if you had just invoked it by name — it is not available as a " +
  "tool here.\n\n";

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
export async function makePluginVariant(variantDir, { pluginsDir, ruleId, arm }) {
  const rule = RULES[ruleId];
  if (!rule) throw new Error(`unknown rule id "${ruleId}"`);
  if (rule.retired) {
    throw new Error(
      `rule "${ruleId}" was retired in ${rule.retired} — it is no longer in the doc, so there is nothing to ablate`
    );
  }
  // A rule whose text a prior campaign already measured as load-bearing must
  // not be re-ablated by accident. Its verdict could only ever be weaker than
  // the measurement it contradicts, and a `no-delta` from it reads as a licence
  // to delete content that was measured to be worth 2.7 rubric points. Running
  // one has to be a deliberate act, not the default of a bare `run-probe.mjs`
  // with no --probes (which selects every registered probe).
  if (rule.measuredContent && process.env.KCC_ABLATE_MEASURED !== "1") {
    throw new Error(
      `rule "${ruleId}" ablates content the 0.10.0 campaign measured as load-bearing ` +
        `(${rule.measuredContent}). Its verdict cannot license a deletion. ` +
        `Set KCC_ABLATE_MEASURED=1 only if you know why you want this.`
    );
  }

  const dest = path.join(variantDir, rule.doc.plugin);
  await cp(path.join(pluginsDir, rule.doc.plugin), dest, { recursive: true });

  const docPath = path.join(dest, rule.doc.path);
  const source = await readFile(docPath, "utf-8");
  const sentinel = `probe-${arm}-${ruleId}`;
  const isSkill = rule.doc.deliver === "skill";
  const { text, removedLines } = buildVariant(isSkill ? stripFrontmatter(source) : source, {
    anchor: arm === "B" ? rule.anchor ?? null : null,
    snippet: arm === "B" ? rule.snippet ?? null : null,
    sentinel,
    label: rule.label,
  });

  if (arm === "B" && removedLines === 0) {
    throw new Error(`arm B for "${ruleId}" removed nothing — the arms would be identical`);
  }

  if (isSkill) {
    // The ablated body replaces the document the SessionStart hook
    // already injects, and skills/ leaves the variant entirely: a
    // SKILL.md left on disk hands arm B the intact rule back through a
    // Read or a Grep, and the plugin's own principles doc would keep
    // pointing at a skill that is no longer there.
    await writeFile(path.join(dest, rule.doc.via), skillPreamble(rule.doc.skill) + text);
    await rm(path.join(dest, "skills"), { recursive: true, force: true });
  } else {
    await writeFile(docPath, text);
  }
  return { pluginDir: dest, sentinel, removedLines };
}
