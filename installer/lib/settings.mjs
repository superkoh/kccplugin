/**
 * settings.json merging.
 *
 * `.claude/settings.json` is the *project's* file, not ours — it carries the
 * team's permissions, env, statusline and their own hooks. So we never own
 * the file, only the hook entries we put in it.
 *
 * Ownership predicate: a hook command belongs to kcc iff it references
 * `/.claude/kcc/`. Every script we install lives there, so the test is exact,
 * needs no marker keys (which strict schemas would reject), and survives the
 * user reformatting or reordering the file.
 *
 * Every write is therefore "strip everything of ours, then append the current
 * truth" — which makes install, upgrade and uninstall the same operation and
 * makes it idempotent.
 */
import { MANAGED_HOOK_MARKER } from "./projection.mjs";

/** @returns {boolean} true when a single `{type, command}` entry is ours. */
export function isManagedHook(hook) {
  return (
    !!hook &&
    typeof hook === "object" &&
    typeof hook.command === "string" &&
    hook.command.includes(MANAGED_HOOK_MARKER)
  );
}

/**
 * Remove every kcc-owned hook from a settings object, leaving everything
 * else — including the user's own hooks on the same events — untouched.
 *
 * Filtering happens at the inner `hooks[]` level rather than the entry level,
 * so an entry that mixes ours and theirs (which we never write, but a user
 * could hand-craft) loses only our half.
 *
 * @param {object} settings  parsed settings.json (not mutated)
 * @returns {object} a new settings object
 */
export function stripManagedHooks(settings) {
  const next = { ...settings };
  const hooks = next.hooks;
  if (!hooks || typeof hooks !== "object") return next;

  const cleanedEvents = {};
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) {
      cleanedEvents[event] = entries;
      continue;
    }
    const keptEntries = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.hooks)) {
        keptEntries.push(entry);
        continue;
      }
      const keptHooks = entry.hooks.filter((h) => !isManagedHook(h));
      if (keptHooks.length === 0) continue; // entry was entirely ours
      if (keptHooks.length === entry.hooks.length) keptEntries.push(entry);
      else keptEntries.push({ ...entry, hooks: keptHooks });
    }
    // An event that had entries and lost them all was ours; one that was
    // already empty belongs to the project and is left exactly as found.
    if (keptEntries.length > 0 || entries.length === 0) cleanedEvents[event] = keptEntries;
  }

  // Drop `hooks` only when it had content and everything in it was ours.
  // A project that wrote `"hooks": {}` keeps it — removing the key would put
  // a change in their diff that kcc had no reason to make.
  if (Object.keys(cleanedEvents).length === 0 && Object.keys(hooks).length > 0) {
    delete next.hooks;
  } else {
    next.hooks = cleanedEvents;
  }
  return next;
}

/**
 * Collect the kcc-owned hook entries currently present in a settings object,
 * keyed by event. Used by `--check` to detect that someone edited or deleted
 * one of our entries.
 *
 * @returns {Record<string, object[]>}
 */
export function extractManagedHooks(settings) {
  const out = {};
  const hooks = settings?.hooks;
  if (!hooks || typeof hooks !== "object") return out;
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    const mine = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.hooks)) continue;
      const managed = entry.hooks.filter(isManagedHook);
      if (managed.length === 0) continue;
      mine.push(managed.length === entry.hooks.length ? entry : { ...entry, hooks: managed });
    }
    if (mine.length > 0) out[event] = mine;
  }
  return out;
}

/**
 * Produce the settings object to write: the user's settings with all kcc
 * hooks replaced by `managed`.
 *
 * Managed entries are appended *after* the user's own entries for the same
 * event, and events are emitted in the order they first appear (existing
 * events keep their position; new ones are appended sorted) so that repeated
 * runs produce byte-stable output and clean git diffs.
 *
 * @param {object|null} settings  parsed settings.json, or null when absent
 * @param {Record<string, object[]>} managed  event → entries to install
 * @returns {object}
 */
export function mergeManagedHooks(settings, managed) {
  const base = stripManagedHooks(settings ?? {});
  const events = Object.keys(managed);
  if (events.length === 0) return base;

  const existing = base.hooks && typeof base.hooks === "object" ? base.hooks : {};
  const merged = {};
  // Existing events keep their original position.
  for (const [event, entries] of Object.entries(existing)) {
    merged[event] = Array.isArray(entries) ? [...entries] : entries;
  }
  // New events are appended in a stable, sorted order.
  for (const event of [...events].sort()) {
    if (!(event in merged)) merged[event] = [];
    if (!Array.isArray(merged[event])) {
      throw new Error(
        `.claude/settings.json: hooks.${event} is not an array — refusing to merge into it`
      );
    }
    merged[event] = [...merged[event], ...managed[event]];
  }

  return { ...base, hooks: merged };
}

/**
 * Decide what to do with `.claude/settings.json`.
 *
 * This used to be three independent predicates in the installer's `main()`,
 * evaluated in sequence with nothing proving they covered every case — and
 * they did not: "the stripped result is empty but we did not create the
 * file" fell through all three, so `--uninstall` left kcc's hook commands in
 * a project-owned settings.json, pointing at scripts it had just deleted,
 * with the lockfile gone so a second run could not repair it.
 *
 * As one total function over its four inputs, that case is a line of code and
 * a unit test instead of a scenario someone has to think to script.
 *
 * @param {object|null} settings   parsed settings.json, or null when absent
 * @param {Record<string, object[]>} managed  hook entries this install wants
 * @param {boolean} createdSettings  did kcc create this file?
 * @param {boolean} existed          was the file there before this run?
 * @returns {{action: 'write'|'remove'|'leave', next: object}}
 */
export function decideSettingsWrite({ settings, managed, createdSettings, existed }) {
  const next = mergeManagedHooks(settings ?? {}, managed);
  const empty = Object.keys(next).length === 0;
  const unchanged = sameManagedHooks(extractManagedHooks(settings ?? {}), managed);

  // Nothing left, and the file is ours: remove it rather than leave a `{}`.
  if (empty && createdSettings) return { action: "remove", next };
  // Nothing left, and there was no file: do not create an empty one.
  if (empty && !existed) return { action: "leave", next };
  // Nothing of ours to add or remove: rewriting would reflow a file we do not
  // own into an unrelated diff.
  if (unchanged && existed) return { action: "leave", next };
  // Everything else — including "all that is left is empty, but the project
  // owns the file" — must be written, or our entries stay behind.
  return { action: "write", next };
}

/**
 * Structural equality for the managed-hook comparison in `--check`.
 *
 * Key order must not matter anywhere, not just at the top level: a team that
 * runs prettier (or `jq -S`) over `.claude/settings.json` reorders the keys
 * inside every hook entry, and a stringify-based comparison would then report
 * drift on every CI run forever — the documented CI gate failing on a purely
 * cosmetic change is worse than no gate at all.
 */
export function sameManagedHooks(a, b) {
  return JSON.stringify(canonical(a ?? {})) === JSON.stringify(canonical(b ?? {}));
}

/** Recursively sort object keys; arrays keep their order, which is meaningful. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([x], [y]) => (x < y ? -1 : 1))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
}
