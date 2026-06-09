// Persist and restore the user's selected session + item across page reloads.
// Without this, every refresh jumps to the newest session's first item; with
// it, the page stays on whatever the user was looking at — as long as that
// session and item still exist. Pure helpers (no DOM / CDN imports) so they
// can be unit-tested under `node --test`.

const KEY = "kcc-preview:selection";

// Write the current selection. Pass a falsy/sid-less value to clear it.
// localStorage can throw (private mode, quota, disabled) — swallow so a
// storage failure never breaks navigation; the selection just won't persist.
export function saveSelection(storage, sel) {
  try {
    if (sel && sel.sid) {
      storage.setItem(KEY, JSON.stringify({ sid: sel.sid, itemId: sel.itemId ?? null }));
    } else {
      storage.removeItem(KEY);
    }
  } catch { /* storage unavailable — selection simply isn't remembered */ }
}

export function loadSelection(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.sid === "string") {
      return { sid: v.sid, itemId: typeof v.itemId === "string" ? v.itemId : null };
    }
  } catch { /* malformed or unavailable — fall through to null */ }
  return null;
}

// Given a saved selection and the current session list, pick which sid to open:
// the saved one if it still exists, else the first session (legacy default).
export function pickSession(saved, sessionList) {
  if (saved && saved.sid && sessionList.some((s) => s.sid === saved.sid)) return saved.sid;
  return sessionList[0]?.sid ?? null;
}

// Given a saved itemId and a session's current items, pick which item to open:
// the saved one if it still exists, else the first item (newest).
export function pickItem(savedItemId, items) {
  if (savedItemId && items.some((i) => i.id === savedItemId)) return savedItemId;
  return items[0]?.id ?? null;
}
