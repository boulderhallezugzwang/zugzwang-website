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

function sendNotifyKuendigung(vorname, nachname, datum, ergebnis, absenderEmail) {
  var pruefen = (ergebnis === 'pruefen');
  var aktiv = getConfigValue('notify_kuendigung_aktiv');
  // Abweichende E-Mail muss ein Mensch pruefen → immer benachrichtigen.
  if (aktiv !== 'ja' && !pruefen) return;
  var email = getConfigValue('notify_kuendigung_email') || (pruefen ? VEREIN_EMAIL_FALLBACK : '');
  if (!email) return;
  var ergebnisText = {
    gekuendigt: 'Status im Mitglieder-Tab wurde auf "gekündigt" gesetzt.',
    bereits: 'Das Mitglied war bereits als gekündigt eingetragen.',
    pruefen: 'ACHTUNG: Die angegebene E-Mail stimmt NICHT mit der beim Mitglied hinterlegten überein.\n' +
      '          Der Status wurde NICHT geändert. Bitte beim Mitglied nachfragen und ggf. von Hand eintragen.',
    nicht_gefunden: 'Kein Mitglied mit diesem Namen gefunden.'
  }[ergebnis] || '';
  MailApp.sendEmail({
    to: email,
    subject: (pruefen ? 'BITTE PRÜFEN – Kündigung: ' : 'Kündigung eingegangen: ') + vorname + ' ' + nachname,
    body: 'Eine Kündigung ist eingegangen:\n\n' +
      '  Name:     ' + vorname + ' ' + nachname + '\n' +
      '  E-Mail:   ' + (absenderEmail || '') + '\n' +
      '  Datum:    ' + datum + '\n' +
      '  Ergebnis: ' + ergebnisText + '\n',
    name: 'Kündigungs-Formular'
  });
}

const KUENDIGUNG_HEADERS = [
  'Vorname', 'Nachname', 'E-Mail', 'Kündigungsdatum', 'Ergebnis'
];

const VEREIN_EMAIL_FALLBACK = 'boulderhallezugzwang@gmail.com';

// Text aus dem oeffentlichen Formular sicher in eine Zelle schreiben:
// ein fuehrendes = + - @ wuerde von Sheets als Formel ausgewertet.
function sheetSafe(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return v;
  var s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 2000);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

// Eingaben pruefen; gibt Fehlermeldung oder '' zurueck.
function validateKuendigung(data) {
  if (!data || typeof data !== 'object') return 'Ungültige Anfrage.';
  var namePattern = /^[^<>"=;{}\[\]\\\/\u0000-\u001F]{1,60}$/;
  if (typeof data.vorname !== 'string' || !namePattern.test(data.vorname.trim())) return 'Bitte einen gültigen Vornamen angeben.';
  if (typeof data.nachname !== 'string' || !namePattern.test(data.nachname.trim())) return 'Bitte einen gültigen Nachnamen angeben.';
  if (typeof data.email !== 'string' || data.email.length > 120 ||
      !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(data.email.trim())) return 'Bitte eine gültige E-Mail-Adresse angeben.';
  return '';
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var fehler = validateKuendigung(data);
    if (fehler) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: fehler })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    data.vorname = data.vorname.trim();
    data.nachname = data.nachname.trim();
    data.email = data.email.trim();

    // Das Datum setzt der Server – nicht der Absender.
    var kuendigungsDatum = todayDe();
    var ergebnis;

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

      // ── Kündigungs-Sheet anlegen oder finden ──
      var kSheet = ss.getSheetByName(KUENDIGUNG_SHEET_NAME);
      if (!kSheet) {
        kSheet = ss.insertSheet(KUENDIGUNG_SHEET_NAME);
        kSheet.appendRow(KUENDIGUNG_HEADERS);
        kSheet.getRange(1, 1, 1, KUENDIGUNG_HEADERS.length).setFontWeight('bold');
        kSheet.setFrozenRows(1);
      } else if (!kSheet.getRange(1, 5).getValue()) {
        kSheet.getRange(1, 5).setValue('Ergebnis').setFontWeight('bold');
      }

      // ── Status im Hauptsheet aktualisieren (nur bei passender E-Mail) ──
      ergebnis = updateMainSheet(ss, data.vorname, data.nachname, data.email, kuendigungsDatum);

      var ergebnisText = {
        gekuendigt: 'Status gesetzt',
        bereits: 'war bereits gekündigt',
        pruefen: 'E-MAIL WEICHT AB – bitte manuell prüfen, Status NICHT geändert',
        nicht_gefunden: 'Mitglied nicht gefunden'
      }[ergebnis];

      // ── Kündigung protokollieren ──
      kSheet.appendRow([
        sheetSafe(data.vorname),
        sheetSafe(data.nachname),
        sheetSafe(data.email),
        kuendigungsDatum,
        ergebnisText
      ]);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    // Ab hier ist die Kuendigung gespeichert; Mail-Fehler (z.B. leeres
    // Kontingent) duerfen daraus keinen Fehler machen.
    try {
      if (ergebnis === 'gekuendigt' || ergebnis === 'bereits') {
        sendKuendigungsMail(data, kuendigungsDatum);
      } else if (ergebnis === 'pruefen') {
        sendPruefungMail(data);
      } else {
        sendNichtGefundenMail(data);
      }
    } catch (errMail) {
      console.error('Kuendigung ' + data.nachname + ': Mail an Absender fehlgeschlagen: ' + errMail);
    }
    try {
      sendNotifyKuendigung(data.vorname, data.nachname, kuendigungsDatum, ergebnis, data.email);
    } catch (errNotify) {
      console.error('Kuendigung ' + data.nachname + ': Benachrichtigung fehlgeschlagen: ' + errNotify);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ status: 'ok' })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error('Fehler: ' + error.toString());
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: 'Die Kündigung konnte nicht verarbeitet werden.' })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ═══════════════════════════════════════════════════
// HAUPTSHEET AKTUALISIEREN
// ═══════════════════════════════════════════════════

