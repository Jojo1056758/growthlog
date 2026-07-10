import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalEvent,
  CalendarInfo,
  CalendarPrefs,
  Importance,
  calendarWritable,
  createEvent,
  deleteEvent,
  getConnectionStatus,
  getEvent,
  isReconnectError,
  listCalendars,
  listEvents,
  loadImportance,
  loadPrefs,
  moveEvent,
  setImportance,
  startGoogleConnect,
  updateEvent,
} from "../lib/calendar";

// ---------------- Datums-Helfer ----------------

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDaysIso = (iso: string, n: number) => isoDate(addDays(new Date(iso + "T12:00:00"), n));
const fmtTime = (d: Date) =>
  d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const fmtDayLong = (d: Date) =>
  d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
const fmtDayShort = (d: Date) =>
  d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const timeToHM = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

type ViewId = "day" | "week" | "month" | "agenda";
const VIEW_TABS: { id: ViewId; label: string }[] = [
  { id: "day", label: "Tag" },
  { id: "week", label: "Woche" },
  { id: "month", label: "Monat" },
  { id: "agenda", label: "Agenda" },
];

const AGENDA_DAYS = 30;

function rangeFor(view: ViewId, anchor: Date): { start: Date; end: Date } {
  const a = startOfDay(anchor);
  if (view === "day") return { start: a, end: addDays(a, 1) };
  if (view === "week") {
    const mon = mondayOf(a);
    return { start: mon, end: addDays(mon, 7) };
  }
  if (view === "month") {
    const first = new Date(a.getFullYear(), a.getMonth(), 1);
    const gridStart = mondayOf(first);
    const last = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    const gridEnd = addDays(mondayOf(last), 7);
    return { start: gridStart, end: gridEnd };
  }
  return { start: a, end: addDays(a, AGENDA_DAYS) };
}

const overlapsDay = (e: CalEvent, day: Date) => {
  const ds = startOfDay(day).getTime();
  const de = ds + 86400000;
  return e.start.getTime() < de && e.end.getTime() > ds;
};

const sortEvents = (list: CalEvent[]) =>
  [...list].sort((a, b) =>
    a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : a.start.getTime() - b.start.getTime()
  );

const REMINDER_OPTIONS = [
  { id: "default", label: "Kalender-Standard" },
  { id: "none", label: "Keine Erinnerung" },
  { id: "5", label: "5 Minuten vorher" },
  { id: "10", label: "10 Minuten vorher" },
  { id: "30", label: "30 Minuten vorher" },
  { id: "60", label: "1 Stunde vorher" },
  { id: "1440", label: "1 Tag vorher" },
];

const RECURRENCE_OPTIONS = [
  { id: "none", label: "Keine Wiederholung" },
  { id: "DAILY", label: "Täglich" },
  { id: "WEEKLY", label: "Wöchentlich" },
  { id: "MONTHLY", label: "Monatlich" },
  { id: "YEARLY", label: "Jährlich" },
];

const IMPORTANCE_LABEL: Record<Importance, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
};

// ---------------- Formular-Zustand ----------------

interface FormState {
  eventId: string | null; // null = neuer Termin
  originalCalendarId: string | null;
  calendarId: string;
  title: string;
  allDay: boolean;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  attendees: string;
  reminder: string;
  recurrence: string;
  allowRecurrence: boolean;
}

function emptyForm(defaultCalendar: string, base?: Date): FormState {
  const now = base || new Date();
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 3600000);
  return {
    eventId: null,
    originalCalendarId: null,
    calendarId: defaultCalendar,
    title: "",
    allDay: false,
    date: isoDate(start),
    endDate: isoDate(start),
    startTime: timeToHM(start),
    endTime: timeToHM(end),
    location: "",
    description: "",
    attendees: "",
    reminder: "default",
    recurrence: "none",
    allowRecurrence: true,
  };
}

