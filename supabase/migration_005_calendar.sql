-- GrowthLog – Migration V5: Kalender-Integration (Google, erweiterbar)
-- In Supabase: SQL Editor → New query → einfügen → Run
--
-- Additiv und rückwärtskompatibel. Vier neue Tabellen:
--
-- 1) calendar_connections  – OAuth-Tokens, NUR serverseitig (Edge Functions
--    mit Service-Role) erreichbar. RLS ist aktiviert, es gibt aber BEWUSST
--    KEINE Policies: der Browser-Client (anon key + User-JWT) kann diese
--    Tabelle weder lesen noch schreiben. Refresh-Tokens erreichen das
--    Frontend dadurch nie.
-- 2) calendar_oauth_states – kurzlebige OAuth-State-Werte (CSRF-Schutz),
--    ebenfalls nur serverseitig.
-- 3) calendar_prefs        – Anzeige-Einstellungen des Nutzers (ausgeblendete
--    Kalender, Standardkalender). Klient-Zugriff per RLS auf eigene Zeile.
-- 4) calendar_event_meta   – App-eigene Metadaten pro Termin (Wichtigkeit),
--    ohne den Google-Termin zu verändern. Klient-Zugriff per RLS.
--
-- Das provider-Feld ist überall vorbereitet, damit später weitere Anbieter
-- (z. B. Outlook) ergänzt werden können, ohne die Struktur zu ändern.

-- 1) Tokens (nur Service-Role) --------------------------------------------
create table if not exists public.calendar_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  account_email text,
  access_token text,
  access_token_expires_at timestamptz,
  refresh_token text,
  scopes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.calendar_connections enable row level security;
-- KEINE Policies: Zugriff ausschließlich über Service-Role in Edge Functions.

-- 2) OAuth-States (nur Service-Role) --------------------------------------
create table if not exists public.calendar_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  created_at timestamptz not null default now()
);
alter table public.calendar_oauth_states enable row level security;
-- KEINE Policies (siehe oben).

-- 3) Kalender-Einstellungen (Klient, eigene Zeile) -------------------------
create table if not exists public.calendar_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  hidden_calendars jsonb not null default '[]'::jsonb,
  default_calendar text,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.calendar_prefs enable row level security;
drop policy if exists "calendar_prefs_select_own" on public.calendar_prefs;
create policy "calendar_prefs_select_own" on public.calendar_prefs
  for select using (auth.uid() = user_id);
drop policy if exists "calendar_prefs_insert_own" on public.calendar_prefs;
create policy "calendar_prefs_insert_own" on public.calendar_prefs
  for insert with check (auth.uid() = user_id);
drop policy if exists "calendar_prefs_update_own" on public.calendar_prefs;
create policy "calendar_prefs_update_own" on public.calendar_prefs
  for update using (auth.uid() = user_id);
drop policy if exists "calendar_prefs_delete_own" on public.calendar_prefs;
create policy "calendar_prefs_delete_own" on public.calendar_prefs
  for delete using (auth.uid() = user_id);

-- 4) Termin-Metadaten: Wichtigkeit (Klient, eigene Zeilen) ------------------
create table if not exists public.calendar_event_meta (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  event_id text not null,
  importance text not null check (importance in ('low', 'normal', 'high')),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider, event_id)
);
alter table public.calendar_event_meta enable row level security;
drop policy if exists "calendar_event_meta_select_own" on public.calendar_event_meta;
create policy "calendar_event_meta_select_own" on public.calendar_event_meta
  for select using (auth.uid() = user_id);
drop policy if exists "calendar_event_meta_insert_own" on public.calendar_event_meta;
create policy "calendar_event_meta_insert_own" on public.calendar_event_meta
  for insert with check (auth.uid() = user_id);
drop policy if exists "calendar_event_meta_update_own" on public.calendar_event_meta;
create policy "calendar_event_meta_update_own" on public.calendar_event_meta
  for update using (auth.uid() = user_id);
drop policy if exists "calendar_event_meta_delete_own" on public.calendar_event_meta;
create policy "calendar_event_meta_delete_own" on public.calendar_event_meta
  for delete using (auth.uid() = user_id);

-- Aufräum-Hilfe: alte OAuth-States (älter als 1 Stunde) können gelegentlich
-- gelöscht werden. Optionaler manueller Aufruf:
--   delete from public.calendar_oauth_states where created_at < now() - interval '1 hour';
