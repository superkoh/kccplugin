import { marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
import hljs from "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/+esm";
import { saveSelection, loadSelection, pickSession, pickItem } from "./selection.mjs";

mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });

const state = {
  sessions: new Map(),       // sid -> { label, items: [], unread: 0, lastTouchedAt: number }
  selectedSid: null,
  selectedItemId: null,
  expanded: new Set(),       // sids whose item list is open in the sidebar
};
let selectSeq = 0;

const $nav = document.getElementById("index-list");
const $title = document.getElementById("current-title");
const $meta = document.getElementById("current-meta");
const $host = document.getElementById("content-host");
const $dot = document.getElementById("status-dot");

// Accessing window.localStorage — not just calling its methods — throws when a
// browser blocks storage outright (Firefox "Never remember history", sandboxed
// frames, some enterprise policies). Resolve it once behind a guard so such a
// browser degrades to "selection isn't remembered" instead of crashing app
// init. selection.mjs already tolerates a null/throwing store.
const selectionStore = (() => {
  try { return window.localStorage; } catch { return null; }
})();

function pillFor(item) {
  if (item.kind === "file") {
    const ext = (item.path || "").split(".").pop().toLowerCase();
    if (["png","jpg","jpeg","gif","svg","webp"].includes(ext)) return { cls: "img", label: ext };
    if (["md","markdown"].includes(ext)) return { cls: "md", label: "md" };
    return { cls: "file", label: ext || "file" };
  }
  if (item.kind === "inline") return { cls: "md", label: "md" };
  if (item.kind === "vc") return { cls: "vc", label: "vc" };
  if (item.kind === "html") return { cls: "html", label: "html" };
  return { cls: "file", label: item.kind };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// Two-level sidebar: each session is a collapsible level-1 group whose pushed
// items render nested as level-2 rows.
function renderNav() {
  $nav.innerHTML = "";
  const sids = [...state.sessions.keys()].sort((a, b) =>
    state.sessions.get(b).lastTouchedAt - state.sessions.get(a).lastTouchedAt
  );
  if (!sids.length) {
    $nav.innerHTML = `<div class="empty">No active sessions — start a Claude Code session.</div>`;
    return;
  }
  for (const sid of sids) {
    const s = state.sessions.get(sid);
    const expanded = state.expanded.has(sid);
    const group = document.createElement("div");
    group.className = "session-group" + (expanded ? " expanded" : "");

    const row = document.createElement("div");
    row.className = "session-row" + (sid === state.selectedSid ? " active" : "");
    row.dataset.sid = sid;
    row.innerHTML = `<span class="chevron">▸</span>
                     <span class="label">${escapeHtml(s.label || sid)}</span>
                     <span class="unread${s.unread ? "" : " hidden"}"></span>`;
    row.addEventListener("click", () => toggleSession(sid));
    group.appendChild(row);

    if (expanded) {
      const box = document.createElement("div");
      box.className = "session-items";
      if (!s.items.length) {
        box.innerHTML = `<div class="empty sub">Nothing pushed yet.</div>`;
      } else {
        for (const it of s.items) {
          const pill = pillFor(it);
          const item = document.createElement("div");
          const active = sid === state.selectedSid && it.id === state.selectedItemId;
          item.className = "index-item" + (active ? " active" : "");
          item.dataset.id = it.id;
          item.innerHTML = `<span class="pill ${pill.cls}">${pill.label}</span>
                           <span class="title">${escapeHtml(it.title || "(untitled)")}</span>`;
          item.addEventListener("click", () => selectItem(sid, it.id));
          box.appendChild(item);
        }
      }
      group.appendChild(box);
    }
    $nav.appendChild(group);
  }
}

function toggleSession(sid) {
  if (state.expanded.has(sid)) {
    state.expanded.delete(sid);
    renderNav();
  } else {
    selectSession(sid);
  }
}

async function selectSession(sid, preferredItemId = null) {
  state.selectedSid = sid;
  const s = state.sessions.get(sid);
  if (s) s.unread = 0;
  state.expanded.add(sid);
  state.selectedItemId = null;
  renderNav();
  await refreshSessionItems(sid);
  const target = s ? pickItem(preferredItemId, s.items) : null;
  if (target) selectItem(sid, target);
  else { persistSelection(); clearView(); }
}

// Reset the content pane to its empty state (no item open).
function clearView() {
  $title.textContent = "kcc-preview"; $meta.textContent = ""; $host.innerHTML = "";
}

function persistSelection() {
  saveSelection(selectionStore, { sid: state.selectedSid, itemId: state.selectedItemId });
}

async function refreshSessionItems(sid) {
  const res = await fetch(`/api/sessions/${sid}/items`);
  if (!res.ok) return;
  const items = await res.json();
  const s = state.sessions.get(sid);
  if (!s) return;
  s.items = items;
  renderNav();
}

async function selectItem(sid, id) {
  const mySeq = ++selectSeq;
  if (sid !== state.selectedSid) {
    state.selectedSid = sid;
    state.expanded.add(sid);
    const s = state.sessions.get(sid);
    if (s) s.unread = 0;
  }
  state.selectedItemId = id;
  persistSelection();
  renderNav();
  const res = await fetch(`/api/sessions/${sid}/items/${id}`);
  if (mySeq !== selectSeq) return;
  if (!res.ok) { $host.innerHTML = `<div class="muted">Failed to load item.</div>`; return; }
  const item = await res.json();
  if (mySeq !== selectSeq) return;
  $title.textContent = item.title || "(untitled)";
  $meta.textContent = metaLine(item);
  renderContent(item);
}

function metaLine(item) {
  if (item.path) return item.path;
  if (item.kind === "inline") return "inline";
  return item.kind;
}

async function renderContent(item) {
  if (item.error) { $host.innerHTML = `<pre>${escapeHtml(item.error)}</pre>`; return; }
  if (item.kind === "vc" || item.kind === "html") {
    $host.innerHTML = `<iframe src="/api/sessions/${state.selectedSid}/items/${item.id}/frame" sandbox="allow-scripts allow-same-origin"></iframe>`;
    return;
  }
  if (item.kind === "file") {
    if (item.mime?.startsWith("image/")) { $host.innerHTML = `<img src="${item.url}" alt="${escapeHtml(item.title)}">`; return; }
    if (item.mime === "text/html") { $host.innerHTML = `<iframe srcdoc="${escapeHtml(item.body)}" sandbox="allow-scripts"></iframe>`; return; }
    if (item.mime === "text/markdown") { $host.innerHTML = await renderMarkdown(item.body || ""); return; }
    const lang = (item.path || "").split(".").pop();
    $host.innerHTML = `<pre><code class="hljs language-${lang}">${escapeHtml(item.body || "")}</code></pre>`;
    hljs.highlightAll();
    return;
  }
  $host.innerHTML = await renderMarkdown(item.body || "");
}

async function renderMarkdown(src) {
  const html = marked.parse(src, { gfm: true, breaks: false });
  const host = document.createElement("div");
  host.innerHTML = html;
  for (const pre of host.querySelectorAll("pre code")) hljs.highlightElement(pre);
  const mermaidBlocks = host.querySelectorAll("code.language-mermaid");
  for (const block of mermaidBlocks) {
    const code = block.textContent;
    const div = document.createElement("div");
    const id = "m" + Math.random().toString(36).slice(2);
    try {
      if ((await mermaid.parse(code, { suppressErrors: true })) === false) throw new Error("invalid Mermaid syntax");
      const { svg } = await mermaid.render(id, code);
      div.className = "mermaid";
      div.innerHTML = svg;
    } catch (e) {
      div.className = "mermaid-error";
      div.textContent = "Mermaid error: " + (e?.message || e);
    } finally {
      document.getElementById(id)?.remove();
      document.getElementById("d" + id)?.remove();
    }
    block.closest("pre").replaceWith(div);
  }
  return host.innerHTML;
}

function connectSSE() {
  const es = new EventSource("/api/events");
  es.onopen = () => $dot.classList.add("connected");
  es.onerror = () => $dot.classList.remove("connected");

  es.addEventListener("session-added", (ev) => {
    const { sid, label } = JSON.parse(ev.data);
    if (!state.sessions.has(sid)) {
      state.sessions.set(sid, { label, items: [], unread: 0, lastTouchedAt: Date.now() });
    } else {
      const s = state.sessions.get(sid); s.label = label; s.lastTouchedAt = Date.now();
    }
    renderNav();
    if (!state.selectedSid) selectSession(sid);
    else refreshSessionItems(sid);  // backfill items pushed before label
  });
  es.addEventListener("session-relabeled", (ev) => {
    const { sid, label } = JSON.parse(ev.data);
    const s = state.sessions.get(sid);
    if (s) { s.label = label; renderNav(); }
  });
  es.addEventListener("session-removed", (ev) => {
    const { sid } = JSON.parse(ev.data);
    state.sessions.delete(sid);
    state.expanded.delete(sid);
    if (state.selectedSid === sid) {
      const next = [...state.sessions.keys()].sort((a,b) =>
        state.sessions.get(b).lastTouchedAt - state.sessions.get(a).lastTouchedAt)[0] || null;
      if (next) selectSession(next);
      else { state.selectedSid = null; state.selectedItemId = null; clearView(); }
    }
    renderNav();
  });
  es.addEventListener("added", (ev) => {
    const { sid, item } = JSON.parse(ev.data);
    const s = state.sessions.get(sid);
    if (!s) return;  // session not yet labeled — ignore until session-added
    s.items.unshift(item);
    s.lastTouchedAt = Date.now();
    if (sid !== state.selectedSid) s.unread++;
    renderNav();
  });
  es.addEventListener("updated", (ev) => {
    const { sid, item } = JSON.parse(ev.data);
    const s = state.sessions.get(sid);
    if (!s) return;
    const idx = s.items.findIndex((i) => i.id === item.id);
    if (idx >= 0) s.items[idx] = item;
    if (state.expanded.has(sid)) renderNav();  // only item rows changed — skip if collapsed
  });
  es.addEventListener("evicted", (ev) => {
    const { sid, id } = JSON.parse(ev.data);
    const s = state.sessions.get(sid);
    if (!s) return;
    s.items = s.items.filter((i) => i.id !== id);
    // If the open item is the one that just vanished, fall back to the
    // newest remaining item in its session, or clear the view entirely.
    if (sid === state.selectedSid && id === state.selectedItemId) {
      const next = s.items[0];
      if (next) selectItem(sid, next.id);
      else {
        state.selectedItemId = null;
        persistSelection();
        clearView();
        renderNav();
      }
      return;
    }
    if (state.expanded.has(sid)) renderNav();  // only item rows changed — skip if collapsed
  });
}

async function initialLoad() {
  const saved = loadSelection(selectionStore);
  const res = await fetch("/api/sessions");
  if (res.ok) {
    const list = await res.json();
    for (const { sid, label } of list) {
      state.sessions.set(sid, { label, items: [], unread: 0, lastTouchedAt: Date.now() });
    }
    const sid = pickSession(saved, list);
    // Restore the saved item only when we landed on the saved session;
    // pickItem falls back to the newest item if it no longer exists.
    if (sid) await selectSession(sid, sid === saved?.sid ? saved.itemId : null);
  }
  renderNav();
}

initialLoad().then(connectSSE);
