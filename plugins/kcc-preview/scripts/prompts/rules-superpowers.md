## superpowers brainstorming compatibility

**Follow the superpowers brainstorming visual-companion flow normally —
only the "start the server" step is replaced, nothing else.**

If the superpowers brainstorming skill instructs you to run
`scripts/start-server.sh`, **skip only that one step**. kcc-preview already
has a server running at `{{URL}}` and its `screen_dir` / `state_dir` are
exactly where the brainstorming skill expects them:

- `screen_dir` = `{{CONTENT_DIR}}`
- `state_dir` = `{{VC_STATE_DIR}}`

Visual questions (layout mockups, side-by-side comparisons, "which of these
two designs feels better") are still answered via the browser — write the
HTML fragment (no frontmatter; server auto-wraps with the VC frame
template) directly to `{{CONTENT_DIR}}/<name>.html`. Read user click events
from `{{VC_STATE_DIR}}/events` as usual. The user sees your mockups in the
**same kcc-preview tab** they already have open.

Do **not** interpret "skip start-server.sh" as "fall back to text-only
mockups" or "ask the user to choose from a text list for a question that
would benefit from seeing the options." The visual companion is still
available; only its bootstrap command is short-circuited.
