/**
 * ============================================================
 * ZUGZWANG — Google Drive CMS Backend
 * ============================================================
 *
 * Dieses Apps Script dient als API für die Zugzwang-Website.
 * Es liest Bilder und News aus Google Drive Ordnern und
 * liefert sie als JSON zurück.
 *
 * SETUP:
 * 1. Gehe zu https://script.google.com und erstelle ein neues Projekt
 * 2. Ersetze den Code in Code.gs mit diesem Script
 * 3. Erstelle zwei Ordner in Google Drive:
 *    - "Zugzwang_Bilder" (für das Bildkarussell)
 *    - "Zugzwang_News"   (für den Newsfeed — hier kommen Google Docs rein)
 * 4. Kopiere die Ordner-IDs aus der URL und trage sie unten ein
 * 5. Deploy → "Als Web-App bereitstellen"
 *    - Ausführen als: Ich
 *    - Zugriff: Jeder
 * 6. Die Web-App-URL ist deine API
 *
 * NUTZUNG:
 *   Bilder:  https://script.google.com/.../exec?action=images
 *   News:    https://script.google.com/.../exec?action=news
 *   Alles:   https://script.google.com/.../exec?action=all
 *
 * BILDER-ORDNER:
 *   Einfach JPG/PNG/WebP Dateien in den Ordner legen.
 *   Optional: Dateiname als Beschreibung nutzen, z.B.
 *   "Umschraubaktion Dezember 2025.jpg"
 *   Die Bilder werden nach Änderungsdatum sortiert (neueste zuerst).
 *
 * NEWS-ORDNER:
 *   Google Docs in den Ordner legen. Aufbau des Docs:
 *   - Zeile 1: Titel (wird als Überschrift angezeigt)
 *   - Zeile 2: Datum im Format TT.MM.JJJJ
 *   - Zeile 3: Autor
 *   - Ab Zeile 4: Inhalt (Fließtext)
 *   - Optional: Ein eingebettetes Bild im Doc wird als Vorschaubild genutzt
 *
 *   Tipp: Erstellt ein Template-Doc und kopiert es für jeden neuen Beitrag.
 *   News werden nach Datum sortiert (neueste zuerst).
 *
 * ============================================================
 */

// ===================== KONFIGURATION =====================

// WICHTIG: Hier eure Google Drive Ordner-IDs eintragen!
// Die ID findet ihr in der URL wenn ihr den Ordner öffnet:
// https://drive.google.com/drive/folders/HIER_IST_DIE_ID
const CONFIG = {
  IMAGES_FOLDER_ID: '1zXWq7cgjcRQXM8bWXXEt1Ads4JzdjTSf',
  NEWS_FOLDER_ID: '1gql-ifQ24MvQNuKuwemyFtzJxOd7nN14',
  LOGO_FOLDER_ID: '1bFCAwmz1LPouI7rKtOazFNJdgMu_OpyP',

  // Kalender — Schlüssel muss mit CAL_CONFIG im Frontend übereinstimmen!
  CALENDARS: {
    oeffnungszeiten:  '701eb54a002f16ec329ce8f473337455832df22c4bdc86ee12065b780a6e50c6@group.calendar.google.com',
    events:           '6eb31d432b827ce5d980491712fba5df0cca4b7285a10b2e40ed5cba16c90722@group.calendar.google.com',
    trainingstermine: '8c88314fa8dd847bf2311553f1e401982a10e4b54d6a542e4aa9699d3823c3d0@group.calendar.google.com',
    arbeitsdienste:   '4de1761c6fb2c0eadb12bd5a0724cc2983d84ed2a4ed0559caefa67892145f16@group.calendar.google.com',
  },
  MAX_EVENTS: 30,

  // Maximale Anzahl Ergebnisse
  MAX_IMAGES: 20,
  MAX_NEWS: 10,

  // Bildgröße für Thumbnails (px Breite)
  IMAGE_THUMBNAIL_WIDTH: 1200,
  NEWS_IMAGE_WIDTH: 800,
};

