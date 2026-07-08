-- GrowthLog – Import-Funktionen für den persönlichen Wortschatz
-- In Supabase: SQL Editor → New query → einfügen → Run
--
-- Voraussetzung: migration_003_word_queue.sql und seed/003_seed_word_queue.sql
-- wurden bereits ausgeführt (Tabelle public.word_queue existiert und ist gefüllt).
--
-- Diese Datei legt zwei idempotente Funktionen an. Beide sind SECURITY DEFINER,
-- damit sie den Katalog-Status pflegen dürfen; sie schreiben Nutzerdaten aber
-- ausschließlich für die ausdrücklich übergebene Benutzer-ID.

-- 1) Bestehende Wörter des Nutzers vervollständigen (nicht destruktiv):
--    füllt NUR leere Felder (Kategorie, zweite Erklärung, zweiter Beispielsatz)
--    aus dem Katalog, sofern das Wort dort vorkommt. Überschreibt nichts.
create or replace function public.gl_enrich_existing_words(target_user uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count int;
begin
  update public.user_words uw
     set category    = coalesce(nullif(btrim(uw.category), ''), q.category),
         definition2  = coalesce(nullif(btrim(uw.definition2), ''), q.definition2),
         example2     = coalesce(nullif(btrim(uw.example2), ''), q.example2)
    from public.word_queue q
   where uw.user_id = target_user
     and lower(btrim(uw.word)) = lower(btrim(q.word))
     and (
           nullif(btrim(uw.category), '')    is null
        or nullif(btrim(uw.definition2), '') is null
        or nullif(btrim(uw.example2), '')    is null
     );
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

-- 1b) Verbleibende Wörter OHNE Kategorie einer Fallback-Hauptkategorie zuordnen.
--     Nach gl_enrich_existing_words ausführen: die fachlich passende Kategorie wird
--     dort bereits per Katalogtreffer gesetzt. Hier landen nur Wörter, die NICHT im
--     250er-Katalog vorkommen. So bleibt garantiert kein Wort unter „Ohne Kategorie".
--     Idempotent (füllt nur leere Kategorien) und nicht destruktiv.
create or replace function public.gl_categorize_uncategorized(
  target_user uuid,
  fallback_category text default 'Allgemeine Bildungssprache'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count int;
  allowed text[] := array[
    'Philosophie und Erkenntnistheorie','Psychologie und Verhalten','Sprache und Rhetorik',
    'Logik und Argumentation','Wissenschaft und Forschung','Politik und Gesellschaft',
    'Wirtschaft und Organisation','Kultur und Geschichte','Recht und Ethik','Allgemeine Bildungssprache'
  ];
begin
  if not (fallback_category = any(allowed)) then
    raise exception 'Ungültige Fallback-Kategorie: %', fallback_category;
  end if;
  update public.user_words uw
     set category = fallback_category
   where uw.user_id = target_user
     and nullif(btrim(uw.category), '') is null;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

-- 2) Wortschatz auf genau target_total (Standard 100) auffüllen:
--    - markiert Katalogwörter, die der Nutzer bereits besitzt, als 'skipped_duplicate'
--    - fügt danach angereicherte, noch nicht vorhandene Wörter in balancierter
--      Reihenfolge ein, bis der Nutzer target_total Wörter besitzt
--    Idempotent: bereits eingefügte Wörter sind 'active' und werden nicht erneut
--    gewählt; die Zählgrenze verhindert ein Überschreiten von target_total.
create or replace function public.gl_import_words_until(
  target_user uuid,
  target_total int default 100
)
returns table(inserted int, skipped int, final_total int)
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_total int;
  ins int := 0;
  skp int := 0;
  rec record;
