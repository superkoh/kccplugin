# kcc-backlog is active

This repo has a backlog at `.kcc/backlog/`. **The backlog is the
authoritative place to record work items the user wants to defer.**
When this plugin is active, plain user-memory / project-memory / a
silent note-to-self are NOT substitutes for /backlog-add. Route
deferred work through the backlog, not through other memory
mechanisms.

## Trigger — propose, don't silently record

Trigger capture is handled by the `capture-deferred-work` skill
(same plugin). When the user signals deferral, that skill fires first
and runs the propose chain. This file exists to reinforce what the
skill does and list the trigger shapes.

Trigger shapes:

- "later / 以后 / 改天 / 下次 / 之后再说 / 现在不做 / 不是这个 session / 另一个 worktree"
- "put it on the list / TODO later / add to backlog / 加到 backlog"
- User surfaces a new feature / bug / refactor unrelated to the
  current thread, and signals they won't do it now
- A discovery could derail the current task — "record and move on"
  vs. "pivot now"

**REQUIRED response chain when a trigger fires (enforced by the
capture-deferred-work skill):**

1. State in ONE sentence what you would record and why.
2. Ask via the AskUserQuestion tool: "加入 backlog?" with options
   [是 (Recommended) / 否 / 改措辞].
3. On 是 → run `/backlog-add` with the finalized title + body.
4. On 改措辞 → refine once, re-confirm via AskUserQuestion, then
   `/backlog-add`.
5. On 否 → drop it; do NOT save elsewhere.

**Forbidden when a trigger fires:**

- Silently saving the item to user memory, project memory, or any
  scratch note. The backlog is the one place deferred work lives.
- Replying "好的，记下了 / ok, 我记到 memory 里了 / 已记下" without
  running the AskUserQuestion propose flow. That reply is a bug.
- Assuming user consent without the AskUserQuestion gate.
- Skipping the propose because the trigger seems minor. If you
  hesitate, propose — the user can still say 否.

Only skip the propose when the item is clearly in-scope for the
current session (you are actively working on it right now),
a clarifying question, or something the user is clearly about to
do immediately.

Being mildly noisy on an ambiguous case is correct. Silently
auto-saving as memory is incorrect.

## Slash commands

- /backlog        — 总览（in_progress 置顶）
- /backlog-add    — 显式添加（自动添加也走这里）
- /backlog-pick   — 从 backlog 选一项开始工作
- /backlog-tidy   — 深度整理：合并重复、重排优先级
- /backlog-done   — 标当前 in_progress 为 done 并 archive

Silent by default — do not announce backlog existence every turn or
remind the user it exists. Only surface when a trigger fires or when
the user invokes a command or the skill.

<!-- kcc-backlog-sentinel: kcc-backlog-awareness-v1 -->
