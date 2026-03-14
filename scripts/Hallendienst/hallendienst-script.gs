// ═══════════════════════════════════════════════════════════════
// Google Apps Script – Hallendienst Backend
// Boulderverein Zugzwang e.V.
//
// 1. doGet: Liefert verfügbare und belegte Hallendienst-Termine
// 2. doPost: Mitglied trägt sich ein, Kalendereintrag wird erstellt
//
// Sheet-Spalten:
//   A: Datum (DD.MM.YYYY)
//   B: Status (aktiv / inaktiv)
//   C: Vorname
//   D: Nachname
//   E: E-Mail
//   F: Mobilnr
//
// ⚠️ Als EIGENES Projekt anlegen (script.google.com → Neues Projekt)
//    Dann als Web-App deployen (Ausführen als: Ich, Zugriff: Jeder)
// ═══════════════════════════════════════════════════════════════

const SPREADSHEET_ID = '1HGhz-q7zWtYYFvLr8hnUZ2Yzz8p_p_e5NPYmwokluN8';
const SHEET_NAME = 'Hallendienst';
const VEREIN_EMAIL = 'boulderhallezugzwang@gmail.com';
const CALENDAR_ID = '701eb54a002f16ec329ce8f473337455832df22c4bdc86ee12065b780a6e50c6@group.calendar.google.com';

// Öffnungszeiten je Wochentag
const ZEITEN = {
  3: { start: '18:00', end: '21:00' }, // Mittwoch
  5: { start: '18:00', end: '21:00' }, // Freitag
  0: { start: '14:00', end: '17:00' }  // Sonntag
};

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WOCHENTAGE_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// ═══════════════════════════════════════════════════
// GET – Termine laden
// ═══════════════════════════════════════════════════

function doGet(e) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ success: true, termine: [] });
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return jsonResponse({ success: true, termine: [] });
    }

    var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    var heute = new Date();
    heute.setHours(0, 0, 0, 0);

    var termine = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var rawDatum = row[0];
      var datumStr, datum;

      // Sheets speichert Daten als Date-Objekt — instanceof kann fehlschlagen
      if (rawDatum && typeof rawDatum.getDate === 'function') {
        datum = rawDatum;
        datumStr = ('0' + rawDatum.getDate()).slice(-2) + '.' + ('0' + (rawDatum.getMonth() + 1)).slice(-2) + '.' + rawDatum.getFullYear();
      } else {
        datumStr = rawDatum.toString();
        datum = parseDatumDE(datumStr);
      }

      var status = row[1].toString().toLowerCase();

      if (status !== 'aktiv') continue;
      if (!datum || datum < heute) continue;

      var dow = datum.getDay();
      var zeit = ZEITEN[dow];
      if (!zeit) continue;

      var vorname = row[2].toString().trim();
      var nachname = row[3].toString().trim();
      var verfuegbar = !vorname;

      var anzeigeName = null;
      if (!verfuegbar) {
        anzeigeName = vorname + ' ' + nachname;
      }

      termine.push({
        datum: datumStr,
        wochentag: WOCHENTAGE[dow],
        wochentagLang: WOCHENTAGE_LANG[dow],
        uhrzeit: zeit.start + ' – ' + zeit.end,
        verfuegbar: verfuegbar,
        name: anzeigeName,
        sheetRow: i + 2
      });
    }

    // Nach Datum sortieren
    termine.sort(function(a, b) {
      return parseDatumDE(a.datum) - parseDatumDE(b.datum);
    });

    // sheetRow nicht ans Frontend senden
    termine = termine.map(function(t) {
      return {
        datum: t.datum,
        wochentag: t.wochentag,
        wochentagLang: t.wochentagLang,
        uhrzeit: t.uhrzeit,
        verfuegbar: t.verfuegbar,
        name: t.name
      };
    });

    return jsonResponse({ success: true, termine: termine });

  } catch (error) {
    Logger.log('GET Fehler: ' + error.toString());
    return jsonResponse({ success: false, message: error.toString() });
  }
}

