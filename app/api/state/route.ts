import { derive, ghostsFor, isIsoDay } from "@/lib/cycle";
import { personFrom, sheetOf } from "@/lib/person";
import { PEOPLE } from "@/lib/plans";
import { storeFor } from "@/lib/sheet";

// Today's view for the signed-in person. `today` is the phone's local date,
// so midnight is the person's midnight, not the server's.
export async function GET(req: Request) {
  const key = await personFrom(req);
  if (!key) return Response.json({ error: "Signed out" }, { status: 401 });
  const today = new URL(req.url).searchParams.get("today");
  if (!isIsoDay(today)) return Response.json({ error: "Bad date" }, { status: 400 });

  const { name, plan } = PEOPLE[key];
  const store = storeFor(key, sheetOf(key));
  if (!plan || !store) return Response.json({ person: name, ready: false });

  try {
    const sessions = await store.sessions();
    const { toLog, view } = derive(plan, sessions, today);
    if (toLog.length) {
      // Rest days that have passed get their own row in Sessions.
      const n0 = sessions.reduce((a, r) => Math.max(a, r.n), 0);
      await store.append("Sessions", toLog.map((r, i) => [n0 + i + 1, r.date, r.cycle, r.day, "Rest", "", "", "", "", "", "", ""]));
    }
    const ghosts = view.kind === "plan" ? ghostsFor(plan, view.dayIndex, await store.sets()) : {};
    return Response.json({ person: name, ready: true, plan, view, ghosts });
  } catch (e) {
    console.error("state", e);
    return Response.json({ error: "Could not read the log" }, { status: 502 });
  }
}
