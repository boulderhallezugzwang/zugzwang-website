# Zugzwang Website & Google Apps Scripts

Website und Backend-Scripts für den **Boulderverein Zugzwang e.V.** — Boulderhalle in Auerbach i.d.OPf.

**Live:** https://boulderhallezugzwang.github.io/zugzwang-website

---

## Projektstruktur

```
├── index.html              ← Startseite (Öffnungszeiten, News, Preise, Bilder)
├── verein.html             ← Vereinsseite (Vorstand, Beiträge, Hallendienst)
├── jugendtraining.html     ← Anmeldeformular Jugendtraining
├── info.html               ← Satzung, Datenschutz, Haftungsausschluss, Downloads
├── intern.html             ← Interner Bereich (Mitgliederliste, Chipverwaltung)
├── antrag.html             ← Mitgliedsantrag
├── kuendigung.html         ← Kündigungsformular
├── impressum.html          ← Impressum
├── img/                    ← Lokale Bilder (Vorstand etc.)
└── scripts/                ← Google Apps Scripts (Backend)
    ├── CMS/                ← Website-API (Bilder, News, Kalender)
    ├── Hallendienst/       ← Hallendienst Web-App + Spreadsheet-Menü
    ├── Haftungsausschluss/ ← Haftungsausschluss mit PDF-Generierung
    ├── Jugendtraining/     ← Jugendtraining-Anmeldung
    ├── Kündigung/          ← Kündigungs-Backend
    ├── Mitgliederliste/    ← Mitglieder-API (passwortgeschützt)
    └── Mitgliedsantrag/    ← Mitgliedsantrag + ClubDesk-Integration
```

---

## Voraussetzungen

- Google-Konto mit Zugriff auf das Vereins-Spreadsheet
- Google Drive Ordner für Bilder, News und Haftungsausschluss-PDFs
- GitHub-Konto für die Website (GitHub Pages)

---

## Google Spreadsheet

Alle Scripts verwenden dasselbe Spreadsheet mit folgenden Tabs:

| Tab | Beschreibung |
|-----|-------------|
| *Erstes Sheet* | Mitgliederliste (Nachname, Vorname, Status, Chip, etc.) |
| Hallendienst | Hallendiensttermine (Datum, Status, Vorname, Nachname, E-Mail, Mobilnr) |
| Haftungsausschlüsse | Eingegangene Haftungsausschlüsse mit PDF-Links |
| Jugendtraining | Anmeldungen zum Jugendtraining mit SEPA-Daten |
| Kündigungen | Eingegangene Kündigungen |

Die Tabs werden automatisch erstellt, falls sie nicht existieren.

---

## Scripts einrichten

### Übersicht

| Script | Typ | Datei | Deployment |
|--------|-----|-------|------------|
| CMS Backend | Standalone Web-App | `scripts/CMS/cms-backend.gs` | Eigenes Projekt |
| Hallendienst | Standalone Web-App | `scripts/Hallendienst/hallendienst-script.gs` | Eigenes Projekt |
| Hallendienst Menü | Gebunden | `scripts/Hallendienst/gebunden_Menue.gs` | Im Spreadsheet |
| Haftungsausschluss | Standalone Web-App | `scripts/Haftungsausschluss/haftung-script.gs` | Eigenes Projekt |
| Jugendtraining | Standalone Web-App | `scripts/Jugendtraining/jugendtraining-script.gs` | Eigenes Projekt |
| Kündigung | Standalone Web-App | `scripts/Kündigung/kuendigung-script-2.gs` | Eigenes Projekt |
| Mitgliederliste | Standalone Web-App | `scripts/Mitgliederliste/mitgliederliste-script.gs` | Eigenes Projekt |
| Mitgliedsantrag | Gebunden | `scripts/Mitgliedsantrag/google-apps-script-5.gs` | Im Spreadsheet |

---

### 1. CMS Backend (Bilder, News, Kalender)

Liefert Bilder, News und Kalender-Termine als JSON an die Website.

