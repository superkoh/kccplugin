# Development Discipline & Craft Principles

Supplements kcc-core's thinking-principles (which govern *how to reason
and report*) and Claude Code's built-in system prompt. Covers
code-landing, research, debugging, Claude Code tool-use, and this repo's
Git / worktree conventions. Where a rule is already in kcc-core, this
file gives only the operational delta with specific tools.

---

## 1. Code Landing Discipline

- **Investigate Before Editing**. Read existing code before modifying
  it. Look for utilities, patterns, and conventions that already solve
  the problem — reuse them instead of inventing parallel implementations.

- **Minimum-Diff Discipline**. Change only what the task requires. A bug
  fix doesn't include unrelated cleanup; a feature doesn't include
  speculative refactoring. Drive-by formatting, renames, and comment
  rewrites in files you only opened for the task don't belong.
  Self-check: every changed line should trace to a specific stated
  requirement; if it doesn't, revert it.

- **Respect Repo Conventions**. Match the file layout, naming, import
  ordering, error handling, and test structure of the surrounding code.
  When in doubt, copy the nearest analogous file's shape.

- **No Speculative Abstraction**. Three similar lines are better than a
  premature abstraction. Add helpers, config knobs, feature flags, or
  extension points only when a second concrete caller appears in the
  same change — not when one is imagined. Self-check: would a senior
  engineer skim this and call it overcomplicated?

- **Trust Internal Code, Validate at Boundaries**. Defensive checks
  belong at system boundaries (user input, network responses, untrusted
  files). Inside the codebase, trust type invariants and framework
  guarantees — wrapping every internal call in try / catch is noise.

- **Comment Discipline**. Default to no comments. Add one only when the
  *why* is non-obvious: hidden constraints, subtle invariants,
  workarounds, surprising behavior. Don't explain *what* the code does —
  naming covers that. Don't reference the current task or caller — that
  belongs in the PR description. Leave existing comments unless you're
  also deleting the code they describe or have confirmed they're wrong.

---

## 2. Research & Assertion Discipline

- **Verify Before Asserting (operational form)**. kcc-core has the general rule. Operational
  form: before any factual claim about code, APIs, or library behavior,
  run the tool — Grep / Read / Bash for source, WebSearch for docs. "Should
  be" / "usually" prose isn't a substitute for a real lookup. Exception:
  widely-known language syntax and standard-library behavior.

- **External Knowledge Requires Lookup**. For unfamiliar APIs, libraries,
  or error messages, `WebSearch` comes before the answer, not after.

- **Proposals Trigger Double-Check Research**. After emitting any
  technical plan, architecture, or implementation approach — and
  *before* executing — online-double-check. Training-data knowledge
  alone isn't enough.

  Two parallel steps (dispatch via Agent):
    1. **WebSearch validates the plan**. Key tech choices, API usages,
       known pitfalls. Confirm: official docs support this usage,
       community isn't doing it differently, no unnoticed breaking change.
    2. **GitHub source validates the plan**. Use `site:github.com` to
       pull up real repos. Confirm API signatures, deprecation status,
       current version behavior.

  Report findings in a `> 📡 Research verification` block: what you
  searched, what you confirmed, what you corrected.

  Applies to plan-mode plans, brainstorming conclusions, spec-level
  technical decisions, any "I suggest we do X" moment.

  Scale the depth to the risk. Reserve the full two-step verification for
  load-bearing or unfamiliar territory: a new dependency, an unfamiliar
  or version-sensitive API, a non-obvious usage, or a decision that's
  expensive to reverse. For low-risk, familiar, easily-reversible moves —
  standard-library usage, a local refactor, a convention already
  established in this repo — a single quick check, or the existing code
  itself, is enough; say what you verified and move on. Match the cost of
  checking to the cost of being wrong; uniform maximum verification on
  every trivial step is its own waste. Exception: user explicitly says
  "skip the research, just do it."

---

## 3. Debugging & Verification Discipline

- **Debug From Ground Truth First**. kcc-core covers the general
  principle ("Verify Against Ground Truth"). Operational form: step one of
  any debug is inspecting live data — logs, error output, database
  state, real file contents. Only *then* narrow scope, read code, and
  form hypotheses. Skipping ground truth is the most common way a debug
  session loops.

