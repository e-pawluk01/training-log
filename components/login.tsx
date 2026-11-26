"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { PEOPLE, PERSON_KEYS, type PersonKey } from "@/lib/plans";
import { Icon } from "./icon";

// Same sign-in as OS: pick who you are, then your password.
export function Login({ onIn }: { onIn: () => void }) {
  const [who, setWho] = useState<PersonKey | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!who) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api("/api/login", { method: "POST", body: JSON.stringify({ who, password }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not sign in");
      onIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="box">
        <div className="crest">
          <div><Icon n="lock" /></div>
          <h2>Training Log</h2>
        </div>

        {!who ? (
          <div className="who">
            {PERSON_KEYS.map((k) => (
              <button key={k} onClick={() => setWho(k)}>
                <span>{PEOPLE[k].name}</span>
                <Icon n="right" />
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="as">
              <button type="button" aria-label="Back" onClick={() => { setWho(null); setPassword(""); setError(null); }}>
                <Icon n="left" />
              </button>
              <span>Authenticating as <b>{PEOPLE[who].name}</b></span>
            </div>
            <input type="password" placeholder="Enter Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required autoComplete="current-password" />
            {error && <p className="err">{error}</p>}
            <button type="submit" className="go" disabled={busy}>{busy ? "Decrypting..." : "Access"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
