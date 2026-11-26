import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser side: the Supabase session (same accounts as OS) and a fetch that sends it.
let sb: SupabaseClient | null = null;
export const supa = () =>
  (sb ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "none"));

export async function api(path: string, init?: RequestInit) {
  const { data } = await supa().auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

/* Per-viewer storage that survives a reload mid-workout. */
export const load = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
};
export const save = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };
