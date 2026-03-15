# Zugzwang Website & Google Apps Scripts

Website und Backend-Scripts für den **Boulderverein Zugzwang e.V.** — Boulderhalle in Auerbach i.d.OPf.

**Live:** https://boulderhallezugzwang.github.io/zugzwang-website

---

## Projektstruktur

```
├── index.html                  ← Startseite (Öffnungszeiten, News, Preise, Bilder)
├── verein.html                 ← Vereinsseite (Vorstand, Beiträge, Hallendienst)
├── jugendtraining.html         ← Anmeldeformular Jugendtraining
├── info.html                   ← Satzung, Datenschutz, Haftungsausschluss, Downloads
├── intern.html                 ← Internes Dashboard (Login, Mitglieder, Termine, News, Newsletter)
├── antrag.html                 ← Mitgliedsantrag-Formular
├── haftung.html                ← Haftungsausschluss-Formular
├── kuendigung.html             ← Kündigungsformular
├── impressum.html              ← Impressum
├── img/                        ← Lokale Bilder (Hero, Logo, Vorstand)
└── scripts/                    ← Google Apps Scripts (Backend-Referenzkopien)
    ├── manifest/
    │   └── appsscript.json     ← OAuth-Scopes + Manifest für gebundenes Projekt
    ├── CMS/
    │   └── cms-backend.gs      ← Öffentliche Website-API (Bilder, News, Kalender)
    ├── Mitgliederliste/
    │   ├── mitgliederliste-script.gs   ← HAUPT-BACKEND (Auth, Mitglieder, Kalender, News, Newsletter, Antrag)
    │   └── EINRICHTUNG.md
    ├── Hallendienst/
    │   ├── hallendienst-script.gs      ← Hallendienst Web-App (standalone)
    │   ├── hallendienst-menu.gs        ← Hallendienst Menü (standalone)
    │   ├── gebunden_Menue.gs           ← Spreadsheet-Menü (gebunden)
    │   ├── gebunden_Mitgliedsantrag.gs ← ClubDesk Export/Import (gebunden)
    │   ├── gebunden_Kuendigungen.gs    ← Kündigungs-Verarbeitung (gebunden)
    │   └── menue-script.gs            ← Menü-Erstellung (gebunden)
    ├── Haftungsausschluss/
    │   └── haftung-script.gs           ← Haftungsausschluss mit PDF-Generierung
    ├── Jugendtraining/
    │   └── jugendtraining-script.gs    ← Jugendtraining-Anmeldung
    ├── Kündigung/
    │   └── kuendigung-script-2.gs      ← Kündigungs-Backend
    └── Mitgliedsantrag/
        ├── google-apps-script-5.gs     ← Standalone-Referenz (NICHT im gebundenen Projekt)
        └── EINRICHTUNG.md
```

---

## Architektur-Übersicht

### Gebundenes Projekt (ans Spreadsheet gebunden)

Das zentrale Backend läuft als **gebundenes Apps Script** im Vereins-Spreadsheet. Es enthält mehrere `.gs`-Dateien, die zusammen als ein Projekt deployed werden:

| Datei im Apps Script Editor | Referenz im Repo | Funktion |
|---|---|---|
| `mitgliederliste-script.gs` | `scripts/Mitgliederliste/` | **Haupt-Backend**: Auth, Mitgliederliste, Kalender-CRUD, News-CRUD, Newsletter, Mitgliedsantrag |
| `gebunden_Mitgliedsantrag.gs` | `scripts/Hallendienst/` | ClubDesk CSV-Export/Import |
| `gebunden_Menue.gs` | `scripts/Hallendienst/` | Spreadsheet-Menüs (Hallendienst, ClubDesk) |
| `gebunden_Kuendigungen.gs` | `scripts/Hallendienst/` | Kündigungen im Sheet verarbeiten |
| `menue-script.gs` | `scripts/Hallendienst/` | onOpen-Menü-Erstellung |
| `appsscript.json` | `scripts/manifest/` | OAuth-Scopes (Drive, Docs, Calendar, Mail) |

**Ein Deployment** → eine Web-App-URL für alles.

### Standalone Web-Apps (separate Projekte)

| Script | Datei | Zweck |
|---|---|---|
| CMS Backend | `scripts/CMS/cms-backend.gs` | Öffentliche API für Website (Bilder, News, Kalender) |
| Hallendienst | `scripts/Hallendienst/hallendienst-script.gs` | Hallendienst-Eintragung |
| Haftungsausschluss | `scripts/Haftungsausschluss/haftung-script.gs` | PDF-Generierung |
| Jugendtraining | `scripts/Jugendtraining/jugendtraining-script.gs` | Anmeldeformular |
| Kündigung | `scripts/Kündigung/kuendigung-script-2.gs` | Kündigungsformular |