// Setzt den Status NUR, wenn Name UND die beim Mitglied hinterlegte E-Mail
// uebereinstimmen. Frueher reichte der Name: damit konnte jeder jedes
// Mitglied (und alle Namensvettern) kuendigen.
//
// Rueckgabe:
//   'gekuendigt'     – Status wurde gesetzt
//   'bereits'        – Name + E-Mail passen, war schon gekuendigt
//   'pruefen'        – Name gefunden, aber E-Mail weicht ab / ist nicht
//                      hinterlegt → nichts geaendert, Vorstand prueft
//   'nicht_gefunden' – kein Mitglied mit diesem Namen
function updateMainSheet(ss, vorname, nachname, email, kuendigungsDatum) {
  var sheet = ss.getSheetByName('Mitglieder') || ss.getSheets()[0];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) return 'nicht_gefunden';

  // Spalten-Indizes finden
  var colIdx = {};
  headers.forEach(function(h, i) { colIdx[h.toString().trim()] = i; });

  var nachnameIdx = colIdx['Nachname'];
  var vornameIdx = colIdx['Vorname'];
  var statusIdx = colIdx['Status'];
  var emailIdx = colIdx['E-Mail'];

  if (nachnameIdx === undefined || vornameIdx === undefined ||
      statusIdx === undefined || emailIdx === undefined) {
    throw new Error('Spalten Nachname/Vorname/Status/E-Mail im Mitglieder-Tab nicht gefunden');
  }

  var norm = function(v) { return v.toString().trim().toLowerCase(); };
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var nameGefunden = false;
  var gekuendigt = false;
  var bereits = false;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (norm(row[nachnameIdx]) !== norm(nachname) || norm(row[vornameIdx]) !== norm(vorname)) continue;
    nameGefunden = true;

    if (!norm(row[emailIdx]) || norm(row[emailIdx]) !== norm(email)) continue;

    if (norm(row[statusIdx]).indexOf('gekündigt') === 0) {
      bereits = true;
      continue;
    }
    sheet.getRange(i + 2, statusIdx + 1).setValue('gekündigt (' + kuendigungsDatum + ')');
    gekuendigt = true;
  }

  if (gekuendigt) return 'gekuendigt';
  if (bereits) return 'bereits';
  return nameGefunden ? 'pruefen' : 'nicht_gefunden';
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
  var introText = getConfigValue('mail_kuendigung_intro') ||
    'Wir haben Deine Kündigung der Mitgliedschaft beim Boulderverein Zugzwang e.V. erhalten.';
  var hinweisText = getConfigValue('mail_kuendigung_hinweis') ||
    'Die Mitgliedschaft endet zum 31.12.' + new Date().getFullYear() + '.\n\nDer Zutrittschip ist bis zum Ende der Mitgliedschaft zurückzugeben.\nBitte an folgende Adresse senden:\n\n  Detlef Müller\n  Josefstr. 9\n  91275 Auerbach i.d.OPf.\n\nBitte den Chip auf ein Blatt Papier mit Deinen Daten kleben und nicht lose in ein Kuvert stecken.\nEs besteht die Gefahr, dass das Kuvert beschädigt wird und der Chip verloren geht.';
  var signatur = getConfigValue('mail_signatur') ||
    'Sportliche Grüße,\nBoulderverein Zugzwang e.V.\nNeuhauser Straße 1\n91275 Auerbach i.d.OPf.\n\nhttps://boulderhallezugzwang.github.io/zugzwang-website';

  var body = 'Hallo ' + data.vorname + ',\n\n' +
    introText + '\n\n' +
    'Folgende Daten wurden übermittelt:\n\n' +
    '  Name:              ' + data.vorname + ' ' + data.nachname + '\n' +
    '  E-Mail:            ' + data.email + '\n' +
    '  Kündigungsdatum:   ' + kuendigungsDatum + '\n\n' +
    hinweisText + '\n\n' +
    'Falls du Fragen hast, erreichst du uns unter ' + (getConfigValue('kontakt_kuendigung_email') || 'boulderhallezugzwang@gmail.com') + '.\n\n' +
    signatur;

  MailApp.sendEmail({
    to: data.email,
    subject: 'Bestätigung Deiner Kündigung – Boulderverein Zugzwang e.V.',
    body: body,
    name: 'Boulderverein Zugzwang e.V.'
  });
}

