# kcc-preview — Design Spec

**Date**: 2026-04-16
**Status**: Design approved, pending implementation plan
**Author**: koh.718 + Claude (brainstorm transcript)

## 1. Motivation

Terminals are a bad medium for content users need to deeply read: long
Markdown documents, wide tables, multi-file diffs, architecture diagrams,
images, and source files. Claude Code users today either squint at terminal
wrapping or manually copy content into an external viewer.

`kcc-preview` is an **add-on** ("外挂") plugin. Its job:

- Mirror preview-worthy content from a Claude Code session into a local
  browser UI with good typography, Mermaid rendering, syntax highlighting,
  and a session-scoped index.
- Do so **without changing how Claude reasons or formats most responses**.
  The plugin stays silent on ordinary turns and only surfaces the browser
  when content genuinely benefits from it.

## 2. Core Decisions

These were settled during the brainstorm and drive everything downstream.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **SessionStart hook** starts a per-session Node HTTP server on a random free port and injects the full capability rules into Claude's context | Each CC session is an isolated workspace; one server per session keeps state clean and matches the user's "独立 URL" preference |
| D2 | **UserPromptSubmit hook** injects a one-line reminder each turn | Prevents long-session drift where the SessionStart context gets pushed out of attention |
| D3 | **SessionEnd hook** kills the server PID and removes the session temp dir | Honors the in-memory-only retention policy; prevents zombies |
| D4 | **Claude decides** whether to push, in-stream, using rules in the injected prompt | No LLM-as-judge in a Stop hook (too expensive/slow); no pure regex extraction (too crude). The rules include an explicit "default silent" clause |
| D5 | **Push mechanism**: Claude uses the Write tool to drop a small `.md` "entry" file into the session's `content/` directory; server watches the directory | Leverages a tool Claude already has; no custom CLI / MCP required |
| D6 | **Content kinds**: `inline` (Markdown body), `html` (custom layout), `file` (reference to an existing file by absolute path) | Covers the full range — ad-hoc prose, custom views, persistent artifacts, images, source |
| D7 | **Original file preservation**: when Claude generates a persistent artifact (plan, spec, code file), it writes to the artifact's natural location and only drops a `kind: file` reference in `content/`. The plugin never copies or relocates user files | "外挂" principle — the plugin is transparent to the rest of the filesystem |
| D8 | **Retention**: in-memory only; cleaned on SessionEnd. No cross-session history | User prefers simplicity over archival |
| D9 | **Layout A**: left sidebar index + main viewport; dark theme | Chosen over top-bar/⌘K and feed-with-TOC for scannable index with ≥20 items |
| D10 | **Stack**: Node stdlib HTTP server, zero plugin-local deps; frontend loads `marked` / `mermaid` / `highlight.js` from CDN | Matches the repo's Node ecosystem; no install step; first-load cache covers steady state |
| D11 | **VC compatibility**: kcc-preview's server accepts bare `.html` fragments and wraps them in a compatible frame template (`.options` / `.cards` / `.mockup` CSS). SessionStart prompt instructs Claude to skip `start-server.sh` and route brainstorming HTML into kcc-preview's `content/` instead. Events are mirrored to the VC-expected `state/events` path | Avoids two parallel servers when both `kcc-preview` and `superpowers` are installed |

## 3. Architecture

```
┌────────────────────────────┐   ┌──────────────┐   ┌──────────────┐
│  Claude Code                │   │  Node server │   │  Browser     │
│                             │   │  (detached)  │   │              │
│  SessionStart hook ────────▶│──▶│  alloc port  │   │              │
│   · start server            │   │  watch dir   │◀──│  SSE /events │
│   · inject capability rules │   │  in-memory   │──▶│  Layout A    │
│                             │   │              │   │              │
│  UserPromptSubmit hook ────▶│──▶│  (read state)│   │              │
│   · one-line reminder       │   │              │   │              │
│                             │   │              │   │              │
│  LLM ──▶ Write .md ────────▶│──▶│  parse + push│──▶│  render      │
│                             │   │              │   │              │
│  SessionEnd hook ──────────▶│──▶│  kill pid    │   │              │
└────────────────────────────┘   └──────────────┘   └──────────────┘
```

**Session temp dir** (`$TMPDIR/kcc-preview/<session_id>/`):

- `server.pid` — detached server PID
- `server.port` — chosen free port
- `content/` — Claude drops entry files here; server watches
- `state/events` — VC-compatible JSONL click events (mirror)
- `state/server-info` — VC-compatible startup JSON (mirror)

## 4. Components

