// Node stdlib HTTP server for kcc-preview. Binds 127.0.0.1 on a random
// free port (or PORT env). Serves:
//   GET /                     — the SPA shell
//   GET /api/items            — list {id,title,kind,path,createdAt}
//   GET /api/items/:id        — renderItem(item)
//   GET /api/file?path=...    — raw file bytes (for images, etc.)
//   GET /api/events           — SSE of store changes
//   GET /health               — liveness

import http from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderItem, mimeFor } from "./render.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "..", "frontend");

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function serveStatic(res, file) {
  try {
    const buf = await readFile(file);
    const mime = mimeFor(file).replace(/^text\//, "text/") + "; charset=utf-8";
    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": buf.length,
    });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}

export async function createServer({ store, sessionId, port = 0 }) {
  const startedAt = Date.now();
  const sseClients = new Set();

  const unsubscribe = store.subscribe((ev) => {
    const payload = ev.type === "evicted"
      ? { type: ev.type, id: ev.id }
      : { type: ev.type, item: publicItem(ev.item) };
    const msg = `event: ${ev.type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const c of sseClients) c.write(msg);
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1`);

    if (url.pathname === "/health") {
      return json(res, 200, { sessionId, uptime: Date.now() - startedAt });
    }

    if (url.pathname === "/") {
      return serveStatic(res, path.join(FRONTEND_DIR, "index.html"));
    }

    if (url.pathname.startsWith("/assets/")) {
      const sub = url.pathname.replace(/^\/assets\//, "");
      const file = path.join(FRONTEND_DIR, sub);
      if (!file.startsWith(FRONTEND_DIR)) {
        res.writeHead(403); return res.end("forbidden");
      }
      return serveStatic(res, file);
    }

    if (url.pathname === "/api/items") {
      return json(res, 200, store.list().map(publicItem));
    }

    const mItem = /^\/api\/items\/([A-Za-z0-9-]+)$/.exec(url.pathname);
    if (mItem) {
      const it = store.get(mItem[1]);
      if (!it) return json(res, 404, { error: "not found" });
      const rendered = await renderItem(it);
      return json(res, 200, rendered);
    }

    if (url.pathname === "/api/file") {
      const p = url.searchParams.get("path");
      if (!p || !path.isAbsolute(p)) {
        return json(res, 400, { error: "absolute path required" });
      }
      try {
        const mime = mimeFor(p);
        res.writeHead(200, { "Content-Type": mime });
        createReadStream(p).on("error", () => res.end()).pipe(res);
      } catch {
        return json(res, 404, { error: "not found" });
      }
      return;
    }

    if (url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });
      // Open the stream with an SSE comment line (no frame terminator) so
      // proxies flush headers without the client observing a complete event
      // boundary before the first real message.
      res.write(`: open\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    res.writeHead(404); res.end("not found");
  });

  server.on("close", unsubscribe);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return { server, port: server.address().port };
}

function publicItem(item) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    path: item.path,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
