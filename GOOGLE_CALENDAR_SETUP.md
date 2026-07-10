# Google-Kalender-Integration – Einrichtung

Diese Schritte musst du einmalig selbst durchführen. Die App-Seite ist bereits
fertig implementiert; es fehlen nur Google-Zugangsdaten, die Supabase-Migration
und das Deployment der beiden Edge Functions.

**Verwende nirgends echte Werte aus dieser Datei – alle Werte in
`GROSSBUCHSTABEN` sind Platzhalter.**

## Architektur-Überblick

- Der Browser spricht **nie direkt** mit Google und sieht **nie** Tokens.
- Zwei Supabase Edge Functions erledigen alles Serverseitige:
  - `calendar-auth` – OAuth-Start, OAuth-Callback, Status, Trennen/Widerruf
  - `calendar-api` – Proxy zur Google Calendar API inkl. automatischem
    Access-Token-Refresh
- Tokens liegen in `calendar_connections` (RLS ohne Policies → nur die
  Service-Role der Edge Functions kommt heran).
- Sichtbarkeit/Standardkalender (`calendar_prefs`) und Wichtigkeit
  (`calendar_event_meta`) sind normale RLS-Tabellen pro Nutzer.

## 1. Google-Cloud-Projekt

1. https://console.cloud.google.com öffnen.
2. Bestehendes Projekt wählen oder „Neues Projekt“ erstellen
   (z. B. Name `growthlog-calendar`).

## 2. Google Calendar API aktivieren

1. Menü → „APIs und Dienste“ → „Bibliothek“.
2. Nach **Google Calendar API** suchen → „Aktivieren“.

## 3. OAuth-Zustimmungsbildschirm

1. „APIs und Dienste“ → „OAuth-Zustimmungsbildschirm“.
2. User Type: **Extern** (für private Nutzung reicht der Testmodus).
3. App-Name (z. B. „GrowthLog“), Support-E-Mail, Kontakt-E-Mail eintragen.
4. Scopes hinzufügen:
   - `openid`
   - `email`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
5. Im Testmodus: deine eigene Google-Adresse als **Testnutzer** hinzufügen.

## 4. OAuth-Webclient erstellen

1. „APIs und Dienste“ → „Anmeldedaten“ → „Anmeldedaten erstellen“ →
   „OAuth-Client-ID“ → Typ **Webanwendung**.
2. **Autorisierte Weiterleitungs-URI** eintragen (genau diese eine URL – der
   Callback läuft über die Edge Function, nicht über die App selbst):

   ```
   https://DEIN-PROJEKT-REF.supabase.co/functions/v1/calendar-auth
   ```

   (`DEIN-PROJEKT-REF` findest du in Supabase unter Project Settings → General.
   Dieselbe URL gilt für lokal UND produktiv, da der Callback serverseitig ist.)
3. Nach dem Erstellen **Client-ID** und **Client-Secret** notieren.
   Das Secret gehört ausschließlich in Supabase-Secrets – niemals ins Repo,
   niemals in Vercel-`VITE_`-Variablen.

## 5. Supabase-Migration ausführen

Im Supabase **SQL Editor** den Inhalt von
[`supabase/migration_005_calendar.sql`](supabase/migration_005_calendar.sql)
ausführen. Legt an: `calendar_connections`, `calendar_oauth_states`,
`calendar_prefs`, `calendar_event_meta` (inkl. RLS).

## 6. Edge Functions deployen

Voraussetzung: Supabase CLI ist installiert und mit dem Projekt verknüpft
(`supabase login`, `supabase link --project-ref DEIN-PROJEKT-REF`).

```bash
# Secrets setzen (Werte aus Schritt 4; APP_URL = deine App-Adresse)
supabase secrets set GOOGLE_CLIENT_ID="DEINE-CLIENT-ID"
supabase secrets set GOOGLE_CLIENT_SECRET="DEIN-CLIENT-SECRET"
supabase secrets set GOOGLE_REDIRECT_URI="https://DEIN-PROJEKT-REF.supabase.co/functions/v1/calendar-auth"
supabase secrets set APP_URL="https://DEINE-APP.vercel.app"

# Funktionen deployen
supabase functions deploy calendar-auth --no-verify-jwt
supabase functions deploy calendar-api
```

Hinweise:
- `--no-verify-jwt` ist bei `calendar-auth` nötig, weil Google den Callback
  per GET ohne Supabase-JWT aufruft. Die POST-Aktionen der Funktion prüfen das
  JWT trotzdem selbst.
- Für lokale Entwicklung mit der Produktiv-Funktion ist nichts weiter nötig –
  der OAuth-Callback leitet immer auf `APP_URL` um. Willst du beim lokalen
  Testen zurück auf `http://localhost:5173` geleitet werden, setze `APP_URL`
  vorübergehend darauf um (und danach wieder zurück).

## 7. Umgebungsvariablen

| Ort | Variable | Zweck |
| --- | --- | --- |
| Supabase Secrets | `GOOGLE_CLIENT_ID` | OAuth-Client-ID |
| Supabase Secrets | `GOOGLE_CLIENT_SECRET` | OAuth-Client-Secret (nur hier!) |
| Supabase Secrets | `GOOGLE_REDIRECT_URI` | Callback-URL (Edge Function) |
| Supabase Secrets | `APP_URL` | Ziel der Weiterleitung nach dem OAuth-Flow |
| Vercel + lokal `.env` | `VITE_SUPABASE_URL` | bereits vorhanden |
| Vercel + lokal `.env` | `VITE_SUPABASE_ANON_KEY` | bereits vorhanden |

Es kommen **keine neuen Frontend-Variablen** hinzu.

## 8. Verbindung testen

1. App öffnen → „Mehr“ → „Kalender-Integration“ → **Google Kalender verbinden**.
2. Google-Zustimmung erteilen → du landest wieder in den Einstellungen mit
   der Meldung „erfolgreich verbunden“.
3. Sichtbare Kalender und Standardkalender prüfen.
4. Tab „Kalender“: Termine sollten erscheinen; Termin anlegen, bearbeiten,
   duplizieren, verschieben und löschen testen.
5. „Heute“: kompakte Terminübersicht prüfen.
6. Trennen testen: Einstellungen → „Verbindung trennen“ → der Zugriff wird
   bei Google widerrufen und die Tokens werden gelöscht (prüfbar unter
   https://myaccount.google.com/permissions).

## Fehlersuche

- **Nach Google-Login: „Verbindung fehlgeschlagen“** → Redirect-URI in Google
  exakt gleich wie `GOOGLE_REDIRECT_URI`? Secrets gesetzt? Funktion mit
  `--no-verify-jwt` deployt?
- **„Verbindung abgelaufen“ direkt nach dem Verbinden** → Google hat kein
  Refresh-Token geliefert; unter https://myaccount.google.com/permissions den
  App-Zugriff entfernen und neu verbinden (die App fordert `prompt=consent`
  bereits an).
- **Termine laden nicht (reconnect_required)** → Refresh-Token widerrufen oder
  Testmodus-Ablauf (im Testmodus laufen Refresh-Tokens nach 7 Tagen ab, bis
  die App „In Produktion“ veröffentlicht ist).