```
plugins/kcc-preview/
├── .claude-plugin/plugin.json            # manifest
├── hooks/hooks.json                      # SessionStart / UserPromptSubmit / SessionEnd
├── scripts/
│   ├── session-start.mjs                 # read session_id from stdin; sweep stale session dirs;
│   │                                     # allocate port, spawn detached server, emit additionalContext
│   ├── user-prompt-submit.mjs            # one-line reminder, health-check, restart if dead
│   ├── session-end.mjs                   # kill server, remove session dir
│   ├── server.mjs                        # Node stdlib HTTP (SSE + REST + fs.watch)
│   └── frontend/
│       ├── index.html                    # Layout A shell
│       ├── app.js                        # SSE subscriber, renderer dispatch, routing
│       ├── styles.css                    # dark theme
│       └── vc-frame.css                  # VC-compatible class names
└── tests/
    ├── unit/
    │   ├── hooks.test.mjs
    │   ├── server.test.mjs
    │   └── parser.test.mjs
    └── sdk/expected.json
```

## 5. Content File Convention

Claude's `Write` tool drops files into `content/`. Three shapes:

### 5.1 `kind: inline` — Markdown body

````markdown
---
title: "Option 对比"
kind: inline
---
| 方案 | 成本 | 复杂度 |
| --- | --- | --- |
| A   | 低   | 低     |

```mermaid
graph TD
  A --> B
```
````

### 5.2 `kind: file` — reference to an existing file

```markdown
---
title: "设计规格 review"
kind: file
path: "/abs/path/docs/specs/2026-04-16-foo-design.md"
---
```

Server reads the referenced file on demand. **Never copies**. Rendering
is dispatched by extension:

| Extension | Renderer |
|---|---|
| `.md`, `.markdown` | marked + mermaid + highlight.js |
| `.png`, `.jpg`, `.gif`, `.svg`, `.webp` | `<img>` |
| `.html`, `.htm` | sandboxed iframe |
| `.json`, `.yaml`, `.yml`, `.toml` | highlight.js |
| source code (`.ts`, `.py`, `.go`, `.rs`, etc.) | highlight.js |
| other | `<pre>` + "open in editor" link |

Deduplication: entries with the same `path` replace prior ones — the
index shows one row per referenced file, with last-push timestamp.

### 5.3 `kind: html` — custom layout (rare)

````markdown
---
title: "对比矩阵"
kind: html
---
<div class="grid">...</div>
````

### 5.4 VC-compatibility fragments

A `.html` file with **no YAML frontmatter** is treated as a bare VC-style
fragment. The server auto-wraps with the VC frame template (header,
`.options` / `.cards` CSS, `toggleSelect` helper).

## 6. Injected Prompt Rules

SessionStart `additionalContext` emits one block wrapped in
`<!-- kcc-preview-sentinel: v1 -->` for version-aware updates, structured as:

### Block A — Capability announce

- URL = `http://localhost:{port}`
- `content/` directory path
- Three `kind` shapes and frontmatter schema

### Block B — Push discretion (the noise gate)

> **Default: do not push. Stay silent about the preview.**
>
> Push only when content fits one of these:
> - Long Markdown (spec / plan / design doc / long review)
> - Mermaid diagrams
> - Wide tables (≥3 columns or ≥5 rows) or multi-dimensional comparisons
> - Multi-file diffs or side-by-side code comparisons
> - Asking the user to review a file already on disk (use `kind: file`)
> - Images, source files, rendered HTML artifacts
>
> Do **not** push for: short answers, tool-use narration, clarifying
> questions, confirmation messages, code blocks under ~40 lines.
>
> **When not pushing, do not mention "preview" / "browser" / the URL.**

### Block C — Original file preservation

> When generating a persistent artifact (spec, plan, source file),
> write it to its natural location (e.g., `docs/specs/`). Then drop a
> `kind: file` entry pointing to that path. Do **not** put artifact
> bodies into `content/`.

### Block D — User notification convention

> When you push, add **one line** to your reply:
> `👀 已推送到 preview: <title> — http://localhost:{port}`
> Combine multiple titles into a single line.

### Block E — Format preferences

> For diagrams, prefer Mermaid code fences (`graph TD`, `sequenceDiagram`,
> `flowchart`, etc.). Avoid ASCII art.

### Block F — VC compatibility (conditional)

> If the superpowers brainstorming skill instructs you to run
> `scripts/start-server.sh`, **skip it**. kcc-preview already has a
> server. Write HTML fragments to `{content_dir}/<name>.html` as normal.
> Click events are mirrored to `{vc_state_dir}/events`.

