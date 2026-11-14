// ═══════════════════════════════════════════════════════════════
// Google Apps Script – Jugendtraining Backend
// Boulderverein Zugzwang e.V.
//
// Speichert Anmeldungen im Tab "Jugendtraining"
// Sendet Bestätigungsmail
//
// ⚠️ Als EIGENES Projekt anlegen (script.google.com → Neues Projekt)
// ═══════════════════════════════════════════════════════════════

const SPREADSHEET_ID = '1HGhz-q7zWtYYFvLr8hnUZ2Yzz8p_p_e5NPYmwokluN8';
const SHEET_NAME = 'Jugendtraining';

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

function sendNotifyJugendtraining(vorname, nachname, datum) {
  var aktiv = getConfigValue('notify_jugendtraining_aktiv');
  if (aktiv !== 'ja') return;
  var email = getConfigValue('notify_jugendtraining_email');
  if (!email) return;
  MailApp.sendEmail({
    to: email,
    subject: 'Neue Jugendtraining-Anmeldung: ' + vorname + ' ' + nachname,
    body: 'Eine neue Anmeldung zum Jugendtraining ist eingegangen:\n\n' +
      '  Name:   ' + vorname + ' ' + nachname + '\n' +
      '  Datum:  ' + datum + '\n',
    name: 'Jugendtraining-Formular'
  });
}

const HEADERS = [
  'Nachname', 'Vorname', 'Geburtsdatum', 'Adresse', 'PLZ', 'Ort',
  'E-Mail', 'Telefon Mobil', 'Bemerkungen',
  'Kontoinhaber', 'IBAN', 'BIC',
  'SEPA-Lastschrift erlauben', 'Mandat Unterschriftsdatum', 'Lastschriftart', 'Mandatsreferenz',
  'Eintritt'
];

// Text aus dem oeffentlichen Formular sicher in eine Zelle schreiben:
// ein fuehrendes = + - @ wuerde von Sheets als Formel ausgewertet.
function sheetSafe(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return v;
  var s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 2000);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function isEmail(s) {
  return typeof s === 'string' && s.length <= 120 &&
    /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(s.trim());
}

// Alle Textfelder der Anfrage begrenzen (rekursiv). longKeys duerfen gross sein
// (z.B. die Unterschrift als Bild). Gibt Fehlermeldung oder '' zurueck.
function checkLengths(obj, longKeys, depth) {
  if (depth > 3) return 'Ungültige Anfrage.';
  var keys = Object.keys(obj);
  if (keys.length > 60) return 'Ungültige Anfrage.';
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], v = obj[k];
    if (typeof v === 'string') {
      var max = longKeys.indexOf(k) !== -1 ? 2000000 : 500;
      if (v.length > max) return 'Eingabe zu lang: ' + k;
    } else if (Array.isArray(v)) {
      if (v.length > 12) return 'Zu viele Einträge: ' + k;
      for (var j = 0; j < v.length; j++) {
        if (!v[j] || typeof v[j] !== 'object') return 'Ungültige Anfrage.';
        var e = checkLengths(v[j], longKeys, depth + 1);
        if (e) return e;
      }
    } else if (v && typeof v === 'object') {
      return 'Ungültige Anfrage.';
    }
  }
  return '';
}

