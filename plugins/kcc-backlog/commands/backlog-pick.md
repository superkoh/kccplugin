---
description: Pick a backlog item to start working on. Flips status to in_progress and proposes a next move (open a worktree, clarify the approach, or continue discussion here).
argument-hint: "[optional id or title keyword]"
allowed-tools: Bash, AskUserQuestion
---

You are responding to `/backlog-pick`. The user's argument follows `$ARGUMENTS`.

## Step 1 — Resolve the target id

Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" list`. Parse JSON.

- If the list is empty: "backlog 空 — 先用 /backlog-add 添加一条。" Stop.
- If `$ARGUMENTS` is empty: present the list as a numbered menu, then AskUserQuestion letting the user pick (options are the items themselves with id+title as the label). Set `target` = chosen id.
- If `$ARGUMENTS` is non-empty: exact id match first; otherwise fuzzy match against titles (case-insensitive substring). Exactly one match → use it. Multiple → AskUserQuestion to disambiguate. Zero matches → "没有找到匹配的 item — $ARGUMENTS" and stop.

## Step 2 — Load the item

Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" read --id <target>`. Parse JSON. Display the body and frontmatter concisely (one paragraph) so the user confirms.

## Step 3 — Flip status

Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" update --id <target> --status in_progress`. Confirm: `✔ <id> 标记为 in_progress`.

## Step 4 — Hand off

The `picking-from-backlog` skill takes over from here. Without any intermediate step:

1. State: "已载入这条 item。接下来根据它的性质提议走法。"
2. Invoke the picking-from-backlog skill with the item content you just loaded. The skill handles the 3-way proposal (new worktree / clarify approach first / continue in place).

Do NOT execute any of the three moves yourself — the skill owns that decision flow, and it must ask the user via AskUserQuestion first.