**Einrichten:**
1. https://script.google.com → **Neues Projekt** erstellen
2. Code aus `scripts/CMS/cms-backend.gs` einfügen
3. Google Drive Ordner anlegen und IDs anpassen:
   - `IMAGES_FOLDER_ID` — Ordner für Bildkarussell (JPG/PNG/WebP)
   - `NEWS_FOLDER_ID` — Ordner für News (Google Docs)
   - `LOGO_FOLDER_ID` — Ordner für Logo + Hintergrundbild
4. Kalender-IDs in `CONFIG.CALENDARS` prüfen/anpassen
5. **Deploy → Web-App** (Ausführen als: Ich, Zugriff: Jeder)
6. Web-App-URL in `index.html` eintragen (Variable `API_URL`)

**API-Endpunkte:**
- `?action=images` — Bilder aus Drive
- `?action=news` — News aus Google Docs
- `?action=calendar` — Kalender-Termine (90 Tage)
- `?action=all` — Alles zusammen

**News-Dokumente:** Google Docs im News-Ordner mit folgendem Aufbau:
- Zeile 1: Titel
- Zeile 2: Datum (TT.MM.JJJJ)
- Zeile 3: Autor
- Ab Zeile 4: Inhalt

**Drive-Ordner müssen öffentlich geteilt sein** ("Jeder mit dem Link"), damit Bilder auf der Website angezeigt werden.

---

### 2. Hallendienst

Mitglieder können sich online für Hallendienste eintragen. Erstellt automatisch Kalendereinträge.

**Standalone Web-App (`hallendienst-script.gs`):**
1. https://script.google.com → **Neues Projekt**
2. Code einfügen
3. `CALENDAR_ID` prüfen (Öffnungszeiten-Kalender)
4. **Deploy → Web-App** (Ausführen als: Ich, Zugriff: Jeder)
5. Web-App-URL in `verein.html` eintragen (Variable `HD_URL`)

**Gebundenes Script (`gebunden_Menue.gs`):**
1. Spreadsheet öffnen → **Erweiterungen → Apps Script**
2. Code einfügen (ggf. in bestehende Datei)
3. Spreadsheet neu laden → Menü "Hallendienst" erscheint

**Spreadsheet-Menü:**
- **Termine generieren** — Erstellt Hallendiensttermine für Zeitraum (Mi/Fr/So wählbar)
- **Termine absagen** — Belegte Termine stornieren (setzt inaktiv, sendet Absage-Mail, löscht Kalendereinträge)
- **Vergangene ausblenden** — Setzt vergangene Termine auf "inaktiv"

**Öffnungszeiten:**
- Mittwoch: 18:00 – 21:00
- Freitag: 18:00 – 21:00
- Sonntag: 14:00 – 17:00

---

### 3. Haftungsausschluss

Generiert PDF-Haftungsausschlüsse mit Datenschutzerklärung. Unterstützt Erwachsene und Minderjährige (mit Erziehungsberechtigtem).

**Einrichten:**
1. https://script.google.com → **Neues Projekt**
2. Code aus `scripts/Haftungsausschluss/haftung-script.gs` einfügen
3. Google Drive Ordner "Haftungsausschlüsse" anlegen
4. `PDF_FOLDER_ID` mit der Ordner-ID aktualisieren
5. **Deploy → Web-App** (Ausführen als: Ich, Zugriff: Jeder)
6. Web-App-URL im Haftungsausschluss-Formular auf der Website eintragen

**Funktionsweise:**
- Formular wird ausgefüllt → Script erstellt Google Doc → exportiert als PDF
- PDF wird im Drive-Ordner gespeichert
- Bestätigungsmail mit PDF-Anhang wird an den Nutzer gesendet
- Daten werden im Sheet "Haftungsausschlüsse" gespeichert

---

### 4. Jugendtraining

Anmeldeformular für das Jugendtraining mit SEPA-Lastschriftmandat.

**Einrichten:**
1. https://script.google.com → **Neues Projekt**
2. Code einfügen
3. **Deploy → Web-App** (Ausführen als: Ich, Zugriff: Jeder)
4. Web-App-URL in `jugendtraining.html` eintragen

