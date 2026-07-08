import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Settings({ userId, email }: { userId: string; email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <span>Angemeldet als</span>
          <strong>{email || "–"}</strong>
        </div>
        <button type="button" className="primary" onClick={signOut}>
          Abmelden
        </button>
      </div>

      <div className="card">
        <h2>Daten</h2>
        <p className="muted small">
          Exportiert alle Einträge und Wörter als JSON-Datei – z. B. als Backup.
        </p>
        {error && <p className="status error">{error}</p>}
        <button type="button" className="primary" onClick={exportData} disabled={busy}>
          {busy ? "Exportiert…" : "Alle Daten exportieren"}
        </button>
      </div>

      <div className="card">
        <h2>Über GrowthLog</h2>
        <p className="muted small">
          Tägliches Tagebuch für Stimmung, Wachstum, soziale Situationen, Träume und
          Vokabeln. Deine Daten liegen in deinem eigenen Supabase-Projekt und sind durch
          Row Level Security nur für dich sichtbar.
        </p>
      </div>
    </div>
  );
}
