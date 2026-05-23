# kcc-backlog is active

This repo has a backlog at `.kcc/backlog/`. It's the authoritative place
for deferred work — route through `/backlog-add` instead of saving to
user / project memory or any scratch note.

## Trigger — propose, don't silently record

The `capture-deferred-work` skill fires on these signals and runs the
propose chain; this file just lists the shapes it watches for.

Trigger shapes:

- "later / 以后 / 改天 / 下次 / 之后再说 / 现在不做 / 不是这个 session / 另一个 worktree"
- "put it on the list / TODO later / add to backlog / 加到 backlog"
- User surfaces a new feature / bug / refactor unrelated to the
  current thread, and signals they won't do it now
- A discovery could derail the current task — "record and move on"
  vs. "pivot now"

Response chain when a trigger fires:

1. State in ONE sentence what you would record and why.
2. AskUserQuestion: "加入 backlog?" with options [是 (Recommended) / 否 / 改措辞].
3. On 是 → run `/backlog-add` with the finalized title + body.
4. On 改措辞 → refine once, re-confirm via AskUserQuestion, then `/backlog-add`.
5. On 否 → drop it; don't stash it elsewhere.

Always run the propose flow rather than answering "好的，记下了" — even on
ambiguous cases. Being mildly noisy on a marginal trigger is fine; silently
auto-saving to memory is not.

Skip the propose only when the item is clearly in-scope for the current
session (you're working on it right now), a clarifying question, or
something the user is about to do immediately.

## Slash commands

- /backlog        — 总览（in_progress 置顶）
- /backlog-add    — 显式添加（自动添加也走这里）
- /backlog-pick   — 从 backlog 选一项开始工作
- /backlog-tidy   — 深度整理：合并重复、重排优先级
- /backlog-done   — 标当前 in_progress 为 done 并 archive

Silent by default — don't announce the backlog every turn. Surface only
when a trigger fires or the user invokes a command.

<!-- kcc-backlog-sentinel: kcc-backlog-awareness-v1 -->
