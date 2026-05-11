// Track labeled sessions. When the count reaches zero, schedule onExit
// after idleMs. Any new label cancels. Called by daemon.mjs with
// onExit = () => process.exit(0).

export function createIdleReaper({ idleMs = 60_000, onExit } = {}) {
  const labeled = new Set();
  let timer = null;

  function reschedule() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (labeled.size === 0) {
      timer = setTimeout(() => { timer = null; onExit?.(); }, idleMs);
    }
  }

  return {
    onLabeled(sid) { labeled.add(sid); reschedule(); },
    onRemoved(sid) { labeled.delete(sid); reschedule(); },
    get size() { return labeled.size; },
  };
}
