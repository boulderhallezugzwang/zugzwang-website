// ═══════════════════════════════════════════════════════════════
// Google Apps Script – Kündigung Backend
// Boulderverein Zugzwang e.V.
//
// 1. Speichert Kündigung in einem eigenen Sheet "Kündigungen"
// 2. Setzt Status im Hauptsheet "Mitgliedsantraege_Zugzwang" auf "gekündigt"
// 3. Sendet Bestätigungsmail
// ═══════════════════════════════════════════════════════════════

const SPREADSHEET_ID = '1HGhz-q7zWtYYFvLr8hnUZ2Yzz8p_p_e5NPYmwokluN8';
const KUENDIGUNG_SHEET_NAME = 'Kündigungen';

const KUENDIGUNG_HEADERS = [
  'Vorname', 'Nachname', 'E-Mail', 'Kündigungsdatum'
];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ── Kündigungs-Sheet anlegen oder finden ──
    var kSheet = ss.getSheetByName(KUENDIGUNG_SHEET_NAME);
    if (!kSheet) {
      kSheet = ss.insertSheet(KUENDIGUNG_SHEET_NAME);
      kSheet.appendRow(KUENDIGUNG_HEADERS);
      kSheet.getRange(1, 1, 1, KUENDIGUNG_HEADERS.length).setFontWeight('bold');
      kSheet.setFrozenRows(1);
    }

    var kuendigungsDatum = data.datum || todayDe();

    // ── Kündigung eintragen ──
    kSheet.appendRow([
      data.vorname,
      data.nachname,
      data.email,
      kuendigungsDatum
    ]);

    // ── Status im Hauptsheet aktualisieren ──
    var found = updateMainSheet(ss, data.vorname, data.nachname, data.email, kuendigungsDatum);

    if (found) {
      // ── Bestätigungsmail ──
      sendKuendigungsMail(data, kuendigungsDatum);
    } else {
      // ── Mitglied nicht gefunden ──
      sendNichtGefundenMail(data);
    }

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
// HAUPTSHEET AKTUALISIEREN
// ═══════════════════════════════════════════════════

function updateMainSheet(ss, vorname, nachname, email, kuendigungsDatum) {
  // Erstes Sheet = Mitgliederliste
  var sheet = ss.getSheets()[0];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) return false;

  // Spalten-Indizes finden
  var colIdx = {};
  headers.forEach(function(h, i) { colIdx[h] = i; });

  var nachnameIdx = colIdx['Nachname'];
  var vornameIdx = colIdx['Vorname'];
  var statusIdx = colIdx['Status'];

  if (statusIdx === undefined) return false;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var found = false;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var matchName = row[nachnameIdx].toString().toLowerCase() === nachname.toLowerCase() &&
                    row[vornameIdx].toString().toLowerCase() === vorname.toLowerCase();

    if (matchName) {
      var rowNum = i + 2; // 1-basiert + Header
      sheet.getRange(rowNum, statusIdx + 1).setValue('gekündigt (' + kuendigungsDatum + ')');
      found = true;
    }
  }

  return found;
}

// ═══════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════

function todayDe() {
  var d = new Date();
  var dd = ('0' + d.getDate()).slice(-2);
  var mm = ('0' + (d.getMonth() + 1)).slice(-2);
  return dd + '.' + mm + '.' + d.getFullYear();
}

// ═══════════════════════════════════════════════════
// E-MAILS
// ═══════════════════════════════════════════════════

function sendKuendigungsMail(data, kuendigungsDatum) {
  var body = 'Hallo ' + data.vorname + ',\n\n' +
    'wir haben Deine Kündigung der Mitgliedschaft beim Boulderverein Zugzwang e.V. erhalten.\n\n' +
    'Folgende Daten wurden übermittelt:\n\n' +
    '  Name:              ' + data.vorname + ' ' + data.nachname + '\n' +
    '  E-Mail:            ' + data.email + '\n' +
    '  Kündigungsdatum:   ' + kuendigungsDatum + '\n\n' +
    'Die Mitgliedschaft endet zum 31.12.' + new Date().getFullYear() + '.\n\n' +
    'Der Zutrittschip ist bis zum Ende der Mitgliedschaft zurückzugeben.\n' +
    'Bitte an folgende Adresse senden:\n\n' +
    '  Detlef Müller\n' +
    '  Josefstr. 9\n' +
    '  91275 Auerbach i.d.OPf.\n\n' +
    'Bitte den Chip auf ein Blatt Papier mit Deinen Daten kleben und nicht lose in ein Kuvert stecken.\n' +
    'Es besteht die Gefahr, dass das Kuvert beschädigt wird und der Chip verloren geht.\n\n' +
    'Falls du Fragen hast, erreichst du uns unter boulderhallezugzwang@gmail.com.\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'Neuhauser Straße 1\n' +
    '91275 Auerbach i.d.OPf.\n\n' +
    'https://boulderhallezugzwang.github.io/zugzwang-website';

  MailApp.sendEmail({
    to: data.email,
    subject: 'Bestätigung Deiner Kündigung – Boulderverein Zugzwang e.V.',
    body: body,
    name: 'Boulderverein Zugzwang e.V.'
  });
}

function sendNichtGefundenMail(data) {
  var body = 'Hallo ' + data.vorname + ',\n\n' +
    'wir haben Deine Kündigungsanfrage erhalten, konnten jedoch keinen passenden Eintrag ' +
    'in unseren Vereinsdaten finden.\n\n' +
    'Folgende Daten wurden übermittelt:\n\n' +
    '  Name:    ' + data.vorname + ' ' + data.nachname + '\n' +
    '  E-Mail:  ' + data.email + '\n\n' +
    'Die Kündigung konnte daher nicht durchgeführt werden. Bitte prüfe, ob du den Namen ' +
    'genau so angegeben hast, wie er bei der Anmeldung verwendet wurde.\n\n' +
    'Bei Fragen wende dich bitte an boulderhallezugzwang@gmail.com.\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'Neuhauser Straße 1\n' +
    '91275 Auerbach i.d.OPf.\n\n' +
    'https://boulderhallezugzwang.github.io/zugzwang-website';

  MailApp.sendEmail({
    to: data.email,
    subject: 'Kündigung fehlgeschlagen – Mitglied nicht gefunden',
    body: body,
    name: 'Boulderverein Zugzwang e.V.'
  });
}

