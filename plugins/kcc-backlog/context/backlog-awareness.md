# kcc-backlog is active

This repo has a backlog at `.kcc/backlog/`. It is the authoritative place
for deferred work — route through `/backlog-add` instead of saving to
user / project memory or any scratch note.

## Trigger — propose, don't silently record

The `capture-deferred-work` skill fires on defer signals and runs the
propose chain. Representative shapes:

- "later / 以后再说 / 改天 / 现在不做 / 先不动 / add to backlog"
- A new feature / bug / refactor surfaces, unrelated to the current
  thread, and the user signals they won't do it now
- A discovery could derail the current task — "record and move on"

Response chain when a trigger fires:

1. State in ONE sentence what you would record and why.
2. AskUserQuestion: "加入 backlog?" with options [是 (Recommended) / 否 / 改措辞].
3. On 是 → run `/backlog-add` with the finalized title + body.
4. On 改措辞 → refine once, re-confirm, then `/backlog-add`.
5. On 否 → drop it; don't stash it elsewhere.

Run the propose flow even on ambiguous cases — never answer "好的，记下了"
without the gate. Skip only when the item is clearly in-scope right now, a
clarifying question, or something the user is about to do immediately.

## Slash commands

- /backlog        — 总览（in_progress 置顶）
- /backlog-add    — 显式添加（自动添加也走这里）
- /backlog-pick   — 从 backlog 选一项开始工作
- /backlog-tidy   — 深度整理：合并重复、重排优先级
- /backlog-done   — 标当前 in_progress 为 done 并 archive

Silent by default — surface only when a trigger fires or the user invokes
a command.

<!-- kcc-backlog-sentinel: kcc-backlog-awareness-v2 -->
