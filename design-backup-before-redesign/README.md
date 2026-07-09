# Design-Backup vor Redesign

Ausgangs-Commit: 11e3855 ("vokabeln100")
Erstellt vor dem UI-Redesign. Enthält NUR Design-/Layout-/UI-Dateien.

## Zurücksetzen (nur dieses Redesign)
Option A – uncommittete Änderungen verwerfen (empfohlen, da Ausgangsstand sauber war):
  git restore src/ index.html

Option B – aus diesem Backup wiederherstellen:
  cp design-backup-before-redesign/styles.css src/styles.css
  cp design-backup-before-redesign/App.tsx src/App.tsx
  cp design-backup-before-redesign/main.tsx src/main.tsx
  cp design-backup-before-redesign/index.html index.html
  cp design-backup-before-redesign/components/Fields.tsx src/components/Fields.tsx
  cp design-backup-before-redesign/pages/*.tsx src/pages/

Dieser Ordner wird nicht importiert und nicht gebaut (liegt außerhalb von src/).
