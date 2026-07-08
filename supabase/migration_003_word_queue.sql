-- GrowthLog – Migration V3: Warteliste / Import-Katalog für Vokabeln
-- In Supabase: SQL Editor → New query → einfügen → Run
--
-- Additiv und rückwärtskompatibel: legt eine NEUE Tabelle an und verändert
-- weder public.user_words noch bestehende Daten. Die Tabelle enthält den
-- kuratierten Katalog der 250 Lernwörter als Warteliste für den (späteren)
-- Import in den persönlichen Wortschatz.

create table if not exists public.word_queue (
  id uuid primary key default gen_random_uuid(),
  position int not null unique,            -- feste Reihenfolge (1..250)
  word text not null unique,               -- verhindert doppelte Wörter im Katalog
  part_of_speech text,                     -- Wortart, falls vorhanden
  category text not null,                  -- genau eine der 10 Hauptkategorien
  definition text not null default '',     -- erste Erklärung
  definition2 text,                        -- zweite Erklärung (nur bei enriched)
  example text,                            -- erster Beispielsatz
  example2 text,                           -- zweiter Beispielsatz (nur bei enriched)
  enriched boolean not null default false, -- true = vollständig (2 Erklärungen + 2 Beispiele)
  activation_order int,                    -- balancierte Aktivierungsreihenfolge (nur enriched)
  status text not null default 'pending',  -- 'pending' | 'active' | 'skipped_duplicate'
  processed_at timestamptz,                -- Zeitpunkt der Verarbeitung
  error text,                              -- optionale Fehlermeldung eines Laufs
  created_at timestamptz not null default now()
);

create index if not exists idx_word_queue_status on public.word_queue (status, activation_order);

-- Row Level Security: Der Katalog enthält KEINE personenbezogenen Daten. Alle
-- eingeloggten Nutzer dürfen ihn lesen. Schreibzugriff erfolgt ausschließlich
-- über die SECURITY-DEFINER-Funktionen in import_words.sql (bzw. den SQL-Editor),
-- nicht direkt durch Client-Rollen.
alter table public.word_queue enable row level security;

drop policy if exists "word_queue_select_auth" on public.word_queue;
create policy "word_queue_select_auth" on public.word_queue
  for select using (auth.uid() is not null);