Jedes Standalone-Script hat sein eigenes Deployment mit eigener URL.

---

## Google Spreadsheet

**ID:** `1HGhz-q7zWtYYFvLr8hnUZ2Yzz8p_p_e5NPYmwokluN8`

| Tab | Beschreibung |
|-----|-------------|
| Mitglieder | Mitgliederliste (Nachname, Vorname, Status, Chip, E-Mail, IBAN etc.) |
| Benutzer | Login-Daten für intern.html (Benutzername, Anzeigename, Rolle, Passwort) |
| Hallendienst | Hallendiensttermine (Datum, Status, Name, E-Mail) |
| Haftungsausschlüsse | Eingegangene Haftungsausschlüsse mit PDF-Links |
| Jugendtraining | Anmeldungen zum Jugendtraining |
| Kündigungen | Eingegangene Kündigungen |

### Benutzer-Tab (für intern.html)

| Spalte | Inhalt |
|--------|--------|
| A | Benutzername (Login) |
| B | Anzeigename |
| C | Rolle (`admin` oder `mitglied`) |
| D | Passwort |
| E | Erstanmeldung (`Ja`/`Nein`) |

Admin legt neue User an: Benutzername + Anzeigename + Rolle + initiales Passwort + Erstanmeldung=Ja. Beim ersten Login wird der User aufgefordert, sein Passwort zu ändern.

---

## Google Drive Ordner

| Ordner | ID | Inhalt |
|--------|----|--------|
| Zugzwang_Bilder | `1zXWq7cgjcRQXM8bWXXEt1Ads4JzdjTSf` | Bilder fürs Karussell (JPG/PNG/WebP) |
| Zugzwang_News | `1gql-ifQ24MvQNuKuwemyFtzJxOd7nN14` | News als Google Docs |
| Zugzwang_Logo | `1bFCAwmz1LPouI7rKtOazFNJdgMu_OpyP` | Logo + Hintergrundbild |

**Ordner müssen öffentlich geteilt sein** ("Jeder mit dem Link"), damit Bilder auf der Website angezeigt werden.

---

## Google Kalender

| Kalender | Schlüssel | Beschreibung |
|----------|-----------|-------------|
| Öffnungszeiten | `oeffnungszeiten` | Reguläre Öffnungszeiten |
| Events | `events` | Vereinsveranstaltungen |
| Trainingstermine | `trainingstermine` / `training` | Jugendtraining etc. |
| Arbeitsdienste | `arbeitsdienste` / `arbeitsdienst` | Arbeitsdienste |

Die Kalender-IDs sind in `cms-backend.gs` (öffentlich) und `mitgliederliste-script.gs` (intern) konfiguriert.

---

## Interner Bereich (intern.html)

Das interne Dashboard bietet 5 Tabs:

### 1. Mitgliederliste
- Suche, Sortierung, Chip-Bearbeitung (nur Admin)
- Zeigt: Name, Telefon, E-Mail, Status, Ort, Chip/ChipNr.

### 2. Hallendienst
- Zeigt kommende Hallendienste aus dem Hallendienst-Script

### 3. Termine
- Kalender-Events erstellen, bearbeiten, löschen
- E-Mail-Versand bei jeder Aktion wählbar: keine / alle Mitglieder / custom Adressen
- Mail-Status wird im Kalender-Event gespeichert (ZZ-MAIL Tag in Beschreibung)
- ICS-Kalenderdatei als Anhang

### 4. News
- Google Docs im News-Ordner erstellen, bearbeiten, löschen
- Bild-Upload (Base64) für Vorschaubild
- Docs werden vom CMS-Backend auf der öffentlichen Website angezeigt

### 5. Newsletter
- Rich-Text-Editor (Quill.js) mit Formatierung und Bild-Einbettung
- HTML-E-Mails mit Plaintext-Fallback
- Bilder werden als CID-Inline-Images gesendet (kompatibel mit Gmail, Outlook etc.)
- Versand an alle Mitglieder oder custom Adressen

### API-Endpunkte (Haupt-Backend)

**POST-Requests** (JSON via `Content-Type: text/plain` um CORS-Preflight zu vermeiden):

| Action | Beschreibung | Auth |
|--------|-------------|------|
| `login` | Anmeldung → Mitgliederdaten | username + password |
| `setPassword` | Passwort ändern (Erstanmeldung) | username + oldPassword + newPassword |
| `getEvents` | Kalender-Termine laden | username + password |
| `createEvent` | Termin erstellen + optional Mail | username + password |
| `updateEvent` | Termin bearbeiten + optional Mail | username + password |
| `deleteEvent` | Termin löschen + optional Mail | username + password |
| `getNews` | News-Liste laden | username + password |
| `createNews` | News erstellen (Google Doc) | username + password |
| `updateNews` | News bearbeiten | username + password |
| `deleteNews` | News löschen | username + password |
| `sendNewsletter` | Newsletter versenden (HTML+Text) | username + password |
| *(kein action)* | Mitgliedsantrag verarbeiten | — (öffentlich) |

