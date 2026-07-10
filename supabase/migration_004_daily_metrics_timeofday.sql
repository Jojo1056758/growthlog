-- GrowthLog – Migration V4: Tageszeiten-Kennzahlen
-- In Supabase: SQL Editor → New query → einfügen → Run
--
-- Additiv und rückwärtskompatibel: erweitert die Struktur der täglich erfassten
-- Kennzahlen um Tageszeitwerte (morgens, mittags, abends) für jede Kennzahl.
-- Bestehende Daten bleiben unverändert, die Struktur der Antworten-JSONB wird
-- nicht umstrukturiert – nur neue Felder können hinzugefügt werden.
--
-- WICHTIG: Diese Migration ist optional. Alte Einträge funktionieren weiterhin
-- ohne die Tageszeitwerte. Die App lädt und speichert auch alte Einträge
-- korrekt, solange die neuen Feldnamen im Schema definiert sind.

-- Keine Datenbankänderung erforderlich – nur das Client-seitige Schema wurde
-- um die folgenden Felder erweitert:
-- - energy_morning, energy_noon, energy_evening
-- - motivation_morning, motivation_noon, motivation_evening
-- - stress_morning, stress_noon, stress_evening
-- - focus_morning, focus_noon, focus_evening
-- - calm_morning, calm_noon, calm_evening
--
-- Diese Felder werden automatisch gespeichert und geladen, sobald sie im
-- Frontend eingegeben werden. Alte Einträge, die diese Felder nicht haben,
-- funktionieren weiterhin normal.

-- Falls Monitoring oder Analytics die neuen Felder abfragen sollen, können
-- folgende Indizes optional hinzugefügt werden:
-- (nicht erforderlich für normale Nutzung)

-- ALTER TABLE public.daily_entries
-- ADD INDEX IF NOT EXISTS idx_answers_energy_morning ON daily_entries USING GIN(answers);
-- ALTER TABLE public.daily_entries
-- ADD INDEX IF NOT EXISTS idx_answers_motivation_morning ON daily_entries USING GIN(answers);
-- etc.

-- Bestehende Daten prüfen (für Dokumentation):
-- SELECT COUNT(*) as total_entries,
--        SUM(CASE WHEN answers ->> 'energy_morning' IS NOT NULL THEN 1 ELSE 0 END) as with_energy_morning
-- FROM public.daily_entries;
