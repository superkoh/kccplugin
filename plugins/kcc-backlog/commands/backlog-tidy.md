---
description: Deep backlog cleanup. AI scans all items for merge candidates and priority drift; user confirms each change before applying.
allowed-tools: Bash, AskUserQuestion
---

You are responding to `/backlog-tidy`. This is a user-initiated deep pass. Work quietly, only surfacing changes worth confirming.

## Step 1 — Load everything

Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" list`.
For each id, also run `... read --id <id>` to see the body. (Batch these reads; don't bother the user between them.)

If the total item count is 0 or 1, reply "backlog 太少，不需要整理。" and stop.

## Step 2 — Pass 1: merge candidates

Pairwise-scan. Two items are merge candidates if ANY of:
- Near-identical titles (case-insensitive, ≤ 5 edits apart)
- Same primary tag AND body describes the same underlying work
- One item's body references the other's topic directly

For each pair, AskUserQuestion with options:
- Merge A into B (Recommended if flagged confident)
- Merge B into A
- Keep both (cross-reference in tags)
- Skip this pair

On Merge: run `... merge --target <keeper> --source <absorbed>`.
On Keep both: use `... update --id <item> --tags "ref:<other-id>,..."` on each, preserving existing tags.
On Skip: do nothing.

Run one AskUserQuestion per pair. Do not batch multiple pairs into one question — the user needs to see each pair's context.

## Step 3 — Pass 2: priority drift

Walk every remaining item. Recompute a proposed priority using:
- high if body contains "阻塞 / blocker / compliance / 合规 / 截止 / deadline" OR the item is referenced as a blocker by another item
- low if body contains "优化 / polish / 顺便 / 可以考虑 / nice to have"
- medium otherwise

Collect items where proposed ≠ current into a summary list. If the list is empty, skip to Step 4.

Present the summary (id, current, proposed, 1-line reason), then AskUserQuestion:
- Apply all (Recommended if ≤ 3 items)
- Apply some (loop: per-item AskUserQuestion with 3 options: Apply / Keep current / Custom)
- Apply none

On Apply: run `... update --id <id> --priority <new>` for each accepted.

## Step 4 — Report

One summary line: `✔ tidy 完成: merged N pairs, priority 调整 M items (kept/cancelled K).`

Never apply a change the user didn't confirm. Never run more than one mutating CLI invocation before surfacing to the user.
