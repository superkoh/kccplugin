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

## When to push

**Default: do not push. Stay silent about the preview.** Nothing pushes
automatically — no hook will push on your behalf. Pushing is your call,
based on the judgment below, plus whenever the user asks.

**Push on your own judgment when your next move is to pause and wait for
the user.** This is the main path — use it without being asked:

- You're about to call `AskUserQuestion`.
- You just produced a spec / plan / design doc and want the user to read
  it before you build on it.
- You need the user to choose between visual options (layout mockups,
  diagrams, A/B comparisons).

**Also push when the user explicitly asks.** Recognize natural-language
triggers in any language, e.g.:

- "推到 preview" / "preview 看一下" / "丢到 preview" / "推一下"
- "push this to preview" / "show it in the preview" / "preview this"

Push the artifact the request points at (the doc/spec/diagram you just
produced, or the one they name). If it's ambiguous which one, ask.

Don't push just because a file is long, lives under `specs/` or `plans/`,
or because the task finished. The trigger is "I'm pausing for the user,"
not "I wrote a file." Final summaries, analysis reports, changelogs,
READMEs, code-explanation docs — the user reads those from your reply or
from disk.

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
