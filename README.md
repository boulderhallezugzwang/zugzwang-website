# Zugzwang Webseite & Google Apps Scripts

Webseite und Backend-Scripts für den **Boulderverein Zugzwang e.V.** — Boulderhalle in Auerbach i.d.OPf.

**Webseite:** https://boulderhallezugzwang.github.io/zugzwang-website

---

## Projektstruktur

```
├── index.html                  ← Startseite (Öffnungszeiten, News, Preise, Bilder)
├── verein.html                 ← Vereinsseite (Vorstand, Beiträge, Hallendienst)
├── jugendtraining.html         ← Anmeldeformular Jugendtraining
├── info.html                   ← Satzung, Datenschutz, Haftungsausschluss, Downloads
├── intern.html                 ← Interner Bereich (Anmeldung, Mitglieder, Termine, News, Newsletter)
├── antrag.html                 ← Mitgliedsantrag-Formular
├── haftung.html                ← Haftungsausschluss-Formular
├── kuendigung.html             ← Kündigungsformular
├── impressum.html              ← Impressum
├── img/                        ← Lokale Bilder (Hero, Logo, Vorstand)
└── scripts/                    ← Google Apps Scripts (Referenzkopien vom Backend)
    ├── manifest/
    │   └── appsscript.json     ← OAuth-Berechtigungen + Manifest für gebundenes Projekt
    ├── CMS/
    │   └── cms-backend.gs      ← Öffentliche Webseiten-API (Bilder, News, Kalender)
    ├── Mitgliederliste/
    │   ├── mitgliederliste-script.gs   ← HAUPT-BACKEND (Anmeldung, Mitglieder, Kalender, News, Newsletter, Antrag)
    │   └── EINRICHTUNG.md
    ├── Hallendienst/
    │   ├── hallendienst-script.gs      ← Hallendienst Web-App (eigenständig)
    │   ├── hallendienst-menu.gs        ← Hallendienst Menü (eigenständig)
    │   ├── gebunden_Menue.gs           ← Spreadsheet-Menü (gebunden)
    │   ├── gebunden_Mitgliedsantrag.gs ← ClubDesk Export/Import (gebunden)
    │   ├── gebunden_Kuendigungen.gs    ← Kündigungs-Verarbeitung (gebunden)
    │   └── menue-script.gs            ← Menü-Erstellung (gebunden)
    ├── Haftungsausschluss/
    │   └── haftung-script.gs           ← Haftungsausschluss mit PDF-Erstellung
    ├── Jugendtraining/
    │   └── jugendtraining-script.gs    ← Jugendtraining-Anmeldung
    ├── Kündigung/
    │   └── kuendigung-script-2.gs      ← Kündigungs-Backend
    └── Mitgliedsantrag/
        ├── google-apps-script-5.gs     ← Eigenständige Referenz (NICHT im gebundenen Projekt)
        └── EINRICHTUNG.md
```

---

## Aufbau und Architektur

### Gebundenes Projekt (ans Spreadsheet gebunden)

Das zentrale Backend läuft als **gebundenes Apps Script** im Vereins-Spreadsheet. Es enthält mehrere `.gs`-Dateien, die zusammen als ein Projekt bereitgestellt werden:

| Datei im Apps Script Editor | Referenz im Repo | Funktion |
|---|---|---|
| `mitgliederliste-script.gs` | `scripts/Mitgliederliste/` | **Haupt-Backend**: Anmeldung, Mitgliederliste, Kalender-Verwaltung, News-Verwaltung, Newsletter, Mitgliedsantrag |
| `gebunden_Mitgliedsantrag.gs` | `scripts/Hallendienst/` | ClubDesk CSV-Export/Import |
| `gebunden_Menue.gs` | `scripts/Hallendienst/` | Spreadsheet-Menüs (Hallendienst, ClubDesk) |
| `gebunden_Kuendigungen.gs` | `scripts/Hallendienst/` | Kündigungen im Sheet verarbeiten |
| `menue-script.gs` | `scripts/Hallendienst/` | onOpen-Menü-Erstellung |
| `appsscript.json` | `scripts/manifest/` | OAuth-Berechtigungen (Drive, Docs, Kalender, Mail) |

**Eine Bereitstellung** ergibt eine Web-App-URL für alles.

### Eigenständige Web-Apps (separate Projekte)

| Script | Datei | Zweck |
|---|---|---|
| CMS Backend | `scripts/CMS/cms-backend.gs` | Öffentliche API für die Webseite (Bilder, News, Kalender) |
| Hallendienst | `scripts/Hallendienst/hallendienst-script.gs` | Hallendienst-Eintragung |
| Haftungsausschluss | `scripts/Haftungsausschluss/haftung-script.gs` | PDF-Erstellung |
| Jugendtraining | `scripts/Jugendtraining/jugendtraining-script.gs` | Anmeldeformular |
| Kündigung | `scripts/Kündigung/kuendigung-script-2.gs` | Kündigungsformular |

