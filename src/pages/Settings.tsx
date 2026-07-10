import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  CalendarInfo,
  CalendarPrefs,
  calendarWritable,
  disconnectGoogle,
  getConnectionStatus,
  listCalendars,
  loadPrefs,
  savePrefs,
  startGoogleConnect,
} from "../lib/calendar";

interface DataStats {
  entries: number;
  words: number;
  bytes: number;
}

type CalConn =
  | { state: "loading" }
  | { state: "disconnected" }
  | { state: "reconnect"; email: string | null }
  | { state: "connected"; email: string | null }
  | { state: "error" };

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

  const [params, setParams] = useSearchParams();
  const [calNotice, setCalNotice] = useState<"connected" | "error" | null>(null);
  const [cal, setCal] = useState<CalConn>({ state: "loading" });
  const [calList, setCalList] = useState<CalendarInfo[]>([]);
  const [calPrefs, setCalPrefs] = useState<CalendarPrefs>({ hidden: [], defaultCalendar: null });
  const [calBusy, setCalBusy] = useState(false);

  // Rückmeldung nach dem OAuth-Redirect (?calendar=connected|error)
  useEffect(() => {
    const flag = params.get("calendar");
    if (flag === "connected" || flag === "error") {
      setCalNotice(flag);
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCalendarSection = async () => {
    setCal({ state: "loading" });
    try {
      const status = await getConnectionStatus();
      if (!status.connected) {
        setCal({ state: "disconnected" });
        return;
      }
      if (status.needsReconnect) {
        setCal({ state: "reconnect", email: status.email });
        return;
      }
      const [cals, prefs] = await Promise.all([listCalendars(), loadPrefs(userId)]);
      setCalList(cals);
      setCalPrefs(prefs);
      setCal({ state: "connected", email: status.email });
    } catch {
      setCal({ state: "error" });
    }
  };

  useEffect(() => {
    loadCalendarSection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const connectGoogle = async () => {
    setCalBusy(true);
    try {
      window.location.href = await startGoogleConnect();
    } catch {
      setCalBusy(false);
      setCal({ state: "error" });
    }
  };

  const disconnect = async () => {
    if (
      !window.confirm(
        "Google Kalender wirklich trennen? Die gespeicherten Zugriffstokens werden gelöscht und bei Google widerrufen."
      )
    )
      return;
    setCalBusy(true);
    try {
      await disconnectGoogle();
      setCalList([]);
      setCal({ state: "disconnected" });
    } catch {
      setCal({ state: "error" });
    } finally {
      setCalBusy(false);
    }
  };

  const updatePrefs = async (next: CalendarPrefs) => {
    setCalPrefs(next);
    try {
      await savePrefs(userId, next);
    } catch {
      /* nächster Load stellt den gespeicherten Stand wieder her */
    }
  };

  const toggleCalendarVisible = (id: string) => {
    const hidden = calPrefs.hidden.includes(id)
      ? calPrefs.hidden.filter((x) => x !== id)
      : [...calPrefs.hidden, id];
    updatePrefs({ ...calPrefs, hidden });
  };

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
        <h2>Kalender-Integration</h2>

        {calNotice === "connected" && (
          <div className="alert" style={{ marginBottom: "var(--s3)", background: "var(--accent-soft)", borderColor: "var(--accent-border)" }}>
            <span className="alert-ico" aria-hidden="true" style={{ color: "var(--accent)" }}>✓</span>
            <div>Google Kalender wurde erfolgreich verbunden.</div>
          </div>
        )}
        {calNotice === "error" && (
          <div className="alert" style={{ marginBottom: "var(--s3)" }}>
            <span className="alert-ico" aria-hidden="true">!</span>
            <div>Die Verbindung mit Google ist fehlgeschlagen. Bitte versuche es erneut.</div>
          </div>
        )}

        {cal.state === "loading" && (
          <>
            <div className="skeleton skel-line w60" />
            <div className="skeleton skel-line w40" />
          </>
        )}

        {cal.state === "error" && (
          <div className="alert">
            <span className="alert-ico" aria-hidden="true">!</span>
            <div>
              Der Verbindungsstatus konnte nicht geladen werden.
              <div className="alert-actions">
                <button type="button" className="link-btn" onClick={loadCalendarSection}>
                  Erneut versuchen
                </button>
              </div>
            </div>
          </div>
        )}

        {cal.state === "disconnected" && (
          <>
            <p className="section-hint">
              Verbinde dein Google-Konto, um deine Kalender direkt in der App anzuzeigen
              und Termine zu erstellen, zu bearbeiten und zu löschen. Die Zugriffstokens
              werden ausschließlich serverseitig gespeichert.
            </p>
            <button type="button" className="primary" disabled={calBusy} onClick={connectGoogle}>
              {calBusy ? "Öffnet Google…" : "Google Kalender verbinden"}
            </button>
          </>
        )}

        {cal.state === "reconnect" && (
          <>
            <div className="stat-row">
              <span className="muted">Status</span>
              <strong style={{ color: "var(--error)" }}>Verbindung abgelaufen</strong>
            </div>
            {cal.email && (
              <div className="stat-row">
                <span className="muted">Google-Konto</span>
                <strong>{cal.email}</strong>
              </div>
            )}
            <button type="button" className="primary" disabled={calBusy} onClick={connectGoogle}>
              {calBusy ? "Öffnet Google…" : "Erneut mit Google verbinden"}
            </button>
            <button type="button" className="btn-secondary" disabled={calBusy} onClick={disconnect}>
              Verbindung trennen
            </button>
          </>
        )}

        {cal.state === "connected" && (
          <>
            <div className="stat-row">
              <span className="muted">Status</span>
              <strong style={{ color: "var(--good)" }}>Verbunden</strong>
            </div>
            {cal.email && (
              <div className="stat-row">
                <span className="muted">Google-Konto</span>
                <strong>{cal.email}</strong>
              </div>
            )}

            {calList.length > 0 && (
              <>
                <p className="q-label" style={{ marginTop: "var(--s4)" }}>Sichtbare Kalender</p>
                <div className="cal-pref-list">
                  {calList.map((c) => {
                    const visible = !calPrefs.hidden.includes(c.id);
                    return (
                      <label key={c.id} className="cal-pref-row">
                        <input
                          type="checkbox"
                          checked={visible}
                          onChange={() => toggleCalendarVisible(c.id)}
                        />
                        <span className="cal-dot" style={{ background: c.color || "var(--accent)" }} />
                        <span className="cal-pref-name">{c.name}</span>
                        {!calendarWritable(c) && <span className="cal-badge">Schreibgeschützt</span>}
                        {c.primary && <span className="cal-badge">Haupt</span>}
                      </label>
                    );
                  })}
                </div>

                <label htmlFor="cal-default" style={{ marginTop: "var(--s3)" }}>
                  Standardkalender für neue Termine
                </label>
                <select
                  id="cal-default"
                  value={calPrefs.defaultCalendar || ""}
                  onChange={(e) =>
                    updatePrefs({ ...calPrefs, defaultCalendar: e.target.value || null })
                  }
                >
                  <option value="">Automatisch (Hauptkalender)</option>
                  {calList.filter(calendarWritable).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            <button type="button" className="btn-secondary" disabled={calBusy} onClick={disconnect}>
              {calBusy ? "Trennt…" : "Verbindung trennen"}
            </button>
          </>
        )}
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
