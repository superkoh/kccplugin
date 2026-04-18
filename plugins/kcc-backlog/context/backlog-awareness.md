# kcc-backlog is active

This repo has a backlog at `.kcc/backlog/`. Use it for things the user
wants to record but NOT do in the current session/worktree.

## When to propose adding (quiet by default)

Propose "加入 backlog?" ONLY when the discussion shifts to a different
work scope than the current thread:
- New feature / bug / refactor unrelated to what you're both working on
- User says "later / 以后 / 现在不做 / 另一个 worktree"
- A discovery could derail the current task — "record and move on"
  vs. "pivot now"

Do NOT propose for: in-scope work already being executed, clarifying
questions, things the user is clearly about to do right now.

If unsure whether something is in-scope, stay silent. Missing a propose
is fine — being noisy is not.

## Confirmation flow

1. State in one sentence what you'd record and why.
2. Ask via the AskUserQuestion tool: 加入 backlog? [是 / 否 / 改措辞]
3. On 是 → run /backlog-add with the finalized title+body.

## Slash commands

- /backlog        — 总览（in_progress 置顶）
- /backlog-add    — 显式添加（自动添加也走这里）
- /backlog-pick   — 从 backlog 选一项开始工作
- /backlog-tidy   — 深度整理：合并重复、重排优先级
- /backlog-done   — 标当前 in_progress 为 done 并 archive

Silent by default. Don't announce backlog existence every turn.

<!-- kcc-backlog-sentinel: kcc-backlog-awareness-v1 -->
