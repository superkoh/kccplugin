---
name: picking-from-backlog
description: Use after /backlog-pick loads a backlog item, or when the user says "let's start this backlog item" / "开始做这个 item". Reads the loaded item's nature, proposes one of three moves (new worktree, clarify the approach first, or continue in place), and waits for user confirmation before proceeding.
allowed-tools: Bash, AskUserQuestion
---

# picking-from-backlog

Activated right after `/backlog-pick` loaded an item and flipped it to `in_progress`. Your job here is narrow: read the item's nature, propose **one** of three moves, and let the user confirm. Do NOT execute the move yourself.

## The three moves

**A — Open a new worktree** for this item.
Use when the item is a concrete coding task (feature / bug fix / refactor) AND the current worktree has uncommitted changes OR the change would conflict with what's currently being worked on. The user may also choose this when they want to keep the current session focused and start fresh elsewhere.

**B — Clarify the approach first** before writing code.
Use when the item body captured the motivation but not the "how" — fuzzy requirements, spec-level changes, or "I know I want to do X but not sure how yet." Proposal: spend a round or two aligning on scope and approach with the user before touching code.

**C — Continue discussion here.**
Use when the item is non-code work (docs, research, lookup, planning), a small targeted edit that won't hit other work, or the user opened this session specifically to work on this item.

## Judgement signals

Look at the item's title and body. Signals that shift the recommendation:

- Body contains "research / 查 / 了解 / 对齐 / 调研" → lean C.
- Body contains concrete technical verbs "implement / refactor / fix / 修 / 加 / 重构 / 新增" → A or B.
- Title/body very specific (names a module, a file, a concrete change) → A or C.
- Title/body open-ended ("improve X", "think about Y", "figure out Z") → B.
- Run `git status` in the current worktree. If uncommitted changes exist → A's value goes up; if clean → A and C both OK.

Form an internal recommendation, but **always show all three options** to the user.

## Propose via AskUserQuestion

Exactly one AskUserQuestion call with three options:

- Label "A 开一个独立 worktree", description: "Start work on this item in an isolated git worktree. Recommended when the change would conflict with current work or you want a clean slate."
- Label "B 先梳理方案再动手", description: "Align on scope and approach with a brief discussion before writing code. Recommended for fuzzy or spec-level items."
- Label "C 直接在这里讨论", description: "Continue in this session. Recommended for research, docs, small edits, or when this session was opened for this item."

Prepend the option you recommend with "(Recommended)" — still keep all three visible.

State one sentence of why, right above the AskUserQuestion call: "这个 item 看起来更像 X，因为 <一句话>。"

## After the user picks

- On **A**: tell the user "好，开一个独立 worktree 推进这件事。" Describe what opening a worktree means in plain language — then stop. If the install has a skill or command that handles worktrees, the harness will pick it up from your stated intent. Do NOT name any specific skill or command from outside kcc-backlog.

- On **B**: tell the user "好，先对齐一下方案。" Then start the discussion by asking the user one focused question about scope or success criteria. Do NOT name any specific skill from outside kcc-backlog.

- On **C**: just stay in the conversation and continue on the item directly.

## Forbidden

- Jumping to a move before the user answers the AskUserQuestion.
- Asking in plain prose instead of AskUserQuestion.
- Naming any skill or command from outside kcc-backlog (portability — other plugins may not be installed).
- Activating when the loaded item's status is `done` or `abandoned`. If that happens, tell the user "这个 item 已经 closed — 选另一个 item 吧。" and stop.