### UserPromptSubmit injection

Each turn, ≤5 lines:

> kcc-preview @ `{URL}` — push only when content is worth a browser
> trip; stay silent otherwise.

## 7. Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| Port allocation fails | SessionStart emits `<!-- kcc-preview: unavailable ({reason}) -->`; hook exits 0. Claude treats preview as absent for this session |
| Server dies mid-session | UserPromptSubmit pings `/health`; if dead, restart on same port; on restart failure, inject unavailable marker |
| Invalid frontmatter | Server 400s the file; special `__errors__` index entry shows the parse error; Claude's turn is unaffected |
| `kind: file` path missing / unreadable | Entry preserved; viewport shows `path not readable: <path>` + mtime |
| Burst writes | Watcher debounces 100 ms; in-memory cap 200 items FIFO |
| SessionEnd not fired (SIGKILL) | Next SessionStart sweeps `$TMPDIR/kcc-preview/*` — stale PIDs SIGTERMed, dirs removed |
| Concurrent sessions | Independent ports, isolated dirs per `session_id` |
| Superpowers server pre-existing | Detect `.superpowers/brainstorm/*/state/server-info`; inject "VC running independently, not intercepting" and let both run |
| Linux `fs.watch` recursive instability | Auto-fallback to 200 ms poll when `process.platform === 'linux'` |
| Headless / SSH environment | Server binds `127.0.0.1`; unreachable browser means most sessions are zero-impact because of the discretion rule |

**Security**:

- Bind `127.0.0.1` only
- No auth (single-user local machine)
- `kind: file` is read-only; absolute paths explicit in entry file; no
  traversal surface

## 8. Testing Strategy

Aligned with the repo's four-layer framework.

| Layer | Covers | API key |
|---|---|:---:|
| **L1** | `plugin.json`, `hooks.json`, all frontmatter pass ajv schemas; misplaced subdir detector | no |
| **L2** | `parser.test.mjs`, `server.test.mjs`, `hooks.test.mjs` — Node `--test` | no |
| **L3** | **Skipped**. Value lives in Claude's judgment + browser render, both hostile to `--bare` stdout assertion | — |
| **L4** | `tests/sdk/expected.json` asserts hooks register at load | tiny |

**L2 critical cases**:

- Server: random free port, watch a tmp dir, receive 3 SSE events in under 2 s
- Hooks: feed Claude Code stdin JSON, assert stdout is valid JSON with
  `hookSpecificOutput.additionalContext` containing the sentinel and URL
- Parser: valid frontmatter, missing `kind`, missing `path` when
  `kind: file`, unknown `kind` — each produces the expected shape
- SessionEnd: pre-seed a fake `server.pid`, invoke hook, assert pid
  file and session dir are gone

**Out of scope for automated tests** (explicitly):

- Claude's push/no-push judgment — prompt-engineering domain, validated
  by dogfooding
- VC events JSONL schema exact match — upstream-dependent, fragile

## 9. Dependencies & Compatibility

- **Runtime**: Node ≥ 20 (matches repo requirement)
- **Zero plugin-local npm deps**; frontend loads CDN libs (`marked@13`,
  `mermaid@11`, `highlight.js@11`)
- **Claude Code hook API** as documented at
  `https://code.claude.com/docs/en/hooks` (verified 2026-04-16): stdin
  JSON envelope with `session_id` / `transcript_path` / `cwd` /
  `hook_event_name`; stdout JSON with `hookSpecificOutput.additionalContext`
- **Background server detach**: `nohup … & disown` in shell, or Node
  `spawn({ detached: true, stdio: "ignore" }).unref()`. Known to fail
  under Linux sandboxed `--die-with-parent` (issue #35986) — documented
  as a Linux-CI caveat, not a macOS-local blocker
- **Superpowers VC** ≥ v5.0.2 — zero-dep, `.options` / `.cards` /
  `.mockup` CSS classes stable per released docs

## 10. Open Items (for the implementation plan)

- Choice of CDN origin (jsdelivr vs unpkg vs cdnjs) and exact pinned
  versions
- Health-check endpoint shape (simple `GET /health` returning session_id + uptime)
- Whether to ship a minimal Mermaid theme override matching the dark
  palette of the frontend
- Exact wording of Block B's push criteria — will likely tune during
  dogfooding

## 11. Non-Goals

- Not a collaboration / sharing surface — localhost only
- Not an archival system — sessions are ephemeral
- Not a rich editor — read-only view
- Not a Claude Code replacement for short answers — silent by default
