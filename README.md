# Zugzwang Webseite & Google Apps Scripts

Webseite und Backend-Scripts für den **Boulderverein Zugzwang e.V.** — Boulderhalle in Auerbach i.d.OPf.

**Webseite:** https://zugzwang-auerbach.de

---

## Projektstruktur

```
├── index.html, verein.html, team.html, jugendtraining.html, info.html
├── antrag.html, haftung.html, kuendigung.html, impressum.html
├── rueckmeldung.html           ← Zu-/Absage zu einem Termin (Link aus der Termin-Mail, zählt ohne Namen)
├── dienst.html                 ← Austragen aus einem Hallen-/Helferdienst (Link aus der Bestätigungsmail)
├── intern.html                 ← Interner Bereich (Anmeldung, Mitglieder, Termine, News, Newsletter, Team, Bilder, Config)
├── data/                       ← ticker.json, team.json, carousel.json (werden aus intern.html per GitHub-API geschrieben)
├── img/                        ← Bilder
├── tests/backend.test.js       ← Tests der Backend-Logik: `node tests/backend.test.js .`
└── apps-script/                ← Google Apps Scripts, je Ordner ein Script-Projekt (mit clasp verknüpft)
    ├── mitgliederliste/        ← HAUPT-BACKEND, an die Tabelle gebunden (heißt in Google „Mitgliedsantrag“)
    │   ├── Mitgliederliste.gs  ← doPost/doGet: Anmeldung, Mitglieder, Kalender, News, Newsletter, Mitgliedsantrag,
    │   │                         Rückmeldungen, Helferdienste (Tabs „Helferdienste“ und „Dienste“)
    │   ├── Mitgliedsantrag.gs  ← ClubDesk CSV-Export/-Import (Tabellen-Menü)
    │   ├── Menue.gs            ← onOpen + Menüs (ClubDesk, Hallendienst, Verteiler)
    │   └── appsscript.json
    ├── _gemeinsam/dienste-kern.js  ← Vorlage für den Dienste-Block (Mitglieder erkennen, Tab „Dienste“, Zähler);
    │                               mit `node tests/sync-dienste-kern.js` in mitgliederliste + hallendienst übernehmen
    ├── hallendienst/Code.gs    ← Hallendienst-Eintragung (eigenständig)
    ├── kuendigung/Code.gs      ← Kündigungsformular
    ├── jugendtraining/Jugendtraining.gs
    ├── haftung/haftung-script.gs   ← Haftungsausschluss mit PDF
    └── cms/google drive cms.gs     ← Öffentliche API der Startseite (Bilder, News, Kalender)
```

---

## Apps Scripts bereitstellen (clasp)

Die Ordner unter `apps-script/` entsprechen 1:1 den Projekten in Google. Hochladen und bereitstellen mit
[clasp](https://github.com/google/clasp) (einmalig `npm install -g @google/clasp`, `clasp login` mit dem Vereinskonto):

```bash
cd apps-script/<projekt>
clasp push                                   # Code in den Editor laden
clasp list-deployments                       # ID der Web-App-Bereitstellung ablesen
clasp update-deployment <deploymentId> -d "Beschreibung"   # neue Version, URL bleibt gleich
clasp update-deployment <deploymentId> -V <alteVersion>    # zurückstellen
```

- `clasp push` ersetzt **alle** Dateien des Projekts durch den Ordnerinhalt.
- In einem Projekt darf es jede Funktion nur einmal geben (alle Dateien teilen einen Namensraum).
- `mitgliederliste` und `hallendienst` enthalten denselben Anmelde-Block (Passwort-Hash) und müssen zusammen bereitgestellt werden.
- Reihenfolge bei Änderungen an Formularen: erst Backend bereitstellen, dann Website pushen.

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
| D | Passwort (wird nach dem ersten Login automatisch durch einen Hash `zz1$…` ersetzt) |
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

Apps Scripts: siehe oben „Apps Scripts bereitstellen (clasp)“.

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