Jedes eigenständige Script hat seine eigene Bereitstellung mit eigener URL.

---

## Google Spreadsheet

**ID:** `1HGhz-q7zWtYYFvLr8hnUZ2Yzz8p_p_e5NPYmwokluN8`

| Tab | Beschreibung |
|-----|-------------|
| Mitglieder | Mitgliederliste (Nachname, Vorname, Status, Chip, E-Mail, IBAN usw.) |
| Benutzer | Anmeldedaten für intern.html (Benutzername, Anzeigename, Rolle, Passwort) |
| Hallendienst | Hallendiensttermine (Datum, Status, Name, E-Mail) |
| Haftungsausschlüsse | Eingegangene Haftungsausschlüsse mit PDF-Links |
| Jugendtraining | Anmeldungen zum Jugendtraining |
| Kündigungen | Eingegangene Kündigungen |

### Benutzer-Tab (für intern.html)

| Spalte | Inhalt |
|--------|--------|
| A | Benutzername (zum Anmelden) |
| B | Anzeigename |
| C | Rolle (`admin` oder `mitglied`) |
| D | Passwort |
| E | Erstanmeldung (`Ja`/`Nein`) |

Der Admin legt neue Benutzer an: Benutzername + Anzeigename + Rolle + ein erstes Passwort + Erstanmeldung=Ja. Beim ersten Anmelden wird der Benutzer aufgefordert, sein Passwort zu ändern.

---

## Google Drive Ordner

| Ordner | ID | Inhalt |
|--------|----|--------|
| Zugzwang_Bilder | `1zXWq7cgjcRQXM8bWXXEt1Ads4JzdjTSf` | Bilder fürs Karussell (JPG/PNG/WebP) |
| Zugzwang_News | `1gql-ifQ24MvQNuKuwemyFtzJxOd7nN14` | News als Google Docs |
| Zugzwang_Logo | `1bFCAwmz1LPouI7rKtOazFNJdgMu_OpyP` | Logo + Hintergrundbild |

**Die Ordner müssen öffentlich geteilt sein** ("Jeder mit dem Link"), damit die Bilder auf der Webseite angezeigt werden.

---

## Google Kalender

| Kalender | Schlüssel | Beschreibung |
|----------|-----------|-------------|
| Öffnungszeiten | `oeffnungszeiten` | Reguläre Öffnungszeiten |
| Events | `events` | Vereinsveranstaltungen |
| Trainingstermine | `trainingstermine` / `training` | Jugendtraining usw. |
| Arbeitsdienste | `arbeitsdienste` / `arbeitsdienst` | Arbeitsdienste |

Die Kalender-IDs sind in `cms-backend.gs` (öffentlich) und `mitgliederliste-script.gs` (intern) hinterlegt.

---

## Interner Bereich (intern.html)

Der interne Bereich bietet 5 Bereiche:

### 1. Mitgliederliste
- Suche, Sortierung, Chip-Bearbeitung (nur Admin)
- Zeigt: Name, Telefon, E-Mail, Status, Ort, Chip/ChipNr.

### 2. Hallendienst
- Zeigt die kommenden Hallendienste

### 3. Termine
- Kalender-Termine erstellen, bearbeiten, löschen
- E-Mail-Versand bei jeder Aktion wählbar: keine Mail / an alle Mitglieder / an bestimmte Adressen
- Mail-Status wird im Kalender-Termin gespeichert (ZZ-MAIL-Kennzeichnung in der Beschreibung)
- ICS-Kalenderdatei als Anhang

### 4. News
- Google Docs im News-Ordner erstellen, bearbeiten, löschen
- Bild-Upload für Vorschaubild
- Die Docs werden vom CMS-Backend auf der öffentlichen Webseite angezeigt

### 5. Newsletter
- Texteditor (Quill.js) mit Formatierung und Bild-Einbettung
- HTML-E-Mails mit Klartext-Rückfallebene
- Bilder werden als eingebettete Anhänge gesendet (kompatibel mit Gmail, Outlook usw.)
- Versand an alle Mitglieder oder an bestimmte Adressen

### Schnittstellen (Haupt-Backend)

**POST-Anfragen** (JSON über `Content-Type: text/plain` um CORS-Probleme zu vermeiden):

| Aktion | Beschreibung | Anmeldung |
|--------|-------------|-----------|
| `login` | Anmeldung → Mitgliederdaten | Benutzername + Passwort |
| `setPassword` | Passwort ändern (Erstanmeldung) | Benutzername + altes PW + neues PW |
| `getEvents` | Kalender-Termine laden | Benutzername + Passwort |
| `createEvent` | Termin erstellen + optional Mail | Benutzername + Passwort |
| `updateEvent` | Termin bearbeiten + optional Mail | Benutzername + Passwort |
| `deleteEvent` | Termin löschen + optional Mail | Benutzername + Passwort |
| `getNews` | News-Liste laden | Benutzername + Passwort |
| `createNews` | News erstellen (Google Doc) | Benutzername + Passwort |
| `updateNews` | News bearbeiten | Benutzername + Passwort |
| `deleteNews` | News löschen | Benutzername + Passwort |
| `sendNewsletter` | Newsletter versenden (HTML+Text) | Benutzername + Passwort |
| *(keine Aktion)* | Mitgliedsantrag verarbeiten | — (öffentlich) |

