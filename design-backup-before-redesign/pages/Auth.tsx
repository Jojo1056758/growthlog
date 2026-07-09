import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setError(error.message);
        } else if (data.user && !data.session) {
          setInfo("Konto erstellt. Bitte E-Mail bestätigen und dann anmelden.");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>GrowthLog</h1>
        <p className="muted small">Dein tägliches Wachstums- und Stimmungstagebuch.</p>
        <form onSubmit={submit}>
          <label htmlFor="email">E-Mail</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="password">Passwort</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          {error && <p className="status error">{error}</p>}
          {info && <p className="status">{info}</p>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Bitte warten…" : mode === "login" ? "Anmelden" : "Konto erstellen"}
          </button>
        </form>
        <div className="row-gap">
          {mode === "login" ? (
            <button type="button" className="link-btn" onClick={() => setMode("signup")}>
              Noch kein Konto? Registrieren
            </button>
          ) : (
            <button type="button" className="link-btn" onClick={() => setMode("login")}>
              Schon ein Konto? Anmelden
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
