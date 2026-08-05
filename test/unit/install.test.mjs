/**
 * L2 — install.sh (marketplace-scope tooling, not a plugin).
 *
 * Why node --test rather than bats, which is this repo's default for shell:
 * almost every assertion here is about JSON state (kcc-vendor.json,
 * settings.json) and file trees across repeated invocations. node --test
 * asserts those natively, and it needs nothing installed beyond the Node this
 * repo already requires — `bats` is absent on a stock macOS dev box, so a
 * bats suite would silently skip exactly where this script is most dangerous
 * (it edits the user's settings.json). The hook-script suites stay on bats;
 * they assert stdout contracts, which is bats' home turf.
 *
 * Every case is hermetic: `--source-dir` installs from a fixture on disk, so
 * nothing here touches the network.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { PLUGIN_COMPONENT_DIRS, REPO_ROOT } from "../lib/discover.mjs";

const INSTALL_SH = path.join(REPO_ROOT, "install.sh");

/** Run install.sh; returns {status, stdout, stderr} without throwing. */
function run(args) {
  const res = spawnSync("bash", [INSTALL_SH, ...args], { encoding: "utf-8" });
  return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

/** Run install.sh and fail the test if it exits non-zero. */
function runOk(args) {
  const res = run(args);
  assert.equal(
    res.status,
    0,
    `install.sh ${args.join(" ")} failed:\n${res.stdout}\n${res.stderr}`
  );
  return res;
}

function tmp(prefix) {
  return mkdtempSync(path.join(tmpdir(), `kcc-${prefix}-`));
}

function write(file, content, mode) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf-8");
  if (mode !== undefined) chmodSync(file, mode);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf-8"));
}

/**
 * A minimal stand-in marketplace: one plugin exercising every whitelisted
 * component directory, plus a `tests/` directory that must NOT ship.
 */
function makeFixture() {
  const src = tmp("src");
  write(
    path.join(src, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "kccplugin", plugins: [] })
  );
  const p = path.join(src, "plugins", "demo-plug");
  write(
    path.join(p, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "demo-plug", version: "1.0.0", description: "demo" })
  );
  write(path.join(p, "hooks", "hooks.json"), JSON.stringify({ hooks: {} }));
  write(path.join(p, "scripts", "run.sh"), "#!/usr/bin/env bash\necho hi\n", 0o755);
  write(path.join(p, "skills", "demo", "SKILL.md"), "---\ndescription: d\n---\n\nbody\n");
  write(path.join(p, "context", "note.md"), "upstream note\n");
  write(path.join(p, "commands", "go.md"), "---\ndescription: d\n---\n\ngo\n");
  write(path.join(p, "agents", "helper.md"), "---\ndescription: d\n---\n\nhelp\n");
  write(path.join(p, "tests", "unit", "demo.bats"), "@test 'x' { true; }\n");
  return { src, pluginDir: p };
}

function installFixture(extraArgs = []) {
  const { src, pluginDir } = makeFixture();
  const proj = tmp("proj");
  const res = runOk([
    "--source-dir",
    src,
    "--project-dir",
    proj,
    "demo-plug",
    ...extraArgs,
  ]);
  return { src, pluginDir, proj, res };
}

const target = (proj) => path.join(proj, ".claude", "skills", "demo-plug");
const manifestPath = (proj) => path.join(proj, ".claude", "kcc-vendor.json");
const settingsPath = (proj) => path.join(proj, ".claude", "settings.json");

test("fresh install vendors the whole plugin under .claude/skills/", () => {
  const { proj } = installFixture();
  const t = target(proj);
  for (const rel of [
    ".claude-plugin/plugin.json",
    "hooks/hooks.json",
    "scripts/run.sh",
    "skills/demo/SKILL.md",
    "context/note.md",
    "commands/go.md",
    "agents/helper.md",
  ]) {
    assert.ok(existsSync(path.join(t, rel)), `expected vendored file ${rel}`);
  }
  rmSync(proj, { recursive: true, force: true });
});

test("tests/ is excluded — dev artifacts must not ship into a project", () => {
  const { proj } = installFixture();
  assert.ok(
    !existsSync(path.join(target(proj), "tests")),
    "tests/ must not be vendored"
  );
  rmSync(proj, { recursive: true, force: true });
});

test("executable bits survive the copy", () => {
  const { proj } = installFixture();
  const mode = statSync(path.join(target(proj), "scripts", "run.sh")).mode;
  assert.ok(mode & 0o100, "scripts/run.sh should stay executable");
  rmSync(proj, { recursive: true, force: true });
});

