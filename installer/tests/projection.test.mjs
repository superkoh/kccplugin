import assert from "node:assert/strict";
import { test } from "node:test";
import { projectHooks, projectPath, moduleRuntimeRoot } from "../lib/projection.mjs";

test("commands land in a namespaced subdirectory", () => {
  // Verified live: .claude/commands/<ns>/<f>.md registers as /<ns>:<f>.
  assert.equal(
    projectPath("kcc-pm", "commands/onboard.md"),
    ".claude/commands/kcc-pm/onboard.md"
  );
});

test("skills keep their namespace via a colon in the directory name", () => {
  // Verified live: a project skill's name IS its directory name, verbatim,
  // and a colon survives — the only way to namespace a project skill.
  assert.equal(
    projectPath("kcc-dev-core", "skills/spec/SKILL.md"),
    ".claude/skills/kcc-dev-core:spec/SKILL.md"
  );
  assert.equal(
    projectPath("kcc-pm", "skills/pm-playbook/references/strategy.md"),
    ".claude/skills/kcc-pm:pm-playbook/references/strategy.md"
  );
});

test("agents stay flat — a colon in an agent name breaks registration", () => {
  assert.equal(projectPath("kcc-pm", "agents/kcc-pm.md"), ".claude/agents/kcc-pm.md");
});

test("scripts and context keep their relative layout under .claude/kcc/", () => {
  // The hook scripts self-locate with $0 and read ../context/*.md, so this
  // relative pairing is what lets them run unmodified.
  assert.equal(
    projectPath("kcc-core", "scripts/session-start-principles.sh"),
    ".claude/kcc/kcc-core/scripts/session-start-principles.sh"
  );
  assert.equal(
    projectPath("kcc-core", "context/thinking-principles.md"),
    ".claude/kcc/kcc-core/context/thinking-principles.md"
  );
});

test("authoring-only paths are not shipped", () => {
  for (const rel of [
    "hooks/hooks.json",
    ".claude-plugin/plugin.json",
    "tests/unit/x.test.mjs",
    "tests/e2e/case.yaml",
    "README.md",
    "skills/stray.md",
  ]) {
    assert.equal(projectPath("kcc-core", rel), null, `${rel} should not ship`);
  }
});

test("path traversal is refused", () => {
  assert.throws(() => projectPath("kcc-core", "../../etc/passwd"), /non-relative/);
  assert.throws(() => projectPath("kcc-core", "/etc/passwd"), /non-relative/);
});

test("hook commands are remapped from plugin root to project root", () => {
  const hooks = projectHooks(
    {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/start.sh"',
                timeout: 5,
              },
            ],
          },
        ],
      },
    },
    "kcc-core"
  );
  assert.equal(
    hooks.SessionStart[0].hooks[0].command,
    'bash "$CLAUDE_PROJECT_DIR/.claude/kcc/kcc-core/scripts/start.sh"'
  );
  // Every installed command must carry the ownership marker, since that is
  // the only thing that lets an upgrade find its own entries again.
  assert.ok(hooks.SessionStart[0].hooks[0].command.includes("/.claude/kcc/"));
});

test("the bare $CLAUDE_PLUGIN_ROOT form is remapped too", () => {
  const hooks = projectHooks(
    { hooks: { Stop: [{ hooks: [{ type: "command", command: "bash $CLAUDE_PLUGIN_ROOT/s.sh" }] }] } },
    "kcc-dev-core"
  );
  assert.equal(hooks.Stop[0].hooks[0].command, `bash ${moduleRuntimeRoot("kcc-dev-core")}/s.sh`);
});

test("a module with no hooks projects to an empty object", () => {
  assert.deepEqual(projectHooks({}, "kcc-pm"), {});
  assert.deepEqual(projectHooks(null, "kcc-pm"), {});
});

test("a hook command without the ownership marker is refused at authoring time", () => {
  // Without this, the entry is appended on every install (it can never be
  // recognized as ours again), settings.json grows without bound, --check
  // reports drift forever, and uninstall leaves it behind.
  assert.throws(
    () =>
      projectHooks(
        { hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }] } },
        "kcc-core"
      ),
    /could never recognize or remove it/
  );
});

test("a command that reaches outside the module root is refused too", () => {
  assert.throws(
    () =>
      projectHooks(
        {
          hooks: {
            Stop: [{ hooks: [{ type: "command", command: 'bash "$CLAUDE_PROJECT_DIR/tools/x.sh"' }] }],
          },
        },
        "kcc-dev-core"
      ),
    /could never recognize or remove it/
  );
});
