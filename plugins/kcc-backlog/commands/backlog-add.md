---
description: Add a new backlog item. Scans existing titles for duplicates before writing; if similar, proposes merging instead of adding.
argument-hint: "[optional title or short description]"
allowed-tools: Bash, AskUserQuestion, Read, Edit
---

You are responding to `/backlog-add`. The user's arguments (if any) follow `$ARGUMENTS`.

## Step 1 — Draft the item

- If `$ARGUMENTS` is empty, ask via AskUserQuestion in this order:
  - "Backlog item title? (≤ 80 chars, describe the thing to remember)"
  - "Priority?" — high / medium (Recommended) / low.
  - "Any tags? (comma-separated, optional)"
  - "Free-form notes?" (single open text answer; blank is fine).

- If `$ARGUMENTS` is non-empty, infer:
  - `title`: first sentence or line (≤ 80 chars)
  - `body`: remaining text (may be empty)
  - `priority`: medium unless text contains a signal — 阻塞 / compliance / 截止 → high; 顺便 / nice to have / polish → low
  - `tags`: empty unless user provided them

## Step 2 — Dedup scan

Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" list`

Compare your draft's title+body against every existing `{id, title, tags}` and form one verdict:

- **Obvious duplicate** (same intent, near-identical title, overlapping body): propose MERGE into existing.
- **Related but distinct** (same module, different work): propose ADD with a pointer — append the related id to tags (`ref:2026-04-10-x`).
- **Unrelated**: ADD directly.

AskUserQuestion with four options: Merge / Add with ref / Add as-is / Cancel. Always pass all four so the user can override.

## Step 3 — Execute

- **Merge**: `... read --id <target-id>`, then Edit/Write to append a `## Merged from user-draft (YYYY-MM-DD)` section with the draft body. Run `... update --id <target-id>` to bump updated_at. Tell the user briefly what was merged.

- **Add with ref or Add as-is**:
  ```
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" add \
    --title "<title>" --priority <priority> --tags "<a,b>" --body "<body>"
  ```
  Report: `✔ 已加入 backlog: <id>`.

- **Cancel**: tell the user the draft was discarded.

When the dedup verdict is Merge or Add-with-ref, wait for user confirmation before writing.
