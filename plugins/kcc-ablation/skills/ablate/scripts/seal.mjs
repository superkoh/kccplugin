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
 *
 * makeDocVariant(variantDir, { pluginsDir, rule, ruleId, arm })
 *
 *   rule    { doc, label, anchor?, snippet? } — the ablation descriptor.
 *           `doc` names the plugin, the document's path inside it, and
 *           how the document reaches the model:
 *             { plugin, path, deliver: "context" }
 *               the file is already injected by that plugin's
 *               SessionStart hook; ablate it where it sits.
 *             { plugin, path, deliver: "skill", via, skill }
 *               a SKILL.md; the ablated body (frontmatter stripped) is
 *               written into `via` — the file the plugin's hook already
 *               injects — and skills/ is deleted from the variant, so
 *               arm B cannot be handed the intact rule back through the
 *               Skill tool, a Read, or a Grep.
 *   ruleId  short id, used to mint the arm sentinel.
 *   arm     "A" keeps the rule, "B" ablates it; both get an arm-unique
 *           sentinel so the hook payload identifies the arm without
 *           asking the model anything.
 *
 * Returns { pluginDir, sentinel, removedLines }. A B arm that removed
 * nothing throws — two identical arms would produce a confident, wrong
 * "no-delta" verdict.
 */
export async function makeDocVariant(variantDir, { pluginsDir, rule, ruleId, arm }) {
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

  // The invariant is that the two arms DIFFER; a line count is only a proxy
  // for it, and a wrong one at both ends. It misses a snippet that deletes a
  // line and puts identical text back, and it rejects a ceiling control that
  // strengthens the doc without cutting anything. Compare the texts, built
  // with the same sentinel so arm identity is not what makes them differ.
  if (arm === "B") {
    const { text: unablated } = buildVariant(isSkill ? stripFrontmatter(source) : source, {
      sentinel,
      label: rule.label,
    });
    if (text === unablated) {
      throw new Error(`arm B for "${ruleId}" changed nothing — the arms would be identical`);
    }
  }

  if (isSkill) {
    // The ablated body replaces the document the hook already injects,
    // and skills/ leaves the variant entirely: a SKILL.md left on disk
    // hands arm B the intact rule back through a Read or a Grep. The
    // via file's directory may not exist in a plugin that ships no
    // injected docs of its own (measured: kcc-pm 0.3.0 removed its
    // context/ dir entirely) — create it rather than ENOENT.
    const viaPath = path.join(dest, rule.doc.via);
    await mkdir(path.dirname(viaPath), { recursive: true });
    await writeFile(viaPath, skillPreamble(rule.doc.skill) + text);
    await rm(path.join(dest, "skills"), { recursive: true, force: true });
  } else {
    await writeFile(docPath, text);
  }
  return { pluginDir: dest, sentinel, removedLines };
}
