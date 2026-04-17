# kcc-preview — Manual Smoke Test Script

**Plugin:** `plugins/kcc-preview` v0.1.1
**Branch:** `worktree-kcc-preview`
**HEAD at test time:** see `git rev-parse HEAD`

This is the **last-mile** verification that automated tests cannot do:
the browser-side SPA actually rendering Markdown, Mermaid, syntax highlight,
and file refs; and the noise-gate / "原文件位置不变" / SSE-live behaviors
playing out in a real Claude Code session.

Run this in one sitting (~10 minutes). For each round, paste the prompt
verbatim into Claude Code and check the predicted behavior. Mark ✅ / ❌
in the checklist at the bottom.

---

## 0. Pre-flight (terminal A)

Open a fresh Claude Code session pointed at this plugin only:

```bash
cd "/Volumes/External SSD/Projects/kccplugin/.claude/worktrees/kcc-preview"
claude --plugin-dir plugins/kcc-preview
```

Open a **second terminal (terminal B)** for inspections — DO NOT cd into
the worktree there; just run:

```bash
ls "$TMPDIR/kcc-preview/" 2>/dev/null
```

You should see exactly one new dir, e.g. `01J9ABC.../`. Stash its name:

```bash
SESS=$(ls -t "$TMPDIR/kcc-preview/" | head -1)
echo "session: $SESS"
PORT=$(cat "$TMPDIR/kcc-preview/$SESS/server.port")
echo "port: $PORT"
curl -s "http://127.0.0.1:$PORT/health"
```

Expected: `{"sessionId":"<uuid>","uptime":<small_number>}`.

**Do not open the browser yet** — Round 4 is when we test that Claude
prints the URL on first push. Claude should be silent about the preview
until that point.

---

## Round 1 — silent default on greeting

**Prompt:** `hello`

**Expected:**
- Claude returns a normal greeting.
- Claude does **NOT** mention "preview", "browser", or any URL.

**Verify (terminal B):**
```bash
ls "$TMPDIR/kcc-preview/$SESS/content/" 2>/dev/null
```
Expected: empty (no files dropped).

---

## Round 2 — silent default on a clarifying question

**Prompt:** `what does TDD stand for?`

**Expected:**
- Short text answer.
- No mention of preview / browser / URL.
- `content/` still empty in terminal B.

---

## Round 3 — silent default on small code block

**Prompt:** `give me a python hello world, just a few lines`

**Expected:**
- 2-5 line code block.
- No preview push (rule: code blocks under ~40 lines stay silent).
- `content/` still empty.

---

## Round 4 — first push: Mermaid diagram

**Prompt:** `用 Mermaid 画一个时序图，描述一个 web 请求从浏览器到 nginx 到 app server 再到数据库的完整往返`

**Expected:**
- Claude responds with a ```mermaid sequenceDiagram``` (or similar) block.
- Claude appends **one line** like:
  `👀 已推送到 preview: <some title> — http://localhost:<PORT>`
- The port number matches what's in `$TMPDIR/kcc-preview/$SESS/server.port`.

**Verify (terminal B):**
```bash
ls "$TMPDIR/kcc-preview/$SESS/content/"
```
Expected: a new `.md` file.

```bash
curl -s "http://127.0.0.1:$PORT/api/items" | python3 -m json.tool
```
Expected: one item with the title Claude announced.

**Now open the URL in your browser.** Verify:
- Left sidebar shows one entry with a colored `md` pill.
- Main viewport renders the Mermaid diagram as **actual SVG boxes and
  arrows**, not raw text. Status dot (top-right of sidebar) is green.

---

## Round 5 — SSE live update

Keep the browser tab open from Round 4.

**Prompt:** `再画一个 Mermaid 流程图，描述 OAuth 2.0 authorization-code 的完整流程`

**Expected:**
- Claude pushes a second entry; announces it on one line.
- In the **already-open browser tab**, the sidebar gains a new row
  **without any page refresh**. Click the new row — the OAuth flow
  renders.

If the sidebar does NOT auto-update, the SSE connection is broken — note
which test phase failed.