begin
  -- Schritt 1: Duplikate markieren (Wörter, die der Nutzer schon hat)
  update public.word_queue q
     set status = 'skipped_duplicate',
         processed_at = now()
   where q.status <> 'active'
     and exists (
           select 1 from public.user_words uw
            where uw.user_id = target_user
              and lower(btrim(uw.word)) = lower(btrim(q.word))
     );
  get diagnostics skp = row_count;

  -- Schritt 2: auffüllen bis target_total
  select count(*) into cur_total from public.user_words where user_id = target_user;

  for rec in
    select *
      from public.word_queue q
     where q.enriched = true
       and q.status = 'pending'
       and not exists (
             select 1 from public.user_words uw
              where uw.user_id = target_user
                and lower(btrim(uw.word)) = lower(btrim(q.word))
       )
     order by q.activation_order asc nulls last, q.position asc
  loop
    exit when cur_total >= target_total;
    insert into public.user_words
      (user_id, word, category, definition, definition2, example, example2)
    values
      (target_user, rec.word, rec.category, rec.definition, rec.definition2, rec.example, rec.example2);
    update public.word_queue
       set status = 'active', processed_at = now()
     where id = rec.id;
    ins := ins + 1;
    cur_total := cur_total + 1;
  end loop;

  select count(*) into cur_total from public.user_words where user_id = target_user;
  inserted := ins;
  skipped := skp;
  final_total := cur_total;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- AUSFÜHRUNG (im SQL-Editor, nach dem Anlegen der Funktionen):
--
--   1. Eigene Benutzer-ID ermitteln (KEINE erfundene ID verwenden!):
--        select id, email from auth.users;
--
--   2. Bestehende Wörter vervollständigen (leere Felder aus Katalog auffüllen):
--        select public.gl_enrich_existing_words('DEINE-USER-ID');
--
--   3. Restliche Wörter ohne Kategorie einer Fallback-Kategorie zuordnen,
--      damit KEIN Wort unter „Ohne Kategorie" bleibt:
--        select public.gl_categorize_uncategorized('DEINE-USER-ID');
--      (optional andere Fallback-Kategorie:
--        select public.gl_categorize_uncategorized('DEINE-USER-ID', 'Kultur und Geschichte'); )
--
--   4. Auf genau 100 Wörter auffüllen:
--        select * from public.gl_import_words_until('DEINE-USER-ID', 100);
--      Rückgabe: inserted (neu eingefügt), skipped (Duplikate), final_total (=100).
--
-- PRÜFUNGEN:
--   -- Gesamtzahl (erwartet: 100):
--   select count(*) from public.user_words where user_id = 'DEINE-USER-ID';
--
--   -- Wörter ohne Kategorie (erwartet: 0):
--   select count(*) from public.user_words
--    where user_id = 'DEINE-USER-ID' and nullif(btrim(category),'') is null;
--
--   -- Ungültige Kategorien (erwartet: 0 Zeilen):
--   select distinct category from public.user_words
--    where user_id = 'DEINE-USER-ID'
--      and category not in (
--        'Philosophie und Erkenntnistheorie','Psychologie und Verhalten','Sprache und Rhetorik',
--        'Logik und Argumentation','Wissenschaft und Forschung','Politik und Gesellschaft',
--        'Wirtschaft und Organisation','Kultur und Geschichte','Recht und Ethik','Allgemeine Bildungssprache'
--      );
--
--   -- Verteilung je Kategorie:
--   select category, count(*) from public.user_words
--    where user_id = 'DEINE-USER-ID' group by category order by category;
--
--   -- Aktive Wörter ohne zweite Erklärung/zweiten Beispielsatz (erwartet: 0
--   -- für neu importierte; bestehende ohne Katalogtreffer können hier auftauchen):
--   select word from public.user_words
--    where user_id = 'DEINE-USER-ID'
--      and (nullif(btrim(definition2),'') is null or nullif(btrim(example2),'') is null);
--
--   -- Status der Warteliste:
--   select status, count(*) from public.word_queue group by status;
-- ---------------------------------------------------------------------------
