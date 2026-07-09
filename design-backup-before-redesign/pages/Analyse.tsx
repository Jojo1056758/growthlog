import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Answers } from "../lib/schema";

interface EntryRow {
  entry_date: string;
  answers: Answers;
}

const METRICS: { id: string; label: string }[] = [
  { id: "mood_overall", label: "Gesamtstimmung" },
  { id: "energy", label: "Energie" },
  { id: "motivation", label: "Motivation" },
  { id: "stress", label: "Stress" },
  { id: "focus", label: "Fokus" },
  { id: "calm", label: "Innere Ruhe" },
  { id: "sleep_quality", label: "Schlafqualität" },
];

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

export default function Analyse({ userId }: { userId: string }) {
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
        .order("entry_date", { ascending: true })
        .limit(90);
      if (cancelled) return;
      if (error) setError(error.message);
      else setEntries((data as EntryRow[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const last30 = useMemo(() => entries.slice(-30), [entries]);

  const averages = useMemo(
    () =>
      METRICS.map((m) => {
        const values = last30
          .map((e) => num(e.answers?.[m.id]))
          .filter((v): v is number => v !== undefined);
        const avg = values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : undefined;
        return { ...m, avg, count: values.length };
      }),
    [last30]
  );

  const moodBars = useMemo(
    () =>
      last30.map((e) => ({
        date: e.entry_date,
        mood: num(e.answers?.mood_overall),
      })),
    [last30]
  );

  const streak = useMemo(() => {
    if (!entries.length) return 0;
    const dates = new Set(entries.map((e) => e.entry_date));
    let count = 0;
    const d = new Date();
    for (;;) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
      if (dates.has(iso)) {
        count += 1;
        d.setDate(d.getDate() - 1);
      } else if (count === 0) {
        // heute noch kein Eintrag – Streak ab gestern zählen
        d.setDate(d.getDate() - 1);
        const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`;
        if (!dates.has(y)) break;
      } else {
        break;
      }
    }
    return count;
  }, [entries]);

  return (
    <div className="page">
      <h1>Analyse</h1>
      {loading && <div className="card muted">Lädt…</div>}
      {error && <div className="card status error">{error}</div>}
      {!loading && !error && entries.length === 0 && (
        <div className="card muted">Noch keine Daten. Fülle zuerst ein paar Check-ins aus.</div>
      )}
      {!loading && !error && entries.length > 0 && (
        <>
          <div className="card">
            <h2>Überblick</h2>
            <div className="stat-row">
              <span>Einträge gesamt</span>
              <strong>{entries.length}</strong>
            </div>
            <div className="stat-row">
              <span>Aktuelle Serie</span>
              <strong>{streak} Tage</strong>
            </div>
          </div>

          <div className="card">
            <h2>Stimmungsverlauf (letzte 30 Einträge)</h2>
            <div className="bars">
              {moodBars.map((b) => (
                <div
                  key={b.date}
                  className="bar"
                  title={`${b.date}: ${b.mood ?? "–"}`}
                  style={{
                    height: b.mood ? `${b.mood * 10}%` : "2%",
                    opacity: b.mood ? 1 : 0.3,
                  }}
                />
              ))}
            </div>
            <p className="muted small">Balkenhöhe = Gesamtstimmung (1–10) pro Tag.</p>
          </div>

          <div className="card">
            <h2>Durchschnitt (letzte 30 Einträge)</h2>
            {averages.map((m) => (
              <div className="stat-row" key={m.id}>
                <span>
                  {m.label} <span className="muted small">({m.count}×)</span>
                </span>
                <strong>{m.avg !== undefined ? m.avg.toFixed(1) : "–"}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
