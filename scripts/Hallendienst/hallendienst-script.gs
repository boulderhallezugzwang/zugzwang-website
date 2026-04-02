// ═══════════════════════════════════════════════════════════════
// Google Apps Script – Hallendienst Backend
// Boulderverein Zugzwang e.V.
//
// 1. doGet: Liefert verfügbare und belegte Hallendienst-Termine
// 2. doPost: Mitglied trägt sich ein ODER Admin-Aktionen (auth)
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
const BENUTZER_TAB = 'Benutzer';
// Config aus Sheet lesen
function getConfigValue(key) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Config');
  if (!sheet) return '';
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';
  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0].toString() === key) return data[i][1].toString();
  }
  return '';
}

function sendNotifyHallendienst(vorname, nachname, datum) {
  var aktiv = getConfigValue('notify_hallendienst_aktiv');
  if (aktiv !== 'ja') return;
  var email = getConfigValue('notify_hallendienst_email');
  if (!email) return;
  MailApp.sendEmail({
    to: email,
    subject: 'Hallendienst-Anmeldung: ' + vorname + ' ' + nachname,
    body: 'Neue Hallendienst-Anmeldung:\n\n' +
      '  Name:   ' + vorname + ' ' + nachname + '\n' +
      '  Datum:  ' + datum + '\n',
    name: 'Hallendienst-Formular'
  });
}
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
// AUTHENTIFIZIERUNG
// ═══════════════════════════════════════════════════

function authenticateUser(username, password) {
  if (!username || !password) return null;
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(BENUTZER_TAB);
  if (!sheet) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === username.toLowerCase() &&
        data[i][3].toString() === password) {
      return {
        benutzername: data[i][0].toString(),
        anzeigename: data[i][1].toString(),
        rolle: data[i][2].toString()
      };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════
// GET – Termine laden (öffentlich, wie bisher)
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
      var anzeigeName = verfuegbar ? null : vorname + ' ' + nachname;

      termine.push({
        datum: datumStr,
        wochentag: WOCHENTAGE[dow],
        wochentagLang: WOCHENTAGE_LANG[dow],
        uhrzeit: zeit.start + ' – ' + zeit.end,
        verfuegbar: verfuegbar,
        name: anzeigeName
      });
    }

    termine.sort(function(a, b) {
      return parseDatumDE(a.datum) - parseDatumDE(b.datum);
    });

    return jsonResponse({ success: true, termine: termine });

  } catch (error) {
    Logger.log('GET Fehler: ' + error.toString());
    return jsonResponse({ success: false, message: error.toString() });
  }
}

