import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Answers } from "../lib/schema";

interface EntryRow {
  entry_date: string;
  answers: Answers;
}

const formatDate = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export default function History({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("daily_entries")
        .select("entry_date, answers")
        .eq("user_id", userId)
        .order("entry_date", { ascending: false })
        .limit(180);
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else {
        setEntries((data as EntryRow[]) || []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="page">
      <h1>Verlauf</h1>

      {loading && (
        <div className="history-list">
          {[0, 1, 2, 3].map((i) => (
            <div className="history-item" key={i}>
              <div className="skeleton skel-line w40" />
              <div className="skeleton skel-line w80" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="alert">
          <span className="alert-ico" aria-hidden="true">!</span>
          <div>
            Der Verlauf konnte gerade nicht geladen werden. Bitte prüfe deine
            Verbindung und versuche es erneut.
          </div>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="card empty">
          <span className="empty-ico" aria-hidden="true">🗓️</span>
          <p className="empty-title">Noch keine Einträge</p>
          <p>Starte im Bereich „Heute" mit deinem ersten Eintrag.</p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="history-list">
          {entries.map((e) => {
            const mood = e.answers?.mood_overall as number | undefined;
            const summary = (e.answers?.day_summary as string) || "";
            const dreamText = (e.answers?.dream_text as string) || "";
            return (
              <Link className="history-item" to={`/?date=${e.entry_date}`} key={e.entry_date}>
                <div className="history-date">
                  <strong>{formatDate(e.entry_date)}</strong>
                  {typeof mood === "number" && (
                    <span className="mood-badge">Stimmung {mood}/10</span>
                  )}
                </div>
                {summary && <p className="muted small clamp">{summary}</p>}
                {dreamText && <p className="muted small clamp">Traum: {dreamText}</p>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
