---
name: picking-from-backlog
description: Use after /backlog-pick loads a backlog item, or when the user says "let's start this backlog item" / "开始做这个 item". Reads the loaded item's nature, proposes one of three moves (new worktree, clarify the approach first, or continue in place), and waits for user confirmation before proceeding.
allowed-tools: Bash, AskUserQuestion
---

# picking-from-backlog

Activated right after `/backlog-pick` loaded an item and flipped it to `in_progress`. Your job is narrow: read the item, propose **one** of three moves via AskUserQuestion, and let the user confirm. The user picks; you don't execute the move.

## The three moves

**A — Open a new worktree** for this item.
Use for concrete coding tasks (feature / bug fix / refactor) when the current worktree has uncommitted changes or the change would conflict with what's currently being worked on. The user may also pick this to keep the current session focused.

**B — Clarify the approach first** before writing code.
Use when the item captured the motivation but not the "how" — fuzzy requirements, spec-level changes, or "I want to do X but not sure how yet." Spend a round aligning on scope before touching code.

**C — Continue discussion here.**
Use for non-code work (docs, research, lookup, planning), a small targeted edit, or when the user opened this session specifically for this item.

## Judgement signals

- Body contains "research / 查 / 了解 / 对齐 / 调研" → lean C.
- Body contains concrete verbs "implement / refactor / fix / 修 / 加 / 重构 / 新增" → A or B.
- Title/body very specific (names a module, file, concrete change) → A or C.
- Title/body open-ended ("improve X", "think about Y") → B.
- Run `git status`. Uncommitted changes raise A's value; clean tree leaves A and C both OK.

Form an internal recommendation, then show all three options to the user — never pre-pick.

## Propose via AskUserQuestion

One AskUserQuestion call with three options:

- "A 开一个独立 worktree" — "Start work on this item in an isolated git worktree. Recommended when the change would conflict with current work or you want a clean slate."
- "B 先梳理方案再动手" — "Align on scope and approach with a brief discussion before writing code. Recommended for fuzzy or spec-level items."
- "C 直接在这里讨论" — "Continue in this session. Recommended for research, docs, small edits, or when this session was opened for this item."

Prepend "(Recommended)" to the option you recommend. One sentence of why goes right above the call: `这个 item 看起来更像 X，因为 <一句话>。`

## After the user picks

- **A** → "好，开一个独立 worktree 推进这件事。" Describe what opening a worktree means in plain language, then stop. If the install has a worktree skill or command, the harness picks it up from your stated intent. Stay within kcc-backlog's surface area — don't name skills or commands from other plugins (they may not be installed).
- **B** → "好，先对齐一下方案。" Start the discussion with one focused question about scope or success criteria.
- **C** → Just stay in the conversation and continue on the item directly.

If the loaded item's status is `done` or `abandoned`, say "这个 item 已经 closed — 选另一个 item 吧。" and stop instead of proposing.
