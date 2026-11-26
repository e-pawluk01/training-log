import "server-only";
import { google } from "googleapis";
import { promises as fs } from "fs";
import path from "path";
import type { SessionRow, SetRow } from "./cycle";

// The person's Google Sheet ("Training Log"): tabs Sessions and Sets.
// Uses the same Google OAuth refresh token as OS. When those env vars are
// missing in local dev, a JSON file in .data/ stands in for the Sheet.

type Cell = string | number | boolean | null;
export type Store = {
  sessions(): Promise<SessionRow[]>;
  sets(): Promise<SetRow[]>;
  append(tab: "Sessions" | "Sets", rows: Cell[][]): Promise<void>;
};

const num = (v: unknown) => (typeof v === "number" ? v : v === "" || v == null ? NaN : Number(v));
const pad = (n: number) => String(n).padStart(2, "0");

// Dates come back as serial numbers (days since 30 Dec 1899); typed-in text is handled too.
function isoDate(v: unknown): string {
  if (typeof v === "number") {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return "";
}
function clock(v: unknown): string {
  if (typeof v === "number") { const mins = Math.round((v % 1) * 1440); return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`; }
  return String(v ?? "");
}

const toSession = (r: unknown[]): SessionRow | null => {
  const n = num(r[0]), day = num(r[3]), date = isoDate(r[1]);
  if (!Number.isFinite(n) || !Number.isFinite(day) || !date) return null;
  return { n, date, cycle: num(r[2]) || 1, day, workout: String(r[4] ?? ""), start: clock(r[5]), dur: num(r[7]) || 0, sets: num(r[8]) || 0, rest: num(r[9]) || 0 };
};
const toSet = (r: unknown[]): SetRow | null => {
  const n = num(r[0]), day = num(r[3]), set = num(r[7]);
  if (!Number.isFinite(n) || !Number.isFinite(day) || !Number.isFinite(set)) return null;
  const reps = num(r[8]), sec = num(r[9]);
  return { n, day, workout: String(r[4] ?? ""), exercise: String(r[5] ?? ""), movement: String(r[6] ?? ""), set, reps: Number.isFinite(reps) ? reps : null, sec: Number.isFinite(sec) ? sec : null };
};
const keep = <T,>(x: T | null): x is T => x != null;

function googleStore(sheetId: string): Store {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  const api = google.sheets({ version: "v4", auth }).spreadsheets.values;
  const read = async (range: string) =>
    ((await api.get({ spreadsheetId: sheetId, range, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" })).data.values || []) as unknown[][];
  return {
    sessions: async () => (await read("Sessions!A2:L")).map(toSession).filter(keep),
    sets: async () => (await read("Sets!A2:L")).map(toSet).filter(keep),
    // OVERWRITE fills the empty rows under the header, so new rows keep the
    // column formats instead of inheriting the black header style.
    append: async (tab, rows) => {
      if (!rows.length) return;
      await api.append({ spreadsheetId: sheetId, range: `${tab}!A1`, valueInputOption: "USER_ENTERED", insertDataOption: "OVERWRITE", requestBody: { values: rows } });
    },
  };
}

function fileStore(key: string): Store {
  const file = path.join(process.cwd(), ".data", `${key}.json`);
  const load = async (): Promise<{ Sessions: Cell[][]; Sets: Cell[][] }> => {
    try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return { Sessions: [], Sets: [] }; }
  };
  return {
    sessions: async () => (await load()).Sessions.map(toSession).filter(keep),
    sets: async () => (await load()).Sets.map(toSet).filter(keep),
    append: async (tab, rows) => {
      const db = await load();
      db[tab].push(...rows);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(db, null, 1));
    },
  };
}

export function storeFor(key: string, sheetId: string | undefined): Store | null {
  const hasGoogle = !!(process.env.GOOGLE_OAUTH_REFRESH_TOKEN && process.env.GOOGLE_OAUTH_CLIENT_ID);
  if (process.env.NODE_ENV === "development" && !hasGoogle) return fileStore(key);
  return sheetId && hasGoogle ? googleStore(sheetId) : null;
}