**GET-Anfragen:**

| Aktion | Beschreibung |
|--------|-------------|
| `updateChip` | Chip-Daten aktualisieren (nur Admin) |

### Web-App-URLs

| Zweck | Variable in intern.html |
|-------|------------------------|
| Haupt-Backend (Mitgliederliste) | `API_URL` |
| Hallendienst | `HD_API_URL` |

---

## Anleitung: Bereitstellung

### Gebundenes Projekt (Haupt-Backend)

1. Spreadsheet öffnen → **Erweiterungen → Apps Script**
2. Folgende Dateien im Editor pflegen:
   - `mitgliederliste-script.gs` — Hauptlogik
   - `gebunden_Mitgliedsantrag.gs` — ClubDesk Export/Import
   - `gebunden_Menue.gs` — Spreadsheet-Menüs
   - `gebunden_Kuendigungen.gs` — Kündigungen
   - `menue-script.gs` — onOpen
3. **appsscript.json** im Editor einschalten: Projekteinstellungen → "appsscript.json-Manifestdatei im Editor anzeigen" → Inhalt aus `scripts/manifest/appsscript.json` einfügen
4. **Bereitstellen → Neue Bereitstellung → Web-App**
   - Ausführen als: Ich (dein Google-Konto)
   - Zugriff: Jeder (auch anonym)
5. Beim ersten Mal: Autorisierungsdialog bestätigen (Drive, Docs, Kalender, Mail)

**Wichtig:** Bei jeder Code-Änderung eine **neue Bereitstellung** erstellen! Die alte Bereitstellung zeigt weiterhin den alten Code.

### Eigenständige Web-Apps

1. https://script.google.com → **Neues Projekt** erstellen
2. Code aus der jeweiligen `.gs`-Datei einfügen
3. **Bereitstellen → Web-App** (Ausführen als: Ich, Zugriff: Jeder)
4. Web-App-URL in der jeweiligen HTML-Datei eintragen

### Webseite (GitHub Pages)

1. Änderungen committen und auf `main` pushen
2. GitHub Pages ist automatisch aktiv
3. Erreichbar unter: https://boulderhallezugzwang.github.io/zugzwang-website

---

## Anleitung: Neuen Benutzer anlegen

1. Spreadsheet öffnen → Tab "Benutzer"
2. Neue Zeile ausfüllen: Benutzername | Anzeigename | `admin` oder `mitglied` | erstes Passwort | `Ja`
3. Dem Benutzer seinen Benutzernamen und das erste Passwort mitteilen
4. Beim ersten Anmelden wird automatisch zur Passwort-Änderung aufgefordert

**Passwort zurücksetzen:** Passwort im Sheet ändern + Erstanmeldung auf `Ja` setzen.

---

## Anleitung: News veröffentlichen

1. Im internen Bereich → Tab "News"
2. Titel, Datum, Autor und Text eingeben + optional ein Bild hochladen
3. "Erstellen" klicken → es wird ein Google Doc im News-Ordner angelegt
4. Die News erscheint automatisch auf der öffentlichen Webseite (über das CMS-Backend)

---

## Anleitung: Newsletter versenden

1. Im internen Bereich → Tab "Newsletter"
2. Betreff eingeben
3. Nachricht im Texteditor verfassen (Formatierung, Bilder, Links möglich)
4. Empfänger wählen: alle Mitglieder oder bestimmte E-Mail-Adressen
5. "Senden" klicken → HTML-Mail mit Klartext-Rückfallebene wird verschickt

---

## Wichtige Hinweise

- **E-Mail-Absender:** `boulderhallezugzwang@gmail.com` (Google Apps Script sendet im Namen des Kontos, das die Bereitstellung erstellt hat)
- **E-Mail-Limit:** Google Apps Script erlaubt ca. 100 Mails pro Tag (kostenlos) bzw. 1500 pro Tag (Workspace)
- **Autorisierung:** Wenn neue Berechtigungen hinzugefügt werden (appsscript.json), muss neu autorisiert werden: Dazu eine beliebige Funktion im Script-Editor einmal manuell ausführen
- **CORS:** POST-Anfragen an Apps Script müssen `Content-Type: text/plain` verwenden und `redirect: 'follow'` setzen
- **Kalender-Mail-Status:** Wird als `[ZZ-MAIL:all:42]`, `[ZZ-MAIL:custom:3]` oder `[ZZ-MAIL:none]` in der Termin-Beschreibung gespeichert

---

## Kontakt

Boulderverein Zugzwang e.V.
Neuhauser Straße 1, 91275 Auerbach i.d.OPf.
boulderhallezugzwang@gmail.com
