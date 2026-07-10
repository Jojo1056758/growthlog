import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./lib/supabase";
import Auth from "./pages/Auth";
import Today from "./pages/Today";
import History from "./pages/History";
import Analyse from "./pages/Analyse";
import Words from "./pages/Words";
import Quiz from "./pages/Quiz";
import Settings from "./pages/Settings";
import CalendarPage from "./pages/Calendar";

const svgProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const IconToday = () => (
  <svg {...svgProps}>
    <path d="M12 3a6 6 0 0 0-6 6c0 2.5 1.5 3.8 2.3 5.2.4.7.7 1.3.7 1.8h6c0-.5.3-1.1.7-1.8C16.5 12.8 18 11.5 18 9a6 6 0 0 0-6-6Z" />
    <path d="M9.5 20h5M10 22h4" />
  </svg>
);
const IconHistory = () => (
  <svg {...svgProps}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 4v4h4M12 8v4l3 2" />
  </svg>
);
const IconChart = () => (
  <svg {...svgProps}>
    <path d="M4 4v16h16" />
    <path d="M8 15v-3M12 15V9M16 15v-6" />
  </svg>
);
const IconWords = () => (
  <svg {...svgProps}>
    <path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
    <path d="M17 20a3 3 0 0 0-3-3H5" />
  </svg>
);
const IconMore = () => (
  <svg {...svgProps}>
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </svg>
);
const IconCalendar = () => (
  <svg {...svgProps}>
    <rect x="4" y="5" width="16" height="16" rx="2.5" />
    <path d="M4 10h16M8 3v4M16 3v4" />
  </svg>
);

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
      <Shell userId={userId} email={email} />
    </BrowserRouter>
  );
}

function Shell({ userId, email }: { userId: string; email: string }) {
  const location = useLocation();
  const isQuiz = location.pathname.startsWith("/words/quiz");

  return (
    <>
      <main className="content">
        <Routes>
          <Route path="/" element={<Today userId={userId} />} />
          <Route path="/calendar" element={<CalendarPage userId={userId} />} />
          <Route path="/history" element={<History userId={userId} />} />
          <Route path="/analyse" element={<Analyse userId={userId} />} />
          <Route path="/words" element={<Words userId={userId} />} />
          <Route path="/words/quiz" element={<Quiz userId={userId} />} />
          <Route path="/settings" element={<Settings userId={userId} email={email} />} />
          <Route path="*" element={<Today userId={userId} />} />
        </Routes>
      </main>
      {!isQuiz && (
        <nav className="bottom-nav">
          <NavLink to="/" end>
            <span className="nav-ico" aria-hidden="true"><IconToday /></span>
            <span className="nav-label">Heute</span>
          </NavLink>
          <NavLink to="/calendar">
            <span className="nav-ico" aria-hidden="true"><IconCalendar /></span>
            <span className="nav-label">Kalender</span>
          </NavLink>
          <NavLink to="/history">
            <span className="nav-ico" aria-hidden="true"><IconHistory /></span>
            <span className="nav-label">Verlauf</span>
          </NavLink>
          <NavLink to="/analyse">
            <span className="nav-ico" aria-hidden="true"><IconChart /></span>
            <span className="nav-label">Analyse</span>
          </NavLink>
          <NavLink to="/words">
            <span className="nav-ico" aria-hidden="true"><IconWords /></span>
            <span className="nav-label">Wörter</span>
          </NavLink>
          <NavLink to="/settings">
            <span className="nav-ico" aria-hidden="true"><IconMore /></span>
            <span className="nav-label">Mehr</span>
          </NavLink>
        </nav>
      )}
    </>
  );
}
