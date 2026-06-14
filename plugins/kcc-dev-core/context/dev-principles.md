# Development Discipline & Craft Principles

Supplements kcc-core's thinking-principles (which govern *how to reason
and report*) and Claude Code's built-in system prompt. Covers
code-landing, research, debugging, Claude Code tool-use, and this repo's
Git / worktree conventions. Each rule is a trigger (**when …**) and the
move it demands (**→ …**); where a rule already lives in kcc-core, this
file gives only the operational delta with specific tools.

---

## 1. Code Landing Discipline

- **Investigate Before Editing**. **When** about to modify code **→**
  read it first, and look for utilities, patterns, and conventions that
  already solve the problem — reuse them instead of inventing a parallel
  implementation.

- **Minimum-Diff Discipline**. **When** changing a file **→** change only
  what the task requires. A bug fix carries no unrelated cleanup; a
  feature carries no speculative refactor; drive-by formatting, renames,
  and comment rewrites in files you only opened for the task don't
  belong. Self-check: every changed line traces to a specific stated
  requirement — if it doesn't, revert it.

- **Respect Repo Conventions**. **When** writing new code **→** match the
  surrounding file layout, naming, import ordering, error handling, and
  test structure. When in doubt, copy the nearest analogous file's shape.

- **No Speculative Abstraction**. **When** tempted to add a helper, config
  knob, feature flag, or extension point **→** add it only when a second
  concrete caller appears in the same change, not when one is imagined.
  Three similar lines beat a premature abstraction. Self-check: would a
  senior engineer skim this and call it overcomplicated?

- **Trust Internal Code, Validate at Boundaries**. **When** deciding
  where a defensive check belongs **→** put it at system boundaries (user
  input, network responses, untrusted files); inside the codebase, trust
  type invariants and framework guarantees. Wrapping every internal call
  in try / catch is noise.

- **Comment Discipline**. **When** about to write a comment **→** default
  to none; add one only when the *why* is non-obvious (hidden
  constraints, subtle invariants, workarounds, surprising behavior).
  Don't explain *what* the code does — naming covers that — and don't
  reference the current task or caller; that belongs in the PR
  description. Leave existing comments unless you're also deleting the
  code they describe or have confirmed they're wrong.

---

## 2. Research & Assertion Discipline

- **Verify Before Asserting (operational form)**. kcc-core's "Verify
  Against Ground Truth" is the general rule. **When** about to make any
  factual claim about code, APIs, or library behavior **→** run the tool
  first — Grep / Read / Bash for source, WebSearch for docs. "Should be"
  / "usually" prose isn't a substitute for a real lookup. Exception:
  widely-known language syntax and standard-library behavior.

- **External Knowledge Requires Lookup**. **When** facing an unfamiliar
  API, library, or error message **→** `WebSearch` comes before the
  answer, not after.

