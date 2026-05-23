---
description: Deep backlog cleanup. AI scans all items for merge candidates and priority drift; user confirms each change before applying.
allowed-tools: Bash, AskUserQuestion
---

You are responding to `/backlog-tidy`. User-initiated deep pass — work quietly, only surface changes worth confirming.

## Step 1 — Load everything

Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" list`. For each id, also `... read --id <id>` to see the body. Batch these reads; don't bother the user between them.

If total item count ≤ 1: "backlog 太少，不需要整理。" Stop.

## Step 2 — Pass 1: merge candidates

Pairwise-scan. Two items are merge candidates if any of:
- Near-identical titles (case-insensitive, ≤ 5 edits apart)
- Same primary tag AND body describes the same underlying work
- One item's body references the other's topic directly

For each pair, AskUserQuestion with options:
- Merge A into B (Recommended if flagged confident)
- Merge B into A
- Keep both (cross-reference in tags)
- Skip this pair

On Merge: `... merge --target <keeper> --source <absorbed>`.
On Keep both: `... update --id <item> --tags "ref:<other-id>,..."` on each, preserving existing tags.
On Skip: nothing.

One AskUserQuestion per pair — the user needs to see each pair's context, not a batch.

## Step 3 — Pass 2: priority drift

Walk every remaining item. Recompute proposed priority:
- high if body contains "阻塞 / blocker / compliance / 合规 / 截止 / deadline" OR the item is referenced as a blocker by another item
- low if body contains "优化 / polish / 顺便 / 可以考虑 / nice to have"
- medium otherwise

Collect items where proposed ≠ current. If empty, skip to Step 4. Otherwise present the summary (id, current, proposed, 1-line reason), then AskUserQuestion:
- Apply all (Recommended if ≤ 3 items)
- Apply some (loop: per-item AskUserQuestion with Apply / Keep current / Custom)
- Apply none

On Apply: `... update --id <id> --priority <new>` for each accepted.

## Step 4 — Report

`✔ tidy 完成: merged N pairs, priority 调整 M items (kept/cancelled K).`

Only apply changes the user confirmed; only run one mutating CLI invocation between user surfacings.
