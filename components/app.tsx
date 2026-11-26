"use client";

import { useCallback, useEffect, useState } from "react";
import { dayKey, type View } from "@/lib/cycle";
import { api, load, save } from "@/lib/client";
import type { Plan } from "@/lib/plans";
import { Icon } from "./icon";
import { Login } from "./login";
import { Workout } from "./workout";

type Data =
  | { person: string; ready: false }
  | { person: string; ready: true; plan: Plan; view: View; ghosts: Record<number, string[][]> };
type Cached = { today: string; data: Data | null };
const CACHE = "training.state.v1";

export function App() {
  const [phase, setPhase] = useState<"boot" | "login" | "error" | "ready">("boot");
  const [data, setData] = useState<Data | null>(null);

  // Today's view from the Sheet. Offline (bad gym signal) falls back to the last
  // copy from today, so a reload mid-workout still opens.
  const reload = useCallback(async () => {
    const today = dayKey(Date.now());
    try {
      const res = await api(`/api/state?today=${today}`);
      if (res.status === 401) { setPhase("login"); return false; }
      if (!res.ok) throw new Error(String(res.status));
      const d: Data = await res.json();
      save(CACHE, { today, data: d });
      setData(d); setPhase("ready");
      return true;
    } catch {
      const c = load<Cached>(CACHE, { today: "", data: null });
      if (c.today === today && c.data) { setData((x) => x ?? c.data); setPhase("ready"); }
      else setPhase((p) => (p === "ready" ? p : "error"));
      return false;
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const signOut = async () => { await api("/api/login", { method: "DELETE" }); save(CACHE, {}); setData(null); setPhase("login"); };

  if (phase === "boot") return <div className="boot"><i /></div>;
  if (phase === "login") return <Login onIn={() => { setPhase("boot"); reload(); }} />;
  if (phase === "error" || !data)
    return (
      <div className="app in" data-view="rest">
        <section className="center">
          <div className="moon"><Icon n="grid" /></div>
          <p className="note">Can&apos;t reach the log</p>
          <button className="round primary" aria-label="Try again" onClick={() => { setPhase("boot"); reload(); }}><Icon n="retry" /></button>
        </section>
      </div>
    );
  if (!data.ready)
    return (
      <div className="app in" data-view="rest">
        <button className="ghostbtn" aria-label="Sign out" onClick={signOut}><Icon n="out" /></button>
        <section className="center">
          <div className="badge"><Icon n="lock" /></div>
          <h1>{data.person}</h1>
          <p className="note">Plan not set up yet</p>
        </section>
      </div>
    );
  return <Workout who={data.person} plan={data.plan} served={data.view} ghosts={data.ghosts} reload={reload} />;
}
