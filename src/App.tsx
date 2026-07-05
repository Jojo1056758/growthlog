import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./lib/supabase";
import Auth from "./pages/Auth";
import Today from "./pages/Today";
import History from "./pages/History";
import Analyse from "./pages/Analyse";
import Words from "./pages/Words";
import Settings from "./pages/Settings";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card">
          <h1>Konfiguration fehlt</h1>
          <p className="muted">
            Die Umgebungsvariablen <code>VITE_SUPABASE_URL</code> und{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> sind nicht gesetzt. Bitte in Vercel unter
            Settings → Environment Variables eintragen und neu deployen.
          </p>
        </div>
      </div>
    );
  }

  if (!ready) return <div className="auth-wrap muted">Lädt…</div>;
  if (!session) return <Auth />;

  const userId = session.user.id;
  const email = session.user.email || "";

  return (
    <BrowserRouter>
      <main className="content">
        <Routes>
          <Route path="/" element={<Today userId={userId} />} />
          <Route path="/history" element={<History userId={userId} />} />
          <Route path="/analyse" element={<Analyse userId={userId} />} />
          <Route path="/words" element={<Words userId={userId} />} />
          <Route path="/settings" element={<Settings userId={userId} email={email} />} />
          <Route path="*" element={<Today userId={userId} />} />
        </Routes>
      </main>
      <nav className="bottom-nav">
        <NavLink to="/" end>
          Heute
        </NavLink>
        <NavLink to="/history">Verlauf</NavLink>
        <NavLink to="/analyse">Analyse</NavLink>
        <NavLink to="/words">Vörter</NavLink>
        <NavLink to="/settings">Mehr</NavLink>
      </nav>
    </BrowserRouter>
  );
}
