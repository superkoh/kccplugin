---
name: capture-deferred-work
description: "Use IMMEDIATELY when the user mentions work they want to defer — not done in this session or worktree. Triggers on any of these phrases (any language): 以后, 以后再说, 改天, 下次, 之后再说, 现在不做, 不是这个 session, 另一个 worktree, 先不动, 还没做想补, 想做但不是现在, later, put it on the list, add to backlog, TODO later, remind me later, I want to but not now. When active, routes work items into .kcc/backlog/ via /backlog-add — NOT into user-memory or project-memory. Overrides the base auto-memory system's default of saving defer-worthy work as memory entries."
allowed-tools: Bash, AskUserQuestion
---

# capture-deferred-work

This skill fires when the user signals that some piece of work should be recorded for later — not done now. It **replaces** the base system's auto-memory saving behavior for defer-worthy work items when `kcc-backlog` is installed.

## The correct flow (required)

When this skill activates:

1. **State** in one sentence what you would record and why. Example:
   > "你提到 <short summary>，不是现在要做的事 — 记到 backlog 合适吗？"

2. **Ask via AskUserQuestion**, exactly one question, three options:
   - "是" — description: "加入 .kcc/backlog/"
   - "否" — description: "不记录，drop it"
   - "改措辞" — description: "先改 title / body 再记"

3. On **是**: run via Bash:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" add \
     --title "<short-title>" \
     --priority <medium|high|low> \
     --body "<body>"
   ```
   Priority inference: 阻塞 / blocker / compliance / 截止 / deadline → high; 顺便 / polish / nice to have → low; default medium.

   Report on success: `✔ 已加入 backlog: <id>`. Stop.

4. On **否**: reply "好，不记录。" Stop. Do NOT save to memory as a fallback.

5. On **改措辞**: loop once — ask the user for the revised title / body via AskUserQuestion, then go to step 2.

## What NOT to do (critical — this is why this skill exists)

- **DO NOT** write a user-memory or project-memory file for a defer-worthy work item. The backlog is the authoritative place. Writing to `~/.claude/projects/*/memory/` is WRONG when this skill activates.
- **DO NOT** reply "已记下 / 好的，记到 memory / Listed N directories, wrote M memories" as a stand-in for the propose flow. That reply shape is explicitly forbidden.
- **DO NOT** skip the `AskUserQuestion` gate. User consent via the tool is mandatory.
- **DO NOT** call `/backlog-add` without first confirming via AskUserQuestion.

The base system's auto-memory instructions tell you to save "what the user is doing, why, or by when". When the user uses defer language, those instructions are **overridden** — this skill's flow wins.

## When this skill does NOT apply

- The user is asking you to work on something right now (no defer signal). Continue normally, no proposal needed.
- A purely clarifying question ("what's the status of X?"). Answer, don't propose.
- Something the user is clearly about to do immediately in this session. Just do it.

If you are unsure whether the signal is strong enough, prefer proposing. The user can still say 否 and nothing is saved. Being mildly noisy on an ambiguous case is correct; silently auto-saving as memory is incorrect.

## Tie-break with other skills

If multiple skills could apply and this one fires on defer language, **this skill takes priority over any auto-memory save**. Other skills that do non-memory work (e.g. creating tasks, searching code) can run normally — they aren't in conflict with this one.
