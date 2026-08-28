# kccplugin

Claude Code capabilities — thinking principles, dev discipline, a PM
persona, a prompt-ablation toolkit — installed **into your project**, not
into each teammate's laptop.

One command installs and upgrades:

```bash
curl -fsSL https://raw.githubusercontent.com/superkoh/kccplugin/main/install.sh | bash
```

The files land in your repo's `.claude/`. Commit them, and everyone who
clones gets exactly the same capabilities, at exactly the same version,
with no per-machine setup — and, just as importantly, they can *see* what
is already there before adding a skill of their own.

## Why not a plugin marketplace

A marketplace install lives in `~/.claude`. That means every teammate has a
different set of capabilities at a different version, nobody can tell which
of their prompts came from where, and a project-local skill can silently
shadow one they never knew existed. Installing into the repo makes the
capability set a reviewable, versioned part of the project.

## Usage

```bash
# interactive module selection
curl -fsSL .../install.sh | bash

# everything, no prompts
curl -fsSL .../install.sh | bash -s -- --all

# exactly these modules (declarative — anything else is removed)
curl -fsSL .../install.sh | bash -s -- --modules kcc-core,kcc-dev-core

# pin a release
curl -fsSL .../install.sh | KCC_REF=v0.5.0 bash -s -- --all

# verify nothing was edited locally — use this as a CI gate
curl -fsSL .../install.sh | bash -s -- --check

# remove everything kcc installed
curl -fsSL .../install.sh | bash -s -- --uninstall
```

From a clone, the same flags work without the download step:

```bash
node installer/install.mjs --all
```

Requires Node ≥ 18 and `jq` on PATH (the principle-injection hooks degrade
to a silent no-op without `jq`; the installer warns when it is missing).

**Install and upgrade are the same command.** It reconciles what is in the
project against what the source ships, using `.claude/kcc/kcc.lock.json` to
tell "upstream changed this" apart from "somebody edited this".

## Modules

| Module | What it does | Session-start cost |
| --- | --- | --- |
| `kcc-core` | Thinking & communication principles, injected at session start and into every subagent | always injected |
| `kcc-dev-core` | Code-discipline principles (injected only inside a software project), plus the `spec`, `unit-tests` and `blackbox-tests` skills and a post-turn test audit. Requires `kcc-core`. | conditional |
| `kcc-pm` | Senior PM × product-ops playbook skill, a dispatchable `kcc-pm` agent, and an onboarding command | none |
| `kcc-ablation` | Sealed A/B prompt-ablation campaigns — measures what each rule in an injected prompt is actually worth | none |

Selecting a module pulls in whatever it requires, and says so.

## What gets installed where

```
<project>/.claude/
├── settings.json                          # only the kcc hook entries are touched
├── commands/kcc-pm/onboard.md             # → /kcc-pm:onboard
├── agents/kcc-pm.md                       # → the kcc-pm agent
├── skills/kcc-dev-core:spec/SKILL.md      # → the kcc-dev-core:spec skill
└── kcc/                                   # hook scripts, injected context, lockfile
    ├── kcc.lock.json
    └── kcc-core/{scripts,context}/
```

Every managed path starts with `kcc`, so one glance tells you what is
managed and one glob covers the whole set.

Skills keep their `module:skill` namespace through a colon in the directory
name — that is the only way to namespace a project-level skill, since
project skills take their name verbatim from their directory and do not
namespace by subdirectory.

## These files are managed — don't edit them

Every installed file is recorded in `.claude/kcc/kcc.lock.json` with its
hash. On upgrade, a locally modified file is **overwritten**, on purpose:
the whole point is that the capability set is identical for everyone. Your
previous content is copied to `.claude/kcc/.backup/<timestamp>/` first and
the paths are printed, so nothing disappears silently.

To make that a rule rather than a request, gate it in CI:

```yaml
- run: curl -fsSL .../install.sh | bash -s -- --check
```

`--check` exits non-zero if any managed file was edited, deleted, or if the
kcc hook entries in `settings.json` were changed.

Want a change? Make it in this repo and re-run the installer.

## Migrating from the marketplace install

If you previously installed these as plugins, disable them so their prompts
are not injected twice — the installer detects this and warns:

```bash
claude plugin disable kcc-core
claude plugin disable kcc-dev-core
claude plugin disable kcc-pm
claude plugin disable kcc-ablation
```

One name changed: the PM agent is now `kcc-pm`, not `kcc-pm:pm` — an agent
name cannot contain a colon. Every skill and command keeps the name you
already type.

## Developing

See `CLAUDE.md` for the repo layout and `test/README.md` for the four-layer
test framework.

```bash
npm run test:offline   # L1 + L2, free and offline
npm test               # everything (L3/L4 make real API calls)
```