test("manifest records version, source and a sha256 per file", () => {
  const { proj } = installFixture();
  const m = readJson(manifestPath(proj));
  assert.equal(m.schema, 1);
  const entry = m.plugins["demo-plug"];
  assert.equal(entry.version, "1.0.0");
  assert.equal(entry.source.kind, "local");
  assert.equal(entry.disabledMarketplacePlugin, "demo-plug@kccplugin");
  assert.match(entry.files["hooks/hooks.json"], /^sha256:[0-9a-f]{64}$/);
  assert.ok(
    !Object.keys(entry.files).some((f) => f.startsWith("tests/")),
    "manifest must not list excluded files"
  );
  rmSync(proj, { recursive: true, force: true });
});

test("the marketplace copy is disabled for this project", () => {
  const { proj } = installFixture();
  const s = readJson(settingsPath(proj));
  assert.equal(s.enabledPlugins["demo-plug@kccplugin"], false);
  rmSync(proj, { recursive: true, force: true });
});

test("settings.json is merged, never replaced", () => {
  const { src } = makeFixture();
  const proj = tmp("proj");
  write(
    settingsPath(proj),
    JSON.stringify({ permissions: { allow: ["Bash(ls:*)"] }, model: "opus" }, null, 2)
  );
  runOk(["--source-dir", src, "--project-dir", proj, "demo-plug"]);
  const s = readJson(settingsPath(proj));
  assert.deepEqual(s.permissions, { allow: ["Bash(ls:*)"] });
  assert.equal(s.model, "opus");
  assert.equal(s.enabledPlugins["demo-plug@kccplugin"], false);
  rmSync(proj, { recursive: true, force: true });
});

test("re-running is idempotent — no rewrites, no stray backups", () => {
  const { src, proj } = installFixture();
  const before = readJson(manifestPath(proj)).plugins["demo-plug"].files;
  const res = runOk(["--source-dir", src, "--project-dir", proj, "demo-plug"]);
  assert.match(res.stdout, /write\s+0 file/);
  assert.deepEqual(readJson(manifestPath(proj)).plugins["demo-plug"].files, before);
  assert.ok(!existsSync(path.join(target(proj), "context", "note.md.kcc.bak")));
  rmSync(proj, { recursive: true, force: true });
});

test("a locally edited file is backed up, then brought back to upstream", () => {
  const { src, pluginDir, proj } = installFixture();
  const local = path.join(target(proj), "context", "note.md");
  writeFileSync(local, "MY LOCAL EDIT\n", "utf-8");
  writeFileSync(path.join(pluginDir, "context", "note.md"), "upstream v2\n", "utf-8");

  const res = runOk(["--source-dir", src, "--project-dir", proj, "demo-plug"]);
  assert.match(res.stdout, /back up 1 locally-modified file/);
  assert.equal(readFileSync(local + ".kcc.bak", "utf-8"), "MY LOCAL EDIT\n");
  assert.equal(readFileSync(local, "utf-8"), "upstream v2\n");
  rmSync(proj, { recursive: true, force: true });
});

test("files dropped upstream are pruned from the project", () => {
  const { src, pluginDir, proj } = installFixture();
  rmSync(path.join(pluginDir, "context", "note.md"));

  const res = runOk(["--source-dir", src, "--project-dir", proj, "demo-plug"]);
  assert.match(res.stdout, /prune\s+1 file/);
  assert.ok(!existsSync(path.join(target(proj), "context", "note.md")));
  assert.ok(
    !("context/note.md" in readJson(manifestPath(proj)).plugins["demo-plug"].files)
  );
  rmSync(proj, { recursive: true, force: true });
});

test("a pruned file that was locally edited is backed up before removal", () => {
  const { src, pluginDir, proj } = installFixture();
  const local = path.join(target(proj), "context", "note.md");
  writeFileSync(local, "PRECIOUS\n", "utf-8");
  rmSync(path.join(pluginDir, "context", "note.md"));

  runOk(["--source-dir", src, "--project-dir", proj, "demo-plug"]);
  assert.ok(!existsSync(local));
  assert.equal(readFileSync(local + ".kcc.bak", "utf-8"), "PRECIOUS\n");
  rmSync(proj, { recursive: true, force: true });
});

