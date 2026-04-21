---
description: Use when the user wants to plan a new feature end-to-end — brainstorm → spec → acceptance criteria → review → QA test cases → review. Triggers on 规划功能 / 写 spec 和测试用例 / 做需求规划 / 出新 feature 的 spec / 帮我规划这个 feature / plan feature / plan this feature / write spec and test cases / draft spec and AC. Runs a 6-teammate team via TeamCreate and produces 3 artifacts under .kcc/.
---

# plan-feature — orchestrate a new feature from idea to QA cases

Run this in the main session. The skill builds a team of 6 teammates, each
owning one step, and produces three artifacts:

- `.kcc/specs/<feature-slug>/spec.md`
- `.kcc/specs/<feature-slug>/ac.md`
- `.kcc/tests/cases/<feature-slug>.yaml`

Plus AI peer-review notes at `.kcc/specs/<feature-slug>/review.md`.

## When to use
Trigger phrases (Chinese + English):
- 规划功能 / 写 spec 和测试用例 / 做需求规划 / 出新 feature 的 spec / 帮我规划这个 feature
- plan feature / plan this feature / write spec and test cases / draft spec and AC

## When NOT to use
- Quick code changes that don't need a spec (use general coding workflow)
- Writing test cases alone without a spec (use an existing test-authoring flow)
- A feature that already has spec + AC + test cases written — no orchestration needed

## Process

### Phase 0 — Pre-flight (main session)

1. **Scan context silently.** Look through:
   - The last ~20 turns of conversation for feature names, requirement fragments
   - Recently opened / edited files under `docs/`, `specs/`, `product/`, `prds/`
   - The repo root for a PRD-like directory
   Pre-identify up to 3 candidate feature names and any input-material file paths.

2. **Confirm with the user via one AskUserQuestion call (3 questions):**

   - Q1 **Feature name** — options: each candidate from context scan (up to 3), plus "Other" for free text.
   - Q2 **Input material** — options: one per candidate file path (up to 3), plus "Only session-prior discussion", plus "No prior material — start from scratch".
   - Q3 **Target platform** — options: `web`, `ios`, `android`, `desktop`. Single-select.

3. **Derive `<feature-slug>`.** Rules:
   - Transliterate / summarize CJK to ASCII.
   - kebab-case, `[a-z0-9-]` only.
   - Max 48 chars.
   - If `.kcc/specs/<slug>/` already exists, try `<slug>-v2`, `<slug>-v3`, etc.

4. **Create output directories:**
   ```bash
   mkdir -p .kcc/specs/<feature-slug>
   mkdir -p .kcc/tests/cases
   ```

5. **Write `_kickoff.md`** — the single source of truth for all teammates. Template:

   ```markdown
   # Kickoff: <feature-name>

   - slug: <feature-slug>
   - platform: <platform>
   - kicked off at: <ISO 8601 timestamp>
   - input material: <file path, or "session-only", or "none">

   ## Original material

   <paste the raw user idea or an excerpt from the input file; at least 3 lines>
   ```

### Phase 1 — Create team and task chain

1. **TeamCreate:**
   ```
   TeamCreate(
     team_name="dev-plan-<feature-slug>",
     agent_type="orchestrator",
     description="Plan <feature-name> end-to-end (brainstorm → spec → AC → review → test cases → review)"
   )
   ```

2. **Create 6 tasks with linear `addBlockedBy` chain.** Use the task description template below for each.

   | # | subject | blocked by |
   |---|---------|------------|
   | T1 | `Step 1: Brainstorm for <feature-slug>` | — |
   | T2 | `Step 2: Write spec for <feature-slug>` | T1 |
   | T3 | `Step 3: Write AC for <feature-slug>` | T2 |
   | T4 | `Step 4: Review spec+AC for <feature-slug>` | T3 |
   | T5 | `Step 5: Write test cases for <feature-slug>` | T4 |
   | T6 | `Step 6: Review test cases for <feature-slug>` | T5 |

### Step skill bindings

Each step spawns a teammate that invokes a specific skill via the Skill tool. The `<role>` placeholder in the teammate prompt template maps to these concrete skill names:

- Step 1 → `kcc-dev-workflow:step-brainstorm`
- Step 2 → `kcc-dev-workflow:step-spec-writer`
- Step 3 → `kcc-dev-workflow:step-ac-writer`
- Step 4 → `kcc-dev-workflow:step-spec-ac-reviewer`
- Step 5 → `kcc-dev-workflow:step-test-case-writer`
- Step 6 → `kcc-dev-workflow:step-test-case-reviewer`

### Task description template

Each task's `description` (set via TaskCreate's `description` field) uses this format:

```
## Step <N>: <Role>

**Goal:** <one-sentence goal for this step>

**Inputs (read):**
- .kcc/specs/<feature-slug>/_kickoff.md
- <prior step output paths>

**Output (write):**
- <exact output path>

**Skill to invoke:** kcc-dev-workflow:step-<role>

**DoD:**
- <structural conditions specific to this step>
- Run TaskUpdate(status=completed) when done
```

