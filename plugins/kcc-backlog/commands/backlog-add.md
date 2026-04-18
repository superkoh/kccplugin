---
description: Add a new backlog item. Scans existing titles for duplicates before writing; if similar, proposes merging instead of adding.
argument-hint: "[optional title or short description]"
allowed-tools: Bash, AskUserQuestion, Read, Edit
---

You are responding to `/backlog-add`. The user's arguments (if any) follow `$ARGUMENTS`.

## Step 1 — Draft the item

- If `$ARGUMENTS` is empty, ask via AskUserQuestion:
  "Backlog item title? (keep it ≤ 80 chars, describe the thing to remember)"
  Then ask "Priority?" with options: high / medium (Recommended) / low.
  Then ask "Any tags? (comma-separated, optional)".
  Then ask "Free-form notes?" (AskUserQuestion with a single open text answer; blank is fine).

- If `$ARGUMENTS` is non-empty, infer:
  - `title`: the first sentence or line (truncate to ≤ 80 chars)
  - `body`: the remaining text (may be empty)
  - `priority`: default medium unless the text contains an obvious signal (阻塞 / compliance / 截止 → high; 顺便 / nice to have / polish → low)
  - `tags`: empty unless user provided them

## Step 2 — Dedup scan

Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" list`

Compare your draft's title+body against every existing `{id, title, tags}`. Decide one verdict:

- **Obvious duplicate** (same intent, near-identical title, or overlapping body topic): propose MERGE into the existing item.
- **Related but distinct** (same module, different work): propose ADD with a pointer — append the related id to the new item's tags (e.g. `ref:2026-04-10-x`).
- **Unrelated**: proceed to ADD directly.

Ask via AskUserQuestion with four options: Merge / Add with ref / Add as-is / Cancel.

## Step 3 — Execute

- **Merge**: read the existing target with `... read --id <target-id>`, then use Edit or Write to append a `## Merged from user-draft (YYYY-MM-DD)` section containing the draft body. Run `... update --id <target-id>` to bump updated_at (no frontmatter patch needed beyond that). Tell the user briefly what was merged.

- **Add with ref or Add as-is**:
  ```
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/backlog-io.mjs" add \
    --title "<title>" --priority <priority> --tags "<a,b>" --body "<body>"
  ```
  Report the new id. Show one line: `✔ 已加入 backlog: <id>`.

- **Cancel**: tell the user the draft was discarded, do nothing else.

Never add without user confirmation when the dedup verdict is Merge or Add-with-ref. Always pass all four options so the user can override.
