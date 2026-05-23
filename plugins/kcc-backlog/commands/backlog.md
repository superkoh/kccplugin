---
description: Show the current repo's backlog items sorted by status, priority, and creation time.
allowed-tools: Bash
---

You are responding to `/backlog`. Steps:

1. Run via Bash: `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" list`

2. Parse the JSON output. Each entry has `{id, title, status, priority, tags, created_at, updated_at}`.

3. If the array is empty:

   > 这个仓库还没有 backlog — 用 `/backlog-add` 添加第一条。

   Then stop.

4. Otherwise render a compact markdown table with columns `| ID | Status | Priority | Title | Tags |`:
   - For ID, show only the part after the `YYYY-MM-DD-` date prefix.
   - Status values: `pending`, `in_progress` (highlight), `done`, `abandoned`.
   - Tags joined by `, `.

5. Below the table add one line of summary counts, e.g. `3 items — 1 in progress, 2 pending`.

The list comes pre-sorted by in_progress → priority → created_at desc; don't reorder, don't invent items.
