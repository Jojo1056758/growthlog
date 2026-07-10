// GrowthLog – Edge Function: Google-OAuth für die Kalender-Integration.
//
// Deploy (WICHTIG: ohne JWT-Pflicht, weil Google den Callback per GET ohne
// Supabase-JWT aufruft; die POST-Aktionen prüfen das JWT selbst):
//   supabase functions deploy calendar-auth --no-verify-jwt
//
// Benötigte Secrets (supabase secrets set …):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, APP_URL
//
// Aktionen:
//   POST {action:"start"}      (mit User-JWT) → { url }  – Google-Consent-URL
//   GET  ?code&state           – OAuth-Callback von Google, speichert Tokens
//   POST {action:"status"}     (mit User-JWT) → { connected, email }
//   POST {action:"disconnect"} (mit User-JWT) – widerruft Tokens und löscht sie
//
// Tokens verlassen diese Funktion nie in Richtung Browser.

import { createClient } from "npm:@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

// Minimale Scopes: Termine lesen/schreiben + Kalenderliste lesen + E-Mail
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

const redirect = (query: string) =>
  new Response(null, {
    status: 302,
    headers: { ...CORS, Location: `${APP_URL}/settings?calendar=${query}` },
  });

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof decoded.email === "string" ? decoded.email : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ---- OAuth-Callback von Google (GET) -----------------------------------
  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (url.searchParams.get("error")) return redirect("error");
    if (!code || !state) return redirect("error");

    // State prüfen (CSRF-Schutz): atomar löschen und zurückgeben, damit der
    // State garantiert nur einmal verwendet werden kann (kein Read-then-Delete-
    // Race zwischen zwei gleichzeitigen Callback-Requests mit demselben State).
    const { data: stateRow } = await admin
      .from("calendar_oauth_states")
      .delete()
      .eq("state", state)
      .select("user_id, created_at")
      .maybeSingle();
    if (!stateRow) return redirect("error");

    // State läuft nach 10 Minuten ab, damit ein alter/geleakter State-Wert
    // nicht unbegrenzt lange für einen Callback missbraucht werden kann.
    const STATE_TTL_MS = 10 * 60 * 1000;
    if (Date.now() - new Date(stateRow.created_at).getTime() > STATE_TTL_MS) {
      return redirect("error");
    }

    // Code gegen Tokens tauschen
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return redirect("error");
    const tokens = await tokenRes.json();

    const expiresAt = new Date(
      Date.now() + (Number(tokens.expires_in) || 3600) * 1000
    ).toISOString();

    const { error: upsertError } = await admin.from("calendar_connections").upsert(
      {
        user_id: stateRow.user_id,
        provider: "google",
        account_email: emailFromIdToken(tokens.id_token),
        access_token: tokens.access_token,
        access_token_expires_at: expiresAt,
        refresh_token: tokens.refresh_token ?? null,
        scopes: tokens.scope ?? SCOPES,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );
    if (upsertError) return redirect("error");
    return redirect("connected");
  }

  // ---- App-Aktionen (POST, JWT-geprüft) -----------------------------------
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const userId = await getUserId(req);
  if (!userId) return json({ error: "unauthorized" }, 401);

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* leerer Body */
  }

  if (body.action === "start") {
    const state = crypto.randomUUID();
    const { error } = await admin
      .from("calendar_oauth_states")
      .insert({ state, user_id: userId, provider: "google" });
    if (error) return json({ error: "state_failed" });
    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        scope: SCOPES,
        state,
      }).toString();
    return json({ url: authUrl });
  }

  if (body.action === "status") {
    const { data } = await admin
      .from("calendar_connections")
      .select("account_email, refresh_token")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();
    return json({
      connected: Boolean(data),
      email: data?.account_email ?? null,
      // reconnect nötig, wenn kein Refresh-Token vorliegt
      needsReconnect: Boolean(data && !data.refresh_token),
    });
  }

  if (body.action === "disconnect") {
    const { data } = await admin
      .from("calendar_connections")
      .select("access_token, refresh_token")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();
    if (data) {
      const token = data.refresh_token || data.access_token;
      if (token) {
        // Best effort: Token bei Google widerrufen
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        }).catch(() => {});
      }
      await admin
        .from("calendar_connections")
        .delete()
        .eq("user_id", userId)
        .eq("provider", "google");
    }
    return json({ ok: true });
  }

  return json({ error: "unknown_action" }, 400);
});
