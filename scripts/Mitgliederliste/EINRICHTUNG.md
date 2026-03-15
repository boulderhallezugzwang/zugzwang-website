# Einrichtungsanleitung – Mitgliederliste

## Übersicht

```
Vorstand → Mitgliederliste (passwortgeschützt) ← Google Apps Script ← Google Sheet
              Suche nach Name/E-Mail/Telefon        (separates Script)
```

### Dateien

| Datei | Zweck |
|---|---|
| `mitgliederliste.html` | Passwortgeschützte Mitgliedersuche (GitHub Pages) |
| `mitgliederliste-api.gs` | API: Sheet → JSON für Mitgliederliste |

---

## Schritt 1: API-Script erstellen

1. Öffne das Mitglieder-Sheet
2. **Erweiterungen → Apps Script**
3. Oben auf den Projektnamen klicken → umbenennen in z.B. „Mitgliederliste API"
4. **Neue Script-Datei** erstellen (+ Symbol)
5. Den Inhalt von **`mitgliederliste-api.gs`** einfügen
6. **Passwort ändern** in Zeile 10:
   ```javascript
   const API_PASSWORD = 'zugzwang2026';  // ← Eigenes Passwort setzen
   ```
7. **Speichern** (Strg+S)

## Schritt 2: Als Web-App veröffentlichen

1. **Bereitstellen → Neue Bereitstellung → Web-App**
2. Einstellungen:
   - **Ausführen als:** Ich
   - **Zugriff:** **Jeder**
3. Bereitstellen → **URL kopieren**
4. Falls „Google hat diese App nicht überprüft" erscheint: **Erweitert → Zu [Projektname] wechseln (unsicher)**

## Schritt 3: HTML konfigurieren

1. Öffne **`mitgliederliste.html`** in einem Texteditor
2. Suche die Zeile:
   ```javascript
   const API_URL = 'HIER_DEINE_MITGLIEDERLISTE_API_URL';
   ```
3. Ersetze den Platzhalter durch die URL aus Schritt 2

## Schritt 4: Hosten

Lade `mitgliederliste.html` auf GitHub Pages hoch:
- Im gleichen Repo → erreichbar unter `https://boulderhallezugzwang.github.io/zugzwang_antrag/mitgliederliste.html`
- Oder in einem eigenen Repo

---

## Updates

### Script aktualisieren:
1. **Erweiterungen → Apps Script** → Code ersetzen → Speichern
2. **Bereitstellen → Bereitstellungen verwalten → Stift-Symbol → Neue Version → Bereitstellen**
3. ⚠️ „Neue Version" wählen, NICHT „Neue Bereitstellung" – sonst ändert sich die URL

### Passwort ändern:
1. In `mitgliederliste-api.gs` Zeile 10 ändern
2. Neue Version bereitstellen (siehe oben)
