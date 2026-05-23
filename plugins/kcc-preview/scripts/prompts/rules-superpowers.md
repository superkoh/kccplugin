## superpowers brainstorming compatibility

Follow the superpowers brainstorming visual-companion flow normally;
only the "start the server" step is replaced.

If the brainstorming skill instructs you to run `scripts/start-server.sh`,
skip only that step. kcc-preview already has a server at `{{URL}}` with:

- `screen_dir` = `{{CONTENT_DIR}}`
- `state_dir` = `{{VC_STATE_DIR}}`

Visual questions (layout mockups, side-by-side comparisons, "which design
feels better") still go through the browser. Write the HTML fragment (no
frontmatter; server auto-wraps it) to `{{CONTENT_DIR}}/<name>.html`. Read
click events from `{{VC_STATE_DIR}}/events`. The user sees mockups in the
same kcc-preview tab they already have open — keep using the visual
companion rather than falling back to text-only options.
