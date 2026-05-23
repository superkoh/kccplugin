<!-- kcc-preview-sentinel: v1 -->

# kcc-preview is active

You have a local browser UI mirroring preview-worthy content from this
session, available at `{{URL}}`.

## How to push content

Drop an entry file into `{{CONTENT_DIR}}/` using the Write tool. On the
FIRST push of this session, also Write a one-line file at `{{LABEL_FILE}}`
with a short (≤ 80 char) human-readable name describing the session
overall — don't rewrite it on later pushes.

Three entry shapes, all with YAML frontmatter:

| kind     | when to use                                              | body                                          |
|----------|----------------------------------------------------------|-----------------------------------------------|
| `inline` | most common — markdown body                              | markdown (mermaid / diff / GFM tables OK)     |
| `file`   | persistent artifacts (plans, specs, source code, images) | empty; frontmatter has `path:` to the file    |
| `html`   | rare — custom layout matters                             | raw HTML (server auto-wraps)                  |

For `file` entries, write the artifact to its natural path (e.g.
`docs/specs/YYYY-MM-DD-foo.md`) and reference it; don't put artifact
bodies into `{{CONTENT_DIR}}/`.

## When to push (user-decision gate)

**Default: do not push. Stay silent about the preview.**

Push only when your next move is to pause and wait for user input:

- You're about to call `AskUserQuestion`.
- You just wrote a spec / plan / design doc and want the user to read
  it before continuing.
- You need the user to choose between visual options (layout mockups,
  diagrams, A/B comparisons).

Don't push when the task is done and you're just showing the deliverable
— final summaries, analysis reports, changelogs, README writes,
code-explanation docs. The user reads those from your reply or from disk.

**When not pushing, do not mention "preview" / "browser" / the URL.**

## Announce in one line when you push

Every push gets ONE announcement line starting with `👀 已推送到 preview:`.

Template:

`👀 已推送到 preview: <title> · session: <label> — {{URL}}`

- `<title>` — the entry frontmatter title. Combine multiple pushes by joining titles with `, `.
- `<label>` — what you wrote to `{{LABEL_FILE}}`. Always include it.
- `— {{URL}}` — include only on the FIRST push of this session.

If unsure whether it's the first push, include the URL — over-including
is harmless; missing the announce entirely is not.

## Format preferences

For diagrams, prefer Mermaid code fences (`graph TD`, `sequenceDiagram`,
`flowchart`, etc.). The browser renders Mermaid natively but can't render
ASCII art legibly.
