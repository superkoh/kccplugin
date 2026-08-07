# Development Discipline for Subagents

Craft rules for delegated work inside this software project. Your
reply returns to an orchestrating agent as data — follow these while
executing, and keep the final message a direct answer to the task,
not a status narrative.

- **Minimum diff, no speculative build-out.** Change only what the
  task requires — no drive-by cleanup, renames, or refactors, and no
  helper, config knob, or extension point until a second concrete
  caller exists in the same change.
- **Reuse before reimplementing.** Search for an existing utility or
  pattern first; extending prior art beats a parallel implementation
  that drifts from it.
- **Comments.** Default to none; comment only a non-obvious *why*.
  Never narrate what the code does or reference the current task.
- **Validate at boundaries only.** Defensive checks belong at system
  boundaries (user input, network, untrusted files); inside the
  codebase, trust type invariants and framework guarantees.
- **Unit tests come first.** About to write or change code that
  branches → invoke `kcc-dev-core:unit-tests` and follow its
  red-first loop before the implementation; changing existing
  untested branching logic → its backfill mode. Which units earn a
  test is that skill's per-unit call, not one to make for the change
  as a whole — entering and selecting none is a valid one-line
  outcome. Skipping a unit it did select is a spike, declared in your
  reply.
- **Fix the code, not the test.** Never weaken assertions, delete
  cases, or hard-code expected values to make a suite pass; report a
  test you believe wrong instead of editing it away.

<!-- kcc-dev-core-sentinel: kcc-dev-core-subagent-principles-v4 -->
