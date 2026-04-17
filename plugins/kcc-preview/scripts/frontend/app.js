// kcc-preview SPA — ES module loaded by index.html.
// Loads marked / mermaid / hljs from CDN, subscribes to /api/events SSE,
// and dispatches per-kind rendering into #content-host.

import { marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
import hljs from "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/+esm";

// Use Mermaid's bundled "dark" theme as the base — it handles most diagram
// types correctly. We pair it with CSS overrides in styles.css that force
// SVG text fills and actor/note rectangle colors, so any element category
// the bundled theme misses still ends up readable on our dark palette.
mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });

const state = {
  items: [],
  selectedId: null,
};

// Token used to drop stale select() responses when the user clicks
// (or an SSE 'updated' event fires) before the in-flight fetch resolves.
let selectSeq = 0;

const $sidebar = document.getElementById("index-list");
const $title = document.getElementById("current-title");
const $meta = document.getElementById("current-meta");
const $host = document.getElementById("content-host");
const $dot = document.getElementById("status-dot");

function pillFor(item) {
  if (item.kind === "file") {
    const ext = (item.path || "").split(".").pop().toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return { cls: "img", label: ext };
    if (["md", "markdown"].includes(ext)) return { cls: "md", label: "md" };
    return { cls: "file", label: ext || "file" };
  }
  if (item.kind === "inline") return { cls: "md", label: "md" };
  if (item.kind === "vc") return { cls: "vc", label: "vc" };
  if (item.kind === "html") return { cls: "html", label: "html" };
  return { cls: "file", label: item.kind };
}

function renderSidebar() {
  if (!state.items.length) {
    $sidebar.innerHTML = `<div class="empty">Nothing pushed yet. Claude will populate this during the session.</div>`;
    return;
  }
  $sidebar.innerHTML = "";
  for (const it of state.items) {
    const pill = pillFor(it);
    const row = document.createElement("div");
    row.className = "index-item" + (it.id === state.selectedId ? " active" : "");
    row.dataset.id = it.id;
    row.innerHTML = `<span class="pill ${pill.cls}">${pill.label}</span>
                     <span class="title">${escapeHtml(it.title || "(untitled)")}</span>`;
    row.addEventListener("click", () => select(it.id));
    $sidebar.appendChild(row);
  }
}

async function select(id) {
  const mySeq = ++selectSeq;
  state.selectedId = id;
  renderSidebar();
  const res = await fetch(`/api/items/${id}`);
  if (mySeq !== selectSeq) return;
  if (!res.ok) {
    $host.innerHTML = `<div class="muted">Failed to load item.</div>`;
    return;
  }
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
  if (item.error) {
    $host.innerHTML = `<pre>${escapeHtml(item.error)}</pre>`;
    return;
  }

  if (item.kind === "vc" || item.kind === "html") {
    $host.innerHTML = `<iframe src="/item/${item.id}/frame" sandbox="allow-scripts allow-same-origin"></iframe>`;
    return;
  }

  if (item.kind === "file") {
    if (item.mime?.startsWith("image/")) {
      $host.innerHTML = `<img src="${item.url}" alt="${escapeHtml(item.title)}">`;
      return;
    }
    if (item.mime === "text/html") {
      $host.innerHTML = `<iframe srcdoc="${escapeHtml(item.body)}" sandbox="allow-scripts"></iframe>`;
      return;
    }
    if (item.mime === "text/markdown") {
      $host.innerHTML = await renderMarkdown(item.body || "");
      return;
    }
    const lang = (item.path || "").split(".").pop();
    $host.innerHTML = `<pre><code class="hljs language-${lang}">${escapeHtml(item.body || "")}</code></pre>`;
    hljs.highlightAll();
    return;
  }

  // inline kind
  $host.innerHTML = await renderMarkdown(item.body || "");
}

async function renderMarkdown(src) {
  // Trust model: markdown bodies arrive from content/ entries Claude wrote
  // (kind=inline) or files Claude referenced by absolute path (kind=file,
  // text/markdown). Both are author-trusted at the same level as the user's
  // own filesystem. marked v13 does NOT sanitize HTML — if untrusted markdown
  // ever flows in, add DOMPurify before innerHTML insertion below.
  const html = marked.parse(src, { gfm: true, breaks: false });
  const host = document.createElement("div");
  host.innerHTML = html;
  // highlight code blocks
  for (const pre of host.querySelectorAll("pre code")) {
    hljs.highlightElement(pre);
  }
  // render mermaid
  const mermaidBlocks = host.querySelectorAll("code.language-mermaid");
  for (const block of mermaidBlocks) {
    const src = block.textContent;
    const div = document.createElement("div");
    div.className = "mermaid";
    const id = "m" + Math.random().toString(36).slice(2);
    try {
      const { svg } = await mermaid.render(id, src);
      div.innerHTML = svg;
    } catch (e) {
      div.textContent = "Mermaid error: " + e.message;
    }
    block.closest("pre").replaceWith(div);
  }
  return host.innerHTML;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function connectSSE() {
  const es = new EventSource("/api/events");
  es.onopen = () => $dot.classList.add("connected");
  es.onerror = () => $dot.classList.remove("connected");
  es.addEventListener("added", (ev) => {
    const data = JSON.parse(ev.data);
    state.items.unshift(data.item);
    renderSidebar();
    if (!state.selectedId) select(data.item.id);
  });
  es.addEventListener("updated", (ev) => {
    const data = JSON.parse(ev.data);
    const idx = state.items.findIndex(i => i.id === data.item.id);
    if (idx >= 0) state.items[idx] = data.item;
    renderSidebar();
    if (state.selectedId === data.item.id) select(data.item.id);
  });
  es.addEventListener("evicted", (ev) => {
    const data = JSON.parse(ev.data);
    state.items = state.items.filter(i => i.id !== data.id);
    renderSidebar();
  });
}

async function initialLoad() {
  const res = await fetch("/api/items");
  state.items = await res.json();
  renderSidebar();
  if (state.items[0]) select(state.items[0].id);
}

initialLoad().then(connectSSE);