// ===================== HAUPTFUNKTION =====================

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'all';

  let result = {};

  try {
    switch (action) {
      case 'images':
        result = { success: true, images: getImages() };
        break;
      case 'news':
        result = { success: true, news: getNews() };
        break;
      case 'calendar':
        result = { success: true, events: getCalendarEvents() };
        break;
      case 'all':
        result = { success: true };
        try { result.logo = getLogo(); } catch(e) { result.logo = null; }
        try { result.images = getImages(); } catch(e) { result.images = []; }
        try { result.news = getNews(); } catch(e) { result.news = []; }
        try { result.events = getCalendarEvents(); } catch(e) { result.events = []; }
        break;
      default:
        result = { success: false, error: 'Unbekannte action: ' + action };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===================== LOGO =====================

function getLogo() {
  try {
    const folder = DriveApp.getFolderById(CONFIG.LOGO_FOLDER_ID);
    const files = folder.getFiles();
    const result = { logo: null, background: null };

    while (files.hasNext()) {
      const file = files.next();
      if (!file.getMimeType().startsWith('image/')) continue;
      const id = file.getId();
      const name = file.getName().toLowerCase();
      const urls = {
        url: 'https://lh3.googleusercontent.com/d/' + id,
        urlAlt: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600',
        urlExport: 'https://drive.google.com/uc?export=view&id=' + id
      };

      if (name.indexOf('hintergrund') !== -1 || name.indexOf('background') !== -1) {
        result.background = urls;
      } else {
        result.logo = urls;
      }
    }

    return result;
  } catch (err) {
    Logger.log('Logo-Fehler: ' + err.message);
  }
  return { logo: null, background: null };
}

// ===================== BILDER =====================

function getImages() {
  const folder = DriveApp.getFolderById(CONFIG.IMAGES_FOLDER_ID);
  const files = folder.getFiles();
  const images = [];

  while (files.hasNext()) {
    const file = files.next();
    const mimeType = file.getMimeType();

    // Nur Bilddateien
    if (!mimeType.startsWith('image/')) continue;

    const fileId = file.getId();
    const urls = getImageUrls(fileId, CONFIG.IMAGE_THUMBNAIL_WIDTH);

    images.push({
      id: fileId,
      name: file.getName().replace(/\.[^.]+$/, ''),
      url: urls.url,
      urlAlt: urls.urlAlt,
      urlExport: urls.urlExport,
      mimeType: mimeType,
      date: file.getLastUpdated().toISOString(),
      size: file.getSize()
    });

    if (images.length >= CONFIG.MAX_IMAGES) break;
  }

  // Sortieren nach Datum (neueste zuerst)
  images.sort((a, b) => new Date(b.date) - new Date(a.date));

  return images;
}

/**
 * Generiert eine öffentliche Bild-URL für ein Google Drive Bild.
 * Die Datei/der Ordner MUSS öffentlich geteilt sein ("Jeder mit dem Link").
 *
 * Wir liefern mehrere URLs — das Frontend probiert die erste,
 * bei Fehler die nächste (Fallback-Kette).
 */
function getThumbnailUrl(fileId, width) {
  return 'https://lh3.googleusercontent.com/d/' + fileId;
}

function getImageUrls(fileId, width) {
  return {
    url: 'https://lh3.googleusercontent.com/d/' + fileId,
    urlAlt: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w' + width,
    urlExport: 'https://drive.google.com/uc?export=view&id=' + fileId
  };
}

// ===================== NEWS =====================

function getNews() {
  const folder = DriveApp.getFolderById(CONFIG.NEWS_FOLDER_ID);
  const files = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  const news = [];

  while (files.hasNext()) {
    const file = files.next();

    // Template-Dateien ignorieren
    if (file.getName().toLowerCase().indexOf('template') !== -1) continue;

    try {
      const doc = DocumentApp.openById(file.getId());
      const body = doc.getBody();
      const paragraphs = body.getParagraphs();

      // Nicht-leere Textzeilen sammeln (Bild-Zeilen und Leerzeilen überspringen)
      const textLines = [];
      for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i].getText().trim();
        if (text) textLines.push(text);
      }

      if (textLines.length < 3) continue;  // Mindestens Titel + Datum + Autor

      // Zeile 1: Titel
      const title = textLines[0];

      // Zeile 2: Datum (Format: TT.MM.JJJJ)
      const dateStr = textLines[1];

      // Zeile 3: Autor
      const author = textLines[2];

      // Ab Zeile 4: Inhalt
      const contentParagraphs = textLines.slice(3);

      // Datum parsen (TT.MM.JJJJ)
      let parsedDate = null;
      const dateParts = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (dateParts) {
        parsedDate = new Date(
          parseInt(dateParts[3]),
          parseInt(dateParts[2]) - 1,
          parseInt(dateParts[1])
        ).toISOString();
      } else {
        // Fallback: Datei-Erstelldatum
        parsedDate = file.getDateCreated().toISOString();
      }

      // Erstes Bild im Doc als Vorschaubild suchen
      let imageUrl = null;
      const bodyImages = body.getImages();
      if (bodyImages.length > 0) {
        const blob = bodyImages[0].getBlob();
        const base64 = Utilities.base64Encode(blob.getBytes());
        imageUrl = 'data:' + blob.getContentType() + ';base64,' + base64;
      }

      // Vorschau: max 200 Zeichen
      const fullContent = contentParagraphs.join('\n\n');
      const preview = fullContent.length > 200 ? fullContent.substring(0, 200) + '…' : fullContent;

      news.push({
        id: file.getId(),
        title: title,
        date: parsedDate,
        dateFormatted: dateStr,
        author: author,
        content: fullContent,
        contentPreview: preview,
        imageUrl: imageUrl,
        docUrl: file.getUrl()
      });

    } catch (err) {
      // Doc konnte nicht gelesen werden — überspringen
      Logger.log('Fehler beim Lesen von ' + file.getName() + ': ' + err.message);
      continue;
    }

    if (news.length >= CONFIG.MAX_NEWS) break;
  }

  // Sortieren nach Datum (neueste zuerst)
  news.sort((a, b) => new Date(b.date) - new Date(a.date));

  return news;
}

