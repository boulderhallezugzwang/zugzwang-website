# Einrichtungsanleitung – Mitgliedsantrag Boulderverein Zugzwang e.V.

## Übersicht

```
Antragsteller → HTML-Formular (iframe in ClubDesk) → Google Apps Script → Google Sheet
                     ↓                                       ↓
              IBAN-Validierung                    Bestätigungsmail an Mitglied
              im Browser                          + Benachrichtigung an Verein
```

---

## Schritt 1: Google Sheet anlegen

1. Gehe zu [Google Sheets](https://sheets.google.com) und erstelle ein neues Sheet
2. Benenne es z.B. **„Mitgliedsanträge Zugzwang"**
3. Die Spaltenüberschriften werden automatisch vom Script angelegt

---

## Schritt 2: Google Apps Script einrichten

1. Im Google Sheet: **Erweiterungen → Apps Script**
2. Den gesamten vorhandenen Code löschen
3. Den Inhalt der Datei **`google-apps-script.gs`** einfügen
4. Oben die `VEREIN_EMAIL` anpassen (falls anders als info@boulderhalle-auerbach.de)
5. **Speichern** (Strg+S)

### Script als Web-App veröffentlichen:

1. Klicke auf **Bereitstellen → Neue Bereitstellung**
2. Klicke auf das Zahnrad und wähle **Web-App**
3. Einstellungen:
   - **Beschreibung:** Mitgliedsantrag
   - **Ausführen als:** Ich (deine E-Mail)
   - **Zugriff:** **Jeder** (wichtig! Sonst funktioniert das Formular nicht)
4. Klicke auf **Bereitstellen**
5. Google fragt nach Berechtigungen → **Zugriff erlauben**
6. **Kopiere die angezeigte Web-App-URL** – die sieht so aus:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec


   ```

### Testen:

1. Im Apps Script Editor die Funktion **`testDoPost`** auswählen und ausführen
2. Prüfe, ob im Sheet eine Testzeile erscheint
3. Prüfe, ob eine Test-E-Mail ankommt

---

## Schritt 3: HTML-Formular konfigurieren bei GitHub siehe unten

1. Öffne die Datei **`mitgliedsantrag.html`** in einem Texteditor
2. Suche die Zeile:
   ```javascript
   const SCRIPT_URL = 'HIER_DEINE_GOOGLE_APPS_SCRIPT_URL';
   ```
3. Ersetze den Platzhalter durch deine Web-App-URL aus Schritt 2

---

## Schritt 4: HTML-Datei hosten

Das Formular muss irgendwo im Internet erreichbar sein. Kostenlose Optionen:

### Option A: GitHub Pages (empfohlen)
1. Erstelle ein [GitHub](https://github.com)-Konto (falls noch nicht vorhanden)
2. Erstelle ein neues Repository, z.B. `zugzwang-antrag`
3. Lade `mitgliedsantrag.html` hoch (umbenannt in `index.html`)
4. Unter **Settings → Pages → Source** wähle „main" Branch
5. Deine URL wird: `https://DEIN-USERNAME.github.io/zugzwang-antrag/`

Mitgliedsantrag Webseite bei Github:

GIT Zugang: boulderhallezugzwang@gmail.com per google account
die letzte Version des HTML Formulars ist dort gespeichert.

https://boulderhallezugzwang.github.io/zugzwang_antrag/

### Option B: Google Sites
1. Erstelle eine Google Sites-Seite
2. Füge einen „Einbetten"-Block hinzu und verwende den gesamten HTML-Code

### Option C: Netlify Drop
1. Gehe zu [Netlify Drop](https://app.netlify.com/drop)
2. Ziehe den Ordner mit `index.html` per Drag & Drop hinein
3. Sofort live mit einer netlify.app-URL

---

## Schritt 5: In ClubDesk einbinden

1. Logge dich in ClubDesk ein
2. Gehe zu **Webseite → Verein → Mitgliedsantrag** (oder erstelle eine neue Seite)
3. Füge einen **HTML-Block** ein
4. Füge folgenden Code ein (URL anpassen!):

```html
<iframe
  src="https://boulderhallezugzwang.github.io/zugzwang_antrag/index.html"
  width="100%"
  height="1400"
  frameborder="0"
  style="border: none; max-width: 700px;"
  title="Mitgliedsantrag">
</iframe>
```

5. Die **Höhe** ggf. anpassen (1200–1500px je nach Bildschirmgröße)
6. Speichern und Vorschau prüfen

---

## Schritt 6: CSV-Export für ClubDesk-Import

1. Öffne das Google Sheet mit den Mitgliedsanträgen
2. **Datei → Herunterladen → Kommagetrennte Werte (.csv)**
3. In ClubDesk: **Kontakte → Import → CSV-Datei**
4. Spalten zuordnen (Vorname → Vorname, usw.)

> **Tipp:** Benenne die Spalten im Sheet genauso wie die ClubDesk-Kontaktfelder – dann geht der Import schneller.

---

## Hinweise

- **Bestätigungsmail:** Wird über das Gmail-Konto gesendet, mit dem das Apps Script erstellt wurde. Täglich max. 100 Mails (kostenloser Google-Account) bzw. 1500 (Google Workspace).
- **DSGVO:** In der Datenschutzerklärung auf der ClubDesk-Seite erwähnen, dass Daten über Google-Dienste verarbeitet werden.
- **IBAN-Validierung:** Prüft Format, Länge und Prüfziffer (Modulo 97) für alle SEPA-Länder. Prüft **nicht** ob das Konto existiert.
- **Änderungen am Formular:** Nach Änderung der HTML-Datei muss diese erneut hochgeladen werden (bei GitHub einfach committen).
- **Bei Problemen:** Apps Script → Ausführungsprotokoll prüfen (Ausführungen → Protokolle).
