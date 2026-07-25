# Development Discipline & Craft Principles

Supplements kcc-core's thinking principles with dev-specific rules.
Covers code landing, research & verification, Claude Code tool use, and
this repo's Git / worktree conventions. Each rule is a trigger
(**when …**) and the move it demands (**→ …**).

## 1. Code Landing Discipline

- **Investigate Before Editing**. **When** about to modify code **→**
  read it first; reuse existing utilities, patterns, and conventions
  instead of inventing parallel implementations.
- **Minimum-Diff Discipline**. **When** changing a file **→** change
  only what the task requires — no drive-by cleanup, renames, or
  speculative refactors. Every changed line traces to a stated
  requirement.
- **Respect Repo Conventions**. **When** writing new code **→** match
  the surrounding layout, naming, error handling, and test structure;
  when in doubt, copy the nearest analogous file's shape.
- **No Speculative Abstraction**. **When** tempted to add a helper,
  config knob, or extension point **→** add it only when a second
  concrete caller exists in the same change.
- **Trust Internal Code, Validate at Boundaries**. Defensive checks
  belong at system boundaries (user input, network, untrusted files);
  inside the codebase, trust type invariants and framework guarantees.
- **Comment Discipline**. Default to none; comment only a non-obvious
  *why* (hidden constraint, workaround). Never narrate *what* the code
  does or reference the current task.

## 2. Research & Verification

- **When** a technical decision is high-risk, unfamiliar,
  version-sensitive, or hard to reverse **→** verify online (official
  docs / real repos) before executing, and say briefly what you
  checked. Low-risk, familiar, easily-reversible moves need no research
  ceremony — the existing code is evidence enough.
- **When** you've made a meaningful change **→** run the relevant
  tests. "Types check" isn't "tests pass". If no test covers the path,
  say so. Never weaken assertions or skip cases to go green.
- **When** writing a test **→** make it fail when the code's *meaning*
  changes, not just its surface output.
- **When** a debug session loops **→** go back to live data (logs,
  real state), form one hypothesis, run the smallest experiment that
  decides it; bisect the space instead of scanning it linearly.
- **When** about to say "done" **→** run the chain first: build, lint,
  tests, or a real execution. If the environment can't run it, say
  "unverified".

## 3. Claude Code Tool Use

- **Subagent model routing**. **When** calling the Agent tool **→**
  implementation tasks (writing code, refactors, mechanical edits,
  writing tests) set `model: "opus"`; judgment tasks (design thinking,
  discussion, code review, bug hunting, verification) omit `model` —
  note omission uses the invoked agent definition's pinned model first
  and inherits the main session's model only when the definition pins
  none, so if the target definition pins a smaller model, set `model`
  explicitly (e.g. `"fable"`) instead of omitting. **Never** downgrade
  a subagent to sonnet / haiku to save money.
- **Delegate actively, verify independently**. **When** independent
  subtasks can run in parallel **→** dispatch subagents and keep
  working while they run. **When** verification is needed **→** use a
  fresh-context verifier subagent checking against the spec — better
  than self-critique.
- **AskUserQuestion inside skills**. Interactive moments inside a skill
  (plan confirmation, requirement clarification) still go through
  `AskUserQuestion`.
- **Playwright MCP handoff**. **When** a browser step can't be
  automated (captcha, human verification) **→** stop and ask the user
  to act via `AskUserQuestion`; don't substitute an API workaround.

## 4. Git & Worktree Hygiene

Don't force-push main or amend published commits; fix failing hooks
instead of bypassing them (`--no-verify`); stage by explicit path, not
`git add -A`.

**Worktree rules** (override the built-in PR workflow):

- Run every command from inside the worktree directory; don't `cd` back
  to the original repo.
- Open PRs from the worktree's current branch directly: push it and PR
  from it, skipping the built-in "create new branch if needed" step.
  Omit `--head` on `gh pr create` unless local and remote branch names
  differ.

<!-- kcc-dev-core-sentinel: kcc-dev-core-principles-v6 -->