function formFromEvent(ev: CalEvent, opts: { duplicate?: boolean; allowRecurrence: boolean }): FormState {
  const rrule = (ev.recurrence || []).find((r) => r.startsWith("RRULE:"));
  const freq = rrule ? (rrule.match(/FREQ=(\w+)/)?.[1] ?? "none") : "none";
  const reminder =
    ev.reminderMinutes === null
      ? "default"
      : ev.reminderMinutes.length === 0
        ? "none"
        : String(ev.reminderMinutes[0]);
  return {
    eventId: opts.duplicate ? null : ev.id,
    originalCalendarId: opts.duplicate ? null : ev.calendarId,
    calendarId: ev.calendarId,
    title: opts.duplicate ? `${ev.title} (Kopie)` : ev.title,
    allDay: ev.allDay,
    date: isoDate(ev.start),
    endDate: ev.allDay ? addDaysIso(isoDate(ev.end), -1) : isoDate(ev.end),
    startTime: ev.allDay ? "09:00" : timeToHM(ev.start),
    endTime: ev.allDay ? "10:00" : timeToHM(ev.end),
    location: ev.location,
    description: ev.description,
    attendees: ev.attendees.map((a) => a.email).join(", "),
    reminder,
    recurrence: opts.allowRecurrence ? freq : "none",
    allowRecurrence: opts.allowRecurrence,
  };
}

function buildGoogleEvent(f: FormState): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: f.title.trim() || "(Ohne Titel)",
    location: f.location.trim(),
    description: f.description.trim(),
  };
  if (f.allDay) {
    const endIso = f.endDate && f.endDate >= f.date ? f.endDate : f.date;
    body.start = { date: f.date };
    body.end = { date: addDaysIso(endIso, 1) }; // Google: Ende exklusiv
  } else {
    body.start = { dateTime: `${f.date}T${f.startTime}:00`, timeZone: TZ };
    body.end = { dateTime: `${f.endDate || f.date}T${f.endTime}:00`, timeZone: TZ };
  }
  const emails = f.attendees
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
  body.attendees = emails.map((email) => ({ email }));
  if (f.reminder === "default") body.reminders = { useDefault: true };
  else if (f.reminder === "none") body.reminders = { useDefault: false, overrides: [] };
  else
    body.reminders = {
      useDefault: false,
      overrides: [{ method: "popup", minutes: Number(f.reminder) }],
    };
  if (f.allowRecurrence) {
    body.recurrence = f.recurrence === "none" ? [] : [`RRULE:FREQ=${f.recurrence}`];
  }
  return body;
}

// ---------------- Hauptkomponente ----------------

type ConnState = "loading" | "disconnected" | "reconnect" | "connected" | "error";

