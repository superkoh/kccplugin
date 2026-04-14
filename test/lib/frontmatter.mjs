/**
 * Parse YAML frontmatter out of a Markdown file.
 *
 * A frontmatter block is the region delimited by `---` on the first line
 * and the next `---` line. Everything between is fed to js-yaml. Anything
 * after is the body.
 *
 * Returns { frontmatter: object | null, body: string, raw: string }.
 * Throws if the frontmatter block is malformed YAML.
 */
import { readFile } from "node:fs/promises";
import yaml from "js-yaml";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontmatterString(raw) {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) {
    return { frontmatter: null, body: raw, raw };
  }
  const [, yamlBlock, body] = m;
  const fm = yaml.load(yamlBlock);
  if (fm !== null && typeof fm !== "object") {
    throw new Error("Frontmatter must be a YAML mapping (got scalar/list).");
  }
  return { frontmatter: fm || {}, body, raw };
}

export async function parseFrontmatterFile(filePath) {
  const raw = await readFile(filePath, "utf-8");
  try {
    return parseFrontmatterString(raw);
  } catch (err) {
    err.message = `${filePath}: ${err.message}`;
    throw err;
  }
}
