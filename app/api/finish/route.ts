import { isIsoDay, type FinishBody } from "@/lib/cycle";
import { personFrom, sheetOf } from "@/lib/person";
import { PEOPLE } from "@/lib/plans";
import { storeFor } from "@/lib/sheet";

// A finished workout → one row in Sessions and one row per movement per set in Sets.
export async function POST(req: Request) {
  const key = await personFrom(req);
  if (!key) return Response.json({ error: "Signed out" }, { status: 401 });
  const { plan } = PEOPLE[key];
  const store = storeFor(key, sheetOf(key));
  if (!plan || !store) return Response.json({ error: "Not set up" }, { status: 400 });

  const b = (await req.json().catch(() => null)) as FinishBody | null;
  const day = b && plan[b.dayIndex];
  if (!b || !day || day.rest || !isIsoDay(b.date) || !Array.isArray(b.rows) || !/^\d\d:\d\d$/.test(b.start))
    return Response.json({ error: "Bad session" }, { status: 400 });

  try {
    const sessions = await store.sessions();
    // Already logged (a retry after a dropped connection): nothing to do.
    if (sessions.some((r) => r.date === b.date && r.day === b.dayIndex + 1 && r.start === b.start)) return Response.json({ ok: true });

    const n = sessions.reduce((a, r) => Math.max(a, r.n), 0) + 1;
    const head = [n, b.date, b.cycle, b.dayIndex + 1, day.t];
    const tick = (name: string) => (b.timed?.[name] ? "✓" : "");
    const blank = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "" : v);
    // Sets first, Sessions last: the Sessions row marks the workout as logged,
    // so a retry after a half-finished write only adds what is missing.
    if (!(await store.sets()).some((r) => r.n === n))
      await store.append("Sets", b.rows.map((r) => [...head, r.exercise, r.movement, r.set, blank(r.reps), blank(r.sec), blank(r.kg), blank(r.restAfter)]));
    await store.append("Sessions", [[...head, b.start, b.finish, Math.round(b.durMin * 10) / 10, b.sets, b.avgRest || "", tick("Sauna"), tick("Stretch")]]);
    return Response.json({ ok: true, n });
  } catch (e) {
    console.error("finish", e);
    return Response.json({ error: "Could not write the log" }, { status: 502 });
  }
}
