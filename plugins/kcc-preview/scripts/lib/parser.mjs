// Minimal frontmatter parser for kcc-preview entry files.
// Supports three `kind` values and a handful of known keys. Zero deps.

const KNOWN_KINDS = new Set(["inline", "file", "html"]);

function stripQuotes(s) {
  if (s.length >= 2) {
    const a = s[0], b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

function parseFrontmatter(block) {
  const out = {};
  for (const line of block.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = stripQuotes(m[2].trim());
  }
  return out;
}

function basenameWithoutExt(filename) {
  const base = filename.replace(/^.*[\\/]/, "");
  return base.replace(/\.[^.]+$/, "");
}

export function parseEntry(filename, text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);

  if (!fm) {
    if (/\.html?$/i.test(filename)) {
      return {
        kind: "vc",
        title: basenameWithoutExt(filename),
        body: text,
      };
    }
    return { error: "no frontmatter" };
  }

  const meta = parseFrontmatter(fm[1]);
  const body = fm[2];

  if (!meta.title) return { error: "title is required" };

  const kind = meta.kind || "inline";
  if (!KNOWN_KINDS.has(kind)) {
    return { error: `unknown kind: ${kind}` };
  }
  if (kind === "file" && !meta.path) {
    return { error: "path is required when kind is 'file'" };
  }

  return {
    kind,
    title: meta.title,
    path: meta.path,
    body,
  };
}
