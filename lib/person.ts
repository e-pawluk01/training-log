import "server-only";
import { createClient } from "@supabase/supabase-js";
import { PEOPLE, PERSON_KEYS, type PersonKey } from "./plans";

// Sign-in uses the same Supabase accounts as OS. Emails and Sheet IDs come
// from env vars so they stay out of the repo: ERYK_EMAIL, ERYK_SHEET_ID, ...
const env = (key: PersonKey, what: "EMAIL" | "SHEET_ID") => process.env[`${key.toUpperCase()}_${what}`]?.trim() || undefined;
export const emailOf = (key: PersonKey) => env(key, "EMAIL");
export const sheetOf = (key: PersonKey) => env(key, "SHEET_ID");
export const isPerson = (k: unknown): k is PersonKey => typeof k === "string" && k in PEOPLE;

export const supabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** The signed-in person behind a request's Bearer token, or null. */
export async function personFrom(req: Request): Promise<PersonKey | null> {
  // Local dev without a sign-in: DEV_PERSON=eryk in .env.local (ignored in production).
  if (process.env.NODE_ENV === "development" && isPerson(process.env.DEV_PERSON)) return process.env.DEV_PERSON;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await supabase().auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !email) return null;
  return PERSON_KEYS.find((k) => emailOf(k)?.toLowerCase() === email) ?? null;
}