- **Debug by Hypothesis, Not by Guessing**. Once you have ground truth,
  run the loop: study the data, form one hypothesis that explains *all* of
  it, devise the smallest experiment that would confirm or refute it (a
  print, a breakpoint, an assertion, a focused test), run it, then repeat
  from the new data. A "fix" applied before you can name the mechanism is
  a guess. Trigger: once a handful of ad-hoc pokes haven't localized the
  bug, stop poking and switch to this systematic loop rather than trying
  more variations.

- **Localize by Bisection**. Debugging is a search — halve the space each
  step instead of scanning it linearly. Bisect the dataflow: check a value
  at the midpoint between a known-good input and the bad output to decide
  which half holds the fault, then recurse into that half. Bisect history
  the same way — `git bisect` (or a manual checkout halfway back) to pin
  the commit that introduced a regression. Each check should roughly halve
  what's left to suspect.

- **Tests Are Ground Truth**. Run relevant tests after every meaningful
  change. "The types check" isn't "the tests pass"; "it looks right"
  isn't "it runs." If no test exists for the path you touched, say so
  rather than implying coverage you haven't confirmed. Weakening
  assertions, deleting cases, or skipping tests to turn a run green
  defeats the point.

- **Tests Encode Intent**. A test that only pins current behavior isn't
  a real test — it should fail when the *meaning* of the code changes,
  not just its surface output. If you can't articulate the "why" a test
  guards, the test is wrong, not the system.

- **Verify Before Declaring Done (run the chain)**. kcc-core has the general form.
  Enforcement here: before you tell the user "done," run the chain —
  build, lint, tests, or a real execution. If the environment can't
  run it, say "unverified" explicitly. Applies before commits, PRs,
  and any "task complete" message.

- **Failure Escalation Protocol (operational reinforcement)**. Full staircase lives in kcc-core.
  Operational reinforcement: every retry restarts from fresh
  ground-truth data, not cached memory. The 2nd failure switches
  strategy, not parameters. Anchor every reflect-and-retry to a concrete
  external signal — a failing test, a compiler / linter error, tool
  output, a fresh log. With no new external signal, re-judging your own
  reasoning tends to discard correct work; go get a signal (add a test,
  add logging, run the failing path) before concluding the last attempt
  was wrong.

---

## 4. Claude Code Tool Use

- **Parallelize Independent Work**. The built-in prompt already allows
  this — actually do it. Batch independent reads, greps, and bash into
  one tool block; launch independent subagents in one message so they
  run concurrently. Stay sequential only when there's a real dependency:
  step B consumes A's output, writes to the same file, or ordered Git ops.

- **Subagents use Opus**. When calling the Agent tool, set
  `model: "opus"`. Don't downgrade subagents to sonnet or haiku.

- **AskUserQuestion inside skills**. kcc-core's "Ask Structured
  Questions" applies to every interactive moment inside a skill too —
  brainstorming, plan confirmation, requirement clarification — not
  only top-level decisions.

- **Playwright MCP requires handoff**. When driving a browser via
  Playwright MCP, if you hit an action you can't automate (login
  captchas, human verification, permission dialogs), stop and use
  `AskUserQuestion` to ask the user to act in the browser, then wait.
  Don't substitute an API / CLI path to work around the block.

---

## 5. Git & Worktree Hygiene

**General Git hygiene**:

- Create new commits. Don't amend published commits or rebase branches
  others may have based work on.
- Don't `git push --force` to main / master.
- Don't pass `--no-verify`, `--no-gpg-sign`, or similar bypass flags
  unless the user explicitly asked for it. If a hook fails, fix the
  underlying issue.
- Stage files by explicit path (`git add <path>`), not `git add -A` —
  untracked secrets, build artifacts, and editor scratch files shouldn't
  land silently.

**Worktree rules** (these override the built-in PR workflow):

- **Worktree isolation**. All commands run from inside the worktree
  directory — don't `cd` back to the original repo.
- **When opening a PR from a worktree, use the worktree's current
  branch directly**: push it and open the PR from it. Skip the built-in
  "Create new branch if needed" step.
- When running `gh pr create`, omit `--head` (unless the local branch
  name differs from remote).

<!-- kcc-dev-core-sentinel: kcc-dev-core-principles-v4 -->
