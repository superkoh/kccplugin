// kcc-backlog: generate filesystem-safe ids for backlog items.

const MAX_SLUG = 40;

export function slugify(input) {
  const ascii = (input ?? "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const capped = ascii.slice(0, MAX_SLUG).replace(/-+$/g, "");
  return capped || "item";
}

function formatDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function generateId({ title, date, existing = [] }) {
  const base = `${formatDate(date ?? new Date())}-${slugify(title)}`;
  if (!existing.includes(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!existing.includes(candidate)) return candidate;
  }
}