test("refuses to overwrite a directory it did not create", () => {
  const { src } = makeFixture();
  const proj = tmp("proj");
  write(path.join(target(proj), "SKILL.md"), "---\ndescription: mine\n---\n");

  const res = run(["--source-dir", src, "--project-dir", proj, "demo-plug"]);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /Refusing to overwrite/);
  assert.equal(
    readFileSync(path.join(target(proj), "SKILL.md"), "utf-8"),
    "---\ndescription: mine\n---\n"
  );
  rmSync(proj, { recursive: true, force: true });
});

test("an unknown plugin name is a hard error, not a silent no-op", () => {
  const { src } = makeFixture();
  const proj = tmp("proj");
  const res = run(["--source-dir", src, "--project-dir", proj, "nope"]);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /unknown plugin/);
  assert.ok(!existsSync(path.join(proj, ".claude")));
  rmSync(proj, { recursive: true, force: true });
});

test("--dry-run reports the plan and writes nothing", () => {
  const { src } = makeFixture();
  const proj = tmp("proj");
  const res = runOk(["--source-dir", src, "--project-dir", proj, "--dry-run", "demo-plug"]);
  assert.match(res.stdout, /would write/);
  assert.match(res.stdout, /Dry run/);
  assert.ok(!existsSync(path.join(proj, ".claude")));
  rmSync(proj, { recursive: true, force: true });
});

test("--uninstall removes the tree, its settings toggle, and its manifest entry", () => {
  const { src } = makeFixture();
  const proj = tmp("proj");
  write(settingsPath(proj), JSON.stringify({ model: "opus" }, null, 2));
  runOk(["--source-dir", src, "--project-dir", proj, "demo-plug"]);
  runOk(["--project-dir", proj, "--uninstall", "demo-plug"]);

  assert.ok(!existsSync(target(proj)));
  assert.ok(!existsSync(manifestPath(proj)), "manifest goes away once empty");
  const s = readJson(settingsPath(proj));
  assert.equal(s.model, "opus", "unrelated settings survive");
  assert.ok(!("enabledPlugins" in s), "our toggle is retracted");
  rmSync(proj, { recursive: true, force: true });
});

test("--uninstall on something we never installed is a hard error", () => {
  const proj = tmp("proj");
  const res = run(["--project-dir", proj, "--uninstall", "demo-plug"]);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /not recorded/);
  rmSync(proj, { recursive: true, force: true });
});

test("warns, but does not edit .gitignore, when .claude/ is ignored", () => {
  const { src } = makeFixture();
  const proj = tmp("proj");
  execFileSync("git", ["init", "-q"], { cwd: proj });
  const gitignore = path.join(proj, ".gitignore");
  write(gitignore, ".claude/\n");

  const res = runOk(["--source-dir", src, "--project-dir", proj, "demo-plug"]);
  assert.match(res.stdout, /WARNING: \.claude\/skills\/ is git-ignored/);
  assert.equal(readFileSync(gitignore, "utf-8"), ".claude/\n");
  rmSync(proj, { recursive: true, force: true });
});

test("the vendor whitelist covers every plugin component directory", () => {
  const script = readFileSync(INSTALL_SH, "utf-8");
  const block = script.match(/COMPONENT_DIRS = \(([\s\S]*?)\)/);
  assert.ok(block, "install.sh must declare COMPONENT_DIRS");
  const whitelist = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(whitelist.includes(".claude-plugin"), "the manifest must ship");
  for (const dir of PLUGIN_COMPONENT_DIRS) {
    assert.ok(
      whitelist.includes(dir),
      `install.sh would silently drop ${dir}/ — a plugin component the ` +
        `framework knows about (see PLUGIN_COMPONENT_DIRS in discover.mjs)`
    );
  }
});

test("smoke: a real plugin from this repo vendors correctly", () => {
  const proj = tmp("proj");
  runOk(["--source-dir", REPO_ROOT, "--project-dir", proj, "kcc-core"]);
  const t = path.join(proj, ".claude", "skills", "kcc-core");
  assert.ok(existsSync(path.join(t, ".claude-plugin", "plugin.json")));
  assert.ok(existsSync(path.join(t, "hooks", "hooks.json")));
  assert.ok(existsSync(path.join(t, "scripts", "session-start-principles.sh")));
  assert.ok(!existsSync(path.join(t, "tests")), "tests/ must not ship");

  const entry = readJson(manifestPath(proj)).plugins["kcc-core"];
  assert.equal(entry.disabledMarketplacePlugin, "kcc-core@kccplugin");
  const s = readJson(settingsPath(proj));
  assert.equal(s.enabledPlugins["kcc-core@kccplugin"], false);
  rmSync(proj, { recursive: true, force: true });
});
