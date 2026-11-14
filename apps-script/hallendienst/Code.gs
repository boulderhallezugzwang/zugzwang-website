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

// ── Passwort-Hashing + Sperre nach Fehlversuchen ──
// Passwoerter stehen nicht mehr im Klartext im Tab "Benutzer", sondern als
//   zz1$<Runden>$<Salt>$<Hash>
// Ein vom Admin im Klartext eingetragenes (Erst-)Passwort funktioniert
// weiterhin und wird beim ersten erfolgreichen Anmelden automatisch
// durch den Hash ersetzt. Zuruecksetzen wie bisher: neues Passwort im
// Klartext in Spalte D eintragen + Erstanmeldung = Ja.
// WICHTIG: Dieser Block ist identisch in mitgliederliste-script.gs und
// hallendienst-script.gs – beide Projekte muessen zusammen bereitgestellt werden.
var PW_ROUNDS = 300;
var AUTH_MAX_FAILS = 10;        // Fehlversuche pro Benutzername ...
var AUTH_LOCK_SECONDS = 900;    // ... innerhalb von 15 Minuten

function pwDigest(password, salt, rounds) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  for (var i = 1; i < rounds; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  }
  return Utilities.base64Encode(bytes);
}

function pwMake(password) {
  var salt = Utilities.getUuid().replace(/-/g, '');
  return 'zz1$' + PW_ROUNDS + '$' + salt + '$' + pwDigest(password, salt, PW_ROUNDS);
}

function pwIsHashed(stored) {
  return /^zz1\$\d+\$[0-9a-f]+\$[A-Za-z0-9+\/=]+$/.test(stored);
}

function pwVerify(stored, password) {
  if (!stored) return false;
  if (!pwIsHashed(stored)) return stored === password;   // Altbestand / Erst-Passwort im Klartext
  var p = stored.split('$');
  var rounds = parseInt(p[1], 10);
  if (!(rounds >= 1 && rounds <= 100000)) return false;
  return pwDigest(password, p[2], rounds) === p[3];
}

function authFailKey(username) {
  return 'authfail_' + username.toLowerCase().slice(0, 80);
}

function authIsLocked(username) {
  var n = parseInt(CacheService.getScriptCache().get(authFailKey((username || '').toString())) || '0', 10);
  return n >= AUTH_MAX_FAILS;
}

function authNoteFail(username) {
  var cache = CacheService.getScriptCache();
  var key = authFailKey(username);
  var n = parseInt(cache.get(key) || '0', 10) + 1;
  cache.put(key, String(n), AUTH_LOCK_SECONDS);
}

// Benutzer anhand Username + Passwort prüfen
// Spalten: A=Benutzername, B=Anzeigename, C=Rolle, D=Passwort(-Hash), E=Erstanmeldung
// Konten mit Erstanmeldung=Ja duerfen nur anmelden/Passwort setzen
// (allowErstanmeldung=true), alle anderen Aktionen bleiben gesperrt.
function authenticateUser(username, password, allowErstanmeldung) {
  username = (username === null || username === undefined) ? '' : username.toString().trim();
  password = (password === null || password === undefined) ? '' : password.toString();
  if (!username || !password || password.length > 200) return null;
  if (authIsLocked(username)) return null;
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(BENUTZER_TAB);
  if (!sheet) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0].toString().trim().toLowerCase() !== username.toLowerCase()) continue;
    var stored = data[i][3].toString();
    if (!pwVerify(stored, password)) break;
    if (!pwIsHashed(stored)) {
      // Klartext-Altbestand beim ersten erfolgreichen Anmelden ersetzen
      try { sheet.getRange(i + 2, 4).setValue(pwMake(password)); } catch (e) { console.error('Passwort-Hash konnte nicht gespeichert werden: ' + e); }
    }
    var erstanmeldung = data[i][4].toString().trim().toLowerCase() === 'ja';
    if (erstanmeldung && !allowErstanmeldung) return null;
    return {
      row: i + 2,
      benutzername: data[i][0].toString(),
      anzeigename: data[i][1].toString(),
      rolle: data[i][2].toString(),
      erstanmeldung: erstanmeldung
    };
  }
  authNoteFail(username);
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

// Text aus dem oeffentlichen Formular sicher in eine Zelle schreiben:
// ein fuehrendes = + - @ wuerde von Sheets als Formel ausgewertet.
function sheetSafe(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return v;
  var s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 2000);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

// Oeffentliche Eintragung pruefen; gibt Fehlermeldung oder '' zurueck.
function hdValidateEintrag(data) {
  if (!data || typeof data !== 'object') return 'Ungültige Anfrage.';
  var namePattern = /^[^<>"=;{}\[\]\\\/\u0000-\u001F]{1,60}$/;
  if (typeof data.vorname !== 'string' || !namePattern.test(data.vorname.trim())) return 'Bitte einen gültigen Vornamen angeben.';
  if (typeof data.nachname !== 'string' || !namePattern.test(data.nachname.trim())) return 'Bitte einen gültigen Nachnamen angeben.';
  if (typeof data.email !== 'string' || data.email.length > 120 ||
      !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(data.email.trim())) return 'Bitte eine gültige E-Mail-Adresse angeben.';
  if (data.mobilnr !== undefined && data.mobilnr !== null && data.mobilnr !== '' &&
      !/^[0-9 +().\/\-]{4,30}$/.test(data.mobilnr.toString().trim())) return 'Bitte eine gültige Mobilnummer angeben.';
  if (typeof data.datum !== 'string' || !/^\d{2}\.\d{2}\.\d{4}$/.test(data.datum)) return 'Ungültiges Datum.';
  return '';
}

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

    // ── Öffentliche Eintragung ──
    // Eingaben pruefen: ohne Namen wuerde der Termin frei bleiben, aber
    // trotzdem ein Kalender-Eintrag und eine Mail entstehen.
    var fehler = hdValidateEintrag(data);
    if (fehler) {
      lock.releaseLock();
      return jsonResponse({ status: 'error', message: fehler });
    }
    data.vorname = data.vorname.trim();
    data.nachname = data.nachname.trim();
    data.email = data.email.trim();
    data.mobilnr = (data.mobilnr || '').toString().trim();

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

    sheet.getRange(targetRow, 3, 1, 4).setValues([[
      sheetSafe(data.vorname), sheetSafe(data.nachname), sheetSafe(data.email), sheetSafe(data.mobilnr)
    ]]);
    SpreadsheetApp.flush();

    lock.releaseLock();

    // Die Eintragung ist gespeichert. Fehler bei Kalender/Mail (z.B. leeres
    // Mail-Kontingent) duerfen daraus keinen Fehler machen – beim erneuten
    // Absenden waere der Termin sonst "nicht mehr verfuegbar".
    try { createCalendarEvent(data.datum, data.vorname, data.nachname); }
    catch (errCal) { console.error('Hallendienst ' + data.datum + ': Kalender-Eintrag fehlgeschlagen: ' + errCal); }
    try { sendBestaetigungsMail(data); }
    catch (errMail) { console.error('Hallendienst ' + data.datum + ': Bestaetigungsmail fehlgeschlagen: ' + errMail); }
    try { sendNotifyHallendienst(data.vorname, data.nachname, data.datum); }
    catch (errNotify) { console.error('Hallendienst ' + data.datum + ': Benachrichtigung fehlgeschlagen: ' + errNotify); }

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