### Phase 2 — Execute steps sequentially

For each step N from 1 to 6:

1. **Wait for T<N> to be unblocked.** Poll TaskList; proceed when T<N> status is `pending` and every task in its `blockedBy` is `completed`.

2. **Spawn teammate** via the Agent tool:
   ```
   Agent(
     subagent_type="general-purpose",
     model="opus",
     team_name="dev-plan-<feature-slug>",
     name="step-<N>-<role>",
     prompt=<teammate prompt template below>
   )
   ```

3. **Wait for the teammate's idle notification.** The system delivers it automatically — do not poll.

4. **Verify on idle:**
   - Read T<N> via TaskGet; status must be `completed`.
   - Stat the expected output file; it must exist and be non-empty.
   - For Steps 4 and 6 (reviewers), also confirm `review.md` contains the required section header (`## spec-ac` for Step 4, `## test-cases` for Step 6).

5. **On failure, follow the escalation protocol** (see below).

6. **On success, emit to main session:**
   ```
   ✓ Step <N>: <role> complete → <output path>
   ```

### Teammate prompt template

Each teammate receives exactly this prompt (substitute `<N>`, `<role>`, and the team name; everything else is literal):

```
You are a teammate in team dev-plan-<feature-slug>.
Your task: Step <N> — <role>. Task ID: T<N>.

1. Read the kickoff file: .kcc/specs/<feature-slug>/_kickoff.md
2. Read any prior-step outputs listed in your task description (call TaskGet with taskId=T<N> to see it).
3. Invoke the skill `kcc-dev-workflow:step-<role>` (use the Skill tool). That skill tells you exactly what to write and where.
4. After the skill has written its output file, call TaskUpdate(taskId=T<N>, status=completed).
5. Do NOT write anything outside the paths listed in your task description.
6. Reply with "done" and the output file path, then stop.
```

### Phase 3 — Wrap up

1. **Sanity check.** Read the first 30 lines of each of:
   - `.kcc/specs/<feature-slug>/spec.md`
   - `.kcc/specs/<feature-slug>/ac.md`
   - `.kcc/tests/cases/<feature-slug>.yaml`

   For each, confirm it is non-empty and well-formed (spec.md and ac.md are markdown with sections; yaml parses).

2. **Emit summary to user:**
   ```
   ✅ Plan complete: <feature-slug>
      - spec:       .kcc/specs/<slug>/spec.md
      - AC:         .kcc/specs/<slug>/ac.md
      - test cases: .kcc/tests/cases/<slug>.yaml
      - review:     .kcc/specs/<slug>/review.md
   ```

3. **Shut down teammates** by sending each one a shutdown_request:
   ```
   SendMessage(to=<teammate name>, message={type: "shutdown_request"})
   ```

## Failure escalation

If a teammate does not complete its task (task status not `completed` OR expected output file missing / empty):

1. **1st failure** — SendMessage to the teammate with the concrete problem (e.g. "Output file not found at `.kcc/specs/<slug>/spec.md`; please retry and make sure the skill writes before TaskUpdate.") Ask it to retry.
2. **2nd failure** — switch strategy: re-prompt the teammate with "Skip the Skill tool; directly use the Write tool to create the file at `<path>` with the following structure: <inline template from the step skill's DoD>. Then TaskUpdate(status=completed)."
3. **3rd failure** — stop. List 3 non-overlapping hypotheses:
   - Hypothesis A: the step skill itself has a bug (read the skill file to verify).
   - Hypothesis B: the task description is missing required context (read TaskGet output).
   - Hypothesis C: the prior-step input file is malformed (read it).
   Investigate each before any further retry.
4. **4th failure** — emit an AskUserQuestion: "Step <N> (<role>) has failed 3 times. Attempts tried: <retry / inline write / hypothesis-driven fix>. Current hypotheses: <A / B / C>. Options: (a) skip this step with a TODO stub, (b) I take over manually, (c) describe a new approach in Other."

## Invariants

Before returning to the user, confirm:
- All 6 tasks are `completed`.
- All 3 output files exist and are non-empty.
- `review.md` contains both `## spec-ac` (from Step 4) and `## test-cases` (from Step 6) sections.
- `<feature-slug>` is ASCII-only kebab-case and matches all 3 output paths.
- The team `dev-plan-<feature-slug>` has received a shutdown_request for each teammate.

## Anti-patterns

- **Do not write any teammate's output yourself.** Your job is orchestration. If you find yourself reaching for Write on spec.md, stop — spawn the teammate instead.
- **Do not skip Phase 0.** The kickoff file is the only thing teammates use to coordinate; without it they'll each ask the user, fragmenting the conversation.
- **Do not parallelize steps.** The chain is strictly linear. If you're tempted to spawn T2 and T3 together, remember T3 reads spec.md which T2 writes.
- **Do not re-open the team** if something fails mid-workflow. Use the existing team; the task list is the durable state.

<!-- kcc-dev-workflow-plan-feature-sentinel: v1 -->
