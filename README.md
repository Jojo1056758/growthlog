# GrowthLog

Persönliches Reflexions- und Wachstumssystem als installierbare Web-App (PWA).
Kostenlos gehostet auf Vercel, Daten in Supabase (nur für dein Konto sichtbar).

## Funktionen (V1)

- Heute-Ansicht mit Schnellmodus (60–120 s) und vollständigem Check-in
- Wiederholbare Antworten mit Plus-Button
- Autosave mit Speicherstatus + lokalem Entwurfsschutz
- Frühere Tage nachtragen und bearbeiten
- Verlauf, einfache Analyse (7/30/90 Tage)
- Wortschatz: eigene Wörter eintragen, danach Zufallsabfrage
- JSON-Export aller Daten (Backup / KI-Analyse)
- Login mit E-Mail + Passwort, Row Level Security
- Mobile-first, Dark Mode, als App installierbar

## Einrichtung

### 1. Supabase (Datenbank, kostenlos)

1. Konto auf https://supabase.com erstellen, neues Projekt anlegen.
2. Links **SQL Editor** öffnen → Inhalt von `supabase/migration.sql` einfügen → **Run**.
3. Unter **Project Settings → API** findest du:
   - `Project URL` → wird zu `VITE_SUPABASE_URL`
   - `anon public` Key → wird zu `VITE_SUPABASE_ANON_KEY`

### 2. Lokal starten (optional)

```bash
npm install
cp .env.example .env   # Werte eintragen
npm run dev
```

### 3. Vercel (Hosting, kostenlos)

1. Code in ein GitHub-Repository hochladen.
2. Auf https://vercel.com → **Add New → Project** → Repository importieren.
3. Framework: Vite (wird automatisch erkannt).
4. Unter **Environment Variables** eintragen:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. **Deploy** klicken → nach 1–2 Minuten erhältst du einen Link wie
   `https://growthlog.vercel.app`.

### 4. Auf dem Handy installieren

1. Vercel-Link in Chrome/Safari öffnen.
2. Menü → **Zum Startbildschirm hinzufügen**.
3. Die App startet danach mit eigenem Icon im Vollbild.

## Sicherheit

- Niemals den Supabase **Service Role Key** im Frontend verwenden.
- Der `anon` Key ist für den Browser gedacht; der Datenschutz wird durch
  Row Level Security erzwungen (siehe `supabase/migration.sql`).
- Regelmäßig den JSON-Export als Backup nutzen (Einstellungen).

## Erweiterung

Neue Fragen: `src/lib/schema.ts` ergänzen. Alte Einträge bleiben gültig,
da alle Antworten in einem flexiblen JSONB-Feld gespeichert werden.