// ===================== KALENDER (Multi-Kalender) =====================

function getCalendarEvents() {
  const now = new Date();
  const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 Tage voraus
  const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const pad = (n) => n < 10 ? '0' + n : '' + n;

  const allEvents = [];

  // Alle konfigurierten Kalender durchgehen
  for (const [calKey, calId] of Object.entries(CONFIG.CALENDARS)) {
    try {
      const cal = CalendarApp.getCalendarById(calId);
      if (!cal) {
        Logger.log('⚠️ Kalender nicht gefunden: ' + calKey + ' (' + calId + ')');
        continue;
      }

      const events = cal.getEvents(now, future);
      Logger.log('📅 ' + calKey + ': ' + events.length + ' Termine gefunden');

      for (const ev of events) {
        const start = ev.getStartTime();
        const end = ev.getEndTime();
        const allDay = ev.isAllDayEvent();

        allEvents.push({
          title: ev.getTitle(),
          description: ev.getDescription() || '',
          location: ev.getLocation() || '',
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: allDay,
          calendar: calKey,  // "oeffnungszeiten", "vereinstermine" oder "jugendtraining"
          dayName: dayNames[start.getDay()],
          dayNum: start.getDate(),
          month: monthNames[start.getMonth()],
          year: start.getFullYear(),
          timeStart: allDay ? null : pad(start.getHours()) + ':' + pad(start.getMinutes()),
          timeEnd: allDay ? null : pad(end.getHours()) + ':' + pad(end.getMinutes()),
          color: ev.getColor() || ''
        });
      }
    } catch (err) {
      Logger.log('❌ Kalender-Fehler (' + calKey + '): ' + err.message);
    }
  }

  // Chronologisch sortieren und begrenzen
  allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
  return allEvents.slice(0, CONFIG.MAX_EVENTS);
}

// ===================== HILFSFUNKTIONEN =====================

/**
 * Test-Funktion — in Apps Script Editor ausführen um zu prüfen
 * ob alles funktioniert, bevor ihr deployed.
 */
function testBackend() {
  // Bilder testen
  try {
    const images = getImages();
    Logger.log('✅ Bilder gefunden: ' + images.length);
    images.forEach(img => Logger.log('  📸 ' + img.name));
  } catch (err) {
    Logger.log('❌ Bilder-Fehler: ' + err.message);
    Logger.log('   → Prüfe ob IMAGES_FOLDER_ID korrekt ist');
  }

  // News testen
  try {
    const news = getNews();
    Logger.log('✅ News gefunden: ' + news.length);
    news.forEach(n => Logger.log('  📰 ' + n.title + ' (' + n.dateFormatted + ')'));
  } catch (err) {
    Logger.log('❌ News-Fehler: ' + err.message);
    Logger.log('   → Prüfe ob NEWS_FOLDER_ID korrekt ist');
  }

  // Kalender testen
  try {
    const events = getCalendarEvents();
    Logger.log('✅ Termine gefunden: ' + events.length);
    events.forEach(ev => Logger.log('  📅 [' + ev.calendar + '] ' + ev.dayName + ' ' + ev.dayNum + '. ' + ev.month + ' — ' + ev.title));
  } catch (err) {
    Logger.log('❌ Kalender-Fehler: ' + err.message);
    Logger.log('   → Prüfe ob die Kalender-IDs in CONFIG.CALENDARS korrekt sind');
  }
}