---

## Round 6 — kind: file (review an existing file, do not relocate)

**Prompt:** `请帮我 review plugins/kcc-preview/.claude-plugin/plugin.json，告诉我哪里要补字段，并让我在浏览器里看这个文件`

**Expected:**
- Claude reads the file, gives a short review in chat.
- Claude pushes a `kind: file` entry pointing to the absolute path of
  that plugin.json. The announce line names it.

**Verify (terminal B):**
```bash
cat "$TMPDIR/kcc-preview/$SESS/content/"*.md | grep -E '^(kind|path):'
```
Expected: at least one entry with `kind: file` and `path: /Volumes/External SSD/Projects/.../plugin.json`.

```bash
ls -la "/Volumes/External SSD/Projects/kccplugin/.claude/worktrees/kcc-preview/plugins/kcc-preview/.claude-plugin/plugin.json"
```
Expected: file still exists at original path. **mtime should be unchanged**
(or at most touched by a Read, not rewritten). Claude must NOT have
copied it to `content/`.

**In the browser**: the new sidebar row has a `json` (or `file`) pill;
clicking it shows the JSON syntax-highlighted in the main viewport.

---

## Round 7 — long doc generation: spec stays where it belongs

**Prompt:** `把我们刚才的 Mermaid + plugin.json review 总结成一个简短的 design memo，写到 docs/specs/ 下，文件名带今天日期，然后让我在浏览器里看`

**Expected:**
- Claude `Write`s a real file at `docs/specs/<date>-<topic>.md` in the
  worktree root.
- Claude pushes a **`kind: file` reference** to that path. The announce
  line names the title.
- Claude does **NOT** put the doc body inside `content/` — only the
  reference entry.

**Verify (terminal B):**
```bash
ls "/Volumes/External SSD/Projects/kccplugin/.claude/worktrees/kcc-preview/docs/specs/"
```
Expected: a new `.md` file.

```bash
ls "$TMPDIR/kcc-preview/$SESS/content/" | wc -l
```
Should still be a small number (3 entries from rounds 4, 5, 6, 7). NOT
the full spec body.

```bash
grep -l '^kind: file$' "$TMPDIR/kcc-preview/$SESS/content/"*.md
```
At least one entry should match.

**In the browser**: click the new row. The full spec renders with proper
headings, lists, code blocks.

---

## Round 8 — wide table

**Prompt:** `做一个 Postgres / MySQL / SQLite 的对比表，至少 5 行，覆盖：嵌入支持、并发模型、复制方案、JSON 类型、典型用例`

**Expected:**
- Claude returns a GFM table.
- Push triggered (≥3 columns AND ≥5 rows).
- In the browser: the table renders as an actual table with borders, not
  raw `|` characters.

---

## Round 9 — code diff