- **Proposals Trigger Double-Check Research**. **When** you've emitted a
  technical plan, architecture, or implementation approach — and *before*
  executing it **→** online-double-check (training-data knowledge alone
  isn't enough), then report in a `> 📡 Research verification` block:
  what you searched, what you confirmed, what you corrected.

  Two parallel steps (dispatch via Agent):
    1. **WebSearch validates the plan**. Key tech choices, API usages,
       known pitfalls. Confirm official docs support this usage, the
       community isn't doing it differently, no unnoticed breaking change.
    2. **GitHub source validates the plan**. Use `site:github.com` to
       pull up real repos. Confirm API signatures, deprecation status,
       current-version behavior.

  Applies to plan-mode plans, brainstorming conclusions, spec-level
  technical decisions, any "I suggest we do X" moment.

  **Scale the depth to the risk.** Reserve the full two-step verification
  for load-bearing or unfamiliar territory: a new dependency, an
  unfamiliar or version-sensitive API, a non-obvious usage, or a decision
  that's expensive to reverse. For low-risk, familiar, easily-reversible
  moves — standard-library usage, a local refactor, a convention already
  established in this repo — a single quick check, or the existing code
  itself, is enough; say what you verified and move on. Uniform maximum
  verification on every trivial step is its own waste. Exception: user
  explicitly says "skip the research, just do it."

---

## 3. Debugging & Verification Discipline

- **Debug From Ground Truth First**. kcc-core covers the general
  principle ("Verify Against Ground Truth"). **When** a debug session
  starts **→** step one is inspecting live data — logs, error output,
  database state, real file contents — *before* you narrow scope, read
  code, or form hypotheses. Skipping ground truth is the most common way
  a debug session loops.

- **Debug by Hypothesis, Not by Guessing**. **When** a handful of ad-hoc
  pokes haven't localized the bug **→** stop poking and run the loop:
  study the data, form one hypothesis that explains *all* of it, devise
  the smallest experiment that would confirm or refute it (a print, a
  breakpoint, an assertion, a focused test), run it, then repeat from the
  new data. A "fix" applied before you can name the mechanism is a guess.

- **Localize by Bisection**. **When** searching for a fault **→** halve
  the space each step instead of scanning it linearly. Bisect the
  dataflow: check a value at the midpoint between a known-good input and
  the bad output to decide which half holds the fault, then recurse into
  it. Bisect history the same way — `git bisect` (or a manual checkout
  halfway back) to pin the commit that introduced a regression. Each
  check should roughly halve what's left to suspect.

- **Tests Are Ground Truth**. **When** you've made a meaningful change
  **→** run the relevant tests. "The types check" isn't "the tests
  pass"; "it looks right" isn't "it runs." If no test exists for the path
  you touched, say so rather than implying coverage you haven't
  confirmed. Weakening assertions, deleting cases, or skipping tests to
  turn a run green defeats the point.

- **Tests Encode Intent**. **When** writing a test **→** make it fail
  when the *meaning* of the code changes, not just its surface output. A
  test that only pins current behavior isn't a real test. If you can't
  articulate the "why" it guards, the test is wrong, not the system.

- **Verify Before Declaring Done (run the chain)**. kcc-core's closing
  self-audit asks "done means done?"; this is its dev enforcement.
  **When** about to tell the user "done" — before any commit, PR, or
  "task complete" message **→** run the chain: build, lint, tests, or a
  real execution. If the environment can't run it, say "unverified"
  explicitly.

- **Failure Escalation Protocol (operational reinforcement)**. The full
  staircase lives in kcc-core. **When** retrying a failed attempt **→**
  restart from fresh ground-truth data, not cached memory; the 2nd
  failure switches strategy, not parameters; anchor every
  reflect-and-retry to a concrete external signal — a failing test, a
  compiler / linter error, tool output, a fresh log. With no new signal,
  re-judging your own reasoning tends to discard correct work; go get a
  signal (add a test, add logging, run the failing path) before
  concluding the last attempt was wrong.

---

## 4. Claude Code Tool Use

- **Parallelize Independent Work**. **When** you have independent reads,
  greps, or bash calls — or independent subagents to launch **→** batch
  them into one tool block / one message so they run concurrently. The
  built-in prompt allows this; actually do it. Stay sequential only on a
  real dependency: step B consumes A's output, writes the same file, or
  is an ordered Git op.

- **Subagents use Opus**. **When** calling the Agent tool **→** set
  `model: "opus"`. Don't downgrade subagents to sonnet or haiku.

- **AskUserQuestion inside skills**. **When** any interactive moment
  arises inside a skill — brainstorming, plan confirmation, requirement
  clarification **→** kcc-core's "Ask Structured Questions" still applies,
  not only at top-level decisions.

- **Playwright MCP requires handoff**. **When** driving a browser via
  Playwright MCP and you hit an action you can't automate (login
  captchas, human verification, permission dialogs) **→** stop and use
  `AskUserQuestion` to ask the user to act in the browser, then wait.
  Don't substitute an API / CLI path to work around the block.

---

## 5. Git & Worktree Hygiene

**General Git hygiene**:

- **When** committing **→** create new commits; don't amend published
  commits or rebase branches others may have based work on.
- **Never** `git push --force` to main / master.
- **When** a hook fails **→** fix the underlying issue; don't pass
  `--no-verify`, `--no-gpg-sign`, or similar bypass flags unless the user
  explicitly asked.
- **When** staging **→** add by explicit path (`git add <path>`), not
  `git add -A`; untracked secrets, build artifacts, and editor scratch
  files shouldn't land silently.

**Worktree rules** (these override the built-in PR workflow):

- **Worktree isolation**. **When** running any command **→** run it from
  inside the worktree directory; don't `cd` back to the original repo.
- **When** opening a PR from a worktree **→** use the worktree's current
  branch directly: push it and open the PR from it. Skip the built-in
  "create new branch if needed" step.
- **When** running `gh pr create` **→** omit `--head` unless the local
  branch name differs from remote.

<!-- kcc-dev-core-sentinel: kcc-dev-core-principles-v5 -->