// ═══════════════════════════════════════════════════
// POST – Öffentliche Eintragung + Auth-Aktionen
// ═══════════════════════════════════════════════════

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var data = JSON.parse(e.postData.contents);
    var action = (data.action || '').toString();

    // ── Auth-geschützte Aktionen ──
    if (action === 'getTermine' || action === 'generateTermine' ||
        action === 'addTermin' || action === 'deleteTermin' || action === 'clearPerson') {
      var user = authenticateUser(data.username, data.password);
      if (!user) {
        lock.releaseLock();
        return jsonResponse({ error: 'Nicht authentifiziert' });
      }

      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet = ss.getSheetByName(SHEET_NAME);

      if (action === 'getTermine') {
        lock.releaseLock();
        return jsonResponse(getAlleTermine(sheet));
      }

      if (action === 'generateTermine') {
        var result = generateTermine(sheet, data.von, data.bis, data.tage);
        lock.releaseLock();
        return jsonResponse(result);
      }

      if (action === 'addTermin') {
        var result = addTermin(sheet, data.datum);
        lock.releaseLock();
        return jsonResponse(result);
      }

      if (action === 'deleteTermin') {
        var result = deleteTermin(sheet, data.datum);
        lock.releaseLock();
        return jsonResponse(result);
      }

      if (action === 'clearPerson') {
        var result = clearPerson(sheet, data.datum);
        lock.releaseLock();
        return jsonResponse(result);
      }
    }

    // ── Öffentliche Eintragung (wie bisher) ──
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      lock.releaseLock();
      return jsonResponse({ status: 'error', message: 'Sheet nicht gefunden.' });
    }

    var lastRow = sheet.getLastRow();
    var rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    var targetRow = -1;

    for (var i = 0; i < rows.length; i++) {
      var rawDatum = rows[i][0];
      var datumStr;
      if (rawDatum instanceof Date) {
        datumStr = ('0' + rawDatum.getDate()).slice(-2) + '.' + ('0' + (rawDatum.getMonth() + 1)).slice(-2) + '.' + rawDatum.getFullYear();
      } else {
        datumStr = rawDatum.toString();
      }
      var status = rows[i][1].toString().toLowerCase();
      var vorname = rows[i][2].toString().trim();

      if (datumStr === data.datum && status === 'aktiv' && !vorname) {
        targetRow = i + 2;
        break;
      }
    }

    if (targetRow === -1) {
      lock.releaseLock();
      return jsonResponse({ status: 'error', message: 'Dieser Termin ist leider nicht mehr verfügbar.' });
    }

    sheet.getRange(targetRow, 3).setValue(data.vorname);
    sheet.getRange(targetRow, 4).setValue(data.nachname);
    sheet.getRange(targetRow, 5).setValue(data.email);
    sheet.getRange(targetRow, 6).setValue(data.mobilnr);

    lock.releaseLock();

    createCalendarEvent(data.datum, data.vorname, data.nachname);
    sendBestaetigungsMail(data);
    sendNotifyHallendienst(data.vorname, data.nachname, data.datum);

    return jsonResponse({ status: 'ok' });

  } catch (error) {
    try { lock.releaseLock(); } catch(e) {}
    Logger.log('POST Fehler: ' + error.toString());
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

// ═══════════════════════════════════════════════════
// ADMIN-FUNKTIONEN
// ═══════════════════════════════════════════════════

function getAlleTermine(sheet) {
  if (!sheet) return { termine: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { termine: [] };

  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var termine = [];

  for (var i = 0; i < data.length; i++) {
    var rawDatum = data[i][0];
    var datumStr;
    if (rawDatum && typeof rawDatum.getDate === 'function') {
      datumStr = ('0' + rawDatum.getDate()).slice(-2) + '.' + ('0' + (rawDatum.getMonth() + 1)).slice(-2) + '.' + rawDatum.getFullYear();
    } else {
      datumStr = rawDatum.toString();
    }

    var datum = parseDatumDE(datumStr);
    var dow = datum ? datum.getDay() : -1;
    var zeit = ZEITEN[dow];

    termine.push({
      datum: datumStr,
      wochentag: dow >= 0 ? WOCHENTAGE[dow] : '?',
      uhrzeit: zeit ? zeit.start + ' – ' + zeit.end : '',
      status: data[i][1].toString(),
      vorname: data[i][2].toString().trim(),
      nachname: data[i][3].toString().trim(),
      email: data[i][4].toString().trim(),
      mobilnr: data[i][5].toString().trim(),
      sheetRow: i + 2
    });
  }

  // Nach Datum sortieren
  termine.sort(function(a, b) {
    var da = parseDatumDE(a.datum);
    var db = parseDatumDE(b.datum);
    return (da || 0) - (db || 0);
  });

  return { termine: termine };
}

function generateTermine(sheet, vonISO, bisISO, tage) {
  if (!vonISO || !bisISO) return { error: 'Von- und Bis-Datum erforderlich' };
  // tage = Array von Wochentag-Nummern [0=So, 3=Mi, 5=Fr], Default: alle
  if (!tage || !tage.length) tage = [0, 3, 5];

  if (!sheet) {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['Datum', 'Status', 'Vorname', 'Nachname', 'E-Mail', 'Mobilnr']);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }

  // Bestehende Termine sammeln
  var existing = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var raw = vals[i][0];
      var str;
      if (raw && typeof raw.getDate === 'function') {
        str = ('0' + raw.getDate()).slice(-2) + '.' + ('0' + (raw.getMonth() + 1)).slice(-2) + '.' + raw.getFullYear();
      } else {
        str = raw.toString();
      }
      existing[str] = true;
    }
  }

  var d = new Date(vonISO);
  var end = new Date(bisISO);
  var count = 0;
  var skipped = 0;

  while (d <= end) {
    var dow = d.getDay();
    if (tage.indexOf(dow) !== -1) {
      var str = ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
      if (existing[str]) {
        skipped++;
      } else {
        sheet.appendRow([str, 'aktiv', '', '', '', '']);
        count++;
      }
    }
    d.setDate(d.getDate() + 1);
  }

  var msg = count + ' Termine erstellt.';
  if (skipped > 0) msg += ' ' + skipped + ' bereits vorhanden (übersprungen).';

  // Aktualisierte Liste zurückgeben
  var result = getAlleTermine(sheet);
  result.message = msg;
  return result;
}

function addTermin(sheet, datumStr) {
  if (!datumStr) return { error: 'Datum erforderlich' };

  // Prüfen ob Datum gültig (Mi/Fr/So)
  var datum = parseDatumDE(datumStr);
  if (!datum) return { error: 'Ungültiges Datum' };
  var dow = datum.getDay();
  if (dow !== 0 && dow !== 3 && dow !== 5) {
    return { error: 'Nur Mittwoch, Freitag oder Sonntag möglich' };
  }

  if (!sheet) return { error: 'Sheet nicht gefunden' };

  // Prüfen ob schon vorhanden
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var raw = vals[i][0];
      var str;
      if (raw && typeof raw.getDate === 'function') {
        str = ('0' + raw.getDate()).slice(-2) + '.' + ('0' + (raw.getMonth() + 1)).slice(-2) + '.' + raw.getFullYear();
      } else {
        str = raw.toString();
      }
      if (str === datumStr) return { error: 'Termin existiert bereits' };
    }
  }

  sheet.appendRow([datumStr, 'aktiv', '', '', '', '']);

  var result = getAlleTermine(sheet);
  result.message = 'Termin ' + datumStr + ' hinzugefügt.';
  return result;
}

