/**
 * localStorage helper for consent-free, device-local state only:
 *  - the list of places the visitor has already reviewed (demo mode has no server)
 * It never stores sessions, passwords or the user's precise location history.
 */
const KEY = 'sentra.reviewed.v1';
const MAX_ENTRIES = 200;

export function loadReviewed() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveReviewed(map) {
  try {
    const entries = Object.entries(map).slice(-MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage full or blocked - non-fatal */
  }
}

export function recordReviewed(osmKey, entry) {
  const map = loadReviewed();
  map[osmKey] = { ...entry, at: new Date().toISOString() };
  saveReviewed(map);
  return map;
}

export function clearReviewed() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return {};
}
