// kcc-backlog: filesystem I/O for items under `<root>/items/` and
// `<root>/archive/`. No AI judgement here — minimal YAML frontmatter
// reader scoped to the keys kcc-backlog writes.

import { readdir, readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { generateId } from "./backlog-id.mjs";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function parseFrontmatter(text) {
  const out = { tags: [], related_items: [] };
  const lines = text.split("\n");
  let listKey = null;
  for (const line of lines) {
    if (!line.trim()) { listKey = null; continue; }
    const listMatch = line.match(/^\s+-\s+(.*)$/);
    if (listMatch && listKey) {
      out[listKey].push(listMatch[1].trim());
      continue;
    }
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!kvMatch) continue;
    const [, key, rawVal] = kvMatch;
    const val = rawVal.trim();
    if (val === "") {
      listKey = key;
      out[key] = [];
    } else if (val === "[]") {
      out[key] = [];
      listKey = null;
    } else if (val === "null") {
      out[key] = null;
      listKey = null;
    } else {
      out[key] = val;
      listKey = null;
    }
  }
  return out;
}

function formatFrontmatter(fm) {
  const lines = ["---"];
  const keys = [
    "id", "title", "status", "priority",
    "tags", "created_at", "updated_at",
    "source_session", "related_items", "closed_at",
  ];
  for (const key of keys) {
    if (!(key in fm)) continue;
    const value = fm[key];
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const v of value) lines.push(`  - ${v}`);
      }
    } else if (value === null || value === undefined) {
      lines.push(`${key}: null`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function itemPath(root, id, dir = "items") {
  return path.join(root, dir, `${id}.md`);
}

async function listIds(root, dir = "items") {
  try {
    const names = await readdir(path.join(root, dir));
    return names.filter((n) => n.endsWith(".md")).map((n) => n.slice(0, -3));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

export async function readItem({ root, id, dir = "items" }) {
  const raw = await readFile(itemPath(root, id, dir), "utf-8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`malformed frontmatter in ${id}`);
  return { frontmatter: parseFrontmatter(m[1]), body: m[2] };
}

export async function listItems({ root }) {
  const ids = await listIds(root, "items");
  const summaries = [];
  for (const id of ids) {
    const { frontmatter: fm } = await readItem({ root, id });
    summaries.push({
      id,
      title: fm.title ?? "",
      status: fm.status ?? "pending",
      priority: fm.priority ?? "medium",
      tags: fm.tags ?? [],
      created_at: fm.created_at ?? "",
      updated_at: fm.updated_at ?? "",
    });
  }
  summaries.sort((a, b) => {
    const ap = a.status === "in_progress" ? 0 : 1;
    const bp = b.status === "in_progress" ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const apr = PRIORITY_RANK[a.priority] ?? 1;
    const bpr = PRIORITY_RANK[b.priority] ?? 1;
    if (apr !== bpr) return apr - bpr;
    return b.created_at.localeCompare(a.created_at);
  });
  return summaries;
}

export async function addItem({ root, title, body = "", priority = "medium", tags = [], now = new Date(), session = null }) {
  await mkdir(path.join(root, "items"), { recursive: true });
  const existing = await listIds(root, "items");
  const id = generateId({ title, date: now, existing });
  const iso = now.toISOString();
  const fm = {
    id,
    title,
    status: "pending",
    priority,
    tags,
    created_at: iso,
    updated_at: iso,
    source_session: session ?? "",
    related_items: [],
    closed_at: null,
  };
  const text = `${formatFrontmatter(fm)}\n\n${body.trim()}\n`;
  await writeFile(itemPath(root, id), text, "utf-8");
  return id;
}
