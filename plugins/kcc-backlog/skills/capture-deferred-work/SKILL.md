---
name: capture-deferred-work
description: "Use when the user mentions work they want to defer — not done in this session or worktree. Representative triggers (any language): 以后再说, 改天, 现在不做, 先不动, later, put it on the list, add to backlog, remind me later. While installed, defer-worthy work routes into .kcc/backlog/ via /backlog-add instead of user / project memory."
allowed-tools: Bash, AskUserQuestion, Read, Edit
---

# capture-deferred-work

Fires when the user signals that some piece of work should be recorded for later — not done now. While `kcc-backlog` is installed, defer-worthy work items route to the backlog instead of auto-memory.

## Flow

1. **State** in one sentence what you would record and why. Example:
   > "你提到 <short summary>，不是现在要做的事 — 记到 backlog 合适吗？"

2. **AskUserQuestion**, three options:
   - "是" — "加入 .kcc/backlog/"
   - "否" — "不记录，drop it"
   - "改措辞" — "先改 title / body 再记"

3. On **是**: dedup scan before adding.

   3a. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" list` and scan titles for an obvious near-duplicate of your draft (same intent, near-identical wording, or overlapping topic).

   3b. **If a near-duplicate exists**: surface it and ask one more AskUserQuestion:
       - "Merge" — append the draft into the existing item's body as `## Appended <YYYY-MM-DD>`. Use Read on `.kcc/backlog/items/<existing-id>.md`, Edit to append (leave frontmatter alone), then `node ... update --id <existing-id>` to bump updated_at. Report: `✔ 合并到 <existing-id>`. Stop.
       - "Add anyway" — proceed to 3c.
       - "Cancel" — reply "好，不记录。" Stop.

   3c. **If no near-duplicate** (or user chose "Add anyway"):
       ```
       node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" add \
         --title "<short-title>" \
         --priority <medium|high|low> \
         --body "<body>"
       ```
       Priority inference: 阻塞 / blocker / compliance / 截止 / deadline → high; 顺便 / polish / nice to have → low; default medium.

       Report on success: `✔ 已加入 backlog: <id>`. Stop.

4. On **否**: reply "好，不记录。" Stop — the backlog is the only place to land it; if the user says no, drop it.

5. On **改措辞**: ask the user once for the revised title / body via AskUserQuestion, then return to step 2.

## Routing vs auto-memory

When this skill fires on defer language, defer-worthy work goes through the propose chain above, not into `~/.claude/projects/*/memory/`. Don't reply "已记下 / 好的，记到 memory" as a stand-in for the AskUserQuestion gate — that's the failure mode this skill exists to prevent.

Other skills that do non-memory work (creating tasks, searching code) can run normally — they aren't in conflict.

## When this skill does NOT apply

- The user wants you to work on something right now (no defer signal) — continue normally.
- A clarifying question ("what's the status of X?") — answer, don't propose.
- Something the user is clearly about to do immediately in this session — just do it.

On ambiguous signal, prefer proposing. The user can still say 否. Being mildly noisy on a marginal trigger beats silently auto-saving as memory.
