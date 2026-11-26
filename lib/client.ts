// Browser side: calls to this app's own API (the sign-in cookie goes along automatically).
export const api = (path: string, init?: RequestInit) =>
  fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json" } });

/* Per-viewer storage that survives a reload mid-workout. */
export const load = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
};
export const save = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };
