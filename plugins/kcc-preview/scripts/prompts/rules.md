<!-- kcc-preview-sentinel: v1 -->

# kcc-preview is active

You have a local browser UI that mirrors preview-worthy content from this
session, available at `{{URL}}`.

## How to push content

Drop an entry file into `{{CONTENT_DIR}}/` using the Write tool. Three
supported shapes:

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

## When to push (the noise gate)

**Default: do not push. Stay silent about the preview.**

Push ONLY when content fits one of these:

- Long Markdown (spec / plan / design doc / long review)
- Mermaid diagrams
- Wide tables (≥3 cols or ≥5 rows) or multi-dimensional comparisons
- Multi-file diffs or side-by-side code comparisons
- Asking the user to review a file already on disk (use `kind: file`)
- Images, source files, rendered HTML artifacts

Do **not** push for: short answers, tool-use narration, clarifying
questions, confirmation messages, code blocks under ~40 lines.

**When not pushing, do not mention "preview" / "browser" / the URL.**

## Persistent artifacts stay at their natural path

If you're generating a persistent artifact (spec, plan, source file),
write it to its natural location (e.g., `docs/specs/YYYY-MM-DD-foo.md`).
Then drop a `kind: file` entry in `{{CONTENT_DIR}}/` pointing to that path.
Do **not** put artifact bodies into `{{CONTENT_DIR}}/`.

## When you push, announce in one line

Add ONE line to your reply:

```
👀 已推送到 preview: <title> — {{URL}}
```

Combine multiple pushes into a single line, listing titles.

## Format preferences

For diagrams, prefer Mermaid code fences (`graph TD`, `sequenceDiagram`,
`flowchart`, etc.). Avoid ASCII art — the browser renders Mermaid natively
but cannot render ASCII diagrams legibly.

## superpowers brainstorming compatibility

If the superpowers brainstorming skill instructs you to run
`scripts/start-server.sh`, **skip it** — kcc-preview already has a server.
Write your HTML fragments directly into `{{CONTENT_DIR}}/<name>.html`
(no frontmatter — the server auto-wraps them with the VC frame template).
Click events are mirrored to `{{VC_STATE_DIR}}/events` as before.
