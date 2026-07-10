// Kalender-Schicht der App. Anbieterneutrale Typen + Google-Implementierung.
// Alle Google-Aufrufe laufen über Edge Functions; Tokens bleiben serverseitig.
// Für weitere Anbieter (Outlook, Apple) später: gleiche Typen, eigener Client.

import { supabase } from "./supabase";

export type Importance = "low" | "normal" | "high";

export interface CalendarInfo {
  id: string;
  name: string;
  color: string | null;
  accessRole: string; // owner | writer | reader | freeBusyReader
  primary: boolean;
}

export const calendarWritable = (c: CalendarInfo) =>
  c.accessRole === "owner" || c.accessRole === "writer";

export interface CalAttendee {
  email: string;
  responseStatus?: string;
  organizer?: boolean;
}

export interface CalEvent {
  id: string;
  calendarId: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string;
  description: string;
  attendees: CalAttendee[];
  hangoutLink: string | null;
  recurringEventId: string | null;
  recurrence: string[] | null;
  reminderMinutes: number[] | null; // null = Kalender-Standard
  htmlLink: string | null;
  timeZone: string | null;
}

export interface ConnectionStatus {
  connected: boolean;
  email: string | null;
  needsReconnect: boolean;
}

export interface CalendarPrefs {
  hidden: string[];
  defaultCalendar: string | null;
}

// ---- Rohdaten von Google → CalEvent ---------------------------------------

interface GWhen {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}
interface GEvent {
  id: string;
  _calendarId: string;
  summary?: string;
  start?: GWhen;
  end?: GWhen;
  location?: string;
  description?: string;
  attendees?: { email: string; responseStatus?: string; organizer?: boolean }[];
  hangoutLink?: string;
  recurringEventId?: string;
  recurrence?: string[];
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
  htmlLink?: string;
}

const parseWhen = (w?: GWhen): Date | null => {
  if (w?.dateTime) return new Date(w.dateTime);
  if (w?.date) return new Date(w.date + "T00:00:00");
  return null;
};

export function normalizeEvent(raw: GEvent): CalEvent | null {
  const start = parseWhen(raw.start);
  const end = parseWhen(raw.end) || start;
  if (!start || !end) return null;
  const reminders = raw.reminders;
  return {
    id: raw.id,
    calendarId: raw._calendarId,
    title: raw.summary || "(Ohne Titel)",
    start,
    end,
    allDay: Boolean(raw.start?.date),
    location: raw.location || "",
    description: raw.description || "",
    attendees: raw.attendees || [],
    hangoutLink: raw.hangoutLink || null,
    recurringEventId: raw.recurringEventId || null,
    recurrence: raw.recurrence || null,
    reminderMinutes:
      reminders && reminders.useDefault === false
        ? (reminders.overrides || []).map((o) => o.minutes)
        : null,
    htmlLink: raw.htmlLink || null,
    timeZone: raw.start?.timeZone || null,
  };
}

// ---- Edge-Function-Aufrufe -------------------------------------------------

class CalendarError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export const isReconnectError = (e: unknown) =>
  e instanceof CalendarError &&
  (e.code === "reconnect_required" || e.code === "not_connected");

async function invoke(fn: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new CalendarError("network");
  const d = (data ?? {}) as Record<string, unknown>;
  if (typeof d.error === "string" && d.error) {
    throw new CalendarError((d.code as string) || d.error);
  }
  return d;
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const d = await invoke("calendar-auth", { action: "status" });
  return {
    connected: Boolean(d.connected),
    email: (d.email as string) ?? null,
    needsReconnect: Boolean(d.needsReconnect),
  };
}

export async function startGoogleConnect(): Promise<string> {
  const d = await invoke("calendar-auth", { action: "start" });
  if (typeof d.url !== "string") throw new CalendarError("no_url");
  return d.url;
}

export async function disconnectGoogle(): Promise<void> {
  await invoke("calendar-auth", { action: "disconnect" });
}

export async function listCalendars(): Promise<CalendarInfo[]> {
  const d = await invoke("calendar-api", { action: "listCalendars", params: {} });
  return (d.calendars as CalendarInfo[]) || [];
}

export async function listEvents(
  calendarIds: string[],
  timeMin: Date,
  timeMax: Date
): Promise<CalEvent[]> {
  if (!calendarIds.length) return [];
  const d = await invoke("calendar-api", {
    action: "listEvents",
    params: {
      calendarIds,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
    },
  });
  const events = ((d.events as GEvent[]) || [])
    .map(normalizeEvent)
    .filter((e): e is CalEvent => e !== null);
  // Duplikate vermeiden (gleicher Termin über mehrere Kalender hinweg)
  const seen = new Set<string>();
  return events
    .filter((e) => {
      const key = `${e.calendarId}|${e.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function getEvent(calendarId: string, eventId: string): Promise<CalEvent | null> {
  const d = await invoke("calendar-api", {
    action: "getEvent",
    params: { calendarId, eventId },
  });
  return d.event ? normalizeEvent(d.event as GEvent) : null;
}

export async function createEvent(
  calendarId: string,
  event: Record<string, unknown>
): Promise<void> {
  await invoke("calendar-api", { action: "createEvent", params: { calendarId, event } });
}

export async function updateEvent(
  calendarId: string,
  eventId: string,
  event: Record<string, unknown>
): Promise<void> {
  await invoke("calendar-api", {
    action: "updateEvent",
    params: { calendarId, eventId, event },
  });
}

export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  await invoke("calendar-api", { action: "deleteEvent", params: { calendarId, eventId } });
}

export async function moveEvent(
  calendarId: string,
  eventId: string,
  destination: string
): Promise<void> {
  await invoke("calendar-api", {
    action: "moveEvent",
    params: { calendarId, eventId, destination },
  });
}

// ---- Einstellungen (RLS-geschützte Tabellen, direkter Klient-Zugriff) ------

export async function loadPrefs(userId: string): Promise<CalendarPrefs> {
  const { data } = await supabase
    .from("calendar_prefs")
    .select("hidden_calendars, default_calendar")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  return {
    hidden: Array.isArray(data?.hidden_calendars) ? (data.hidden_calendars as string[]) : [],
    defaultCalendar: (data?.default_calendar as string) ?? null,
  };
}

export async function savePrefs(userId: string, prefs: CalendarPrefs): Promise<void> {
  await supabase.from("calendar_prefs").upsert(
    {
      user_id: userId,
      provider: "google",
      hidden_calendars: prefs.hidden,
      default_calendar: prefs.defaultCalendar,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
}

// ---- Wichtigkeit (App-Metadatum, verändert den Google-Termin nicht) --------

export async function loadImportance(
  userId: string,
  eventIds: string[]
): Promise<Record<string, Importance>> {
  const result: Record<string, Importance> = {};
  for (let i = 0; i < eventIds.length; i += 200) {
    const chunk = eventIds.slice(i, i + 200);
    const { data } = await supabase
      .from("calendar_event_meta")
      .select("event_id, importance")
      .eq("user_id", userId)
      .eq("provider", "google")
      .in("event_id", chunk);
    for (const row of data || []) {
      result[row.event_id as string] = row.importance as Importance;
    }
  }
  return result;
}

export async function setImportance(
  userId: string,
  eventId: string,
  importance: Importance | null
): Promise<void> {
  if (importance === null) {
    await supabase
      .from("calendar_event_meta")
      .delete()
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("event_id", eventId);
    return;
  }
  await supabase.from("calendar_event_meta").upsert(
    {
      user_id: userId,
      provider: "google",
      event_id: eventId,
      importance,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider,event_id" }
  );
}
