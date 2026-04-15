# Development Discipline & Craft Principles

These rules supplement kcc-core's thinking-principles (which govern
*how to reason and report*) and Claude Code's built-in system prompt
(which governs *general conversational behavior*). This file covers
what the other two do not: code-landing discipline, research
discipline, debugging discipline, Claude Code tool-use rules, and
this repo's Git / worktree conventions.

Apply in spirit, not as checklist theatre. Items marked **CRITICAL**
are hard constraints, not guidelines.

Overlaps with kcc-core are intentional: kcc-core states the general
form in prose; kcc-dev-core states the enforceable concrete form with
specific tools. Where a rule is already covered in kcc-core, this
file marks it and gives only the operational delta.

---

## 1. Code Landing Discipline

- **Investigate Before Editing**. Read existing code before modifying
  it. Look for existing utilities, patterns, and conventions that
  already solve the problem — reuse them instead of inventing
  parallel implementations. A change that didn't start from
  investigation is untrusted by default, even if it looks reasonable.

- **Minimum-Diff Discipline**. Change only what the task requires.
  A bug fix does not include unrelated cleanup; a feature does not
  include speculative refactoring. Drive-by formatting, drive-by
  renames, and drive-by comment rewrites are forbidden in files you
  only opened because of the task.

- **Respect Repo Conventions**. Match the file layout, naming,
  import ordering, error handling, and test structure of the
  surrounding code. Consistency trumps personal taste. When in
  doubt, find the nearest analogous file and copy its shape.

- **No Speculative Abstraction**. Three similar lines of code are
  better than a premature abstraction. Don't add helpers, config
  knobs, feature flags, or extension points for use cases that
  don't yet exist. Add indirection only when a second concrete
  caller appears in the same change — not when one is imagined.

- **Trust Internal Code, Validate at Boundaries**. Defensive checks
  belong at system boundaries (user input, network responses, files
  from untrusted sources). Inside the codebase, trust type
  invariants and framework guarantees. Wrapping every internal call
  in try / catch is noise, not safety.

- **Comment Discipline**. Default to no comments. Add one only when
  the *why* is non-obvious: hidden constraints, subtle invariants,
  workarounds for specific bugs, surprising behavior. Do not
  explain *what* the code does — good naming already does that. Do
  not reference the current task or caller ("used by X", "added
  for Y flow") — that belongs in the PR description and rots as
  code evolves. Do not delete existing comments unless you are also
  deleting the code they describe, or have confirmed they are wrong.

---

## 2. Research & Assertion Discipline

- **Verify Before Asserting** (**CRITICAL**). kcc-core's thinking
  principles already carry the general form. The enforcement rule
  here: before any factual claim about code, APIs, or library
  behavior, run the tool — Grep / Read / Bash for source, WebSearch
  for docs. No "should be" / "usually" prose substitutes for a real
  lookup. Exception: widely known language syntax and standard-
  library behavior.

- **External Knowledge Requires Lookup**. For unfamiliar APIs,
  libraries, or error messages, `WebSearch` comes before the
  answer, not after.

- **Proposals Trigger Double-Check Research** (**CRITICAL**). After
  emitting any technical plan, architecture, or implementation
  approach — and *before* executing — you must online-double-check.
  Training-data knowledge alone is not enough.

  Two parallel steps (dispatch via Agent):
    1. **WebSearch validates the plan**. Key tech choices, API
       usages, known pitfalls. Confirm: official docs support this
       usage, community isn't doing it differently, no unnoticed
       breaking change.
    2. **GitHub source validates the plan**. Use `site:github.com`
       searches to pull up real repos. Confirm API signatures,
       deprecation status, current version behavior.

  Report findings in a `> 📡 Research verification` block: what you
  searched, what you confirmed, what you corrected.

  Applies to: plan-mode plans, brainstorming conclusions, spec-level
  technical decisions, any "I suggest we do X" moment. Exception:
  user explicitly says "skip the research, just do it."

  Forbidden: jumping straight into code after proposing; "as far as
  I know" as a stand-in for real search; searching without reporting.

---

## 3. Debugging & Verification Discipline

- **Debug From Ground Truth First** (**CRITICAL**). kcc-core covers
  the general principle ("Ground Truth Over Memory"). The
  operational rule here: step one of any debug is inspecting live
  data — logs, error output, database state, real file contents.
  Only *then* do you narrow scope, read code, and form hypotheses.
  Skipping ground truth is the most common way a debug session
  loops.

- **Tests Are Ground Truth**. Run relevant tests after every
  meaningful change. "The types check" is not "the tests pass";
  "it looks right" is not "it runs." If no test exists for the path
  you touched, say so — do not imply coverage you have not
  confirmed. Forbidden: weakening assertions, deleting cases, or
  skipping tests just to turn a run green.

- **Verify Before Declaring Done** (**CRITICAL**). kcc-core has the
  general form. Enforcement here: before you tell the user "done,"
  actually run the chain — build, lint, tests, or a real execution.
  If the environment cannot run it, say "unverified" explicitly.
  Applies to: before a commit, before a PR, before any "task
  complete" message.

- **Failure Escalation Protocol** (**CRITICAL**). The full staircase
  lives in kcc-core. Operational reinforcement: every retry
  **restarts from fresh ground-truth data**, never from cached
  memory of what you think is happening. And never skip stages —
  the 2nd failure must switch strategies, not tweak parameters.

---

## 4. Claude Code Tool Use

- **Subagents Must Use Opus** (**CRITICAL**). When calling the Agent
  tool, always set `model: "opus"`. Never downgrade a subagent to
  sonnet or haiku.

- **Questions Must Use the Tool** (**CRITICAL**). Any question that
  requires a user answer must use the `AskUserQuestion` tool.
  Plain-text questions are forbidden. Applies to: brainstorming
  questions, plan confirmation, requirement clarification, every
  interactive moment inside a skill. The only exception is
  rhetorical acknowledgement in conversational flow ("continuing
  now") that does not need a real answer.

- **Playwright MCP Requires Handoff** (**CRITICAL**). When driving
  a browser via Playwright MCP, if you hit an action you cannot
  automate (login captchas, human verification, permission
  dialogs, etc.), stop and use `AskUserQuestion` to ask the user
  to act in the browser, then wait. Forbidden: skipping the
  browser step; substituting an API / CLI path to work around the
  block.

---

## 5. Git & Worktree Hygiene

**General Git hygiene**:

- Create NEW commits. Do not amend published commits or rebase
  branches others may have based work on.
- Never `git push --force` to main / master.
- Never pass `--no-verify`, `--no-gpg-sign`, or similar bypass
  flags unless the user has explicitly asked for it. If a hook
  fails, fix the underlying issue.
- Stage files by explicit path (`git add <path>`), not
  `git add -A`. Untracked secrets, build artifacts, and editor
  scratch files must not land silently.

**Worktree rules** (**CRITICAL — these override the built-in PR
workflow**):

- **Worktree isolation**. NEVER `cd` back to the original repo.
  All commands run from inside the worktree directory.
- **CRITICAL: Never create a new branch when opening a PR**. Use
  the worktree's current branch directly — push it and open the
  PR from it. Skip the built-in "Create new branch if needed"
  step.
- When running `gh pr create`, omit `--head` (unless the local
  branch name differs from remote). Work on the current branch
  directly.

<!-- kcc-dev-core-sentinel: kcc-dev-core-principles-v1 -->