function requireText(data, fields) {
  for (var i = 0; i < fields.length; i++) {
    if (typeof data[fields[i]] !== 'string' || !data[fields[i]].trim()) return 'Pflichtfeld fehlt: ' + fields[i];
  }
  return '';
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return jsonOut({ status: 'error', message: 'Ungültige Anfrage.' });
    var fehler = checkLengths(data, [], 0) ||
      requireText(data, ['nachname', 'vorname', 'geburtsdatum', 'strasse', 'plz', 'ort', 'email', 'kontoinhaber', 'iban']);
    if (!fehler && !isEmail(data.email)) fehler = 'Bitte eine gültige E-Mail-Adresse angeben.';
    if (!fehler && !/^\d{4}-\d{2}-\d{2}$/.test(data.geburtsdatum)) fehler = 'Ungültiges Geburtsdatum.';
    if (!fehler && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(data.iban.replace(/\s+/g, '').toUpperCase())) fehler = 'Ungültige IBAN.';
    if (fehler) return jsonOut({ status: 'error', message: fehler });

    var S = sheetSafe;
    var heute = todayDe();
    var mandatsref;

    // Geburtsdatum DD.MM.YYYY (direkt aus dem ISO-Text, ohne Zeitzonen-Umweg)
    var gp = data.geburtsdatum.split('-');
    var geb = gp[2] + '.' + gp[1] + '.' + gp[0];

    // Sperre: Mandatsreferenz ermitteln + Zeile anhaengen muss atomar sein.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

      // ── Sheet anlegen oder finden ──
      var sheet = ss.getSheetByName(SHEET_NAME);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME);
        sheet.appendRow(HEADERS);
        sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
      }

      mandatsref = generateMandatsreferenz(sheet);

      // ── Zeile eintragen ──
      sheet.appendRow([
        S(data.nachname),
        S(data.vorname),
        geb,
        S(data.strasse),
        S(data.plz),
        S(data.ort),
        S(data.email),
        S(data.telefon || ''),
        S(data.kommentar || ''),
        S(data.kontoinhaber),
        S(data.iban),
        S(data.bic || ''),
        'Ja',
        heute,
        'Erst-Lastschrift',
        mandatsref,
        heute
      ]);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    // Die Anmeldung ist gespeichert; Mail-Fehler duerfen daraus keinen Fehler
    // machen (sonst sendet der Nutzer erneut → doppelte Zeilen).
    try { sendBestaetigungsMail(data, heute, mandatsref, geb); }
    catch (errMail) { console.error('Jugendtraining ' + mandatsref + ': Bestaetigungsmail fehlgeschlagen: ' + errMail); }
    try { sendNotifyJugendtraining(data.vorname, data.nachname, heute); }
    catch (errNotify) { console.error('Jugendtraining ' + mandatsref + ': Benachrichtigung fehlgeschlagen: ' + errNotify); }

    return jsonOut({ status: 'ok' });

  } catch (error) {
    console.error('Fehler: ' + error.toString());
    return jsonOut({ status: 'error', message: 'Die Anmeldung konnte nicht verarbeitet werden.' });
  }
}

// ═══════════════════════════════════════════════════
// MANDATSREFERENZ: JT-YYYY-NNNN
// ═══════════════════════════════════════════════════

function generateMandatsreferenz(sheet) {
  var year = new Date().getFullYear();
  var prefix = 'JT-' + year + '-';
  var lastRow = sheet.getLastRow();
  var maxNum = 0;

  if (lastRow > 1) {
    var mandatCol = HEADERS.indexOf('Mandatsreferenz') + 1;
    var values = sheet.getRange(2, mandatCol, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      var val = values[i][0].toString();
      if (val.indexOf(prefix) === 0) {
        var num = parseInt(val.substring(prefix.length), 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }

  return prefix + ('000' + (maxNum + 1)).slice(-4);
}

// ═══════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════

function todayDe() {
  var d = new Date();
  return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
}

// ═══════════════════════════════════════════════════
// E-MAILS
// ═══════════════════════════════════════════════════

function sendBestaetigungsMail(data, heute, mandatsref, geb) {
  var introText = getConfigValue('mail_jugendtraining_intro') ||
    'Vielen Dank für die Anmeldung zum Jugendtraining beim Boulderverein Zugzwang e.V.';
  var hinweisText = getConfigValue('mail_jugendtraining_hinweis') || '';
  var signatur = getConfigValue('mail_signatur') ||
    'Sportliche Grüße,\nBoulderverein Zugzwang e.V.\nNeuhauser Straße 1\n91275 Auerbach i.d.OPf.\n\nhttps://boulderhallezugzwang.github.io/zugzwang-website';

  var body = 'Hallo,\n\n' +
    introText + '\n\n' +
    'Folgende Daten wurden übermittelt:\n\n' +
    '  Name:              ' + data.vorname + ' ' + data.nachname + '\n' +
    '  Geburtsdatum:      ' + geb + '\n' +
    '  Adresse:           ' + data.strasse + ', ' + data.plz + ' ' + data.ort + '\n' +
    '  E-Mail:            ' + data.email + '\n' +
    '  Mobilnummer:       ' + data.telefon + '\n' +
    '  Anmeldedatum:      ' + heute + '\n\n' +
    '  Kontoinhaber:      ' + data.kontoinhaber + '\n' +
    '  IBAN:              ' + data.iban + '\n' +
    '  Mandatsreferenz:   ' + mandatsref + '\n\n' +
    (hinweisText ? hinweisText + '\n\n' : '') +
    'Falls du Fragen hast, erreichst du uns unter ' + (getConfigValue('kontakt_jugendtraining_email') || 'boulderhallezugzwang@gmail.com') + '.\n\n' +
    signatur;

  MailApp.sendEmail({
    to: data.email,
    subject: 'Bestätigung Anmeldung Jugendtraining – Boulderverein Zugzwang e.V.',
    body: body,
    name: 'Boulderverein Zugzwang e.V.'
  });
}

