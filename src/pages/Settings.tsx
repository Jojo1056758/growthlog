import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface DataStats {
  entries: number;
  words: number;
  bytes: number;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

export default function Settings({ userId, email }: { userId: string; email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<DataStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatsLoading(true);
      setStatsError(false);
      // Nur Daten des angemeldeten Nutzers (RLS + expliziter user_id-Filter).
      const [entries, words] = await Promise.all([
        supabase
          .from("daily_entries")
          .select("entry_date, answers, schema_version, created_at, updated_at")
          .eq("user_id", userId),
        supabase
          .from("user_words")
          .select("*")
          .eq("user_id", userId),
      ]);
      if (cancelled) return;
      if (entries.error || words.error) {
        setStatsError(true);
        setStatsLoading(false);
        return;
      }
      const entryRows = entries.data || [];
      const wordRows = words.data || [];
      // Geschätzte Größe = Serialisierung der tatsächlich gespeicherten
      // App-Daten dieses Nutzers (nicht die gesamte Datenbank).
      const bytes = new Blob([JSON.stringify({ daily_entries: entryRows, user_words: wordRows })])
        .size;
      setStats({ entries: entryRows.length, words: wordRows.length, bytes });
      setStatsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const exportData = async () => {
    setBusy(true);
    setError(null);
    try {
      const [entries, words] = await Promise.all([
        supabase
          .from("daily_entries")
          .select("entry_date, answers, schema_version, created_at, updated_at")
          .eq("user_id", userId)
          .order("entry_date", { ascending: true }),
        supabase
          .from("user_words")
          .select(
            "word, definition, example, notes, review_count, correct_count, last_reviewed_at, created_at"
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
      ]);
      if (entries.error) throw entries.error;
      if (words.error) throw words.error;
      const payload = {
        exported_at: new Date().toISOString(),
        daily_entries: entries.data,
        user_words: words.data,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `growthlog-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>Mehr</h1>

      <div className="card">
        <h2>Konto</h2>
        <div className="stat-row">
          <span className="muted">Angemeldet als</span>
          <strong>{email || "–"}</strong>
        </div>
        <button type="button" className="btn-secondary" onClick={signOut}>
          Abmelden
        </button>
      </div>

      <div className="card">
        <h2>Deine gespeicherten Daten</h2>

        {statsLoading && (
          <>
            <div className="skeleton skel-line w60" />
            <div className="skeleton skel-line w40" />
          </>
        )}

        {!statsLoading && statsError && (
          <div className="alert">
            <span className="alert-ico" aria-hidden="true">!</span>
            <div>Die Datenübersicht konnte nicht geladen werden. Bitte später erneut versuchen.</div>
          </div>
        )}

        {!statsLoading && !statsError && stats && (
          stats.entries === 0 && stats.words === 0 ? (
            <p className="section-hint" style={{ margin: 0 }}>
              Noch keine gespeicherten Daten vorhanden.
            </p>
          ) : (
            <>
              <div className="stat-row" style={{ marginBottom: "var(--s3)" }}>
                <span>Geschätzte Größe deiner gespeicherten App-Daten</span>
                <strong style={{ fontSize: "1.3rem" }}>{formatBytes(stats.bytes)}</strong>
              </div>
              <p className="stat-sub" style={{ margin: "0 0 var(--s3) 0" }}>
                {stats.entries} Tagebucheinträge · {stats.words} Wörter
              </p>
              <p className="stat-sub" style={{ margin: 0 }}>
                Die Schätzung basiert auf dem Inhalt deiner App-Daten und enthält nicht den
                technischen Datenbank-Overhead von Supabase.
              </p>
            </>
          )
        )}
      </div>

      <div className="card">
        <h2>Export</h2>
        <p className="section-hint">
          Exportiert alle Einträge und Wörter als JSON-Datei – z. B. als Backup.
        </p>
        {error && (
          <div className="alert" style={{ marginBottom: "var(--s3)" }}>
            <span className="alert-ico" aria-hidden="true">!</span>
            <div>Der Export ist fehlgeschlagen. Bitte versuche es später erneut.</div>
          </div>
        )}
        <button type="button" className="primary" onClick={exportData} disabled={busy}>
          {busy ? "Exportiert…" : "Alle Daten exportieren"}
        </button>
      </div>

      <div className="card">
        <h2>Über GrowthLog</h2>
        <p className="section-hint" style={{ margin: 0 }}>
          Tägliches Tagebuch für Stimmung, Wachstum, soziale Situationen, Träume und
          Vokabeln. Deine Daten liegen in deinem eigenen Supabase-Projekt und sind durch
          Row Level Security nur für dich sichtbar.
        </p>
      </div>
    </div>
  );
}
