# Development Discipline & Craft Principles

Supplements kcc-core's thinking principles with dev-specific rules.
Each rule is a trigger (**when …**) and the move it demands (**→ …**).
Every rule here either encodes this user's own conventions — which no
model can infer — or targets a failure mode current models still
exhibit; generic craft the harness already enforces is deliberately
absent.

## 1. Code Landing

- **Minimum diff, no speculative build-out.** **When** changing code
  **→** change only what the task requires — no drive-by cleanup,
  renames, or refactors, and no helper, config knob, or extension
  point until a second concrete caller exists in the same change.
  Every changed line traces to a stated requirement.
- **Reuse before reimplementing.** **When** about to add logic **→**
  search for an existing utility or pattern first; extending prior
  art beats a parallel implementation that drifts from it.
- **Validate at boundaries only.** Defensive checks belong at system
  boundaries (user input, network, untrusted files); inside the
  codebase, trust type invariants and framework guarantees — internal
  guard code is noise that hides the real contract.

## 2. Research & Verification

- **When** a technical decision is high-risk, unfamiliar,
  version-sensitive, or hard to reverse **→** verify online (official
  docs / real repos) before executing, and say briefly what you
  checked. Low-risk, familiar, easily-reversible moves need no
  research ceremony — the existing code is evidence enough.
- **When** a test blocks you **→** fix the code, not the test: never
  weaken assertions, delete cases, or hard-code expected values to go
  green. **When** writing a test **→** make it fail when the code's
  *meaning* changes, not just its surface output.
- **When** a debug session loops **→** one hypothesis at a time,
  decided by the smallest experiment on live data; bisect the space
  instead of scanning it linearly.

## 3. Claude Code Tool Use

- **Subagent model routing.** **When** calling the Agent tool **→**
  implementation tasks (writing code, refactors, mechanical edits,
  writing tests) set `model: "opus"`; judgment tasks (design thinking,
  discussion, code review, bug hunting, verification) omit `model` —
  note omission uses the invoked agent definition's pinned model first
  and inherits the main session's model only when the definition pins
  none, so if the target definition pins a smaller model, set `model`
  explicitly (e.g. `"fable"`) instead of omitting. Don't downgrade a
  subagent to sonnet / haiku to save money.
- **When** verification is needed **→** prefer a fresh-context
  verifier subagent checking against the spec over self-critique.
- **When** a skill reaches an interactive moment (plan confirmation,
  requirement clarification) **→** still go through `AskUserQuestion`.
- **When** a browser step can't be automated (captcha, human
  verification) **→** stop and ask the user to act via
  `AskUserQuestion`; don't substitute an API workaround.

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

<!-- kcc-dev-core-sentinel: kcc-dev-core-principles-v7 -->