function sendNichtGefundenMail(data) {
  var introText = getConfigValue('mail_kuendigung_nf_intro') ||
    'Wir haben Deine Kündigungsanfrage erhalten, konnten jedoch keinen passenden Eintrag in unseren Vereinsdaten finden.';
  var hinweisText = getConfigValue('mail_kuendigung_nf_hinweis') ||
    'Die Kündigung konnte daher nicht durchgeführt werden. Bitte prüfe, ob du den Namen genau so angegeben hast, wie er bei der Anmeldung verwendet wurde.';
  var signatur = getConfigValue('mail_signatur') ||
    'Sportliche Grüße,\nBoulderverein Zugzwang e.V.\nNeuhauser Straße 1\n91275 Auerbach i.d.OPf.\n\nhttps://boulderhallezugzwang.github.io/zugzwang-website';

  var body = 'Hallo ' + data.vorname + ',\n\n' +
    introText + '\n\n' +
    'Folgende Daten wurden übermittelt:\n\n' +
    '  Name:    ' + data.vorname + ' ' + data.nachname + '\n' +
    '  E-Mail:  ' + data.email + '\n\n' +
    hinweisText + '\n\n' +
    'Bei Fragen wende dich bitte an ' + (getConfigValue('kontakt_kuendigung_email') || 'boulderhallezugzwang@gmail.com') + '.\n\n' +
    signatur;

  MailApp.sendEmail({
    to: data.email,
    subject: 'Kündigung fehlgeschlagen – Mitglied nicht gefunden',
    body: body,
    name: 'Boulderverein Zugzwang e.V.'
  });
}

function sendPruefungMail(data) {
  var signatur = getConfigValue('mail_signatur') ||
    'Sportliche Grüße,\nBoulderverein Zugzwang e.V.\nNeuhauser Straße 1\n91275 Auerbach i.d.OPf.\n\nhttps://zugzwang-auerbach.de';

  var body = 'Hallo ' + data.vorname + ',\n\n' +
    'wir haben Deine Kündigungsanfrage erhalten. Die angegebene E-Mail-Adresse stimmt jedoch nicht mit der ' +
    'Adresse überein, die bei uns hinterlegt ist. Die Kündigung wurde deshalb noch nicht eingetragen.\n\n' +
    'Der Vorstand prüft die Anfrage und meldet sich bei Dir. Du kannst das Formular auch erneut mit der ' +
    'E-Mail-Adresse absenden, die Du bei der Anmeldung angegeben hast.\n\n' +
    'Bei Fragen wende dich bitte an ' + (getConfigValue('kontakt_kuendigung_email') || VEREIN_EMAIL_FALLBACK) + '.\n\n' +
    signatur;

  MailApp.sendEmail({
    to: data.email,
    subject: 'Deine Kündigungsanfrage – Rückfrage nötig',
    body: body,
    name: 'Boulderverein Zugzwang e.V.'
  });
}
