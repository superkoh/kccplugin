/**
 * Plugin + test artifact discovery.
 *
 * The whole framework is convention-driven. This module is the single place
 * where those conventions are encoded:
 *
 *   <repo>/plugins/<plugin-name>/                       -- a plugin root
 *     .claude-plugin/plugin.json                        -- manifest
 *     commands/*.md                                     -- slash commands
 *     agents/*.md                                       -- sub-agents
 *     skills/<skill-name>/SKILL.md                      -- skills
 *     hooks/hooks.json                                  -- hooks
 *     tests/unit/**                                     -- L2 unit tests
 *     tests/e2e/*.yaml                                  -- L3 e2e cases
 *     tests/sdk/expected.json                           -- L4 SDK expectations
 *
 *   <repo>/.claude-plugin/marketplace.json              -- marketplace manifest
 *
 * New plugins "just work" by dropping into plugins/<name>/. Nothing in the
 * framework needs to change.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
export const REPO_ROOT = path.resolve(path.dirname(__filename), "..", "..");
export const PLUGINS_DIR = path.join(REPO_ROOT, "plugins");
export const MARKETPLACE_PATH = path.join(
  REPO_ROOT,
  ".claude-plugin",
  "marketplace.json"
);

/** @returns {Promise<boolean>} */
async function isDir(p) {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Error thrown when the PLUGIN filter refers to a plugin that doesn't
 * exist. Runners recognize this class and print it as a one-line user
 * error rather than a stack trace.
 */
export class PluginFilterError extends Error {
  constructor(message) {
    super(message);
    this.name = "PluginFilterError";
  }
}

/**
 * List every plugin directory under plugins/, sorted by name.
 *
 * When a filter name is given (or PLUGIN env var is set), only that plugin
 * is returned. A typo in the filter is a hard error — we refuse to silently
 * "pass" by testing nothing.
 *
 * @param {string} [filterName]
 * @returns {Promise<Array<{name: string, root: string, manifestPath: string}>>}
 */
export async function discoverPlugins(filterName) {
  if (!existsSync(PLUGINS_DIR)) return [];
  const entries = await readdir(PLUGINS_DIR, { withFileTypes: true });
  const plugins = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".")) continue;
    const root = path.join(PLUGINS_DIR, e.name);
    const manifestPath = path.join(root, ".claude-plugin", "plugin.json");
    plugins.push({ name: e.name, root, manifestPath });
  }
  plugins.sort((a, b) => a.name.localeCompare(b.name));

  const effectiveFilter = filterName || process.env.PLUGIN;
  if (effectiveFilter) {
    const matched = plugins.filter((p) => p.name === effectiveFilter);
    if (matched.length === 0) {
      const available = plugins.map((p) => p.name).join(", ") || "(none)";
      throw new PluginFilterError(
        `PLUGIN filter "${effectiveFilter}" did not match any plugin. ` +
          `Available: ${available}`
      );
    }
    return matched;
  }
  return plugins;
}

/**
 * Inventory the authoring artifacts of a single plugin (what actually ships).
 * Nothing here touches the `tests/` directory — that's the job of
 * `discoverTestArtifacts`.
 */
export async function inventoryPluginAssets(plugin) {
  const { root } = plugin;
  const out = {
    manifest: null,
    commands: [],    // [{ name, path }]
    agents: [],      // [{ name, path }]
    skills: [],      // [{ name, dir, path }]
    hooksJson: null, // absolute path or null
  };

  if (existsSync(plugin.manifestPath)) {
    out.manifest = plugin.manifestPath;
  }

  // commands/*.md
  const commandsDir = path.join(root, "commands");
  if (await isDir(commandsDir)) {
    const files = await readdir(commandsDir);
    for (const f of files) {
      if (f.endsWith(".md")) {
        out.commands.push({
          name: f.replace(/\.md$/, ""),
          path: path.join(commandsDir, f),
        });
      }
    }
  }

  // agents/*.md
  const agentsDir = path.join(root, "agents");
  if (await isDir(agentsDir)) {
    const files = await readdir(agentsDir);
    for (const f of files) {
      if (f.endsWith(".md")) {
        out.agents.push({
          name: f.replace(/\.md$/, ""),
          path: path.join(agentsDir, f),
        });
      }
    }
  }

  // skills/<name>/SKILL.md
  const skillsDir = path.join(root, "skills");
  if (await isDir(skillsDir)) {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const skillDir = path.join(skillsDir, e.name);
      const skillFile = path.join(skillDir, "SKILL.md");
      if (existsSync(skillFile)) {
        out.skills.push({ name: e.name, dir: skillDir, path: skillFile });
      }
    }
  }

  // hooks/hooks.json
  const hooksJson = path.join(root, "hooks", "hooks.json");
  if (existsSync(hooksJson)) out.hooksJson = hooksJson;

  // Common misplacements we want to yell about loudly. These are catastrophic
  // (plugin silently won't work) so we expose them so the validator can fail.
  out.misplaced = [];
  const wrongLocations = [
    path.join(root, ".claude-plugin", "commands"),
    path.join(root, ".claude-plugin", "agents"),
    path.join(root, ".claude-plugin", "skills"),
    path.join(root, ".claude-plugin", "hooks"),
  ];
  for (const wrong of wrongLocations) {
    if (await isDir(wrong)) out.misplaced.push(wrong);
  }

  return out;
}

/**
 * Discover test artifacts for a plugin, by layer.
 */
export async function discoverTestArtifacts(plugin) {
  const { root } = plugin;
  const testsDir = path.join(root, "tests");
  const out = {
    unit: { bats: [], nodeTest: [], pytest: [] },
    e2e: [],
    sdkExpected: null,
  };
  if (!(await isDir(testsDir))) return out;

  // L2 unit
  const unitDir = path.join(testsDir, "unit");
  if (await isDir(unitDir)) {
    const walk = async (dir) => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          await walk(full);
        } else if (e.isFile()) {
          if (e.name.endsWith(".bats")) out.unit.bats.push(full);
          else if (e.name.endsWith(".test.mjs") || e.name.endsWith(".test.js"))
            out.unit.nodeTest.push(full);
          else if (e.name.startsWith("test_") && e.name.endsWith(".py"))
            out.unit.pytest.push(full);
        }
      }
    };
    await walk(unitDir);
  }

  // L3 e2e
  const e2eDir = path.join(testsDir, "e2e");
  if (await isDir(e2eDir)) {
    const files = await readdir(e2eDir);
    for (const f of files) {
      if (f.endsWith(".yaml") || f.endsWith(".yml")) {
        out.e2e.push(path.join(e2eDir, f));
      }
    }
    out.e2e.sort();
  }

  // L4 sdk expectations
  const sdkDir = path.join(testsDir, "sdk");
  const sdkExpected = path.join(sdkDir, "expected.json");
  if (existsSync(sdkExpected)) out.sdkExpected = sdkExpected;

  return out;
}

/** Convenience: load+parse marketplace.json; returns null if missing. */
export async function loadMarketplace() {
  if (!existsSync(MARKETPLACE_PATH)) return null;
  const raw = await readFile(MARKETPLACE_PATH, "utf-8");
  return { path: MARKETPLACE_PATH, json: JSON.parse(raw), raw };
}
