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

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ── Sheet anlegen oder finden ──
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    var heute = todayDe();
    var mandatsref = generateMandatsreferenz(sheet);

    // Geburtsdatum DD.MM.YYYY
    var geb = '';
    if (data.geburtsdatum) {
      var d = new Date(data.geburtsdatum);
      geb = ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
    }

    // ── Zeile eintragen ──
    sheet.appendRow([
      data.nachname,
      data.vorname,
      geb,
      data.strasse,
      data.plz,
      data.ort,
      data.email,
      data.telefon,
      data.kommentar || '',
      data.kontoinhaber,
      data.iban,
      data.bic || '',
      'Ja',
      heute,
      'Erst-Lastschrift',
      mandatsref,
      heute
    ]);

    // ── Mail ──
    sendBestaetigungsMail(data, heute, mandatsref, geb);
    sendNotifyJugendtraining(data.vorname, data.nachname, heute);

    return ContentService.createTextOutput(
      JSON.stringify({ status: 'ok' })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Fehler: ' + error.toString());
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
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