**GET-Requests:**

| Action | Beschreibung |
|--------|-------------|
| `updateChip` | Chip-Daten aktualisieren (nur Admin) |

### Web-App-URLs

| Zweck | Variable in intern.html |
|-------|------------------------|
| Haupt-Backend (Mitgliederliste) | `API_URL` |
| Hallendienst | `HD_API_URL` |

---

## Deployment-Anleitung

### Gebundenes Projekt (Haupt-Backend)

1. Spreadsheet öffnen → **Erweiterungen → Apps Script**
2. Folgende Dateien im Editor pflegen:
   - `mitgliederliste-script.gs` — Hauptlogik
   - `gebunden_Mitgliedsantrag.gs` — ClubDesk Export/Import
   - `gebunden_Menue.gs` — Spreadsheet-Menüs
   - `gebunden_Kuendigungen.gs` — Kündigungen
   - `menue-script.gs` — onOpen
3. **appsscript.json** im Editor aktivieren: Projekteinstellungen → "appsscript.json-Manifestdatei im Editor anzeigen" → Inhalt aus `scripts/manifest/appsscript.json` einfügen
4. **Deploy → Neue Bereitstellung → Web-App**
   - Ausführen als: Ich (dein Google-Konto)
   - Zugriff: Jeder (auch anonym)
5. Beim ersten Mal: Autorisierungsdialog bestätigen (Drive, Docs, Calendar, Mail)

**Wichtig:** Bei jeder Code-Änderung eine **neue Bereitstellung** erstellen! Das alte Deployment zeigt den alten Code.

### Standalone Web-Apps

1. https://script.google.com → **Neues Projekt** erstellen
2. Code aus der jeweiligen `.gs`-Datei einfügen
3. **Deploy → Web-App** (Ausführen als: Ich, Zugriff: Jeder)
4. Web-App-URL in der jeweiligen HTML-Datei eintragen

### Website (GitHub Pages)

1. Änderungen committen und auf `main` pushen
2. GitHub Pages ist automatisch aktiv
3. Live unter: https://boulderhallezugzwang.github.io/zugzwang-website

---

## Workflow: Neuen Benutzer anlegen

1. Spreadsheet öffnen → Tab "Benutzer"
2. Neue Zeile: Benutzername | Anzeigename | `admin` oder `mitglied` | initiales Passwort | `Ja`
3. Benutzer mitteilen: Benutzername + initiales Passwort
4. Beim ersten Login wird automatisch zur Passwort-Änderung aufgefordert

**Passwort zurücksetzen:** Passwort im Sheet ändern + Erstanmeldung auf `Ja` setzen.

---

## Workflow: News veröffentlichen

1. Im Intern-Dashboard → Tab "News"
2. Titel, Datum, Autor, Text eingeben + optional Bild hochladen
3. "Erstellen" klicken → Google Doc wird im News-Ordner angelegt
4. News erscheint automatisch auf der öffentlichen Website (via CMS-Backend)

---

## Workflow: Newsletter versenden

1. Im Intern-Dashboard → Tab "Newsletter"
2. Betreff eingeben
3. Nachricht im Rich-Text-Editor verfassen (Formatierung, Bilder, Links möglich)
4. Empfänger wählen: alle Mitglieder oder bestimmte E-Mail-Adressen
5. "Senden" klicken → HTML-Mail mit Plaintext-Fallback wird verschickt

---

## Wichtige Hinweise

- **E-Mail-Absender:** `boulderhallezugzwang@gmail.com` (Google Apps Script sendet im Namen des deploying Users)
- **E-Mail-Limit:** Google Apps Script erlaubt ca. 100 Mails/Tag (kostenlos) bzw. 1500/Tag (Workspace)
- **Autorisierung:** Wenn neue OAuth-Scopes hinzugefügt werden (appsscript.json), muss neu autorisiert werden: Script im Editor einmal manuell ausführen
- **CORS:** POST-Requests an Apps Script müssen `Content-Type: text/plain` verwenden + `redirect: 'follow'`
- **Kalender-Mail-Status:** Wird als `[ZZ-MAIL:all:42]`, `[ZZ-MAIL:custom:3]` oder `[ZZ-MAIL:none]` in der Event-Beschreibung gespeichert

---

## Kontakt

Boulderverein Zugzwang e.V.
Neuhauser Straße 1, 91275 Auerbach i.d.OPf.
boulderhallezugzwang@gmail.com
