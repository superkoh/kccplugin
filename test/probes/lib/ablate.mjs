/**
 * Build one A/B arm of an injected-principles document.
 *
 * Contract
 * --------
 * buildVariant(sourceText, { anchor, sentinel, label })
 *
 *   sourceText  full principles markdown.
 *   anchor      RegExp matching the FIRST line of the rule block to
 *               delete (the B arm), or null for the A arm (no deletion).
 *   sentinel    arm-unique token substituted into the doc's
 *               `<!-- kcc-core-sentinel: … -->` line, so the arm can be
 *               identified off the SessionStart hook_response event.
 *   label       human name used in error messages.
 *
 * Returns { text, removedLines }.
 *
 * The deleted range runs from the anchor line up to (excluding) the next
 * block boundary — another `- **Rule.**` bullet or any markdown heading —
 * with trailing blank lines pushed back out of the range so the seam
 * keeps exactly one separator line.
 *
 * Throws when the anchor matches zero lines, when it matches more than
 * one, or when the doc carries no sentinel line. A silent no-op ablation
 * would produce a B arm identical to A and quietly invalidate a whole
 * campaign, so every one of those is a hard error.
 */

const SENTINEL_RE = /(<!--\s*kcc-core-sentinel:\s*)([^\s>]+)(\s*-->)/;
// A section's block ends at the next bullet, the next heading, or the
// trailing sentinel comment. Without the last one, ablating a doc's
// final section swallows the sentinel and the arm loses its identity.
const BOUNDARY_RE = /^(?:- \*\*|#{1,6} |<!--)/;

export function buildVariant(
  sourceText,
  { anchor = null, snippet = null, sentinel, label = "" } = {}
) {
  if (!SENTINEL_RE.test(sourceText)) {
    throw new Error(`no kcc-core-sentinel line in the source document (arm "${label}")`);
  }

  let text = sourceText;
  let removedLines = 0;

  for (const edit of snippet ? [snippet].flat() : []) {
    const occurrences = text.split(edit.find).length - 1;
    if (occurrences === 0) {
      throw new Error(
        `ablation snippet for "${label}" is not present — the B arm would be identical to A`
      );
    }
    if (occurrences > 1) {
      throw new Error(
        `ablation snippet for "${label}" is ambiguous: found ${occurrences} occurrences`
      );
    }
    const before = text.split("\n").length;
    text = text.replace(edit.find, edit.with ?? "");
    removedLines += before - text.split("\n").length;
  }

  if (anchor) {
    // Strip a stray /g so .test() stays stateless across lines.
    const re = new RegExp(anchor.source, anchor.flags.replace("g", ""));
    const lines = text.split("\n");
    const hits = lines.reduce((acc, l, i) => (re.test(l) ? [...acc, i] : acc), []);

    if (hits.length === 0) {
      throw new Error(
        `ablation anchor for "${label}" matched no line — the B arm would be identical to A`
      );
    }
    if (hits.length > 1) {
      throw new Error(
        `ablation anchor for "${label}" is ambiguous: matched ${hits.length} lines (${hits.join(", ")})`
      );
    }

    const start = hits[0];
    let end = start + 1;
    while (end < lines.length && !BOUNDARY_RE.test(lines[end])) end++;
    while (end - 1 > start && lines[end - 1].trim() === "") end--;

    removedLines += end - start;
    lines.splice(start, end - start);
    text = lines.join("\n");
  }

  if (!SENTINEL_RE.test(text)) {
    throw new Error(
      `ablation for "${label}" deleted the sentinel line — the arm would be unattributable`
    );
  }
  return { text: text.replace(SENTINEL_RE, `$1${sentinel}$3`), removedLines };
}
