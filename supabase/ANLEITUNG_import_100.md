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
   → legt `gl_enrich_existing_words(...)` und `gl_import_words_until(...)` an.

4. **Eigene Benutzer-ID ermitteln** (keine erfundene ID verwenden):
   ```sql
   select id, email from auth.users;
   ```

5. **Bestehende Wörter vervollständigen** (füllt nur leere Felder):
   ```sql
   select public.gl_enrich_existing_words('DEINE-USER-ID');
   ```

6. **Auf genau 100 auffüllen:**
   ```sql
   select * from public.gl_import_words_until('DEINE-USER-ID', 100);
   ```
   Rückgabe: `inserted` (neu eingefügt), `skipped` (Duplikate), `final_total` (= 100).

## Prüfen, ob genau 100 Wörter aktiv sind

```sql
select count(*) from public.user_words where user_id = 'DEINE-USER-ID';   -- erwartet: 100
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

- **Bestehende Wörter ohne Katalogtreffer:** `gl_enrich_existing_words` kann nur
  Wörter vervollständigen, die auch im 250er-Katalog vorkommen. Für eigene Wörter,
  die dort nicht enthalten sind, werden Kategorie/zweite Erklärung/zweiter
  Beispielsatz **nicht** automatisch erfunden. Diese lassen sich in der App manuell
  über das Wort-Formular nachtragen.
- **Warteliste bleibt erhalten:** Nicht aktivierte Wörter bleiben in `word_queue`
  mit Status `pending` und dienen später der (separaten) Tagesautomatisierung.
- **Regenerieren des Katalogs** (optional, nur bei inhaltlichen Änderungen):
  ```
  node supabase/seed/build_catalog.mjs supabase/seed/quelle_komplexe_deutsche_vokabeln_250.json
  ```