**Prompt:** `把这个函数从 callback 风格改写成 async/await，用 ```diff 块给我看变化:\n\nfunction fetchUser(id, cb) {\n  http.get(\`/users/\${id}\`, (res) => {\n    let body = "";\n    res.on("data", (c) => body += c);\n    res.on("end", () => cb(null, JSON.parse(body)));\n  });\n}`

**Expected:**
- Claude returns a ```diff block with `-` and `+` lines.
- Push is borderline (single-file diff). Either outcome is acceptable;
  if pushed, browser shows the diff with green/red coloring.

---

## Round 10 — silent again on conversational follow-up

**Prompt:** `nice, thanks`

**Expected:** A brief acknowledgement. **No preview push, no URL mention.**

If Claude announces a preview here, the noise gate is leaking — note it.

---

## Round 11 — multiple pushes, one announce line

**Prompt:** `给我三张 Mermaid 图：(1) 单体架构 (2) 微服务架构 (3) serverless 架构。每张分别推到 preview`

**Expected:**
- Claude pushes 3 entries.
- The announce line **combines all three titles into ONE line** (per
  rules.md "Combine multiple titles into a single line").
- Browser sidebar gains 3 rows in quick succession.

If Claude prints three separate `👀 已推送...` lines, that's a (minor)
noise-gate deviation — note it.

---

## Round 12 — VC fragment compatibility (only if `superpowers` plugin is also enabled)

If you also have `superpowers` installed, run:

**Prompt:** `/superpowers:brainstorming 我想给 kcc-preview 的前端加一个 ⌘K 命令面板，帮我从需求开始`

**Expected:**
- Claude follows the brainstorming flow but **does NOT** call
  `start-server.sh`. Instead it writes HTML fragments directly into
  `$TMPDIR/kcc-preview/$SESS/content/<name>.html`.
- The **same browser tab** from Round 4 shows the new fragment with the
  superpowers `.options` / `.cards` styling.

If you don't have `superpowers` installed: skip this round.

---

## Round 13 — exit and verify cleanup

In terminal A:

**Prompt:** `/exit`  (or Ctrl-D)

**Verify (terminal B), within ~5 seconds:**

```bash
ls "$TMPDIR/kcc-preview/$SESS" 2>&1
```
Expected: `No such file or directory`. The SessionEnd hook should have
removed it.

```bash
lsof -i ":$PORT" 2>&1 | grep LISTEN
```
Expected: empty. The detached server should have received SIGTERM and
exited.

If either check fails, the cleanup hook didn't fire — run
`pkill -f session-$SESS` to clean up by hand and note it.

---

## Checklist

| Round | What | ✅ / ❌ | Notes |
|------:|------|:------:|------|
| 0  | Pre-flight: server up, /health OK |  |  |
| 1  | "hello" — no preview mention |  |  |
| 2  | "what is TDD" — no preview mention |  |  |
| 3  | small code — no preview mention |  |  |
| 4  | Mermaid push + URL announced + browser renders SVG |  |  |
| 5  | Second push — sidebar updates live (no refresh) |  |  |
| 6  | kind:file review — original mtime unchanged, no copy in content/ |  |  |
| 7  | Spec generated to docs/specs/, content/ only has reference |  |  |
| 8  | Wide table renders as table |  |  |
| 9  | Code diff renders with colors |  |  |
| 10 | Conversational follow-up — silent |  |  |
| 11 | Three Mermaid pushes — one combined announce line |  |  |
| 12 | (if superpowers) VC fragment routes to kcc-preview |  |  |
| 13 | /exit — session dir gone, port not bound |  |  |

---

## Common failure modes

- **Browser shows "ERR_CONNECTION_REFUSED"** — check `server.port` exists
  and `curl http://127.0.0.1:$PORT/health` responds. If port file is
  there but curl fails, server crashed; check stderr (if you can find
  it — detached process) or try `node "$PWD/plugins/kcc-preview/scripts/server.mjs"`
  manually with the same env vars to see the error.

- **Sidebar empty even after Claude pushes** — `ls "$TMPDIR/kcc-preview/$SESS/content/"`
  should show new files. If files are present but sidebar is empty, the
  watcher missed them — try writing one manually:
  ```bash
  cat > "$TMPDIR/kcc-preview/$SESS/content/hand.md" <<'EOF'
  ---
  title: "hand-test"
  kind: inline
  ---
  body
  EOF
  ```
  If THAT shows up in the sidebar, the bug is in how Claude is writing.
  If not, the watcher itself is broken.

- **Mermaid not rendering, just shows raw `graph TD\n A --> B`** —
  open browser devtools console; look for CDN load failures
  (`jsdelivr.net` blocked, offline, etc.). A network-down environment
  will degrade to plain code rendering.

- **Claude announces preview on every reply (including small ones)** —
  the noise gate is being ignored. Re-read `scripts/prompts/rules.md`
  Block B; possibly tune wording.

- **Claude never pushes anything, even for Mermaid** — the SessionStart
  rules block didn't make it into context. Check that the SessionStart
  hook actually ran:
  ```bash
  cat "$TMPDIR/kcc-preview/$SESS/state/server-info"
  ```
  should exist. If not, the hook didn't fire — check
  `claude --debug --plugin-dir plugins/kcc-preview` for hook errors.
