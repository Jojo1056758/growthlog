import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalEvent,
  CalendarInfo,
  getConnectionStatus,
  listCalendars,
  listEvents,
  loadPrefs,
} from "../lib/calendar";

// Kompakte Kalenderübersicht für den Heute-Bereich.
// Wird nur gerendert, wenn ein Kalender verbunden ist – ohne Verbindung
// erscheint bewusst gar nichts (keine toten UI-Elemente im Tagebuch).

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmtTime = (d: Date) =>
  d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

type State =
  | { s: "hidden" }
  | { s: "loading" }
  | { s: "error" }
  | { s: "ready"; events: CalEvent[]; calendars: Map<string, CalendarInfo> };

export default function TodayCalendar({ userId }: { userId: string }) {
  const [state, setState] = useState<State>({ s: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getConnectionStatus();
        if (cancelled) return;
        if (!status.connected || status.needsReconnect) {
          setState({ s: "hidden" });
          return;
        }
        const [cals, prefs] = await Promise.all([listCalendars(), loadPrefs(userId)]);
        if (cancelled) return;
        const visible = cals.filter((c) => !prefs.hidden.includes(c.id));
        const start = startOfDay(new Date());
        const end = new Date(start.getTime() + 2 * 86400000); // heute + morgen
        const events = await listEvents(visible.map((c) => c.id), start, end);
        if (cancelled) return;
        const map = new Map<string, CalendarInfo>();
        cals.forEach((c) => map.set(c.id, c));
        setState({ s: "ready", events, calendars: map });
      } catch {
        if (!cancelled) setState({ s: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  if (state.s === "hidden") return null;

  if (state.s === "loading") {
    return (
      <div className="card">
        <div className="skeleton skel-line w40" />
        <div className="skeleton skel-line w80" />
      </div>
    );
  }

  if (state.s === "error") {
    return (
      <div className="card">
        <h2>Kalender</h2>
        <p className="section-hint" style={{ marginBottom: "var(--s2)" }}>
          Termine konnten gerade nicht geladen werden.
        </p>
        <button
          type="button"
          className="link-btn"
          style={{ padding: 0 }}
          onClick={() => {
            setState({ s: "loading" });
            setReloadKey((k) => k + 1);
          }}
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  const dayAfter = new Date(todayStart.getTime() + 2 * 86400000);

  const inRange = (e: CalEvent, from: Date, to: Date) =>
    e.start.getTime() < to.getTime() && e.end.getTime() > from.getTime();

  const todayEvents = state.events.filter((e) => inRange(e, todayStart, tomorrowStart));
  const tomorrowEvents = state.events.filter(
    (e) => inRange(e, tomorrowStart, dayAfter) && !inRange(e, todayStart, tomorrowStart)
  );
  const nextEvent = todayEvents
    .filter((e) => !e.allDay && e.start.getTime() > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

  const Row = ({ ev }: { ev: CalEvent }) => (
    <div className="cal-mini-row">
      <span
        className="cal-dot"
        style={{ background: state.calendars.get(ev.calendarId)?.color || "var(--accent)" }}
      />
      <span className="cal-mini-time">{ev.allDay ? "Ganztägig" : fmtTime(ev.start)}</span>
      <span className="cal-mini-title">{ev.title}</span>
    </div>
  );

  return (
    <div className="card">
      <div className="row-between" style={{ marginBottom: "var(--s2)" }}>
        <h2 style={{ margin: 0 }}>Kalender</h2>
        <Link className="link-btn" to="/calendar?new=1">
          ＋ Termin
        </Link>
      </div>

      {nextEvent && (
        <div className="cal-next">
          <span className="stat-sub">Nächster Termin</span>
          <div className="cal-mini-row" style={{ marginTop: 4 }}>
            <span
              className="cal-dot"
              style={{ background: state.calendars.get(nextEvent.calendarId)?.color || "var(--accent)" }}
            />
            <span className="cal-mini-time">{fmtTime(nextEvent.start)}</span>
            <strong className="cal-mini-title">{nextEvent.title}</strong>
          </div>
        </div>
      )}

      <p className="stat-sub" style={{ margin: "var(--s3) 0 4px" }}>Heute</p>
      {todayEvents.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>Keine Termine heute.</p>
      ) : (
        todayEvents.map((e) => <Row key={`${e.calendarId}|${e.id}`} ev={e} />)
      )}

      <p className="stat-sub" style={{ margin: "var(--s3) 0 4px" }}>Morgen</p>
      {tomorrowEvents.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>Keine Termine morgen.</p>
      ) : (
        tomorrowEvents.map((e) => <Row key={`${e.calendarId}|${e.id}`} ev={e} />)
      )}

      <Link className="link-btn" to="/calendar" style={{ display: "inline-block", marginTop: "var(--s3)", padding: 0 }}>
        Zum vollständigen Kalender →
      </Link>
    </div>
  );
}
