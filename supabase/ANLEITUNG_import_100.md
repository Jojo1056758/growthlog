# Vokabel-Import auf 100 aktive Wörter – manuelle Schritte

Alle Schritte laufen **nur** im Supabase **SQL-Editor** (kein Dashboard-Klickweg,
kein destruktiver Eingriff). Es werden **keine** bestehenden Wörter gelöscht oder
überschrieben. Alle Skripte sind idempotent (mehrfaches Ausführen ist sicher).

## Reihenfolge

1. **Warteliste-Tabelle anlegen**
   Inhalt von [`migration_003_word_queue.sql`](migration_003_word_queue.sql) ausführen.
   → legt `public.word_queue` an (additiv, mit RLS).

2. **Katalog (250 Wörter) einspielen**
   Inhalt von [`seed/003_seed_word_queue.sql`](seed/003_seed_word_queue.sql) ausführen.
   → füllt `word_queue` mit allen 250 Einträgen (110 davon vollständig angereichert).

3. **Import-Funktionen anlegen**
   Inhalt von [`import_words.sql`](import_words.sql) ausführen.
   → legt `gl_enrich_existing_words(...)`, `gl_categorize_uncategorized(...)` und
   `gl_import_words_until(...)` an.

4. **Eigene Benutzer-ID ermitteln** (keine erfundene ID verwenden):
   ```sql
   select id, email from auth.users;
   ```

5. **Bestehende Wörter vervollständigen** (füllt nur leere Felder aus dem Katalog):
   ```sql
   select public.gl_enrich_existing_words('DEINE-USER-ID');
   ```

6. **Restliche Wörter ohne Kategorie zuordnen** (damit KEIN Wort unter „Ohne
   Kategorie" bleibt – betrifft nur Wörter, die nicht im 250er-Katalog vorkommen):
   ```sql
   select public.gl_categorize_uncategorized('DEINE-USER-ID');
   ```
   Standard-Fallback ist `Allgemeine Bildungssprache`. Optional andere Kategorie:
   ```sql
   select public.gl_categorize_uncategorized('DEINE-USER-ID', 'Kultur und Geschichte');
   ```

7. **Auf genau 100 auffüllen:**
   ```sql
   select * from public.gl_import_words_until('DEINE-USER-ID', 100);
   ```
   Rückgabe: `inserted` (neu eingefügt), `skipped` (Duplikate), `final_total` (= 100).

## Prüfen, ob genau 100 Wörter aktiv sind

```sql
select count(*) from public.user_words where user_id = 'DEINE-USER-ID';   -- erwartet: 100
```

## Prüfen, ob kein Wort ohne Kategorie bleibt

```sql
-- erwartet: 0
select count(*) from public.user_words
 where user_id = 'DEINE-USER-ID' and nullif(btrim(category),'') is null;

-- Ungültige Kategorien (erwartet: 0 Zeilen):
select distinct category from public.user_words
 where user_id = 'DEINE-USER-ID'
   and category not in (
     'Philosophie und Erkenntnistheorie','Psychologie und Verhalten','Sprache und Rhetorik',
     'Logik und Argumentation','Wissenschaft und Forschung','Politik und Gesellschaft',
     'Wirtschaft und Organisation','Kultur und Geschichte','Recht und Ethik','Allgemeine Bildungssprache'
   );
```

## Prüfen, ob Kategorien und Zusatzfelder vorhanden sind

```sql
-- Verteilung je Kategorie:
select category, count(*) from public.user_words
 where user_id = 'DEINE-USER-ID' group by category order by category;

-- Aktive Wörter ohne zweite Erklärung / zweiten Beispielsatz:
-- (0 bei neu importierten; hier tauchen nur bestehende Wörter auf, die NICHT im
--  Katalog vorkommen und daher nicht automatisch vervollständigt werden konnten)
select word from public.user_words
 where user_id = 'DEINE-USER-ID'
   and (nullif(btrim(definition2),'') is null or nullif(btrim(example2),'') is null);

-- Status der Warteliste:
select status, count(*) from public.word_queue group by status;
```

## Hinweise

- **Bestehende Wörter ohne Katalogtreffer:** `gl_enrich_existing_words` kann die
  fachlich passende Kategorie sowie zweite Erklärung/zweiten Beispielsatz nur für
  Wörter setzen, die auch im 250er-Katalog vorkommen. Für eigene Wörter, die dort
  nicht enthalten sind, weist `gl_categorize_uncategorized` eine Fallback-Kategorie
  zu (Standard: `Allgemeine Bildungssprache`), damit kein Wort ohne Kategorie bleibt.
  Die zweite Erklärung/der zweite Beispielsatz werden für diese Wörter **nicht**
  erfunden und lassen sich in der App manuell über das Wort-Formular nachtragen;
  auch die Fallback-Kategorie kann dort jederzeit angepasst werden.
- **Warteliste bleibt erhalten:** Nicht aktivierte Wörter bleiben in `word_queue`
  mit Status `pending` und dienen später der (separaten) Tagesautomatisierung.
- **Regenerieren des Katalogs** (optional, nur bei inhaltlichen Änderungen):
  ```
  node supabase/seed/build_catalog.mjs supabase/seed/quelle_komplexe_deutsche_vokabeln_250.json
  ```
