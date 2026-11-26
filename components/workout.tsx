"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { dayKey, fmtTime, hhmm, hms, mmss, toSec, type DoneInfo, type FinishBody, type FinishSet, type View } from "@/lib/cycle";
import { api, load, save } from "@/lib/client";
import { isTimed, noWt, type Lift, type Plan } from "@/lib/plans";
import { Icon } from "./icon";

/* ---------- Local state (survives a reload mid-workout) ---------- */
type SetState = { r: string[]; w: (number | null)[] };
type ItemState = { sets?: SetState[]; done?: boolean };
type Rest = { sec: number; after: string | null };
type Session = { date: string; dayIndex: number; cycle: number; startedAt: number; items: ItemState[]; rests: Rest[]; lastCell: string | null };
type Timer = { start: number; end: number; total: number; from: number | null };
// A finished workout waiting to reach the Sheet. The lock screen shows from it straight away.
type Pending = { body: FinishBody; done: DoneInfo; next: number; cycle: number };
type Local = { session: Session | null; timer: Timer | null; tLast: number; pending: Pending | null };
const FRESH: Local = { session: null, timer: null, tLast: 90, pending: null };

const fmtW = (w: number) => String(Math.round(w * 10) / 10);
const eff = (sets: SetState[], j: number, k: number) => {
  for (let q = j; q >= 0; q--) if (sets[q].w[k] != null) return sets[q].w[k];
  return null;
};
const blankSet = (it: Lift): SetState => ({ r: it.m.map(() => ""), w: it.m.map(() => null) });
const hm = (ms: number) => { const m = Math.max(0, Math.ceil(ms / 60000)); return `${Math.floor(m / 60)}h ${m % 60}m`; };
const untilMidnight = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime() - Date.now(); };

// Rest logging: the rest timer's actual run time (full, or until you cancel it)
// is saved against the last set you logged. Sauna/Stretch timers are not rests.
function logRest(s: Session | null, t: Timer): Session | null {
  if (!s || t.from != null) return s;
  const sec = Math.round((Math.min(Date.now(), t.end) - t.start) / 1000);
  return sec < 5 ? s : { ...s, rests: [...s.rests, { sec, after: s.lastCell }] };
}

/* ---------- Sound: iOS can't vibrate from the web, so the alert is a chime and a flash ---------- */
let AC: AudioContext | null = null;
function ensureAudio() {
  try { const n = navigator as Navigator & { audioSession?: { type: string } }; if (n.audioSession) n.audioSession.type = "playback"; } catch {}
  try {
    const W = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    AC = AC || new (window.AudioContext || W.webkitAudioContext!)();
    if (AC.state === "suspended") AC.resume();
    const b = AC.createBuffer(1, 1, 22050), s = AC.createBufferSource();
    s.buffer = b; s.connect(AC.destination); s.start(0);
  } catch {}
}
function beep() {
  if (!AC) return;
  const t0 = AC.currentTime + 0.02;
  [0, 0.3, 0.6, 1.2, 1.5, 1.8].forEach((o) => {
    const os = AC!.createOscillator(), g = AC!.createGain();
    os.type = "sine"; os.frequency.value = 1046.5;
    g.gain.setValueAtTime(0.0001, t0 + o);
    g.gain.exponentialRampToValueAtTime(0.45, t0 + o + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o + 0.22);
    os.connect(g).connect(AC!.destination); os.start(t0 + o); os.stop(t0 + o + 0.25);
  });
}
const replay = (el: HTMLElement | null, cls: string) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

/* ---------- Bits ---------- */
function Dots({ plan, cur }: { plan: Plan; cur: number }) {
  return (
    <div className="dots" role="img" aria-label={`Day ${cur + 1} of ${plan.length}`}>
      {plan.map((d, i) => <i key={i} className={`${d.rest ? "rest" : ""} ${i === cur ? "cur" : i < cur ? "past" : ""}`} />)}
    </div>
  );
}

function Strip({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(count);
  const fade = useCallback(() => {
    const st = ref.current; if (!st) return;
    st.style.setProperty("--fl", st.scrollLeft > 2 ? "22px" : "0px");
    st.style.setProperty("--fr", st.scrollLeft + st.clientWidth < st.scrollWidth - 2 ? "22px" : "0px");
  }, []);
  useEffect(() => {
    fade();
    const st = ref.current;
    if (st && count > prev.current) requestAnimationFrame(() => { st.scrollTo({ left: st.scrollWidth, behavior: "smooth" }); fade(); });
    prev.current = count;
  }, [count, fade]);
  useEffect(() => { addEventListener("resize", fade); return () => removeEventListener("resize", fade); }, [fade]);
  return <div className="strip" ref={ref} onScroll={fade}><div className="sets">{children}</div></div>;
}

function Sheet({ onGone, children }: { onGone: () => void; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true))); return () => cancelAnimationFrame(r); }, []);
  const close = () => { setOpen(false); setTimeout(onGone, 500); };
  return (
    <div className={`sheetwrap ${open ? "open" : ""}`}>
      <div className="scrim" onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true"><div className="grab" />{children(close)}</div>
    </div>
  );
}

