-- GrowthLog – Migration V2: Quiz-Erweiterung für user_words
-- In Supabase: SQL Editor → New query → einfügen → Run
--
-- Rückwärtskompatibel: fügt nur neue, optionale Spalten mit sicheren
-- Standardwerten hinzu. Bestehende Wörter und Statistiken bleiben erhalten
-- und funktionieren unverändert weiter (fehlende Werte gelten als "nicht gesetzt").

alter table public.user_words add column if not exists category text;
alter table public.user_words add column if not exists definition2 text;
alter table public.user_words add column if not exists example2 text;

-- Bisher gab es nur review_count (gesamt) und correct_count (richtig).
-- Neu: differenzierte Bewertung in vier Stufen statt binär richtig/falsch.
alter table public.user_words add column if not exists partial_count int not null default 0;
alter table public.user_words add column if not exists wrong_count int not null default 0;
alter table public.user_words add column if not exists unknown_count int not null default 0;
alter table public.user_words add column if not exists last_correct_at timestamptz;

create index if not exists idx_words_user_category on public.user_words (user_id, category);
