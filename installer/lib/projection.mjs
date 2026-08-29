/**
 * Projection — the single source of truth for how a source module maps onto
 * a target project's `.claude/` tree.
 *
 * A module is authored in Claude Code plugin shape (`plugins/<name>/`) and
 * *projected* into a project. The projection is deliberately a **pure byte
 * copy**: no file's content is ever rewritten on the way in. That keeps the
 * drift hashes exact, keeps the shipped prompts byte-identical to the ones
 * the ablation campaigns measured, and makes `install` trivially reversible.
 *
 * The naming rules below are not guesses — each was verified against a live
 * `claude` process by reading the `system/init` record it emits:
 *
 *   commands/<f>.md      → .claude/commands/<module>/<f>.md   ⇒ /<module>:<f>
 *                          (project commands DO namespace by subdirectory)
 *   skills/<s>/**        → .claude/skills/<module>:<s>/**     ⇒ <module>:<s>
 *                          (a skill's name is its directory name verbatim,
 *                           frontmatter `name:` is ignored, and a colon in
 *                           the directory name survives — which is the only
 *                           way to keep a namespace on a project skill,
 *                           since skills do NOT namespace by subdirectory)
 *   agents/<f>.md        → .claude/agents/<f>.md              ⇒ frontmatter name
 *                          (an agent's name comes from frontmatter and may
 *                           NOT contain a colon — such agents silently fail
 *                           to register — so agent names are flat and are
 *                           required to start with the module name)
 *   scripts/**           → .claude/kcc/<module>/scripts/**
 *   context/**           → .claude/kcc/<module>/context/**
 *                          (hook scripts self-locate via $0 and read
 *                           ../context/*.md, so preserving this relative
 *                           layout means they need no edits at all)
 *   hooks/hooks.json     → merged into .claude/settings.json (not a file)
 *
 * Everything else in a module (`.claude-plugin/`, `tests/`, stray files) is
 * authoring-only and is not shipped.
 */

/** Directory that holds everything Claude Code does NOT auto-discover. */
export const KCC_DIR = ".claude/kcc";
/** Lockfile: the record of what we installed and what it hashed to. */
export const LOCK_PATH = `${KCC_DIR}/kcc.lock.json`;
/** Where overwritten local modifications are preserved. */
export const BACKUP_DIR = `${KCC_DIR}/.backup`;
/** The project settings file we merge hook entries into. */
export const SETTINGS_PATH = ".claude/settings.json";
/**
 * A hook entry belongs to us if and only if its command string contains this
 * marker. Every script we install lives under `.claude/kcc/`, so this is
 * exact, and it survives the user reordering or reformatting the file.
 */
export const MANAGED_HOOK_MARKER = "/.claude/kcc/";
/** Lockfile format version. A newer lock than the installer is refused. */
export const LOCK_VERSION = 1;

/** Source subdirectories that are authoring-only and never shipped. */
const NOT_SHIPPED = [".claude-plugin/", "tests/", "evals/"];

/**
 * Map one source-relative path inside a module to its target-relative path.
 *
 * @param {string} moduleName
 * @param {string} rel  path relative to `plugins/<moduleName>/`, POSIX slashes
 * @returns {string|null} target path relative to the project root, or null
 *   when the file is not shipped (authoring-only, or handled out of band).
 */
export function projectPath(moduleName, rel) {
  // A `..` *segment* escapes the module; two dots inside a filename
  // (`notes..md`) are perfectly legal and must not abort the whole install.
  if (rel.startsWith("/") || rel.split("/").includes("..")) {
    throw new Error(`refusing to project a non-relative path: ${rel}`);
  }
  for (const prefix of NOT_SHIPPED) {
    if (rel === prefix.slice(0, -1) || rel.startsWith(prefix)) return null;
  }

  // hooks.json is merged into settings.json, not copied.
  if (rel === "hooks/hooks.json") return null;

  if (rel.startsWith("commands/")) {
    return `.claude/commands/${moduleName}/${rel.slice("commands/".length)}`;
  }

  if (rel.startsWith("agents/")) {
    return `.claude/agents/${rel.slice("agents/".length)}`;
  }

  if (rel.startsWith("skills/")) {
    const rest = rel.slice("skills/".length);
    const slash = rest.indexOf("/");
    if (slash === -1) return null; // a stray file directly under skills/
    const skill = rest.slice(0, slash);
    const inner = rest.slice(slash + 1);
    return `.claude/skills/${moduleName}:${skill}/${inner}`;
  }

  if (rel.startsWith("scripts/") || rel.startsWith("context/")) {
    return `${KCC_DIR}/${moduleName}/${rel}`;
  }

  // Anything else (README.md at the module root, etc.) is authoring-only.
  return null;
}

/**
 * The absolute-at-runtime prefix that a projected module's own files live
 * under, as written into hook command strings. `$CLAUDE_PROJECT_DIR` is
 * expanded by Claude Code when it runs a project hook (verified live).
 */
export function moduleRuntimeRoot(moduleName) {
  return `$CLAUDE_PROJECT_DIR/${KCC_DIR}/${moduleName}`;
}

/**
 * Rewrite a module's hooks.json for project-level execution: the only thing
 * that changes is `${CLAUDE_PLUGIN_ROOT}`, which does not exist outside a
 * plugin, becoming the projected module root.
 *
 * @param {object} hooksJson  parsed hooks/hooks.json
 * @param {string} moduleName
 * @returns {object} the `hooks` object ready to merge into settings.json
 */
export function projectHooks(hooksJson, moduleName) {
  const root = moduleRuntimeRoot(moduleName);
  const remap = (value) => {
    if (typeof value === "string") {
      return value
        .replaceAll("${CLAUDE_PLUGIN_ROOT}", root)
        .replaceAll("$CLAUDE_PLUGIN_ROOT", root);
    }
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, remap(v)])
      );
    }
    return value;
  };
  const hooks = hooksJson?.hooks;
  if (!hooks || typeof hooks !== "object") return {};
  const projected = remap(hooks);

  // Every projected command MUST carry the ownership marker, because that
  // substring is the only thing that lets a later run find its own entries
  // again. A module whose hook command never mentions the module root (say a
  // bare `echo hi`) would be appended to settings.json on every install —
  // growing without bound, permanently failing --check, and surviving
  // uninstall. Fail loudly at authoring time instead.
  for (const [event, entries] of Object.entries(projected)) {
    if (!Array.isArray(entries)) {
      throw new Error(
        `module "${moduleName}": hooks.${event} must be an array of entries, got ` +
          `${entries === null ? "null" : typeof entries}`
      );
    }
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.hooks)) {
        throw new Error(
          `module "${moduleName}": every hooks.${event} entry needs a "hooks" array`
        );
      }
      for (const hook of entry.hooks) {
        if (typeof hook?.command === "string" && !hook.command.includes(MANAGED_HOOK_MARKER)) {
          throw new Error(
            `module "${moduleName}": hooks.${event} command does not reference ` +
              `\${CLAUDE_PLUGIN_ROOT}, so kcc could never recognize or remove it ` +
              `again: ${hook.command}`
          );
        }
      }
    }
  }
  return projected;
}
