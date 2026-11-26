// Pure cycle logic shared by the server routes and the page.
import { isTimed, type Plan } from "./plans";

/* ---------- Dates (local calendar days as YYYY-MM-DD) ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (t: number | Date) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const u = new Date(Date.UTC(y, m - 1, d + n));
  return `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())}`;
};
export const isIsoDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const hhmm = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* ---------- Formatting ---------- */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${pad(Math.round(s) % 60)}`;
export const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};
// Time boxes fill like a microwave: digits enter from the right. 1 → 0:01, 130 → 1:30, 1230 → 12:30.
export const fmtTime = (raw: string) => {
  const d = String(raw).replace(/\D/g, "").replace(/^0+/, "").slice(-4);
  if (!d) return "";
  const p = d.padStart(3, "0");
  return `${+p.slice(0, -2)}:${p.slice(-2)}`;
};
export const toSec = (t: string) => {
  const [m, s] = String(t).split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
};

/* ---------- Sheet rows ---------- */
// Sessions: Session | Date | Cycle | Day | Workout | Start | Finish | Duration (min) | Sets | Avg rest (s) | Sauna | Stretch
export type SessionRow = { n: number; date: string; cycle: number; day: number; workout: string; start: string; dur: number; sets: number; rest: number };
// Sets: Session | Date | Cycle | Day | Workout | Exercise | Movement | Set | Reps | Time (s) | Weight (kg) | Rest after (s)
export type SetRow = { n: number; day: number; workout: string; exercise: string; movement: string; set: number; reps: number | null; sec: number | null };

export type DoneInfo = { t: string; dur: number; sets: number; rest: number; dayIndex: number };
export type View =
  | { kind: "plan"; dayIndex: number; cycle: number }
  | { kind: "rest"; dayIndex: number; cycle: number }
  | { kind: "lock"; dayIndex: number; cycle: number; done: DoneInfo };

/**
 * Where the cycle stands today, from the Sessions log.
 * Rest days pass on their own: a planned rest day lasts one calendar day (the day
 * after the last workout, or later), then the cycle moves on. Extra days off
 * never advance it. Returns any Rest rows that now need logging.
 */
export function derive(plan: Plan, rows: SessionRow[], today: string) {
  const toLog: Omit<SessionRow, "n">[] = [];
  let last: Omit<SessionRow, "n"> | undefined = rows[rows.length - 1];
  for (let guard = 0; guard <= plan.length; guard++) {
    const dayIndex: number = last ? last.day % plan.length : 0;
    const cycle: number = last ? last.cycle + (last.day >= plan.length ? 1 : 0) : 1;
    if (last && last.workout !== "Rest" && last.date === today) {
      const di = last.day - 1;
      return { toLog, view: { kind: "lock", dayIndex, cycle, done: { t: last.workout, dur: last.dur * 60, sets: last.sets, rest: last.rest, dayIndex: di } } as View };
    }
    if (!plan[dayIndex].rest) return { toLog, view: { kind: "plan", dayIndex, cycle } as View };
    const restDate: string = last ? addDays(last.date, 1) : today;
    if (restDate >= today) return { toLog, view: { kind: "rest", dayIndex, cycle } as View };
    last = { date: restDate, cycle, day: dayIndex + 1, workout: "Rest", start: "", dur: 0, sets: 0, rest: 0 };
    toLog.push(last);
  }
  return { toLog, view: { kind: "plan", dayIndex: 0, cycle: 1 } as View };
}

/** "Last time" numbers for a day: ghosts[item][set][movement], from that day's most recent session. */
export function ghostsFor(plan: Plan, dayIndex: number, sets: SetRow[]) {
  const day = plan[dayIndex];
  const mine = sets.filter((r) => r.day === dayIndex + 1 && r.workout === day.t);
  const lastN = mine.reduce((a, r) => Math.max(a, r.n), 0);
  const out: Record<number, string[][]> = {};
  (day.x || []).forEach((it, i) => {
    if (isTimed(it)) return;
    const name = it.m.join(" + ");
    mine.filter((r) => r.n === lastN && r.exercise === name).forEach((r) => {
      const k = it.m.indexOf(r.movement);
      if (k < 0 || r.set < 1) return;
      const g = (out[i] = out[i] || []);
      while (g.length < r.set) g.push(it.m.map(() => ""));
      g[r.set - 1][k] = it.unit === "time" ? (r.sec != null ? mmss(r.sec) : "") : r.reps != null ? String(r.reps) : "";
    });
  });
  return out;
}

/* ---------- Finish payload (page → server) ---------- */
export type FinishSet = { exercise: string; movement: string; set: number; reps: number | null; sec: number | null; kg: number | null; restAfter: number | null };
export type FinishBody = {
  date: string; dayIndex: number; cycle: number;
  start: string; finish: string; durMin: number;
  sets: number; avgRest: number;
  timed: Record<string, boolean>;
  rows: FinishSet[];
};