export default function CalendarPage({ userId }: { userId: string }) {
  const [params, setParams] = useSearchParams();

  const [conn, setConn] = useState<ConnState>("loading");
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [prefs, setPrefs] = useState<CalendarPrefs>({ hidden: [], defaultCalendar: null });

  const [view, setView] = useState<ViewId>("day");
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()));

  const [events, setEvents] = useState<CalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [importanceMap, setImportanceMap] = useState<Record<string, Importance>>({});

  const [detail, setDetail] = useState<CalEvent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editScopeAsk, setEditScopeAsk] = useState<"edit" | "delete" | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [filterCal, setFilterCal] = useState("all");
  const [filterImp, setFilterImp] = useState("all");
  const [filterTime, setFilterTime] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const cacheRef = useRef(new Map<string, { t: number; events: CalEvent[] }>());
  const wantNewRef = useRef(params.get("new") === "1");

  const calById = useMemo(() => {
    const m = new Map<string, CalendarInfo>();
    calendars.forEach((c) => m.set(c.id, c));
    return m;
  }, [calendars]);

  const visibleCalendars = useMemo(
    () => calendars.filter((c) => !prefs.hidden.includes(c.id)),
    [calendars, prefs.hidden]
  );
  const writableCalendars = useMemo(() => calendars.filter(calendarWritable), [calendars]);
  const defaultCalendarId =
    prefs.defaultCalendar && writableCalendars.some((c) => c.id === prefs.defaultCalendar)
      ? prefs.defaultCalendar
      : writableCalendars.find((c) => c.primary)?.id || writableCalendars[0]?.id || "";

  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  // ---- Verbindung + Kalenderliste laden ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getConnectionStatus();
        if (cancelled) return;
        if (!status.connected) {
          setConn("disconnected");
          return;
        }
        if (status.needsReconnect) {
          setConn("reconnect");
          return;
        }
        const [cals, p] = await Promise.all([listCalendars(), loadPrefs(userId)]);
        if (cancelled) return;
        setCalendars(cals);
        setPrefs(p);
        setConn("connected");
      } catch (e) {
        if (cancelled) return;
        setConn(isReconnectError(e) ? "reconnect" : "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ---- Termine für den sichtbaren Zeitraum laden ----
  const visibleIdsKey = visibleCalendars.map((c) => c.id).sort().join("|");
  const fetchEvents = useCallback(
    async (force = false) => {
      if (conn !== "connected" || !visibleCalendars.length) {
        setEvents([]);
        return;
      }
      const key = `${range.start.getTime()}|${range.end.getTime()}|${visibleIdsKey}`;
      const cached = cacheRef.current.get(key);
      if (!force && cached && Date.now() - cached.t < 60000) {
        setEvents(cached.events);
        return;
      }
      setEventsLoading(true);
      setEventsError(false);
      try {
        const list = await listEvents(
          visibleCalendars.map((c) => c.id),
          range.start,
          range.end
        );
        cacheRef.current.set(key, { t: Date.now(), events: list });
        setEvents(list);
        const imp = await loadImportance(userId, list.map((e) => e.id));
        setImportanceMap(imp);
      } catch (e) {
        if (isReconnectError(e)) setConn("reconnect");
        else setEventsError(true);
      } finally {
        setEventsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conn, range.start.getTime(), range.end.getTime(), visibleIdsKey]
  );

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // ?new=1 → Formular direkt öffnen
  useEffect(() => {
    if (wantNewRef.current && conn === "connected" && defaultCalendarId) {
      wantNewRef.current = false;
      setForm(emptyForm(defaultCalendarId, anchor));
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, defaultCalendarId]);

  const invalidateAndReload = () => {
    cacheRef.current.clear();
    fetchEvents(true);
  };

  // ---- Aktionen ----
  const reconnect = async () => {
    setBusy(true);
    try {
      window.location.href = await startGoogleConnect();
    } catch {
      setBusy(false);
      setConn("error");
    }
  };

  const submitForm = async () => {
    if (!form) return;
    if (!form.calendarId) {
      setFormError("Kein beschreibbarer Kalender verfügbar.");
      return;
    }
    if (!form.allDay) {
      const s = `${form.date}T${form.startTime}`;
      const e = `${form.endDate || form.date}T${form.endTime}`;
      if (e <= s) {
        setFormError("Das Ende muss nach dem Beginn liegen.");
        return;
      }
    }
    setBusy(true);
    setFormError(null);
    try {
      const body = buildGoogleEvent(form);
      if (form.eventId === null) {
        await createEvent(form.calendarId, body);
      } else if (form.originalCalendarId && form.calendarId !== form.originalCalendarId) {
        await moveEvent(form.originalCalendarId, form.eventId, form.calendarId);
        await updateEvent(form.calendarId, form.eventId, body);
      } else {
        await updateEvent(form.calendarId, form.eventId, body);
      }
      setForm(null);
      setDetail(null);
      invalidateAndReload();
    } catch (e) {
      setFormError(
        isReconnectError(e)
          ? "Verbindung abgelaufen – bitte in den Einstellungen neu verbinden."
          : "Speichern fehlgeschlagen. Bitte erneut versuchen."
      );
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (ev: CalEvent, scope: "single" | "series") => {
    setBusy(true);
    try {
      const id = scope === "series" && ev.recurringEventId ? ev.recurringEventId : ev.id;
      await deleteEvent(ev.calendarId, id);
      setDetail(null);
      setConfirmDelete(false);
      setEditScopeAsk(null);
      invalidateAndReload();
    } catch {
      setEventsError(true);
    } finally {
      setBusy(false);
    }
  };

  const openEdit = async (ev: CalEvent, scope: "single" | "series") => {
    setEditScopeAsk(null);
    if (scope === "series" && ev.recurringEventId) {
      setBusy(true);
      try {
        const parent = await getEvent(ev.calendarId, ev.recurringEventId);
        if (parent) setForm(formFromEvent(parent, { allowRecurrence: true }));
      } catch {
        setFormError(null);
      } finally {
        setBusy(false);
      }
    } else {
      setForm(formFromEvent(ev, { allowRecurrence: !ev.recurringEventId }));
    }
  };

  const changeImportance = async (ev: CalEvent, value: Importance) => {
    const next = { ...importanceMap };
    if (value === "normal") delete next[ev.id];
    else next[ev.id] = value;
    setImportanceMap(next);
    try {
      await setImportance(userId, ev.id, value === "normal" ? null : value);
    } catch {
      /* Anzeige bleibt optimistisch; nächster Load korrigiert */
    }
  };

  // ---- Navigation ----
  const navigate = (dir: -1 | 1) => {
    if (view === "day") setAnchor(addDays(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else if (view === "month")
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
    else setAnchor(addDays(anchor, dir * AGENDA_DAYS));
  };

  const headerTitle = useMemo(() => {
    if (view === "day") return fmtDayLong(anchor);
    if (view === "week") {
      const mon = mondayOf(anchor);
      const sun = addDays(mon, 6);
      return `${mon.getDate()}.${mon.getMonth() + 1}. – ${sun.getDate()}.${sun.getMonth() + 1}.${sun.getFullYear()}`;
    }
    if (view === "month")
      return anchor.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    return `${AGENDA_DAYS} Tage ab ${anchor.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`;
  }, [view, anchor]);

  // ---- einfache Kennzahlen für den geladenen Zeitraum ----
  const rangeStats = useMemo(() => {
    const timed = events.filter((e) => !e.allDay);
    const hours = timed.reduce((sum, e) => sum + (e.end.getTime() - e.start.getTime()) / 3600000, 0);
    return { count: events.length, hours };
  }, [events]);

  // ---- Ereignis-Zeile ----
  const EventItem = ({ ev, showDate }: { ev: CalEvent; showDate?: boolean }) => {
    const cal = calById.get(ev.calendarId);
    const imp = importanceMap[ev.id];
    return (
      <button type="button" className="cal-event" onClick={() => setDetail(ev)}>
        <span className="cal-event-bar" style={{ background: cal?.color || "var(--accent)" }} />
        <span className="cal-event-time">
          {ev.allDay ? (
            <span className="cal-allday-chip">Ganztägig</span>
          ) : (
            <>
              {showDate && <span className="cal-event-date">{fmtDayShort(ev.start)}</span>}
              {fmtTime(ev.start)}
              <span className="cal-event-endtime">{fmtTime(ev.end)}</span>
            </>
          )}
        </span>
        <span className="cal-event-main">
          <span className="cal-event-title">
            {ev.title}
            {ev.recurringEventId && (
              <span className="cal-badge" title="Wiederholender Termin">↻</span>
            )}
            {imp === "high" && <span className="cal-badge imp-high">Hoch</span>}
            {imp === "low" && <span className="cal-badge imp-low">Niedrig</span>}
          </span>
          {ev.location && <span className="cal-event-loc">{ev.location}</span>}
        </span>
      </button>
    );
  };

  const DayList = ({ day, hideEmpty }: { day: Date; hideEmpty?: boolean }) => {
    const list = sortEvents(events.filter((e) => overlapsDay(e, day)));
    if (!list.length && hideEmpty) return null;
    return (
      <div className="cal-daylist">
        {list.length === 0 ? (
          <p className="cal-empty-day">Keine Termine</p>
        ) : (
          list.map((e) => <EventItem key={`${e.calendarId}|${e.id}`} ev={e} />)
        )}
      </div>
    );
  };

  // ---- Ansichten ----
  const renderDay = () => <DayList day={anchor} />;

  const renderWeek = () => {
    const mon = mondayOf(anchor);
    return (
      <div className="cal-week">
        {Array.from({ length: 7 }, (_, i) => addDays(mon, i)).map((day) => (
          <div key={isoDate(day)} className={`cal-week-day${sameDay(day, new Date()) ? " today" : ""}`}>
            <button
              type="button"
              className="cal-week-head"
              onClick={() => {
                setAnchor(day);
                setView("day");
              }}
            >
              {fmtDayShort(day)}
            </button>
            <DayList day={day} hideEmpty />
          </div>
        ))}
      </div>
    );
  };

  const renderMonth = () => {
    const weeks: Date[][] = [];
    let cur = range.start;
    while (cur < range.end) {
      weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cur, i)));
      cur = addDays(cur, 7);
    }
    const today = new Date();
    return (
      <div className="cal-month">
        <div className="cal-month-head">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div className="cal-month-row" key={wi}>
            {week.map((day) => {
              const dayEvents = events.filter((e) => overlapsDay(e, day));
              const inMonth = day.getMonth() === anchor.getMonth();
              return (
                <button
                  type="button"
                  key={isoDate(day)}
                  className={`cal-month-cell${inMonth ? "" : " out"}${sameDay(day, today) ? " today" : ""}`}
                  onClick={() => {
                    setAnchor(day);
                    setView("day");
                  }}
                >
                  <span className="cal-month-num">{day.getDate()}</span>
                  <span className="cal-month-dots">
                    {dayEvents.slice(0, 3).map((e, i) => (
                      <span
                        key={i}
                        className="cal-dot"
                        style={{ background: calById.get(e.calendarId)?.color || "var(--accent)" }}
                      />
                    ))}
                    {dayEvents.length > 3 && <span className="cal-more">+{dayEvents.length - 3}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const renderAgenda = () => {
    const now = Date.now();
    const q = search.trim().toLowerCase();
    const filtered = sortEvents(
      events.filter((e) => {
        if (filterCal !== "all" && e.calendarId !== filterCal) return false;
        if (filterImp !== "all" && (importanceMap[e.id] || "normal") !== filterImp) return false;
        if (filterTime === "upcoming" && e.end.getTime() < now) return false;
        if (filterTime === "past" && e.start.getTime() >= now) return false;
        if (filterType === "allday" && !e.allDay) return false;
        if (filterType === "timed" && e.allDay) return false;
        if (q && !e.title.toLowerCase().includes(q)) return false;
        return true;
      })
    ).sort((a, b) => a.start.getTime() - b.start.getTime());

    const groups = new Map<string, CalEvent[]>();
    for (const e of filtered) {
      const key = isoDate(e.start);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }

    return (
      <>
        <div className="cal-filters">
          <input
            type="text"
            placeholder="Nach Titel suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Termine durchsuchen"
          />
          <div className="cal-filter-row">
            <select value={filterCal} onChange={(e) => setFilterCal(e.target.value)} aria-label="Kalenderfilter">
              <option value="all">Alle Kalender</option>
              {visibleCalendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={filterImp} onChange={(e) => setFilterImp(e.target.value)} aria-label="Wichtigkeit">
              <option value="all">Jede Wichtigkeit</option>
              <option value="high">Hoch</option>
              <option value="normal">Normal</option>
              <option value="low">Niedrig</option>
            </select>
          </div>
          <div className="cal-filter-row">
            <select value={filterTime} onChange={(e) => setFilterTime(e.target.value)} aria-label="Zeitfilter">
              <option value="all">Gesamter Zeitraum</option>
              <option value="upcoming">Bevorstehend</option>
              <option value="past">Vergangen</option>
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="Termintyp">
              <option value="all">Alle Typen</option>
              <option value="timed">Mit Uhrzeit</option>
              <option value="allday">Ganztägig</option>
            </select>
          </div>
        </div>

        {groups.size === 0 ? (
          <div className="card empty">
            <span className="empty-ico" aria-hidden="true">🗓️</span>
            <p className="empty-title">Keine passenden Termine</p>
            <p>Passe Filter oder Zeitraum an.</p>
          </div>
        ) : (
          Array.from(groups.entries()).map(([key, list]) => (
            <div key={key} className="cal-agenda-group">
              <p className="cal-agenda-date">{fmtDayLong(new Date(key + "T12:00:00"))}</p>
              {list.map((e) => (
                <EventItem key={`${e.calendarId}|${e.id}`} ev={e} />
              ))}
            </div>
          ))
        )}
      </>
    );
  };

  // ---- Detail-Sheet ----
  const renderDetail = () => {
    if (!detail) return null;
    const ev = detail;
    const cal = calById.get(ev.calendarId);
    const writable = cal ? calendarWritable(cal) : false;
    const isRecurringInstance = Boolean(ev.recurringEventId);
    const imp = importanceMap[ev.id] || "normal";

    return (
      <div className="sheet-backdrop" onClick={() => { setDetail(null); setConfirmDelete(false); setEditScopeAsk(null); }}>
        <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grip" aria-hidden="true" />
          <div className="sheet-head">
            <h2 className="sheet-title">{ev.title}</h2>
            <button type="button" className="icon-btn" aria-label="Schließen" onClick={() => setDetail(null)}>
              ✕
            </button>
          </div>

          <div className="sheet-body">
            <p className="cal-detail-line">
              <span className="cal-dot" style={{ background: cal?.color || "var(--accent)" }} />
              {cal?.name || ev.calendarId}
              {!writable && <span className="cal-badge">Schreibgeschützt</span>}
            </p>
            <p className="cal-detail-line">
              {ev.allDay
                ? `${fmtDayLong(ev.start)}${!sameDay(ev.start, addDays(ev.end, -1)) ? ` – ${fmtDayLong(addDays(ev.end, -1))}` : ""} · Ganztägig`
                : `${fmtDayLong(ev.start)} · ${fmtTime(ev.start)} – ${fmtTime(ev.end)}`}
            </p>
            {isRecurringInstance && <p className="cal-detail-line muted">↻ Wiederholender Termin</p>}
            {ev.location && <p className="cal-detail-line">📍 {ev.location}</p>}
            {ev.hangoutLink && (
              <p className="cal-detail-line">
                <a className="link-btn" href={ev.hangoutLink} target="_blank" rel="noreferrer">
                  Videokonferenz öffnen
                </a>
              </p>
            )}
            {ev.reminderMinutes !== null && (
              <p className="cal-detail-line muted">
                🔔 {ev.reminderMinutes.length === 0 ? "Keine Erinnerung" : ev.reminderMinutes.map((m) => `${m} Min. vorher`).join(", ")}
              </p>
            )}
            {ev.attendees.length > 0 && (
              <div className="cal-detail-block">
                <p className="q-label" style={{ margin: "0 0 4px" }}>Teilnehmer</p>
                {ev.attendees.map((a) => (
                  <p key={a.email} className="muted small" style={{ margin: "2px 0" }}>
                    {a.email}
                    {a.organizer ? " (Organisator)" : ""}
                  </p>
                ))}
              </div>
            )}
            {ev.description && (
              <div className="cal-detail-block">
                <p className="q-label" style={{ margin: "0 0 4px" }}>Beschreibung</p>
                <p className="muted small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{ev.description}</p>
              </div>
            )}

            <div className="cal-detail-block">
              <p className="q-label" style={{ margin: "0 0 6px" }}>Wichtigkeit (nur in dieser App)</p>
              <div className="ynu">
                {(["low", "normal", "high"] as Importance[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={imp === v ? "pill active" : "pill"}
                    onClick={() => changeImportance(ev, v)}
                  >
                    {IMPORTANCE_LABEL[v]}
                  </button>
                ))}
              </div>
            </div>

            {writable && !editScopeAsk && !confirmDelete && (
              <div className="cal-detail-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => (isRecurringInstance ? setEditScopeAsk("edit") : openEdit(ev, "single"))}
                >
                  Bearbeiten
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setForm(formFromEvent(ev, { duplicate: true, allowRecurrence: true }))}
                >
                  Duplizieren
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => (isRecurringInstance ? setEditScopeAsk("delete") : setConfirmDelete(true))}
                >
                  Löschen
                </button>
              </div>
            )}

            {editScopeAsk && (
              <div className="cal-scope-ask">
                <p className="q-label" style={{ marginTop: 0 }}>
                  {editScopeAsk === "edit" ? "Was möchtest du bearbeiten?" : "Was möchtest du löschen?"}
                </p>
                <button
                  type="button"
                  className="btn btn-block"
                  disabled={busy}
                  onClick={() =>
                    editScopeAsk === "edit" ? openEdit(ev, "single") : doDelete(ev, "single")
                  }
                >
                  Nur diesen Termin
                </button>
                <button
                  type="button"
                  className="btn btn-block"
                  disabled={busy}
                  onClick={() =>
                    editScopeAsk === "edit" ? openEdit(ev, "series") : doDelete(ev, "series")
                  }
                >
                  Gesamte Serie
                </button>
                <button type="button" className="link-btn" onClick={() => setEditScopeAsk(null)}>
                  Abbrechen
                </button>
              </div>
            )}

            {confirmDelete && (
              <div className="cal-scope-ask">
                <p className="q-label" style={{ marginTop: 0 }}>Termin wirklich löschen?</p>
                <button type="button" className="btn btn-danger btn-block" disabled={busy} onClick={() => doDelete(ev, "single")}>
                  {busy ? "Löscht…" : "Ja, löschen"}
                </button>
                <button type="button" className="link-btn" onClick={() => setConfirmDelete(false)}>
                  Abbrechen
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ---- Termin-Formular ----
  const renderForm = () => {
    if (!form) return null;
    const f = form;
    const set = (patch: Partial<FormState>) => setForm({ ...f, ...patch });
    return (
      <div className="sheet-backdrop" onClick={() => !busy && setForm(null)}>
        <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grip" aria-hidden="true" />
          <div className="sheet-head">
            <h2 className="sheet-title">{f.eventId ? "Termin bearbeiten" : "Neuer Termin"}</h2>
            <button type="button" className="icon-btn" aria-label="Schließen" onClick={() => setForm(null)}>
              ✕
            </button>
          </div>
          <div className="sheet-body">
            <label htmlFor="ev-title">Titel</label>
            <input id="ev-title" type="text" value={f.title} onChange={(e) => set({ title: e.target.value })} />

            <label htmlFor="ev-cal">Kalender</label>
            <select id="ev-cal" value={f.calendarId} onChange={(e) => set({ calendarId: e.target.value })}>
              {writableCalendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div className="row-between" style={{ marginTop: "var(--s3)" }}>
              <span className="q-label" style={{ margin: 0 }}>Ganztägig</span>
              <div className="ynu" style={{ flex: "none" }}>
                <button type="button" className={f.allDay ? "pill active" : "pill"} onClick={() => set({ allDay: true })}>
                  Ja
                </button>
                <button type="button" className={!f.allDay ? "pill active" : "pill"} onClick={() => set({ allDay: false })}>
                  Nein
                </button>
              </div>
            </div>

            <div className="cal-form-grid">
              <div>
                <label htmlFor="ev-date">{f.allDay ? "Von" : "Datum"}</label>
                <input id="ev-date" type="date" value={f.date}
                  onChange={(e) => set({ date: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} />
              </div>
              <div>
                <label htmlFor="ev-enddate">Bis</label>
                <input id="ev-enddate" type="date" value={f.endDate} min={f.date}
                  onChange={(e) => set({ endDate: e.target.value })} />
              </div>
            </div>

            {!f.allDay && (
              <div className="cal-form-grid">
                <div>
                  <label htmlFor="ev-start">Beginn</label>
                  <input id="ev-start" type="time" value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="ev-end">Ende</label>
                  <input id="ev-end" type="time" value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} />
                </div>
              </div>
            )}

            <label htmlFor="ev-loc">Ort (optional)</label>
            <input id="ev-loc" type="text" value={f.location} onChange={(e) => set({ location: e.target.value })} />

            <label htmlFor="ev-desc">Beschreibung (optional)</label>
            <textarea id="ev-desc" rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} />

            <label htmlFor="ev-att">Teilnehmer (E-Mails, mit Komma getrennt)</label>
            <input id="ev-att" type="text" placeholder="name@example.com, …" value={f.attendees}
              onChange={(e) => set({ attendees: e.target.value })} />

            <label htmlFor="ev-rem">Erinnerung</label>
            <select id="ev-rem" value={f.reminder} onChange={(e) => set({ reminder: e.target.value })}>
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>

            {f.allowRecurrence && (
              <>
                <label htmlFor="ev-rec">Wiederholung</label>
                <select id="ev-rec" value={f.recurrence} onChange={(e) => set({ recurrence: e.target.value })}>
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </>
            )}

            <p className="stat-sub" style={{ marginTop: "var(--s3)" }}>Zeitzone: {TZ} (automatisch)</p>

            {formError && <p className="status error" style={{ marginTop: "var(--s2)" }}>{formError}</p>}

            <button type="button" className="primary" disabled={busy || !writableCalendars.length} onClick={submitForm}>
              {busy ? "Speichert…" : f.eventId ? "Änderungen speichern" : "Termin erstellen"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ---- Seitengerüst ----
  if (conn === "loading") {
    return (
      <div className="page">
        <h1>Kalender</h1>
        <div className="card">
          <div className="skeleton skel-line w40" />
          <div className="skeleton skel-line w80" />
          <div className="skeleton skel-line w60" />
        </div>
      </div>
    );
  }

  if (conn === "disconnected") {
    return (
      <div className="page">
        <h1>Kalender</h1>
        <div className="card empty">
          <span className="empty-ico" aria-hidden="true">🗓️</span>
          <p className="empty-title">Kein Kalender verbunden</p>
          <p>Verbinde deinen Google Kalender, um Termine hier anzuzeigen und zu bearbeiten.</p>
          <Link className="primary" to="/settings" style={{ textDecoration: "none", marginTop: "var(--s4)" }}>
            Zu den Einstellungen
          </Link>
        </div>
      </div>
    );
  }

  if (conn === "reconnect") {
    return (
      <div className="page">
        <h1>Kalender</h1>
        <div className="card empty">
          <span className="empty-ico" aria-hidden="true">🔑</span>
          <p className="empty-title">Verbindung abgelaufen</p>
          <p>Bitte melde dich erneut bei Google an, um den Kalender weiter zu nutzen.</p>
          <button type="button" className="primary" disabled={busy} onClick={reconnect}>
            {busy ? "Öffnet Google…" : "Erneut mit Google verbinden"}
          </button>
        </div>
      </div>
    );
  }

  if (conn === "error") {
    return (
      <div className="page">
        <h1>Kalender</h1>
        <div className="alert">
          <span className="alert-ico" aria-hidden="true">!</span>
          <div>
            Der Kalender konnte nicht geladen werden. Prüfe deine Verbindung.
            <div className="alert-actions">
              <button type="button" className="link-btn" onClick={() => window.location.reload()}>
                Erneut versuchen
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="row-between" style={{ marginBottom: "var(--s2)" }}>
        <h1 style={{ margin: 0 }}>Kalender</h1>
        <div className="row-gap" style={{ margin: 0 }}>
          <button type="button" className="icon-btn" aria-label="Aktualisieren" disabled={eventsLoading}
            onClick={() => fetchEvents(true)}>
            ⟳
          </button>
          <button type="button" className="icon-btn cal-add" aria-label="Neuer Termin"
            disabled={!writableCalendars.length}
            onClick={() => setForm(emptyForm(defaultCalendarId, anchor))}>
            ＋
          </button>
        </div>
      </div>

      <div className="segmented cal-views" role="tablist" aria-label="Kalenderansicht">
        {VIEW_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={view === t.id}
            className={view === t.id ? "active" : ""} onClick={() => setView(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="cal-nav">
        <button type="button" className="icon-btn" aria-label="Zurück" onClick={() => navigate(-1)}>
          ‹
        </button>
        <div className="cal-nav-title">
          <strong>{headerTitle}</strong>
          <button type="button" className="link-btn" onClick={() => setAnchor(startOfDay(new Date()))}>
            Heute
          </button>
        </div>
        <button type="button" className="icon-btn" aria-label="Weiter" onClick={() => navigate(1)}>
          ›
        </button>
      </div>

      <p className="stat-sub" style={{ margin: "0 0 var(--s3)" }}>
        {rangeStats.count} Termine · {rangeStats.hours.toFixed(1)} Std verplant
      </p>

      {eventsError && (
        <div className="alert" style={{ marginBottom: "var(--s3)" }}>
          <span className="alert-ico" aria-hidden="true">!</span>
          <div>
            Termine konnten nicht geladen werden.
            <div className="alert-actions">
              <button type="button" className="link-btn" onClick={() => fetchEvents(true)}>
                Erneut versuchen
              </button>
            </div>
          </div>
        </div>
      )}

      {eventsLoading ? (
        <div className="card">
          <div className="skeleton skel-line w60" />
          <div className="skeleton skel-line w80" />
          <div className="skeleton skel-line w40" />
        </div>
      ) : (
        <div className="card cal-card">
          {view === "day" && renderDay()}
          {view === "week" && renderWeek()}
          {view === "month" && renderMonth()}
          {view === "agenda" && renderAgenda()}
        </div>
      )}

      {renderDetail()}
      {renderForm()}
    </div>
  );
}
