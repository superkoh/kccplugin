// Resolves a stored item's id to the body the frontend should render.
// For kind=file, reads from disk and attaches a MIME hint.

import { readFile } from "node:fs/promises";
import path from "node:path";

const MIME = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".html": "text/html",
  ".htm": "text/html",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".json": "application/json",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".toml": "text/toml",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".mjs": "text/javascript",
  ".py": "text/x-python",
  ".go": "text/x-go",
  ".rs": "text/x-rust",
  ".sh": "text/x-shellscript",
  ".bash": "text/x-shellscript",
};

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

export async function renderItem(item) {
  if (item.kind === "inline" || item.kind === "html") {
    return { ...publicFields(item), body: item.body ?? "" };
  }
  if (item.kind === "vc") {
    return { ...publicFields(item), body: item.body ?? "" };
  }
  if (item.kind === "file") {
    const mime = mimeFor(item.path);
    const isBinary = mime.startsWith("image/");
    try {
      if (isBinary) {
        return { ...publicFields(item), mime, body: null, url: `/api/file?path=${encodeURIComponent(item.path)}` };
      }
      const body = await readFile(item.path, "utf-8");
      return { ...publicFields(item), mime, body };
    } catch (err) {
      return { ...publicFields(item), mime, error: `path not readable: ${item.path}` };
    }
  }
  return { ...publicFields(item), error: `unknown kind: ${item.kind}` };
}

function publicFields(item) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    path: item.path,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export { mimeFor };
