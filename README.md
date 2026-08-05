# kccplugin

A [Claude Code](https://claude.com/claude-code) plugin marketplace.

| Plugin | What it does |
| --- | --- |
| `kcc-core` | Injects top-level thinking & communication principles at session start, plus a compact variant into every spawned subagent. |
| `kcc-dev-core` | Injects code-discipline principles when the session is inside a software project (subagent variant included), and ships the `write-spec`, `write-blackbox-tests`, and `materialize-blackbox-tests` skills. |

## Install

There are two ways in, and they solve different problems.

### 1. Marketplace — one person, every project

```bash
claude plugin marketplace add superkoh/kccplugin
claude plugin install kcc-core@kccplugin
claude plugin install kcc-dev-core@kccplugin
```

The files live in `~/.claude` and update from GitHub. Best when you want the
plugins to follow *you*.

### 2. Embed into a project — one project, every person

```bash
curl -fsSL https://raw.githubusercontent.com/superkoh/kccplugin/main/install.sh \
  | bash -s -- kcc-core kcc-dev-core
```

This **vendors** the plugins into the repository. Commit the result and every
teammate — and every CI job, and you on a plane — gets the same plugins with
no marketplace, no network, and no version drift. Claude Code loads anything
under `.claude/skills/<name>/` that carries a `.claude-plugin/plugin.json` as
a project-scope plugin (`<name>@skills-dir`).

What it writes:

| Path | Commit it? | Why |
| --- | --- | --- |
| `.claude/skills/<plugin>/` | yes | the vendored plugin itself |
| `.claude/kcc-vendor.json` | yes | records version, source ref, commit, and a sha256 per file — this is what makes upgrades safe |
| `.claude/settings.json` | yes | sets `enabledPlugins["<plugin>@kccplugin"] = false` so a marketplace-installed copy of the same plugin can't double-fire in this project |

**Upgrading is the same command.** It diffs against the recorded sha256s,
overwrites what upstream changed, deletes what upstream dropped, and parks any
file you edited locally next to itself as `<file>.kcc.bak` — an upgrade never
blocks and never silently loses your edits.

```bash
./install.sh kcc-dev-core                  # latest main
./install.sh kcc-dev-core@v0.7.0           # pin a tag, sha, or branch
./install.sh --dry-run kcc-core            # show the plan, change nothing
./install.sh --uninstall kcc-core          # remove tree + settings toggle + manifest entry
./install.sh --help
```

Requires `python3`, `curl`, and `tar`. Run `./install.sh --help` for the full
option list (`--source-dir`, `--repo`, `--project-dir`).

### After embedding

1. **Accept the workspace trust dialog**, then run `/reload-plugins` (or
   restart). Project plugins under `.claude/skills/` stay unloaded until the
   workspace is trusted — this is the single most common "it didn't install"
   report, and it is not an installer bug.
2. Verify: `claude plugin list` should show each plugin as
   `<name>@skills-dir`, `Scope: project`, `Status: ✔ loaded`.
3. Commit `.claude/skills/` and `.claude/kcc-vendor.json`.

### Gotchas

- **`.gitignore` eats `.claude/`.** Many projects ignore the whole directory,
  which silently defeats the point of vendoring. The installer detects this and
  warns, but deliberately does **not** edit your `.gitignore`. The fix this
  repo uses on itself:

  ```gitignore
  .claude/*
  !.claude/skills/
  ```

- **Add `*.kcc.bak` to `.gitignore`** if you customize vendored files.
- **The plugins themselves need nothing installed.** The context-injecting
  hooks are pure bash builtins — no `jq`, no `python3`, not even `sed` — so
  a teammate who clones the repo gets working hooks whatever their machine
  looks like. The one exception is kcc-dev-core's Stop hook, which audits
  the git working tree and therefore needs `git`; without it there is simply
  nothing to audit and the stop is allowed. (The installer needs
  `python3`/`curl`/`tar`; the plugins it installs do not.)
- **No name collisions.** A vendored plugin's skills are namespaced
  `<plugin>:<skill>`, so they coexist with a project's own plain skill of the
  same name. Nothing needs a manual prefix.
- **Both copies installed?** Harmless — the project's `settings.json` disables
  the marketplace copy, and project scope beats user scope.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, [CLAUDE.md](CLAUDE.md)
for the repo map, and [test/README.md](test/README.md) for the four-layer test
framework.

```bash
npm run test:offline    # L1 schemas + L2 unit — free, offline, pre-commit safe
npm test                # adds L3 e2e + L4 registration (real API cost)
```

## License

MIT — see [LICENSE](LICENSE).
