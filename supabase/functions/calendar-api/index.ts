// GrowthLog – Edge Function: Proxy zur Google Calendar API.
//
// Deploy:
//   supabase functions deploy calendar-api
//
// Benötigte Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//
// Alle Aufrufe laufen mit dem serverseitig gespeicherten Access-Token des
// angemeldeten Nutzers; abgelaufene Access-Tokens werden hier automatisch
// per Refresh-Token erneuert. Der Browser sieht nie ein Google-Token.
//
// POST { action, params } (mit User-JWT). App-Fehler kommen als
// HTTP 200 + { error, code }, damit der Client sie einheitlich behandeln kann.

import { createClient } from "npm:@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const GAPI = "https://www.googleapis.com/calendar/v3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

async function getUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

// Gültiges Access-Token besorgen; erneuert bei Bedarf per Refresh-Token.
async function getAccessToken(
  userId: string
): Promise<{ token?: string; error?: string }> {
  const { data: row } = await admin
    .from("calendar_connections")
    .select("access_token, access_token_expires_at, refresh_token")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (!row) return { error: "not_connected" };

  const stillValid =
    row.access_token &&
    row.access_token_expires_at &&
    new Date(row.access_token_expires_at).getTime() > Date.now() + 60_000;
  if (stillValid) return { token: row.access_token as string };

  if (!row.refresh_token) return { error: "reconnect_required" };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token as string,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    // invalid_grant o. Ä.: Nutzer muss sich neu verbinden
    return { error: "reconnect_required" };
  }
  const tokens = await res.json();
  const expiresAt = new Date(
    Date.now() + (Number(tokens.expires_in) || 3600) * 1000
  ).toISOString();
  await admin
    .from("calendar_connections")
    .update({
      access_token: tokens.access_token,
      access_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "google");
  return { token: tokens.access_token as string };
}

async function gfetch(
  token: string,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${GAPI}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

// deno-lint-ignore no-explicit-any
type Params = Record<string, any>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const userId = await getUserId(req);
  if (!userId) return json({ error: "unauthorized" }, 401);

  let action = "";
  let params: Params = {};
  try {
    const body = await req.json();
    action = body.action ?? "";
    params = body.params ?? {};
  } catch {
    return json({ error: "bad_request" });
  }

  const tok = await getAccessToken(userId);
  if (!tok.token) return json({ error: tok.error, code: tok.error });
  const token = tok.token;
  const enc = encodeURIComponent;

  try {
    switch (action) {
      case "listCalendars": {
        const r = await gfetch(token, "/users/me/calendarList?maxResults=250");
        if (!r.ok) return json({ error: "google_error", detail: r.status });
        // deno-lint-ignore no-explicit-any
        const items = ((r.body as any)?.items ?? []).map((c: any) => ({
          id: c.id,
          name: c.summaryOverride || c.summary,
          color: c.backgroundColor || null,
          accessRole: c.accessRole,
          primary: Boolean(c.primary),
        }));
        return json({ calendars: items });
      }

      case "listEvents": {
        const { calendarIds, timeMin, timeMax } = params;
        if (!Array.isArray(calendarIds) || !timeMin || !timeMax)
          return json({ error: "bad_request" });
        const all: unknown[] = [];
        // Kalender parallel abfragen; einzelne Fehler (z. B. reine
        // Frei/Belegt-Kalender) werden übersprungen statt alles zu blockieren.
        await Promise.all(
          calendarIds.slice(0, 25).map(async (calId: string) => {
            const q = new URLSearchParams({
              singleEvents: "true",
              orderBy: "startTime",
              timeMin,
              timeMax,
              maxResults: "250",
            });
            const r = await gfetch(token, `/calendars/${enc(calId)}/events?${q}`);
            if (!r.ok) return;
            // deno-lint-ignore no-explicit-any
            for (const ev of (r.body as any)?.items ?? []) {
              if (ev.status === "cancelled") continue;
              all.push({ ...ev, _calendarId: calId });
            }
          })
        );
        return json({ events: all });
      }

      case "getEvent": {
        const { calendarId, eventId } = params;
        const r = await gfetch(token, `/calendars/${enc(calendarId)}/events/${enc(eventId)}`);
        if (!r.ok) return json({ error: "google_error", detail: r.status });
        return json({ event: { ...(r.body as object), _calendarId: calendarId } });
      }

      case "createEvent": {
        const { calendarId, event } = params;
        const r = await gfetch(token, `/calendars/${enc(calendarId)}/events`, {
          method: "POST",
          body: JSON.stringify(event),
        });
        if (!r.ok) return json({ error: "google_error", detail: r.status });
        return json({ event: r.body });
      }

      case "updateEvent": {
        const { calendarId, eventId, event } = params;
        const r = await gfetch(
          token,
          `/calendars/${enc(calendarId)}/events/${enc(eventId)}`,
          { method: "PATCH", body: JSON.stringify(event) }
        );
        if (!r.ok) return json({ error: "google_error", detail: r.status });
        return json({ event: r.body });
      }

      case "deleteEvent": {
        const { calendarId, eventId } = params;
        const r = await gfetch(
          token,
          `/calendars/${enc(calendarId)}/events/${enc(eventId)}`,
          { method: "DELETE" }
        );
        if (!r.ok && r.status !== 410)
          return json({ error: "google_error", detail: r.status });
        return json({ ok: true });
      }

      case "moveEvent": {
        const { calendarId, eventId, destination } = params;
        const r = await gfetch(
          token,
          `/calendars/${enc(calendarId)}/events/${enc(eventId)}/move?destination=${enc(destination)}`,
          { method: "POST" }
        );
        if (!r.ok) return json({ error: "google_error", detail: r.status });
        return json({ event: r.body });
      }

      default:
        return json({ error: "unknown_action" });
    }
  } catch (_e) {
    return json({ error: "internal_error" });
  }
});
