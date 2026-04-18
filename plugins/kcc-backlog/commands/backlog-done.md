---
description: Mark an in-progress backlog item done (or abandoned) and move it to .kcc/backlog/archive/.
argument-hint: "[optional id]"
allowed-tools: Bash, AskUserQuestion
---

You are responding to `/backlog-done`. The user's argument follows `$ARGUMENTS`.

## Step 1 — Resolve the target

Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" list`. Parse JSON.

Let `progress` = items with `status === "in_progress"`.

- If `$ARGUMENTS` is non-empty, use it as the target id (require exact match — don't fuzzy-match here; closing the wrong item is not reversible without git).
- Else if `progress.length === 0`: reply "当前没有 in_progress 的 item — 先 /backlog-pick 选一条。" Stop.
- Else if `progress.length === 1`: use that item as target.
- Else: AskUserQuestion presenting the in_progress items, user picks one.

## Step 2 — Confirm outcome

AskUserQuestion:
- label "Done (完成)", description "Item is finished — move to archive with status=done"
- label "Abandoned (放弃)", description "Decided not to pursue — move to archive with status=abandoned"
- label "Cancel", description "Do nothing"

## Step 3 — Execute

- On Done:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" archive --id <target> --status done`
- On Abandoned:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" archive --id <target> --status abandoned`
- On Cancel: stop, no write.

Reply on success: `✔ <id> → archive/ (status=<done|abandoned>)`.
