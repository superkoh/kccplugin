// Atomic leader election by TCP bind. Whichever process binds the port
// first owns the kcc-preview daemon for that range. EADDRINUSE means a
// peer beat us — we walk up the range. Range exhaustion is a hard error
// surfaced as "unavailable" in SessionStart context.

import net from "node:net";

export const DEFAULT_PORT_RANGE = { start: 51296, end: 51305 };

// Parse `KCC_PREVIEW_PORT_RANGE` env (e.g. "51296-51305"); fall back to default
// on missing / malformed input. Exported so SessionStart and UserPromptSubmit
// share the exact same resolution rules (and tests can override via env).
export function resolvePortRange(env = process.env) {
  const raw = env.KCC_PREVIEW_PORT_RANGE;
  if (!raw) return DEFAULT_PORT_RANGE;
  const m = /^(\d+)-(\d+)$/.exec(raw.trim());
  if (!m) return DEFAULT_PORT_RANGE;
  const start = Number(m[1]), end = Number(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return DEFAULT_PORT_RANGE;
  return { start, end };
}

function bindOnce(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", (err) => {
      if (err.code === "EADDRINUSE" || err.code === "EACCES") resolve(null);
      else resolve(null); // any error = port unusable
    });
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

export async function tryBindFirstFreePort(range = DEFAULT_PORT_RANGE) {
  for (let port = range.start; port <= range.end; port++) {
    const srv = await bindOnce(port);
    if (srv) {
      const release = () => new Promise((r) => srv.close(() => r()));
      return { port, server: srv, release };
    }
  }
  const err = new Error(`no free port in ${range.start}-${range.end}`);
  err.code = "RANGE_EXHAUSTED";
  throw err;
}
