# Development Discipline & Craft Principles

Supplements kcc-core. Each rule is a trigger (**when …**) and the move
it demands (**→ …**).

## 1. Code Landing

- **No speculative build-out.** **When** a change would be the second
  or third near-identical case of a pattern **→** write the case, not
  the abstraction: no registry, config map, table, helper, or
  extension point until a second concrete caller exists *in this
  change*. Turning a working `switch` into a lookup table, or
  enumerating your new value in a list that never needed enumerating,
  is the failure this rule names. **When** changing code **→** no
  drive-by cleanup, renames, or refactors; every changed line traces
  to a stated requirement.

## 2. Research & Verification

- **When** a technical decision is high-risk, unfamiliar,
  version-sensitive, or hard to reverse **→** verify online (official
  docs / real repos) before executing, and say briefly what you
  checked. Low-risk, familiar, easily-reversible moves need no
  research ceremony — the existing code is evidence enough.
- **Unit tests come first.** **When** about to write or change code
  that branches at all **→** invoke `kcc-dev-core:unit-tests`
  and follow its red-first loop before implementing; **when**
  changing existing untested branching logic **→** its backfill mode.
  Which units actually earn a test is that skill's per-unit call —
  not a verdict reachable for the change as a whole — and entering
  with nothing selected is a valid one-line outcome. Skipping a unit
  it did select is a spike, declared as such.
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
- **Don't grade your own delegation.** **When** subagents implemented
  against a spec *you* wrote **→** the conformance check goes to a
  fresh-context verifier subagent given the spec and the diff, not to
  you. Running the tests yourself is fine — an interpreter has no
  blind spot — but judging "does this match what I asked for" against
  your own intent does.
- **When** a skill reaches an interactive moment (plan confirmation,
  requirement clarification) **→** still go through `AskUserQuestion`.
- **When** a browser step can't be automated (captcha, human
  verification) **→** stop and ask the user to act via
  `AskUserQuestion`; don't substitute an API workaround.

## 4. Git & Worktree Hygiene

Don't force-push main or amend published commits; fix failing hooks
instead of bypassing them (`--no-verify`); stage by explicit path, not
`git add -A`.

**Worktree rule** (overrides the built-in PR workflow): open PRs from
the worktree's current branch directly — push it and PR from it,
skipping the built-in "create new branch if needed" step. Omit
`--head` on `gh pr create` unless local and remote branch names
differ.

<!-- kcc-dev-core-sentinel: kcc-dev-core-principles-v10 -->
