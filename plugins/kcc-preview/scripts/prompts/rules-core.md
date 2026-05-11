<!-- kcc-preview-sentinel: v1 -->

# kcc-preview is active

You have a local browser UI that mirrors preview-worthy content from this
session, available at `{{URL}}`.

## How to push content

Drop an entry file into `{{CONTENT_DIR}}/` using the Write tool.

**On the FIRST push of this session, ALSO** Write a one-line file at
`{{LABEL_FILE}}` containing a short (≤ 80 characters) human-readable
name describing what this session is about overall. Do not rewrite it on
subsequent pushes.

Three supported entry shapes:

**kind: inline** — markdown body (most common):

```markdown
---
title: "<short title>"
kind: inline
---
<markdown, including ```mermaid / ```diff / GFM tables>
```

**kind: file** — reference an existing file (for persistent artifacts like
plans, specs, source code; or for images):

```markdown
---
title: "<short title>"
kind: file
path: "<absolute path to existing file>"
---
```

**kind: html** — raw HTML (rare; only when custom layout matters):

```markdown
---
title: "<short title>"
kind: html
---
<div class="grid">...</div>
```

## When to push (the user-decision gate)

**Default: do not push. Stay silent about the preview.**

Push ONLY when your next move is to pause and wait for the user's input:

- You are about to call `AskUserQuestion` (the answer gate literally blocks
  until the user decides).
- You just wrote a spec / plan / design doc and want the user to read it
  before you continue — e.g., after finishing a design-phase turn.
- You need the user to choose between visual options (layout mockups,
  architecture diagrams, A/B comparisons).

Do **not** push when the task is already complete and you're just showing
the deliverable — final summaries, analysis reports, changelogs, README
writes, code-explanation docs. The user can read those from disk or from
your reply; a browser trip adds nothing.

**When not pushing, do not mention "preview" / "browser" / the URL.**

## Persistent artifacts stay at their natural path

If you're generating a persistent artifact (spec, plan, source file),
write it to its natural location (e.g., `docs/specs/YYYY-MM-DD-foo.md`).
Then drop a `kind: file` entry in `{{CONTENT_DIR}}/` pointing to that path.
Do **not** put artifact bodies into `{{CONTENT_DIR}}/`.

## When you push, announce in one line

Every push gets ONE announcement line in your reply, ALWAYS starting with
`👀 已推送到 preview:`.

Template:

`👀 已推送到 preview: <title> · session: <label> — {{URL}}`

Rules:
- `<title>` — the title from the entry frontmatter. Combine multiple pushes by joining titles with `, `.
- `<label>` — what you wrote to `{{LABEL_FILE}}`. ALWAYS include it.
- `— {{URL}}` — include only on the FIRST push of this session. Drop on later pushes.

If unsure whether it's the first push, include the URL — over-including is harmless; missing the announce entirely is not.

## Format preferences

For diagrams, prefer Mermaid code fences (`graph TD`, `sequenceDiagram`,
`flowchart`, etc.). Avoid ASCII art — the browser renders Mermaid natively
but cannot render ASCII diagrams legibly.

