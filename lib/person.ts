import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { PEOPLE, type PersonKey } from "./plans";

// Sign-in without any outside service: each person's password and Sheet ID
// live in env vars (ERYK_PASSWORD, ERYK_SHEET_ID, ...). A correct password
// gets a signed cookie that keeps the phone signed in for a year.
const env = (key: PersonKey, what: "PASSWORD" | "SHEET_ID") => process.env[`${key.toUpperCase()}_${what}`]?.trim() || undefined;
export const sheetOf = (key: PersonKey) => env(key, "SHEET_ID");
export const isPerson = (k: unknown): k is PersonKey => typeof k === "string" && k in PEOPLE;

const COOKIE = "tl_session";
const YEAR = 365 * 864e5;
const secret = () => process.env.AUTH_SECRET || "";
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");
const same = (a: string, b: string) => {
  const x = createHmac("sha256", "cmp").update(a).digest(), y = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(x, y);
};

export function passwordOk(key: PersonKey, password: string) {
  const real = env(key, "PASSWORD");
  return !!real && !!secret() && same(password, real);
}

export function signInCookie(key: PersonKey) {
  const v = `${key}.${Date.now() + YEAR}`;
  return cookie(`${v}.${sign(v)}`, YEAR / 1000);
}
export const signOutCookie = () => cookie("", 0);
const cookie = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(maxAge)}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;

/** The signed-in person behind a request's cookie, or null. */
export async function personFrom(req: Request): Promise<PersonKey | null> {
  // Local dev without a sign-in: DEV_PERSON=eryk in .env.local (ignored in production).
  if (process.env.NODE_ENV === "development" && isPerson(process.env.DEV_PERSON)) return process.env.DEV_PERSON;
  const raw = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw || !secret()) return null;
  const [key, exp, sig] = raw.split(".");
  if (!isPerson(key) || !sig || !same(sig, sign(`${key}.${exp}`)) || Number(exp) < Date.now()) return null;
  return env(key, "PASSWORD") ? key : null;   // removing a password signs that person out
}