// ═══════════════════════════════════════════════════
// POST – Für Hallendienst eintragen
// ═══════════════════════════════════════════════════

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      lock.releaseLock();
      return jsonResponse({ status: 'error', message: 'Sheet nicht gefunden.' });
    }

    // Zeile mit passendem Datum finden
    var lastRow = sheet.getLastRow();
    var rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    var targetRow = -1;

    for (var i = 0; i < rows.length; i++) {
      var rawDatum = rows[i][0];
      var datumStr;
      if (rawDatum && typeof rawDatum.getDate === 'function') {
        datumStr = ('0' + rawDatum.getDate()).slice(-2) + '.' + ('0' + (rawDatum.getMonth() + 1)).slice(-2) + '.' + rawDatum.getFullYear();
      } else {
        datumStr = rawDatum.toString();
      }
      var status = rows[i][1].toString().toLowerCase();
      var vorname = rows[i][2].toString().trim();

      if (datumStr === data.datum && status === 'aktiv' && !vorname) {
        targetRow = i + 2; // 1-basiert + Header
        break;
      }
    }

    if (targetRow === -1) {
      lock.releaseLock();
      return jsonResponse({ status: 'error', message: 'Dieser Termin ist leider nicht mehr verfügbar.' });
    }

    // Daten eintragen
    sheet.getRange(targetRow, 3).setValue(data.vorname);
    sheet.getRange(targetRow, 4).setValue(data.nachname);
    sheet.getRange(targetRow, 5).setValue(data.email);
    sheet.getRange(targetRow, 6).setValue(data.mobilnr);

    lock.releaseLock();

    // Kalendereintrag erstellen
    createCalendarEvent(data.datum, data.vorname, data.nachname);

    // Bestätigungsmail
    sendBestaetigungsMail(data);

    return jsonResponse({ status: 'ok' });

  } catch (error) {
    try { lock.releaseLock(); } catch(e) {}
    Logger.log('POST Fehler: ' + error.toString());
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

// ═══════════════════════════════════════════════════
// KALENDER-EINTRAG
// ═══════════════════════════════════════════════════

function createCalendarEvent(datumStr, vorname, nachname) {
  var datum = parseDatumDE(datumStr);
  if (!datum) return;

  var dow = datum.getDay();
  var zeit = ZEITEN[dow];
  if (!zeit) return;

  var startParts = zeit.start.split(':');
  var endParts = zeit.end.split(':');

  var startDate = new Date(datum);
  startDate.setHours(parseInt(startParts[0]), parseInt(startParts[1]), 0);

  var endDate = new Date(datum);
  endDate.setHours(parseInt(endParts[0]), parseInt(endParts[1]), 0);

  var cal = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) {
    Logger.log('Kalender nicht gefunden: ' + CALENDAR_ID);
    return;
  }

  cal.createEvent('Oeffnungszeiten', startDate, endDate, {
    description: 'Hallendienst: ' + vorname + ' ' + nachname
  });
}

// ═══════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════

function parseDatumDE(str) {
  // DD.MM.YYYY → Date
  if (!str) return null;
  // Handle Date objects from Sheets (instanceof kann fehlschlagen)
  if (str && typeof str.getDate === 'function') {
    return str;
  }
  var parts = str.toString().split('.');
  if (parts.length !== 3) return null;
  var d = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10) - 1;
  var y = parseInt(parts[2], 10);
  return new Date(y, m, d);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════
// E-MAILS
// ═══════════════════════════════════════════════════

function sendBestaetigungsMail(data) {
  var datum = parseDatumDE(data.datum);
  var dow = datum ? datum.getDay() : 0;
  var zeit = ZEITEN[dow] || { start: '?', end: '?' };
  var wochentag = datum ? WOCHENTAGE_LANG[dow] : '';

  var body = 'Hallo ' + data.vorname + ',\n\n' +
    'vielen Dank! Du hast dich für folgenden Hallendienst eingetragen:\n\n' +
    '  Datum:    ' + wochentag + ', ' + data.datum + '\n' +
    '  Uhrzeit:  ' + zeit.start + ' – ' + zeit.end + ' Uhr\n\n' +
    'Bitte sei pünktlich vor Ort. Bei Verhinderung melde dich bitte rechtzeitig unter ' +
    'boulderhallezugzwang@gmail.com, damit wir einen Ersatz finden können.\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'Neuhauser Straße 1\n' +
    '91275 Auerbach i.d.OPf.\n\n' +
    'https://boulderhallezugzwang.github.io/zugzwang-website';

  MailApp.sendEmail({
    to: data.email,
    subject: 'Hallendienst bestätigt – ' + data.datum,
    body: body,
    name: 'Boulderverein Zugzwang e.V.'
  });
}