**Mandatsreferenz:** Wird automatisch generiert im Format `JT-YYYY-NNNN` (z.B. JT-2026-0001).

---

### 5. Kündigung

Verarbeitet Mitgliedschaftskündigungen. Setzt den Status im Mitglieder-Sheet automatisch auf "gekündigt".

**Einrichten:**
1. https://script.google.com → **Neues Projekt**
2. Code einfügen
3. **Deploy → Web-App** (Ausführen als: Ich, Zugriff: Jeder)
4. Web-App-URL in `kuendigung.html` eintragen

**Funktionsweise:**
- Kündigung wird im Tab "Kündigungen" eingetragen
- Status im Mitglieder-Sheet wird auf "gekündigt (Datum)" gesetzt
- Bestätigungsmail mit Chip-Rücksende-Infos wird verschickt
- Falls Mitglied nicht gefunden: Fehlermeldung per Mail

---

### 6. Mitgliederliste (API)

Passwortgeschützte API für den internen Bereich der Website (Mitgliederliste, Chipverwaltung).

**Einrichten:**
1. https://script.google.com → **Neues Projekt**
2. Code einfügen
3. `API_PASSWORD` ggf. ändern
4. **Deploy → Web-App** (Ausführen als: Ich, Zugriff: Jeder)
5. Web-App-URL und Passwort in `intern.html` eintragen

**API-Parameter:**
- `?pw=PASSWORT` — Authentifizierung (erforderlich)
- `?pw=PASSWORT&action=updateChip&nachname=X&vorname=Y&chip=Z&chipnr=N` — Chip aktualisieren

---

### 7. Mitgliedsantrag (Gebunden)

Verarbeitet Mitgliedsanträge inkl. Familienmitglieder und SEPA-Mandat. Enthält ClubDesk CSV-Export/Import.

**Einrichten:**
1. Spreadsheet öffnen → **Erweiterungen → Apps Script**
2. Code aus `scripts/Mitgliedsantrag/google-apps-script-5.gs` einfügen
3. Spreadsheet neu laden → Menü "ClubDesk" erscheint

**Spreadsheet-Menü:**
- **ClubDesk → Markierte Zeilen exportieren (CSV)** — Export für ClubDesk
- **ClubDesk → CSV importieren** — Import aus ClubDesk

**Mandatsreferenz:** Format `ZZ-YYYY-NNNN` (z.B. ZZ-2026-0001).

---

## Website (GitHub Pages)

Die Website wird über GitHub Pages gehostet.

**Deployment:**
1. Änderungen committen und auf `main` pushen
2. GitHub Pages ist automatisch aktiv (Settings → Pages → Branch: main)
3. Seite ist erreichbar unter: https://boulderhallezugzwang.github.io/zugzwang-website

**Nach Script-Änderungen:**
1. Code im Google Apps Script Editor aktualisieren
2. **Neues Deployment erstellen** (nicht das bestehende bearbeiten!)
3. Falls sich die URL ändert: URL in der jeweiligen HTML-Datei aktualisieren und pushen

---

## Wichtige Hinweise

- **Erstmalige Autorisierung:** Jedes Script muss beim ersten Ausführen autorisiert werden. Dazu eine beliebige Funktion im Apps Script Editor ausführen und den Autorisierungsdialog bestätigen.
- **Neue Deployments:** Bei Änderungen am Script immer ein **neues Deployment** erstellen. Das alte Deployment zeigt weiterhin den alten Code!
- **E-Mail-Adresse:** Alle Scripts verwenden `boulderhallezugzwang@gmail.com` als Absender.
- **Spreadsheet-ID:** Alle Scripts greifen auf dasselbe Spreadsheet zu: `1HGhz-q7zWtYYFvLr8hnUZ2Yzz8p_p_e5NPYmwokluN8`

---

## Kontakt

Boulderverein Zugzwang e.V.
Neuhauser Straße 1, 91275 Auerbach i.d.OPf.
boulderhallezugzwang@gmail.com