function deleteTermin(sheet, datumStr) {
  if (!datumStr) return { error: 'Datum erforderlich' };
  if (!sheet) return { error: 'Sheet nicht gefunden' };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { error: 'Keine Termine vorhanden' };

  var vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    var raw = vals[i][0];
    var str;
    if (raw && typeof raw.getDate === 'function') {
      str = ('0' + raw.getDate()).slice(-2) + '.' + ('0' + (raw.getMonth() + 1)).slice(-2) + '.' + raw.getFullYear();
    } else {
      str = raw.toString();
    }
    if (str === datumStr) {
      sheet.deleteRow(i + 2);
      // Kalender-Event löschen
      deleteCalendarEvent(datumStr);
      var result = getAlleTermine(sheet);
      result.message = 'Termin ' + datumStr + ' gelöscht.';
      return result;
    }
  }

  return { error: 'Termin nicht gefunden' };
}

function clearPerson(sheet, datumStr) {
  if (!datumStr) return { error: 'Datum erforderlich' };
  if (!sheet) return { error: 'Sheet nicht gefunden' };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { error: 'Keine Termine vorhanden' };

  var vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    var raw = vals[i][0];
    var str;
    if (raw && typeof raw.getDate === 'function') {
      str = ('0' + raw.getDate()).slice(-2) + '.' + ('0' + (raw.getMonth() + 1)).slice(-2) + '.' + raw.getFullYear();
    } else {
      str = raw.toString();
    }
    if (str === datumStr) {
      var row = i + 2;
      sheet.getRange(row, 3).setValue('');  // Vorname
      sheet.getRange(row, 4).setValue('');  // Nachname
      sheet.getRange(row, 5).setValue('');  // E-Mail
      sheet.getRange(row, 6).setValue('');  // Mobilnr
      // Kalender-Event löschen
      deleteCalendarEvent(datumStr);
      var result = getAlleTermine(sheet);
      result.message = 'Person für ' + datumStr + ' entfernt.';
      return result;
    }
  }

  return { error: 'Termin nicht gefunden' };
}

// ═══════════════════════════════════════════════════
// KALENDER
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

function deleteCalendarEvent(datumStr) {
  try {
    var datum = parseDatumDE(datumStr);
    if (!datum) return;

    var dow = datum.getDay();
    var zeit = ZEITEN[dow];
    if (!zeit) return;

    var cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return;

    var events = cal.getEventsForDay(datum);
    for (var i = 0; i < events.length; i++) {
      if (events[i].getTitle() === 'Oeffnungszeiten') {
        events[i].deleteEvent();
      }
    }
  } catch (e) {
    Logger.log('Kalender-Event löschen fehlgeschlagen: ' + e.toString());
  }
}

// ═══════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════

function parseDatumDE(str) {
  if (!str) return null;
  if (str && typeof str.getDate === 'function') return str;
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

  var introText = getConfigValue('mail_hallendienst_intro') ||
    'Vielen Dank! Du hast dich für folgenden Hallendienst eingetragen:';
  var hinweisText = getConfigValue('mail_hallendienst_hinweis') ||
    'Bitte sei pünktlich vor Ort. Bei Verhinderung melde dich bitte rechtzeitig, damit wir einen Ersatz finden können.';
  var signatur = getConfigValue('mail_signatur') ||
    'Sportliche Grüße,\nBoulderverein Zugzwang e.V.\nNeuhauser Straße 1\n91275 Auerbach i.d.OPf.\n\nhttps://boulderhallezugzwang.github.io/zugzwang-website';

  var body = 'Hallo ' + data.vorname + ',\n\n' +
    introText + '\n\n' +
    '  Datum:    ' + wochentag + ', ' + data.datum + '\n' +
    '  Uhrzeit:  ' + zeit.start + ' – ' + zeit.end + ' Uhr\n\n' +
    hinweisText + '\n\n' +
    'Bei Fragen erreichst du uns unter ' + (getConfigValue('kontakt_hallendienst_email') || 'boulderhallezugzwang@gmail.com') + '.\n\n' +
    signatur;

  MailApp.sendEmail({
    to: data.email,
    subject: 'Hallendienst bestätigt – ' + data.datum,
    body: body,
    name: 'Boulderverein Zugzwang e.V.'
  });
}