function WeightSheet({ name, set, start, onSave, onGone }: { name: string; set: number; start: number; onSave: (w: number) => void; onGone: () => void }) {
  const [v, setV] = useState(fmtW(start));
  const bump = (d: number) => setV(fmtW(Math.max(0, (parseFloat(v) || 0) + d)));
  return (
    <Sheet onGone={onGone}>
      {(close) => (<>
        <div className="sh-h"><Icon n="dumbbell" /><b>{name}</b><span>· Set {set}</span></div>
        <div className="step">
          <button className="rb" aria-label="Less" onClick={() => bump(-2.5)}><Icon n="minus" /></button>
          <label className="big"><input inputMode="decimal" autoComplete="off" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} aria-label="Weight in kilograms" /><span>kg</span></label>
          <button className="rb" aria-label="More" onClick={() => bump(2.5)}><Icon n="plus" /></button>
        </div>
        <button className="round primary" aria-label="Save weight" onClick={() => { onSave(Math.max(0, parseFloat(v) || 0)); close(); }}><Icon n="check" /></button>
      </>)}
    </Sheet>
  );
}

/* ---------- The app ---------- */
type Props = { who: string; plan: Plan; served: View; ghosts: Record<number, string[][]>; reload: () => Promise<boolean> };

export function Workout({ who, plan, served, ghosts, reload }: Props) {
  const KEY = `training.v1.${who.toLowerCase()}`;
  const [L, setRaw] = useState<Local>(() => load(KEY, FRESH));
  const Lref = useRef(L); Lref.current = L;
  const setL = useCallback((f: (l: Local) => Local) => setRaw((prev) => { const n = f(prev); save(KEY, n); Lref.current = n; return n; }), [KEY]);
  const [sheet, setSheet] = useState<null | { kind: "t" } | { kind: "w"; i: number; j: number; k: number }>(null);
  const [sync, setSync] = useState<"busy" | "ok" | "fail">("ok");
  const [hold, setHold] = useState(false);
  const [hint, setHint] = useState(false);
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const mainRef = useRef<HTMLButtonElement>(null), tbtnRef = useRef<HTMLButtonElement>(null), flashRef = useRef<HTMLDivElement>(null);

  // What to show: a just-finished workout locks the day even before the Sheet has it.
  const today = dayKey(Date.now());
  const p = L.pending && L.pending.body.date === today ? L.pending : null;
  const view: View = p ? { kind: "lock", dayIndex: p.next, cycle: p.cycle, done: p.done } : served;
  const session = L.session && view.kind === "plan" && L.session.dayIndex === view.dayIndex ? L.session : null;
  const on = !!session;
  const day = plan[view.dayIndex];

  useEffect(() => { if (L.session && !session) setL((l) => ({ ...l, session: null })); }, [L.session, session, setL]);

  /* Sheet sync */
  const flushing = useRef(false), lastTry = useRef(0);
  const flush = useCallback(async () => {
    const pend = Lref.current.pending;
    if (!pend || flushing.current) return;
    flushing.current = true; lastTry.current = Date.now(); setSync("busy");
    try {
      const [res] = await Promise.all([api("/api/finish", { method: "POST", body: JSON.stringify(pend.body) }), new Promise((r) => setTimeout(r, 900))]);
      if (!res.ok) throw new Error(String(res.status));
      setSync("ok");
      // Only drop the local copy once the server's view includes it.
      if (await reload()) setL((l) => (l.pending?.body.start === pend.body.start ? { ...l, pending: null } : l));
    } catch { setSync("fail"); } finally { flushing.current = false; }
  }, [reload, setL]);
  useEffect(() => { if (L.pending) flush(); }, [L.pending, flush]);

  /* Timer */
  const startTimer = (sec: number, from: number | null) => { const n = Date.now(); setL((l) => ({ ...l, timer: { start: n, end: n + sec * 1000, total: sec, from } })); };
  const fired = useRef(0);
  const fire = useCallback(() => {
    const t = Lref.current.timer; if (!t || fired.current === t.end) return;
    fired.current = t.end;
    setL((l) => {
      let s = logRest(l.session, t);
      if (s && t.from != null) s = { ...s, items: s.items.map((it, i) => (i === t.from ? { ...it, done: true } : it)) };
      return { ...l, timer: null, session: s };
    });
    beep();
    try { navigator.vibrate?.([300, 120, 300, 120, 300]); } catch {}
    replay(flashRef.current, "go"); replay(tbtnRef.current, "fired");
  }, [setL]);

  /* Clock: timers, rest retries, and midnight (the lock or rest screen gives way to the next workout) */
  const shownDay = useRef(today);
  useEffect(() => {
    const id = setInterval(() => {
      const l = Lref.current;
      if (l.timer && l.timer.end <= Date.now()) fire();
      const d = dayKey(Date.now());
      if (shownDay.current !== d && !l.session) { shownDay.current = d; reload(); }
      if (l.pending && !flushing.current && Date.now() - lastTry.current > 30000) flush();
      tick();
    }, 250);
    return () => clearInterval(id);
  }, [fire, flush, reload]);

  /* Session */
  const blankSets = (it: Lift, i: number) => Array.from({ length: Math.max(it.sets || 3, ghosts[i]?.length || 0) }, () => blankSet(it));
  const nudge = () => replay(mainRef.current, "nudge");
  const editSets = (i: number, f: (sets: SetState[]) => SetState[], lastCell?: string) =>
    setL((l) => l.session ? { ...l, session: { ...l.session, lastCell: lastCell ?? l.session.lastCell, items: l.session.items.map((it, q) => (q === i ? { ...it, sets: f(it.sets!) } : it)) } } : l);

  function start() {
    if (view.kind !== "plan" || !day.x) return;
    ensureAudio();
    const items = day.x.map((it, i) => (isTimed(it) ? { done: false } : { sets: blankSets(it, i) }));
    setL((l) => ({ ...l, session: { date: today, dayIndex: view.dayIndex, cycle: view.cycle, startedAt: Date.now(), items, rests: [], lastCell: null } }));
  }

  function finish() {
    const s = Lref.current.session; if (!s) return;
    const d = plan[s.dayIndex], end = Date.now(), rows: FinishSet[] = [];
    let sets = 0;
    const timed: Record<string, boolean> = {};
    (d.x || []).forEach((it, i) => {
      if (isTimed(it)) { timed[it.n] = !!s.items[i].done; return; }
      const st = s.items[i].sets || [];
      st.forEach((set, j) => {
        if (!set.r.some((v) => v !== "")) return;
        sets++;
        set.r.forEach((v, k) => {
          if (v === "") return;
          // One Sheet row per movement per set. Pairs share a set number.
          const time = it.unit === "time";
          const rest = s.rests.filter((r) => r.after === `${i}-${j}-${k}`).reduce((a, r) => a + r.sec, 0);
          rows.push({ exercise: it.m.join(" + "), movement: it.m[k], set: j + 1, reps: time ? null : +v, sec: time ? toSec(v) : null, kg: noWt(it, k) ? null : eff(st, j, k) ?? 0, restAfter: rest || null });
        });
      });
    });
    const avgRest = s.rests.length ? Math.round(s.rests.reduce((a, r) => a + r.sec, 0) / s.rests.length) : 0;
    const durMin = Math.round((end - s.startedAt) / 6000) / 10;
    const body: FinishBody = { date: s.date, dayIndex: s.dayIndex, cycle: s.cycle, start: hhmm(s.startedAt), finish: hhmm(end), durMin, sets, avgRest, timed, rows };
    const next = (s.dayIndex + 1) % plan.length;
    const pending: Pending = { body, done: { t: d.t, dur: durMin * 60, sets, rest: avgRest, dayIndex: s.dayIndex }, next, cycle: s.cycle + (next === 0 ? 1 : 0) };
    setTimeout(() => setL((l) => ({ ...l, session: null, timer: null, pending })), 260);
  }

  /* Hold to finish */
  const holdT = useRef<number | null>(null), holdAt = useRef(0);
  const release = () => {
    if (!holdT.current) return;
    clearTimeout(holdT.current); holdT.current = null; setHold(false);
    if (Date.now() - holdAt.current < 350) { setHint(true); setTimeout(() => setHint(false), 1400); }
  };
  const mainProps = {
    ref: mainRef,
    className: `main ${on ? "finish" : "start"} ${hold ? "hold" : ""} ${hint ? "hint" : ""}`,
    "aria-label": on ? "Hold to finish" : "Start",
    onClick: () => { if (!on) start(); },
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!on) return;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      holdAt.current = Date.now(); setHold(true);
      holdT.current = window.setTimeout(() => { holdT.current = null; setHold(false); finish(); }, 900);
    },
    onPointerUp: release,
    onPointerCancel: release,
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!holdT.current) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left - 20 || e.clientX > r.right + 20 || e.clientY < r.top - 20 || e.clientY > r.bottom + 20) release();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  /* Views */
  const left = L.timer ? Math.max(0, Math.ceil((L.timer.end - Date.now()) / 1000)) : 0;
  const timerBtn = (
    <button ref={tbtnRef} className={`tbtn ${L.timer ? "run" : ""}`} aria-label="Timer" onClick={() => { ensureAudio(); setSheet({ kind: "t" }); }}>
      <Icon n="timer" /><span className="tmini">{L.timer ? mmss(left) : ""}</span>
    </button>
  );
  const nextCard = (t: string) => (
    <div className="nextcard">
      <span><Icon n="next" /><b>{t}</b></span>
      <span className="lk"><Icon n="lock" /><span>{hm(untilMidnight())}</span></span>
    </div>
  );

  function cell(it: Lift, i: number, j: number, k: number, sets: SetState[]) {
    const v = sets[j].r[k], time = it.unit === "time";
    const ghost = ghosts[i]?.[j]?.[k] || "";
    const e = eff(sets, j, k);
    return (
      <div className="cell" key={k}>
        <input inputMode="numeric" pattern="[0-9]*" autoComplete="off" readOnly={!on}
          className={`${v !== "" ? "filled" : ""} ${time ? "time" : ""}`}
          placeholder={ghost || (time ? "0:00" : "")} value={v}
          aria-label={`${it.m[k]}, ${time ? "round" : "set"} ${j + 1}, ${time ? "minutes and seconds" : "reps"}`}
          onClick={(ev) => { if (!on) { ev.currentTarget.blur(); nudge(); } }}
          onChange={(ev) => {
            const nv = time ? fmtTime(ev.target.value) : ev.target.value.replace(/\D/g, "").slice(0, 3);
            editSets(i, (ss) => ss.map((s, q) => (q === j ? { ...s, r: s.r.map((x, kk) => (kk === k ? nv : x)) } : s)), nv !== "" ? `${i}-${j}-${k}` : undefined);
          }} />
        {!noWt(it, k) && (
          <button className="wt" aria-label={`${it.m[k]}, set ${j + 1}, weight`} onClick={() => (on ? setSheet({ kind: "w", i, j, k }) : nudge())}>
            {e == null || e === 0 ? <Icon n="dumbbell" /> : <b className={sets[j].w[k] != null ? "" : "carry"}>{fmtW(e)}</b>}
          </button>
        )}
      </div>
    );
  }

  function bar(it: NonNullable<typeof day.x>[number], i: number) {
    if (isTimed(it)) {
      const done = !!session?.items[i]?.done;
      return (
        <div className={`bar st ${done ? "done" : ""}`} style={{ "--d": i } as React.CSSProperties} key={i}>
          <div className="names"><div className="nm"><span>{it.n}</span></div></div>
          <button className="pill" aria-label={`Start ${it.timed / 60} minute ${it.n.toLowerCase()} timer`}
            onClick={() => { if (!on) return nudge(); ensureAudio(); startTimer(it.timed, i); }}>
            <Icon n={done ? "check" : "timer"} /><span>{mmss(it.timed)}</span>
          </button>
        </div>
      );
    }
    const sets = session?.items[i]?.sets || blankSets(it, i);
    const pair = it.m.length > 1;
    return (
      <div className={`bar ${pair ? "pair" : ""}`} style={{ "--d": i } as React.CSSProperties} key={i}>
        <div className="names">
          {pair && <Icon n="link" className="link" />}
          {it.m.map((n) => <div className="nm" key={n}><span>{n}</span></div>)}
        </div>
        <button className="add" aria-label="Add set" onClick={() => (on ? editSets(i, (ss) => [...ss, blankSet(it)]) : nudge())}><Icon n="plus" /></button>
        <Strip count={sets.length}>
          {sets.map((_, j) => (
            <div className={`col ${on && j >= (it.sets || 3) && j >= (ghosts[i]?.length || 0) ? "new" : ""}`} key={j}>
              {it.m.map((_, k) => cell(it, i, j, k, sets))}
            </div>
          ))}
        </Strip>
      </div>
    );
  }

  let content: ReactNode;
  if (view.kind === "lock") {
    const d = view.done;
    const syncState = p ? sync : "ok";
    content = (<>
      <header className="hdr"><div className="top"><Dots plan={plan} cur={d.dayIndex} /></div></header>
      <section className="center">
        <div className="badge"><Icon n="check" /></div>
        <h1>{d.t}</h1>
        <div className="stats">
          <span aria-label="Duration"><Icon n="clock" />{hms(d.dur * 1000)}</span>
          <span aria-label="Sets"><Icon n="stack" />{d.sets}</span>
          {d.rest > 0 && <span aria-label="Average rest"><Icon n="timer" />{mmss(d.rest)}</span>}
        </div>
        <button className={`sync ${syncState === "busy" ? "busy" : ""} ${syncState === "fail" ? "fail" : ""}`} disabled={syncState !== "fail"} onClick={flush}
          aria-label={syncState === "fail" ? "Not logged yet. Tap to retry" : syncState === "busy" ? "Logging to Google Sheets" : "Logged to Google Sheets"}>
          <Icon n="grid" /><span className="sy"><Icon n={syncState === "fail" ? "retry" : "check"} /></span>
        </button>
      </section>
      {nextCard(plan[view.dayIndex].t)}
      <div className="dock"><div className="dockin" /></div>
    </>);
  } else if (view.kind === "rest") {
    content = (<>
      <header className="hdr"><div className="top"><Dots plan={plan} cur={view.dayIndex} /></div></header>
      <section className="center"><div className="moon"><Icon n="moon" /></div><h1>Rest</h1></section>
      {nextCard(plan[(view.dayIndex + 1) % plan.length].t)}
      <div className="dock"><div className="dockin" /></div>
    </>);
  } else {
    content = (<>
      <header className="hdr">
        <div className="top"><Dots plan={plan} cur={view.dayIndex} /></div>
        <h1>{day.t}</h1>
        <div className={`clockwrap ${on ? "on" : ""}`}><div><div className="clock">{session ? hms(Date.now() - session.startedAt) : "0:00"}</div></div></div>
      </header>
      <main className={`list ${on ? "" : "idle"}`}>{(day.x || []).map(bar)}</main>
      <div className="dock"><div className="dockin">
        <button {...mainProps}>
          <svg className="ring" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="39" /></svg>
          <span className="ii i-start"><Icon n="play" /></span><span className="ii i-fin"><Icon n="check" /></span>
          <span className="hintb">Hold</span>
        </button>
        {timerBtn}
      </div></div>
    </>);
  }

  const w = sheet?.kind === "w" && session && day.x ? { it: day.x[sheet.i] as Lift, sets: session.items[sheet.i].sets!, ...sheet } : null;

  return (<>
    <div className="app in" key={`${view.kind}-${view.dayIndex}`} data-view={view.kind}>
      {content}
    </div>
    <div className="flash" ref={flashRef} />

    {w && (
      <WeightSheet name={w.it.m[w.k]} set={w.j + 1} start={eff(w.sets, w.j, w.k) || 0} onGone={() => setSheet(null)}
        onSave={(kg) => editSets(w.i, (ss) => ss.map((s, q) => (q === w.j ? { ...s, w: s.w.map((x, kk) => (kk === w.k ? kg : x)) } : s)))} />
    )}

    {sheet?.kind === "t" && (
      <Sheet onGone={() => setSheet(null)}>
        {(close) => {
          const run = !!L.timer;
          const step = (d: number) => setL((l) => l.timer
            ? { ...l, timer: { ...l.timer, end: Math.max(Date.now() + 1000, l.timer.end + d * 1000) } }
            : { ...l, tLast: Math.max(15, Math.min(3600, l.tLast + d)) });
          return (<>
            <div className="step">
              <button className="rb" aria-label="15 seconds less" onClick={() => step(-15)}><Icon n="minus" /></button>
              <div className="tbig">{run ? mmss(left) : mmss(L.tLast)}</div>
              <button className="rb" aria-label="15 seconds more" onClick={() => step(15)}><Icon n="plus" /></button>
            </div>
            <div className={`chips ${run ? "hide" : ""}`}>
              {[45, 60, 90, 120, 180].map((s) => (
                <button key={s} className={s === L.tLast ? "sel" : ""} onClick={() => setL((l) => ({ ...l, tLast: s }))}>{mmss(s)}</button>
              ))}
            </div>
            <button className="round primary" aria-label={run ? "Cancel timer" : "Start timer"}
              onClick={() => {
                if (run) setL((l) => (l.timer ? { ...l, session: logRest(l.session, l.timer), timer: null } : l));
                else { startTimer(L.tLast, null); close(); }
              }}>
              <Icon n={run ? "x" : "play"} />
            </button>
          </>);
        }}
      </Sheet>
    )}
  </>);
}
