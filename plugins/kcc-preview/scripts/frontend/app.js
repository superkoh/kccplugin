import { marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
import hljs from "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/+esm";

mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });

const state = {
  sessions: new Map(),       // sid -> { label, items: [], unread: 0, lastTouchedAt: number }
  selectedSid: null,
  selectedItemId: null,
};
let selectSeq = 0;

const $tabs = document.getElementById("tabs");
const $sidebar = document.getElementById("index-list");
const $title = document.getElementById("current-title");
const $meta = document.getElementById("current-meta");
const $host = document.getElementById("content-host");
const $dot = document.getElementById("status-dot");

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

function renderTabs() {
  $tabs.innerHTML = "";
  const sids = [...state.sessions.keys()].sort((a, b) =>
    state.sessions.get(b).lastTouchedAt - state.sessions.get(a).lastTouchedAt
  );
  for (const sid of sids) {
    const s = state.sessions.get(sid);
    const tab = document.createElement("div");
    tab.className = "tab" + (sid === state.selectedSid ? " active" : "");
    tab.dataset.sid = sid;
    tab.innerHTML = `${escapeHtml(s.label || sid)}<span class="unread${s.unread ? "" : " hidden"}"></span>`;
    tab.addEventListener("click", () => selectSession(sid));
    $tabs.appendChild(tab);
  }
}

function renderSidebar() {
  const s = state.selectedSid && state.sessions.get(state.selectedSid);
  if (!s) {
    $sidebar.innerHTML = `<div class="empty">No active sessions — start a Claude Code session.</div>`;
    return;
  }
  if (!s.items.length) {
    $sidebar.innerHTML = `<div class="empty">Nothing pushed yet in this session.</div>`;
    return;
  }
  $sidebar.innerHTML = "";
  for (const it of s.items) {
    const pill = pillFor(it);
    const row = document.createElement("div");
    row.className = "index-item" + (it.id === state.selectedItemId ? " active" : "");
    row.dataset.id = it.id;
    row.innerHTML = `<span class="pill ${pill.cls}">${pill.label}</span>
                     <span class="title">${escapeHtml(it.title || "(untitled)")}</span>`;
    row.addEventListener("click", () => selectItem(it.id));
    $sidebar.appendChild(row);
  }
}

async function selectSession(sid) {
  state.selectedSid = sid;
  const s = state.sessions.get(sid);
  if (s) s.unread = 0;
  state.selectedItemId = null;
  renderTabs();
  await refreshSessionItems(sid);
  if (s && s.items[0]) selectItem(s.items[0].id);
  else { $title.textContent = "kcc-preview"; $meta.textContent = ""; $host.innerHTML = ""; }
}

async function refreshSessionItems(sid) {
  const res = await fetch(`/api/sessions/${sid}/items`);
  if (!res.ok) return;
  const items = await res.json();
  const s = state.sessions.get(sid);
  if (!s) return;
  s.items = items;
  renderSidebar();
}

async function selectItem(id) {
  const mySeq = ++selectSeq;
  state.selectedItemId = id;
  renderSidebar();
  const res = await fetch(`/api/sessions/${state.selectedSid}/items/${id}`);
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
    const src = block.textContent;
    const div = document.createElement("div");
    div.className = "mermaid";
    const id = "m" + Math.random().toString(36).slice(2);
    try {
      const { svg } = await mermaid.render(id, src);
      div.innerHTML = svg;
    } catch (e) { div.textContent = "Mermaid error: " + e.message; }
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
    renderTabs();
    if (!state.selectedSid) selectSession(sid);
    else refreshSessionItems(sid);  // backfill items pushed before label
  });
  es.addEventListener("session-relabeled", (ev) => {
    const { sid, label } = JSON.parse(ev.data);
    const s = state.sessions.get(sid);
    if (s) { s.label = label; renderTabs(); }
  });
  es.addEventListener("session-removed", (ev) => {
    const { sid } = JSON.parse(ev.data);
    state.sessions.delete(sid);
    if (state.selectedSid === sid) {
      const next = [...state.sessions.keys()].sort((a,b) =>
        state.sessions.get(b).lastTouchedAt - state.sessions.get(a).lastTouchedAt)[0] || null;
      if (next) selectSession(next);
      else { state.selectedSid = null; state.selectedItemId = null; renderSidebar(); $title.textContent = "kcc-preview"; $meta.textContent = ""; $host.innerHTML = ""; }
    }
    renderTabs();
  });
  es.addEventListener("added", (ev) => {
    const { sid, item } = JSON.parse(ev.data);
    const s = state.sessions.get(sid);
    if (!s) return;  // session not yet labeled — ignore until session-added
    s.items.unshift(item);
    s.lastTouchedAt = Date.now();
    if (sid === state.selectedSid) renderSidebar();
    else { s.unread++; renderTabs(); }
  });
  es.addEventListener("updated", (ev) => {
    const { sid, item } = JSON.parse(ev.data);
    const s = state.sessions.get(sid);
    if (!s) return;
    const idx = s.items.findIndex((i) => i.id === item.id);
    if (idx >= 0) s.items[idx] = item;
    if (sid === state.selectedSid) renderSidebar();
  });
  es.addEventListener("evicted", (ev) => {
    const { sid, id } = JSON.parse(ev.data);
    const s = state.sessions.get(sid);
    if (!s) return;
    s.items = s.items.filter((i) => i.id !== id);
    if (sid === state.selectedSid) renderSidebar();
  });
}

async function initialLoad() {
  const res = await fetch("/api/sessions");
  if (res.ok) {
    const list = await res.json();
    for (const { sid, label } of list) {
      state.sessions.set(sid, { label, items: [], unread: 0, lastTouchedAt: Date.now() });
    }
    if (list[0]) await selectSession(list[0].sid);
  }
  renderTabs();
  renderSidebar();
}

initialLoad().then(connectSSE);
