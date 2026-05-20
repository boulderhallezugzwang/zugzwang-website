// ═══════════════════════════════════════════════════════════════
// Google Apps Script – Mitgliederliste API
// Boulderverein Zugzwang e.V.
//
// Benutzer-Authentifizierung über Sheet-Tab "Benutzer".
// Admin legt Benutzername + Passwort im Sheet an.
// ═══════════════════════════════════════════════════════════════

const SPREADSHEET_ID = '1HGhz-q7zWtYYFvLr8hnUZ2Yzz8p_p_e5NPYmwokluN8';
const BENUTZER_TAB = 'Benutzer';
const NEWS_FOLDER_ID = '1gql-ifQ24MvQNuKuwemyFtzJxOd7nN14';

// Kalender-IDs
const KALENDER = {
  events: '6eb31d432b827ce5d980491712fba5df0cca4b7285a10b2e40ed5cba16c90722@group.calendar.google.com',
  training: '8c88314fa8dd847bf2311553f1e401982a10e4b54d6a542e4aa9699d3823c3d0@group.calendar.google.com',
  arbeitsdienst: '4de1761c6fb2c0eadb12bd5a0724cc2983d84ed2a4ed0559caefa67892145f16@group.calendar.google.com'
};

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Config-Hilfsfunktionen ──

function getConfigSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Config');
  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'Beschreibung']]);
    // Defaults anlegen
    var defaults = [
      ['notify_mitgliedsantrag_aktiv', 'ja', 'Benachrichtigung bei neuem Mitgliedsantrag'],
      ['notify_mitgliedsantrag_email', 'boulderhallezugzwang@gmail.com', 'E-Mail für Mitgliedsantrag-Benachrichtigung'],
      ['notify_haftung_aktiv', 'nein', 'Benachrichtigung bei Haftungsausschluss'],
      ['notify_haftung_email', '', 'E-Mail für Haftungsausschluss-Benachrichtigung'],
      ['notify_hallendienst_aktiv', 'nein', 'Benachrichtigung bei Hallendienst-Anmeldung'],
      ['notify_hallendienst_email', '', 'E-Mail für Hallendienst-Benachrichtigung'],
      ['notify_kuendigung_aktiv', 'nein', 'Benachrichtigung bei Kündigung'],
      ['notify_kuendigung_email', '', 'E-Mail für Kündigungs-Benachrichtigung'],
      ['notify_jugendtraining_aktiv', 'nein', 'Benachrichtigung bei Jugendtraining-Anmeldung'],
      ['notify_jugendtraining_email', '', 'E-Mail für Jugendtraining-Benachrichtigung'],
      ['kontakt_mitgliedsantrag_email', 'boulderhallezugzwang@gmail.com', 'Kontakt-E-Mail in Mitgliedsantrag-Bestätigungen'],
      ['kontakt_haftung_email', 'boulderhallezugzwang@gmail.com', 'Kontakt-E-Mail in Haftungsausschluss-Bestätigungen'],
      ['kontakt_hallendienst_email', 'boulderhallezugzwang@gmail.com', 'Kontakt-E-Mail in Hallendienst-Bestätigungen'],
      ['kontakt_kuendigung_email', 'boulderhallezugzwang@gmail.com', 'Kontakt-E-Mail in Kündigungs-Bestätigungen'],
      ['kontakt_jugendtraining_email', 'boulderhallezugzwang@gmail.com', 'Kontakt-E-Mail in Jugendtraining-Bestätigungen']
    ];
    sheet.getRange(2, 1, defaults.length, 3).setValues(defaults);
  }
  return sheet;
}

function getConfigAll() {
  var sheet = getConfigSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var config = [];
  data.forEach(function(row) {
    if (row[0]) {
      config.push({ key: row[0].toString(), value: row[1].toString(), beschreibung: row[2].toString() });
    }
  });
  return config;
}

function getConfigValue(key) {
  var sheet = getConfigSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';
  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0].toString() === key) return data[i][1].toString();
  }
  return '';
}

function saveConfig(items) {
  var sheet = getConfigSheet();
  var lastRow = sheet.getLastRow();
  var data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 3).getValues() : [];

  items.forEach(function(item) {
    var found = false;
    for (var i = 0; i < data.length; i++) {
      if (data[i][0].toString() === item.key) {
        data[i][1] = item.value;
        found = true;
        break;
      }
    }
    if (!found) {
      data.push([item.key, item.value, item.beschreibung || '']);
    }
  });

  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, 3).setValues(data);
  }
  return { ok: true };
}

function getBenutzerSheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(BENUTZER_TAB);
}

function getMitgliederSheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Mitglieder') ||
         SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
}

// Benutzer anhand Username + Passwort prüfen
// Spalten: A=Benutzername, B=Anzeigename, C=Rolle, D=Passwort, E=Erstanmeldung
function authenticateUser(username, password) {
  if (!username || !password) return null;
  var sheet = getBenutzerSheet();
  if (!sheet) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === username.toLowerCase() &&
        data[i][3].toString() === password) {
      return {
        row: i + 2,
        benutzername: data[i][0].toString(),
        anzeigename: data[i][1].toString(),
        rolle: data[i][2].toString(),
        erstanmeldung: data[i][4].toString().toLowerCase() === 'ja'
      };
    }
  }
  return null;
}

// ── POST-Endpunkt ──

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = (body.action || '').toString();

    // Kein action-Feld → Mitgliedsantrag-Formular
    if (!action) {
      return handleMitgliedsantrag(body);
    }

    if (action === 'login') {
      var user = authenticateUser(body.username, body.password);
      if (!user) return jsonResponse({ error: 'Benutzername oder Passwort falsch' });
      if (user.erstanmeldung) {
        return jsonResponse({ needsPassword: true, displayName: user.anzeigename });
      }
      return jsonResponse(getMemberData(user));
    }

    if (action === 'setPassword') {
      var username = (body.username || '').toString().trim();
      var oldPassword = (body.oldPassword || '').toString();
      var newPassword = (body.newPassword || '').toString();
      if (newPassword.length < 6) return jsonResponse({ error: 'Passwort muss mindestens 6 Zeichen lang sein' });
      var user = authenticateUser(username, oldPassword);
      if (!user) return jsonResponse({ error: 'Authentifizierung fehlgeschlagen' });
      var sheet = getBenutzerSheet();
      sheet.getRange(user.row, 4).setValue(newPassword);  // Neues Passwort
      sheet.getRange(user.row, 5).setValue('Nein');        // Erstanmeldung = Nein
      // Neu authentifizieren mit neuem Passwort
      user.erstanmeldung = false;
      return jsonResponse(getMemberData(user));
    }

    // Auth-geschützte Kalender-Aktionen
    if (action === 'createEvent' || action === 'getEvents' || action === 'deleteEvent' || action === 'updateEvent') {
      var user = authenticateUser(body.username, body.password);
      if (!user) return jsonResponse({ error: 'Nicht authentifiziert' });

      if (action === 'getEvents') {
        return jsonResponse(getCalendarEvents());
      }

      if (action === 'createEvent') {
        var kalender = (body.kalender || '').toString();
        var titel = (body.titel || '').toString().trim();
        var datum = (body.datum || '').toString();
        var zeitVon = (body.zeitVon || '').toString();
        var zeitBis = (body.zeitBis || '').toString();
        var beschreibung = (body.beschreibung || '').toString().trim();

        if (!kalender || !KALENDER[kalender]) return jsonResponse({ error: 'Ungültiger Kalender' });
        if (!titel) return jsonResponse({ error: 'Titel erforderlich' });
        if (!datum || !zeitVon || !zeitBis) return jsonResponse({ error: 'Datum und Uhrzeiten erforderlich' });

        var mailMode = (body.mailMode || 'all').toString();
        var mailTo = (body.mailTo || '').toString();
        var remindHours = (body.remindHours || '0').toString();
        var result = createCalEvent(kalender, titel, datum, zeitVon, zeitBis, beschreibung, mailMode, mailTo, remindHours);
        return jsonResponse(result);
      }

      if (action === 'deleteEvent') {
        var kalender = (body.kalender || '').toString();
        var eventId = (body.eventId || '').toString();
        var mailMode = (body.mailMode || 'all').toString();
        var mailTo = (body.mailTo || '').toString();
        if (!kalender || !eventId) return jsonResponse({ error: 'Kalender und Event-ID erforderlich' });
        return jsonResponse(deleteCalEvent(kalender, eventId, mailMode, mailTo));
      }

      if (action === 'updateEvent') {
        var kalender = (body.kalender || '').toString();
        var eventId = (body.eventId || '').toString();
        var titel = (body.titel || '').toString().trim();
        var datum = (body.datum || '').toString();
        var zeitVon = (body.zeitVon || '').toString();
        var zeitBis = (body.zeitBis || '').toString();
        var beschreibung = (body.beschreibung || '').toString().trim();

        if (!kalender || !eventId) return jsonResponse({ error: 'Kalender und Event-ID erforderlich' });
        if (!titel) return jsonResponse({ error: 'Titel erforderlich' });
        if (!datum || !zeitVon || !zeitBis) return jsonResponse({ error: 'Datum und Uhrzeiten erforderlich' });

        var mailMode = (body.mailMode || 'all').toString();
        var mailTo = (body.mailTo || '').toString();
        var remindHours = (body.remindHours || '0').toString();
        return jsonResponse(updateCalEvent(kalender, eventId, titel, datum, zeitVon, zeitBis, beschreibung, mailMode, mailTo, remindHours));
      }
    }

    // Auth-geschützte News-Aktionen
    if (action === 'getNews' || action === 'createNews' || action === 'deleteNews' || action === 'updateNews') {
      var user = authenticateUser(body.username, body.password);
      if (!user) return jsonResponse({ error: 'Nicht authentifiziert' });

      if (action === 'getNews') {
        return jsonResponse(getNewsList());
      }

      if (action === 'createNews') {
        var titel = (body.titel || '').toString().trim();
        var datum = (body.datum || '').toString().trim();
        var autor = (body.autor || '').toString().trim();
        var inhalt = (body.inhalt || '').toString();
        var bildBase64 = (body.bildBase64 || '').toString();
        var bildMimeType = (body.bildMimeType || 'image/jpeg').toString();

        if (!titel) return jsonResponse({ error: 'Titel erforderlich' });
        if (!datum) return jsonResponse({ error: 'Datum erforderlich' });
        if (!autor) return jsonResponse({ error: 'Autor erforderlich' });

        return jsonResponse(createNewsDoc(titel, datum, autor, inhalt, bildBase64, bildMimeType));
      }

      if (action === 'deleteNews') {
        var docId = (body.docId || '').toString();
        if (!docId) return jsonResponse({ error: 'Doc-ID erforderlich' });
        return jsonResponse(deleteNewsDoc(docId));
      }

      if (action === 'updateNews') {
        var docId = (body.docId || '').toString();
        var titel = (body.titel || '').toString().trim();
        var datum = (body.datum || '').toString().trim();
        var autor = (body.autor || '').toString().trim();
        var inhalt = (body.inhalt || '').toString();
        var bildBase64 = (body.bildBase64 || '').toString();
        var bildMimeType = (body.bildMimeType || 'image/jpeg').toString();

        if (!docId) return jsonResponse({ error: 'Doc-ID erforderlich' });
        if (!titel) return jsonResponse({ error: 'Titel erforderlich' });

        return jsonResponse(updateNewsDoc(docId, titel, datum, autor, inhalt, bildBase64, bildMimeType));
      }
    }

    // Auth-geschützte Config-Aktionen (nur Admin)
    if (action === 'getConfig' || action === 'saveConfig') {
      var user = authenticateUser(body.username, body.password);
      if (!user) return jsonResponse({ error: 'Nicht authentifiziert' });
      if (user.rolle !== 'admin') return jsonResponse({ error: 'Keine Berechtigung' });

      if (action === 'getConfig') {
        return jsonResponse({ config: getConfigAll() });
      }
      if (action === 'saveConfig') {
        var items = body.items || [];
        return jsonResponse(saveConfig(items));
      }
    }

    // Auth-geschützte Newsletter-Aktion
    if (action === 'sendNewsletter') {
      var user = authenticateUser(body.username, body.password);
      if (!user) return jsonResponse({ error: 'Nicht authentifiziert' });

      var betreff = (body.betreff || '').toString().trim();
      var inhalt = (body.inhalt || '').toString();
      var htmlInhalt = (body.htmlInhalt || '').toString();
      var mailMode = (body.mailMode || 'all').toString();
      var mailTo = (body.mailTo || '').toString();

      if (!betreff) return jsonResponse({ error: 'Betreff erforderlich' });
      if (!inhalt) return jsonResponse({ error: 'Inhalt erforderlich' });

      return jsonResponse(sendNewsletter(betreff, inhalt, htmlInhalt, mailMode, mailTo));
    }

    return jsonResponse({ error: 'Unbekannte Aktion' });
  } catch (error) {
    return jsonResponse({ error: error.toString() });
  }
}

// ── GET-Endpunkt (Chip-Update) ──

function doGet(e) {
  try {
    var action = (e.parameter.action || '').toString();
    var username = (e.parameter.username || '').toString();
    var password = (e.parameter.password || '').toString();

    var user = authenticateUser(username, password);
    if (!user) return jsonResponse({ error: 'Nicht authentifiziert' });

    if (action === 'updateChip') {
      if (user.rolle !== 'admin') return jsonResponse({ error: 'Keine Berechtigung' });
      return jsonResponse(updateChipInSheet(e.parameter));
    }

    return jsonResponse({ error: 'Unbekannte Aktion' });
  } catch (error) {
    return jsonResponse({ error: error.toString() });
  }
}

// ── Mitgliederdaten laden ──

function getMemberData(user) {
  var sheet = getMitgliederSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) return { members: [], count: 0, user: { displayName: user.anzeigename, rolle: user.rolle } };

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  var colIdx = {};
  headers.forEach(function(h, i) { colIdx[h] = i; });

  var members = [];
  data.forEach(function(row) {
    var nachname = row[colIdx['Nachname']] || '';
    var vorname = row[colIdx['Vorname']] || '';
    if (nachname || vorname) {
      var member = {
        nachname: nachname.toString(),
        vorname: vorname.toString(),
        telefon: (row[colIdx['Telefon Mobil']] || '').toString(),
        email: (row[colIdx['E-Mail']] || '').toString(),
        status: (row[colIdx['Status']] || '').toString(),
        ort: (row[colIdx['Ort']] || '').toString(),
        chip: (row[colIdx['Chip']] || '').toString(),
        chipnr: (row[colIdx['ChipNr.']] || '').toString(),
        eintritt: row[colIdx['Eintritt']] instanceof Date ? Utilities.formatDate(row[colIdx['Eintritt']], 'Europe/Berlin', 'dd.MM.yyyy') : (row[colIdx['Eintritt']] || '').toString()
      };
      // SEPA-Felder nur für Admins
      if (user.rolle === 'admin') {
        member.iban = (row[colIdx['IBAN']] || '').toString();
        member.bic = (row[colIdx['BIC']] || '').toString();
        member.mandatsreferenz = (row[colIdx['Mandatsreferenz']] || '').toString();
        member.kontoinhaber = (row[colIdx['Kontoinhaber']] || '').toString();
        member.mandatDatum = row[colIdx['Mandat Unterschriftsdatum']] instanceof Date ? Utilities.formatDate(row[colIdx['Mandat Unterschriftsdatum']], 'Europe/Berlin', 'dd.MM.yyyy') : (row[colIdx['Mandat Unterschriftsdatum']] || '').toString();
        member.zahlungspflichtig = (row[colIdx['Zahlungspflichtiges Mitglied']] || '').toString();
      }
      members.push(member);
    }
  });

  var result = {
    members: members,
    count: members.length,
    user: { displayName: user.anzeigename, rolle: user.rolle }
  };

  // Jugendtraining-Daten hinzufügen
  result.jugend = getJugendtrainingData(user);

  return result;
}

// ── Jugendtraining-Daten laden ──

function getJugendtrainingData(user) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Jugendtraining');
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  var colIdx = {};
  headers.forEach(function(h, i) { colIdx[h] = i; });

  var members = [];
  data.forEach(function(row) {
    var nachname = row[colIdx['Nachname']] || '';
    var vorname = row[colIdx['Vorname']] || '';
    if (!nachname && !vorname) return;

    var eintritt = colIdx['Eintritt'] !== undefined ? row[colIdx['Eintritt']] : '';
    var mandatDatum = colIdx['Mandat Unterschriftsdatum'] !== undefined ? row[colIdx['Mandat Unterschriftsdatum']] : '';

    var member = {
      nachname: nachname.toString(),
      vorname: vorname.toString(),
      geburtsdatum: (row[colIdx['Geburtsdatum']] || '').toString(),
      ort: (row[colIdx['Ort']] || '').toString(),
      email: (row[colIdx['E-Mail']] || '').toString(),
      telefon: (row[colIdx['Telefon Mobil']] || '').toString(),
      eintritt: eintritt instanceof Date ? Utilities.formatDate(eintritt, 'Europe/Berlin', 'dd.MM.yyyy') : (eintritt || '').toString()
    };
    // SEPA-Felder nur für Admins
    if (user && user.rolle === 'admin') {
      member.iban = (row[colIdx['IBAN']] || '').toString();
      member.bic = (row[colIdx['BIC']] || '').toString();
      member.kontoinhaber = (row[colIdx['Kontoinhaber']] || '').toString();
      member.mandatsreferenz = (row[colIdx['Mandatsreferenz']] || '').toString();
      member.mandatDatum = mandatDatum instanceof Date ? Utilities.formatDate(mandatDatum, 'Europe/Berlin', 'dd.MM.yyyy') : (mandatDatum || '').toString();
    }
    members.push(member);
  });

  return members;
}

// ── Chip-Daten im Sheet aktualisieren ──

function updateChipInSheet(params) {
  var nachname = params.nachname || '';
  var vorname = params.vorname || '';
  var chip = params.chip || '';
  var chipnr = params.chipnr || '';

  var sheet = getMitgliederSheet();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var lastRow = sheet.getLastRow();

  var colIdx = {};
  headers.forEach(function(h, i) { colIdx[h] = i + 1; });

  var chipCol = colIdx['Chip'];
  var chipnrCol = colIdx['ChipNr.'];
  if (!chipCol || !chipnrCol) return { error: 'Chip-Spalten nicht im Sheet gefunden' };

  var nachnameCol = colIdx['Nachname'];
  var vornameCol = colIdx['Vorname'];
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][nachnameCol - 1] == nachname && data[i][vornameCol - 1] == vorname) {
      var row = i + 2;
      sheet.getRange(row, chipCol).setValue(chip);
      sheet.getRange(row, chipnrCol).setValue(chipnr);
      return { ok: true, updated: vorname + ' ' + nachname };
    }
  }

  return { error: 'Mitglied nicht gefunden: ' + vorname + ' ' + nachname };
}

// ═══════════════════════════════════════════════════
// TERMIN ERSTELLEN + MAIL AN ALLE MITGLIEDER
// ═══════════════════════════════════════════════════

var KALENDER_NAMEN = {
  events: 'Events',
  training: 'Trainingstermine',
  arbeitsdienst: 'Arbeitsdienste'
};

var WOCHENTAGE_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

var MAIL_TAG_RE = /\n?\[ZZ-MAIL:[^\]]*\]/;
var REMIND_TAG_RE = /\n?\[ZZ-REMIND:[^\]]*\]/;
var REMINDED_TAG_RE = /\n?\[ZZ-REMINDED\]/;

function buildMailTag(mailMode, emailCount, recipients) {
  if (mailMode === 'none') return '\n[ZZ-MAIL:none]';
  if (mailMode === 'custom' && recipients && recipients.length > 0) {
    return '\n[ZZ-MAIL:custom:' + emailCount + ':' + recipients.join(',') + ']';
  }
  return '\n[ZZ-MAIL:all:' + emailCount + ']';
}

function buildRemindTag(remindHours) {
  if (!remindHours || remindHours === '0') return '';
  return '\n[ZZ-REMIND:' + remindHours + ']';
}

function parseMailTag(desc) {
  var m = desc.match(/\[ZZ-MAIL:([^\]]*)\]/);
  if (!m) return 'unbekannt';
  var parts = m[1].split(':');
  if (parts[0] === 'none') return 'keine';
  if (parts[0] === 'all') return 'alle (' + (parts[1] || '?') + ')';
  if (parts[0] === 'custom') return 'custom (' + (parts[1] || '?') + ')';
  return 'unbekannt';
}

function parseRemindTag(desc) {
  var m = desc.match(/\[ZZ-REMIND:(\d+)\]/);
  return m ? parseInt(m[1]) : 0;
}

function getMailRecipients(desc) {
  var m = desc.match(/\[ZZ-MAIL:([^\]]*)\]/);
  if (!m) return { mode: 'none', addresses: [] };
  var parts = m[1].split(':');
  if (parts[0] === 'all') return { mode: 'all', addresses: [] };
  if (parts[0] === 'custom' && parts[2]) return { mode: 'custom', addresses: parts[2].split(',') };
  return { mode: parts[0], addresses: [] };
}

function stripTags(desc) {
  return desc.replace(MAIL_TAG_RE, '').replace(REMIND_TAG_RE, '').replace(REMINDED_TAG_RE, '').trim();
}

function getCalendarEvents() {
  var heute = new Date();
  heute.setHours(0, 0, 0, 0);
  // Alle zukünftigen Termine: 1 Jahr voraus
  var bis = new Date();
  bis.setFullYear(bis.getFullYear() + 1);

  var alleTermine = [];
  var keys = Object.keys(KALENDER);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var cal = CalendarApp.getCalendarById(KALENDER[key]);
    if (!cal) continue;
    var events = cal.getEvents(heute, bis);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var start = ev.getStartTime();
      var end = ev.getEndTime();
      alleTermine.push({
        id: ev.getId(),
        kalender: key,
        kalenderName: KALENDER_NAMEN[key],
        titel: ev.getTitle(),
        datum: start.getFullYear() + '-' + ('0' + (start.getMonth() + 1)).slice(-2) + '-' + ('0' + start.getDate()).slice(-2),
        datumFormatiert: ('0' + start.getDate()).slice(-2) + '.' + ('0' + (start.getMonth() + 1)).slice(-2) + '.' + start.getFullYear(),
        wochentag: WOCHENTAGE_LANG[start.getDay()],
        zeitVon: ('0' + start.getHours()).slice(-2) + ':' + ('0' + start.getMinutes()).slice(-2),
        zeitBis: ('0' + end.getHours()).slice(-2) + ':' + ('0' + end.getMinutes()).slice(-2),
        beschreibung: stripTags(ev.getDescription() || ''),
        mailStatus: parseMailTag(ev.getDescription() || ''),
        erinnerung: parseRemindTag(ev.getDescription() || '')
      });
    }
  }

  alleTermine.sort(function(a, b) { return new Date(a.datum) - new Date(b.datum); });
  return { events: alleTermine };
}

function deleteCalEvent(kalender, eventId, mailMode, mailTo) {
  var cal = CalendarApp.getCalendarById(KALENDER[kalender]);
  if (!cal) return { error: 'Kalender nicht gefunden' };

  try {
    var ev = cal.getEventById(eventId);
    if (!ev) return { error: 'Termin nicht gefunden' };

    var titel = ev.getTitle();
    var start = ev.getStartTime();
    var end = ev.getEndTime();

    var datumFormatiert = ('0' + start.getDate()).slice(-2) + '.' + ('0' + (start.getMonth() + 1)).slice(-2) + '.' + start.getFullYear();
    var wochentag = WOCHENTAGE_LANG[start.getDay()];
    var zeitVon = ('0' + start.getHours()).slice(-2) + ':' + ('0' + start.getMinutes()).slice(-2);
    var zeitBis = ('0' + end.getHours()).slice(-2) + ':' + ('0' + end.getMinutes()).slice(-2);

    ev.deleteEvent();

    var msg = 'Termin "' + titel + '" gelöscht.';

    if (mailMode !== 'none') {
      var recipients = (mailMode === 'custom') ? parseCustomEmails(mailTo) : null;
      var result = sendCancelMail(titel, datumFormatiert, wochentag, zeitVon, zeitBis, KALENDER_NAMEN[kalender], recipients);
      msg += ' ' + formatChunkedSendMessage(result, result.total);
    }

    return { ok: true, message: msg };
  } catch (e) {
    return { error: 'Fehler beim Löschen: ' + e.toString() };
  }
}

function updateCalEvent(kalender, eventId, titel, datumISO, zeitVon, zeitBis, beschreibung, mailMode, mailTo, remindHours) {
  var cal = CalendarApp.getCalendarById(KALENDER[kalender]);
  if (!cal) return { error: 'Kalender nicht gefunden' };

  try {
    var ev = cal.getEventById(eventId);
    if (!ev) return { error: 'Termin nicht gefunden' };

    var dateParts = datumISO.split('-');
    var vonParts = zeitVon.split(':');
    var bisParts = zeitBis.split(':');
    var startDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]),
      parseInt(vonParts[0]), parseInt(vonParts[1]), 0);
    var endDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]),
      parseInt(bisParts[0]), parseInt(bisParts[1]), 0);

    if (endDate <= startDate) return { error: 'Ende muss nach Beginn liegen' };

    ev.setTitle(titel);
    ev.setTime(startDate, endDate);

    var mailResult = { sent: 0, queued: 0, failed: 0, total: 0 };
    var actualRecipients = [];

    if (mailMode !== 'none') {
      var datumFormatiert = ('0' + startDate.getDate()).slice(-2) + '.' + ('0' + (startDate.getMonth() + 1)).slice(-2) + '.' + startDate.getFullYear();
      var wochentag = WOCHENTAGE_LANG[startDate.getDay()];
      var icsContent = generateICS(titel, startDate, endDate, beschreibung, remindHours);
      var customRecipients = (mailMode === 'custom') ? parseCustomEmails(mailTo) : null;
      actualRecipients = customRecipients || getEmailRecipients(null);
      mailResult = sendUpdateMail(titel, datumFormatiert, wochentag, zeitVon, zeitBis, beschreibung, KALENDER_NAMEN[kalender], icsContent, customRecipients);
    }

    // Mail-Status + Erinnerung in Beschreibung aktualisieren (Total-Empfaengerzahl, nicht "sent")
    var descWithTag = (beschreibung || '') + buildMailTag(mailMode, mailResult.total, mailMode === 'custom' ? actualRecipients : null) + buildRemindTag(remindHours);
    ev.setDescription(descWithTag);

    var msg = 'Termin aktualisiert.';
    if (mailResult.total > 0) msg += ' ' + formatChunkedSendMessage(mailResult, mailResult.total);
    if (remindHours && remindHours !== '0') msg += ' Erinnerung ' + remindHours + 'h vorher aktiv.';

    return { ok: true, message: msg };
  } catch (e) {
    return { error: 'Fehler beim Ändern: ' + e.toString() };
  }
}

function createCalEvent(kalenderKey, titel, datumISO, zeitVon, zeitBis, beschreibung, mailMode, mailTo, remindHours) {
  var dateParts = datumISO.split('-');
  var vonParts = zeitVon.split(':');
  var bisParts = zeitBis.split(':');

  var startDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]),
    parseInt(vonParts[0]), parseInt(vonParts[1]), 0);
  var endDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]),
    parseInt(bisParts[0]), parseInt(bisParts[1]), 0);

  if (endDate <= startDate) return { error: 'Ende muss nach Beginn liegen' };

  var calId = KALENDER[kalenderKey];
  var cal = CalendarApp.getCalendarById(calId);
  if (!cal) return { error: 'Kalender nicht gefunden' };

  var mailResult = { sent: 0, queued: 0, failed: 0, total: 0 };
  var actualRecipients = [];

  if (mailMode !== 'none') {
    var icsContent = generateICS(titel, startDate, endDate, beschreibung, remindHours);
    var wochentag = WOCHENTAGE_LANG[startDate.getDay()];
    var datumFormatiert = ('0' + startDate.getDate()).slice(-2) + '.' +
      ('0' + (startDate.getMonth() + 1)).slice(-2) + '.' + startDate.getFullYear();

    var customRecipients = (mailMode === 'custom') ? parseCustomEmails(mailTo) : null;
    actualRecipients = customRecipients || getEmailRecipients(null);
    mailResult = sendEventMail(titel, datumFormatiert, wochentag, zeitVon, zeitBis,
      beschreibung, KALENDER_NAMEN[kalenderKey], icsContent, customRecipients);
  }

  // Mail-Status + Erinnerung in Beschreibung speichern (Total-Empfaengerzahl, nicht "sent")
  var descWithTag = (beschreibung || '') + buildMailTag(mailMode, mailResult.total, mailMode === 'custom' ? actualRecipients : null) + buildRemindTag(remindHours);

  var eventOptions = { description: descWithTag };
  cal.createEvent(titel, startDate, endDate, eventOptions);

  var msg = 'Termin "' + titel + '" erstellt.';
  if (mailResult.total > 0) msg += ' ' + formatChunkedSendMessage(mailResult, mailResult.total);
  if (remindHours && remindHours !== '0') msg += ' Erinnerung ' + remindHours + 'h vorher aktiv.';

  return { ok: true, message: msg };
}

function generateICS(titel, startDate, endDate, beschreibung, remindHours) {
  var now = new Date();
  var uid = Utilities.getUuid() + '@zugzwang';

  function icsDate(d) {
    return d.getFullYear().toString() +
      ('0' + (d.getMonth() + 1)).slice(-2) +
      ('0' + d.getDate()).slice(-2) + 'T' +
      ('0' + d.getHours()).slice(-2) +
      ('0' + d.getMinutes()).slice(-2) + '00';
  }

  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Boulderverein Zugzwang//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + uid,
    'DTSTART;TZID=Europe/Berlin:' + icsDate(startDate),
    'DTEND;TZID=Europe/Berlin:' + icsDate(endDate),
    'DTSTAMP:' + icsDate(now) + 'Z',
    'SUMMARY:' + titel.replace(/[,;\\]/g, ' '),
    beschreibung ? 'DESCRIPTION:' + beschreibung.replace(/\n/g, '\\n').replace(/[,;\\]/g, ' ') : '',
    'ORGANIZER;CN=Boulderverein Zugzwang:mailto:boulderhallezugzwang@gmail.com'
  ].filter(function(l) { return l; });

  // Erinnerung als VALARM hinzufügen
  if (remindHours && parseInt(remindHours) > 0) {
    var minutes = parseInt(remindHours) * 60;
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-PT' + minutes + 'M');
    lines.push('ACTION:DISPLAY');
    lines.push('DESCRIPTION:Erinnerung: ' + titel.replace(/[,;\\]/g, ' '));
    lines.push('END:VALARM');
  }

  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

// ── Hilfsfunktion: Custom-E-Mail-Adressen parsen ──

function parseCustomEmails(str) {
  if (!str) return [];
  return str.split(/[,;\s]+/).filter(function(e) {
    return e.indexOf('@') !== -1;
  }).map(function(e) { return e.trim().toLowerCase(); });
}

// ── Diagnose: MailApp-Tageskontingent + Empfänger-Analyse ──
// Im Apps Script Editor Funktion "checkMailQuota" auswählen und ausführen.
// Ergebnis im Ausführungsprotokoll. 100 = Consumer-Gmail, 1500 = Workspace.

function checkMailQuota() {
  var remaining = MailApp.getRemainingDailyQuota();
  var recipients = getEmailRecipients(null);

  // Account-Identität ermitteln (wichtig: Limit gilt pro ausführendem Account)
  var activeUser = '';
  var effectiveUser = '';
  try { activeUser = Session.getActiveUser().getEmail(); } catch (e) { activeUser = '(nicht verfügbar)'; }
  try { effectiveUser = Session.getEffectiveUser().getEmail(); } catch (e) { effectiveUser = '(nicht verfügbar)'; }

  // Duplikat-Analyse direkt aus dem Sheet (vor Dedupe)
  var sheet = getMitgliederSheet();
  var lastRow = sheet.getLastRow();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIdx = {};
  headers.forEach(function(h, i) { colIdx[h] = i; });
  var emailCol = colIdx['E-Mail'];

  var rawCount = 0, emptyCount = 0, invalidCount = 0;
  var counts = {};
  if (emailCol !== undefined && lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    for (var i = 0; i < data.length; i++) {
      var raw = (data[i][emailCol] || '').toString().trim();
      if (!raw) { emptyCount++; continue; }
      if (raw.indexOf('@') === -1) { invalidCount++; continue; }
      rawCount++;
      var lc = raw.toLowerCase();
      counts[lc] = (counts[lc] || 0) + 1;
    }
  }
  var duplicates = Object.keys(counts).filter(function(e) { return counts[e] > 1; });

  Logger.log('═══ MailApp Diagnose ═══');
  Logger.log('Ausführender Account (effective): ' + effectiveUser);
  Logger.log('Angemeldeter User (active):       ' + activeUser);
  Logger.log('  → Wenn das KEIN @zugzwang-auerbach.de Account ist,');
  Logger.log('     greift das Workspace-Limit NICHT.');
  Logger.log('');
  Logger.log('Verbleibendes Tageskontingent: ' + remaining);
  Logger.log('  → 100 = normales Gmail-Konto (Consumer)');
  Logger.log('  → 1500 = Google Workspace');
  Logger.log('');
  Logger.log('Mitglieder-Sheet:');
  Logger.log('  Zeilen mit gültiger E-Mail: ' + rawCount);
  Logger.log('  Leere E-Mail-Zellen: ' + emptyCount);
  Logger.log('  Ungültig (kein @): ' + invalidCount);
  Logger.log('  Eindeutige Empfänger (nach Dedupe): ' + recipients.length);
  Logger.log('  Doppelt im Sheet vorhanden: ' + duplicates.length);
  if (duplicates.length > 0) {
    duplicates.forEach(function(e) {
      Logger.log('    • ' + e + ' (' + counts[e] + '×)');
    });
  }
  Logger.log('');
  if (recipients.length > remaining) {
    Logger.log('⚠ WARNUNG: ' + recipients.length + ' Empfänger, aber nur ' + remaining + ' Mails frei.');
    Logger.log('  → ' + (recipients.length - remaining) + ' Mails würden fehlschlagen!');
  } else {
    Logger.log('✓ OK: Kontingent reicht für einen Versand an alle.');
  }

  return {
    effectiveUser: effectiveUser,
    activeUser: activeUser,
    remainingQuota: remaining,
    uniqueRecipients: recipients.length,
    rawCount: rawCount,
    emptyCount: emptyCount,
    invalidCount: invalidCount,
    duplicates: duplicates.map(function(e) { return { email: e, count: counts[e] }; })
  };
}

// ═══════════════════════════════════════════════════
// MAIL-QUEUE: Versand über mehrere Tage (Quota-Workaround)
// ═══════════════════════════════════════════════════
//
// Hintergrund: MailApp.sendEmail hat ein Tageskontingent (Consumer-Gmail:
// 100/Tag, Workspace: 1500/Tag). Bei vielen Empfaengern wird der erste
// Schwung sofort versandt, der Rest landet in einem versteckten Sheet
// "MailQueue" und wird taeglich um 10 Uhr (Berlin) automatisch nachgesendet.
// Wenn die Queue leer ist, schickt der Versand eine Bilanzmail an den
// ausfuehrenden Account (= Skripteigentuemer).
//
// Hinweis zu Erinnerungs-Mails: Diese gehen ebenfalls an alle Mitglieder
// und sind damit genauso gross wie der Hauptversand. Ein grosser Buffer
// haette hier wertlos die Versandgeschwindigkeit gebremst. Die 2 reserviert
// MAIL_QUOTA_BUFFER fuer einen moeglichen Mitgliedsantrag (Bestaetigung +
// Admin-Benachrichtigung), damit ein Massenversand nie eine Antragstellung
// blockiert.

var MAIL_QUEUE_SHEET = 'MailQueue';
var MAIL_QUOTA_BUFFER = 2;   // Reserve fuer einen Mitgliedsantrag (1 Bestaetigung an Antragsteller + 1 Benachrichtigung an Admin). Reminder-Mails bekommen keinen Puffer (gehen ohnehin an alle).
var MAIL_QUEUE_TRIGGER_HOUR = 10; // 10 Uhr Berlin = sicher nach Reset (Mitternacht PT)

function getMailQueueSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(MAIL_QUEUE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(MAIL_QUEUE_SHEET);
    sh.appendRow([
      'id', 'createdAt', 'type', 'subject', 'plainBody', 'htmlBody',
      'icsContent', 'inlineImagesFolderId', 'remainingEmails', 'failedEmails',
      'totalRecipients', 'status'
    ]);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}

function enqueueMail(entry) {
  var sh = getMailQueueSheet();
  sh.appendRow([
    Utilities.getUuid(),
    new Date(),
    entry.type || 'event',
    entry.subject || '',
    entry.plainBody || '',
    entry.htmlBody || '',
    entry.icsContent || '',
    entry.inlineImagesFolderId || '',
    (entry.remainingEmails || []).join(','),
    (entry.failedEmails || []).join(','),
    entry.totalRecipients || (entry.remainingEmails || []).length,
    'pending'
  ]);
}

function setupMailQueueTrigger() {
  // Alte processMailQueue-Trigger entfernen (so dass wir sauber 2 anlegen koennen)
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processMailQueue') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // 2x taeglich: 6 Uhr (drain bevor Reminder laeuft) und 18 Uhr (drain nach Reminder)
  // Doppelte Chance erhoeht Robustheit gegen das rollende 24h-Quota-Fenster.
  ScriptApp.newTrigger('processMailQueue')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .inTimezone('Europe/Berlin')
    .create();
  ScriptApp.newTrigger('processMailQueue')
    .timeBased()
    .everyDays(1)
    .atHour(18)
    .inTimezone('Europe/Berlin')
    .create();
}

// Sendet so viele Mails wie das verbleibende Tageskontingent erlaubt.
// Gibt zurueck: { sent, remaining: [], failed: [] }
function sendMailChunk(opts, recipients) {
  var quota = MailApp.getRemainingDailyQuota();
  var maxNow = Math.max(0, quota - MAIL_QUOTA_BUFFER);
  Logger.log('  [sendMailChunk] quota=' + quota + ', buffer=' + MAIL_QUOTA_BUFFER + ', maxNow=' + maxNow + ', recipients=' + recipients.length);
  var sendNow = recipients.slice(0, maxNow);
  var remaining = recipients.slice(maxNow);
  var sent = 0;
  var failed = [];

  for (var i = 0; i < sendNow.length; i++) {
    try {
      var msg = {};
      for (var k in opts) msg[k] = opts[k];
      msg.to = sendNow[i];
      MailApp.sendEmail(msg);
      sent++;
    } catch (e) {
      failed.push(sendNow[i]);
      Logger.log('  [sendMailChunk] Fehler an ' + sendNow[i] + ': ' + e.toString());
    }
  }

  Logger.log('  [sendMailChunk] fertig: sent=' + sent + ', failed=' + failed.length + ', remaining=' + remaining.length);
  return { sent: sent, remaining: remaining, failed: failed };
}

// Inline-Bilder (Newsletter) als Drive-Dateien persistieren, damit sie der
// Trigger spaeter wieder laden kann. Gibt Ordner-ID zurueck (oder '').
function persistInlineImages(inlineImages) {
  var keys = Object.keys(inlineImages || {});
  if (keys.length === 0) return '';
  try {
    var folder = DriveApp.getRootFolder().createFolder(
      'ZZ_MailQueue_Temp_' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000)
    );
    for (var i = 0; i < keys.length; i++) {
      var blob = inlineImages[keys[i]];
      folder.createFile(blob).setName(keys[i]);
    }
    return folder.getId();
  } catch (e) {
    Logger.log('persistInlineImages Fehler: ' + e.toString());
    return '';
  }
}

function loadInlineImagesFromFolder(folderId) {
  var imgs = {};
  if (!folderId) return imgs;
  try {
    var folder = DriveApp.getFolderById(folderId);
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      var blob = f.getBlob();
      blob.setName(f.getName());
      imgs[f.getName()] = blob;
    }
  } catch (e) {
    Logger.log('loadInlineImagesFromFolder Fehler: ' + e.toString());
  }
  return imgs;
}

function cleanupInlineImageFolder(folderId) {
  if (!folderId) return;
  try { DriveApp.getFolderById(folderId).setTrashed(true); } catch (e) {}
}

// Daily Trigger: arbeitet die Queue ab, sendet eine Bilanzmail pro
// fertiggestelltem Eintrag an den Skripteigentuemer.
function processMailQueue() {
  // Diagnose-Logging: hilft uns zu sehen, warum der Background-Trigger
  // manchmal "0 versandt" meldet, obwohl die Queue Daten haette
  Logger.log('=== processMailQueue START ===');
  try {
    var effUser = '(n/a)';
    var actUser = '(n/a)';
    try { effUser = Session.getEffectiveUser().getEmail() || '(leer)'; } catch (e) {}
    try { actUser = Session.getActiveUser().getEmail() || '(leer)'; } catch (e) {}
    Logger.log('Effective user: ' + effUser + ' | Active user: ' + actUser);
  } catch (e) {
    Logger.log('Session info: Fehler ' + e);
  }
  Logger.log('Initiales Tageskontingent: ' + MailApp.getRemainingDailyQuota());

  var sh = getMailQueueSheet();
  Logger.log('Sheet: ' + (sh ? sh.getName() : 'NULL') + ' | Parent: ' + (sh && sh.getParent() ? sh.getParent().getId() : 'NULL'));
  var lastRow = sh.getLastRow();
  Logger.log('lastRow: ' + lastRow);
  if (lastRow < 2) {
    Logger.log('Keine Daten in Queue -> return 0');
    return 0;
  }

  var data = sh.getRange(2, 1, lastRow - 1, 12).getValues();
  Logger.log('Anzahl Zeilen geladen: ' + data.length);
  var totalSent = 0;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var statusVal = row[11];
    Logger.log('Zeile ' + (i + 2) + ': status="' + statusVal + '" (typeof ' + typeof statusVal + ', length ' + (statusVal ? String(statusVal).length : 0) + ')');
    if (statusVal !== 'pending') {
      Logger.log('  -> skip (status !== "pending")');
      continue;
    }
    var quotaNow = MailApp.getRemainingDailyQuota();
    Logger.log('  Quota vor Versand: ' + quotaNow + ' (Buffer ' + MAIL_QUOTA_BUFFER + ')');
    if (quotaNow <= MAIL_QUOTA_BUFFER) {
      Logger.log('  -> break (Quota erschoepft)');
      break;
    }

    var emailsRaw = row[8];
    Logger.log('  remainingEmails Laenge im Sheet: ' + (emailsRaw ? String(emailsRaw).length : 0) + ' Zeichen');
    var emails = emailsRaw ? String(emailsRaw).split(',').filter(function(e) { return e; }) : [];
    Logger.log('  Anzahl zu versendender Adressen: ' + emails.length);
    if (emails.length === 0) {
      Logger.log('  -> Markiere als done (keine Adressen)');
      sh.getRange(i + 2, 12).setValue('done');
      continue;
    }

    var opts = {
      subject: row[3],
      body: row[4],
      name: 'Boulderverein Zugzwang e.V.'
    };
    if (row[5]) opts.htmlBody = row[5];
    if (row[6]) opts.attachments = [Utilities.newBlob(row[6], 'text/calendar', 'termin.ics')];
    if (row[7]) {
      var imgs = loadInlineImagesFromFolder(row[7]);
      if (Object.keys(imgs).length > 0) opts.inlineImages = imgs;
    }

    Logger.log('  Rufe sendMailChunk auf mit ' + emails.length + ' Empfaengern, subject="' + row[3] + '"');
    var result = sendMailChunk(opts, emails);
    Logger.log('  sendMailChunk Ergebnis: sent=' + result.sent + ', remaining=' + result.remaining.length + ', failed=' + result.failed.length);
    totalSent += result.sent;

    var oldFailed = row[9] ? String(row[9]).split(',').filter(function(e) { return e; }) : [];
    var newFailed = oldFailed.concat(result.failed);

    if (result.remaining.length === 0) {
      Logger.log('  -> Markiere Zeile als done');
      sh.getRange(i + 2, 9).setValue('');
      sh.getRange(i + 2, 10).setValue(newFailed.join(','));
      sh.getRange(i + 2, 12).setValue('done');
      cleanupInlineImageFolder(row[7]);
      try { sendAdminQueueReport(row[3], row[10], newFailed); } catch (e) {}
    } else {
      Logger.log('  -> Schreibe ' + result.remaining.length + ' verbleibende zurueck ins Sheet');
      sh.getRange(i + 2, 9).setValue(result.remaining.join(','));
      sh.getRange(i + 2, 10).setValue(newFailed.join(','));
    }
  }

  Logger.log('processMailQueue: ' + totalSent + ' Mail(s) versandt');
  Logger.log('=== processMailQueue ENDE ===');
  return totalSent;
}

function getAdminMailAddress() {
  try {
    var e = Session.getEffectiveUser().getEmail();
    if (e) return e;
  } catch (err) {}
  try {
    var e2 = Session.getActiveUser().getEmail();
    if (e2) return e2;
  } catch (err) {}
  try {
    var cfg = getConfigValue('admin_mail');
    if (cfg) return cfg;
  } catch (err) {}
  return 'boulderhallezugzwang@gmail.com';
}

function sendAdminQueueReport(subject, totalRecipients, failed) {
  var adminMail = getAdminMailAddress();
  if (!adminMail) return;

  var ok = totalRecipients - failed.length;
  var body = 'Versand abgeschlossen.\n\n' +
    'Betreff: ' + subject + '\n' +
    'Empfaenger gesamt:  ' + totalRecipients + '\n' +
    'Erfolgreich:        ' + ok + '\n' +
    'Fehlgeschlagen:     ' + failed.length + '\n';
  if (failed.length > 0) {
    body += '\nFehlerhafte Adressen:\n' +
      failed.map(function(e) { return '  - ' + e; }).join('\n') +
      '\n\nTipp: Adressen im Mitglieder-Sheet pruefen (Tippfehler, ungueltige Domain).';
  }

  try {
    MailApp.sendEmail({
      to: adminMail,
      subject: '[Zugzwang] Versand-Bilanz: ' + subject,
      body: body,
      name: 'Boulderverein Zugzwang e.V.'
    });
  } catch (e) {
    Logger.log('Adminreport-Fehler: ' + e.toString());
  }
}

// Hilfsfunktion fuer die UI-Rueckmeldung: "X von Y versandt, Z folgen ..."
function formatChunkedSendMessage(result, total) {
  if (total === 0) return '';
  if (result.queued === 0 && result.failed === 0) {
    return result.sent + ' E-Mail(s) gesendet.';
  }
  var msg = result.sent + ' von ' + total + ' E-Mail(s) sofort versandt';
  if (result.queued > 0) {
    msg += '; ' + result.queued + ' folgen in den naechsten Tagen automatisch';
  }
  if (result.failed > 0) {
    msg += '; ' + result.failed + ' fehlgeschlagen (Adresse pruefen)';
  }
  msg += '.';
  return msg;
}

// ── E-Mail-Empfänger ermitteln (alle Mitglieder oder custom) ──

function getEmailRecipients(customRecipients) {
  if (customRecipients) return customRecipients;

  var sheet = getMitgliederSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var colIdx = {};
  headers.forEach(function(h, i) { colIdx[h] = i; });
  var emailCol = colIdx['E-Mail'];
  if (emailCol === undefined) return [];

  var emails = [];
  var seen = {};
  for (var i = 0; i < data.length; i++) {
    var email = (data[i][emailCol] || '').toString().trim().toLowerCase();
    if (!email || seen[email] || email.indexOf('@') === -1) continue;
    seen[email] = true;
    emails.push(email);
  }
  return emails;
}

// ── Mail-Versand: Neuer Termin ──
// Gibt { sent, queued, failed, total } zurueck.

function sendEventMail(titel, datum, wochentag, zeitVon, zeitBis, beschreibung, kalenderName, icsContent, customRecipients) {
  var recipients = getEmailRecipients(customRecipients);
  if (recipients.length === 0) return { sent: 0, queued: 0, failed: 0, total: 0 };

  var body = 'Hallo,\n\n' +
    'es gibt einen neuen Termin im Boulderverein Zugzwang:\n\n' +
    titel + '\n' +
    wochentag + ', ' + datum + '\n' +
    zeitVon + ' – ' + zeitBis + ' Uhr\n';
  if (beschreibung) body += '\n' + beschreibung + '\n';
  body += '\nIm Anhang findest Du eine Kalenderdatei (.ics) zum Importieren in Deinen Kalender.\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'https://boulderhallezugzwang.github.io/zugzwang-website';

  var subject = kalenderName + ': ' + titel + ' – ' + datum;
  var opts = {
    subject: subject,
    body: body,
    name: 'Boulderverein Zugzwang e.V.',
    attachments: [Utilities.newBlob(icsContent, 'text/calendar', 'termin.ics')]
  };

  var result = sendMailChunk(opts, recipients);
  var retry = result.remaining;
  if (retry.length > 0) {
    enqueueMail({
      type: 'event_new',
      subject: subject,
      plainBody: body,
      icsContent: icsContent,
      remainingEmails: retry,
      failedEmails: result.failed,
      totalRecipients: recipients.length
    });
    setupMailQueueTrigger();
  } else if (result.failed.length > 0) {
    try { sendAdminQueueReport(subject, recipients.length, result.failed); } catch (e) {}
  }

  return {
    sent: result.sent,
    queued: retry.length,
    failed: result.failed.length,
    total: recipients.length
  };
}

// ── Mail-Versand: Absage ──

function sendCancelMail(titel, datum, wochentag, zeitVon, zeitBis, kalenderName, customRecipients) {
  var recipients = getEmailRecipients(customRecipients);
  if (recipients.length === 0) return { sent: 0, queued: 0, failed: 0, total: 0 };

  var body = 'Hallo,\n\n' +
    'folgender Termin im Boulderverein Zugzwang wurde leider abgesagt:\n\n' +
    titel + '\n' +
    wochentag + ', ' + datum + '\n' +
    zeitVon + ' – ' + zeitBis + ' Uhr\n\n' +
    'Bitte entferne den Termin aus Deinem Kalender.\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'https://boulderhallezugzwang.github.io/zugzwang-website';

  var subject = 'ABGESAGT: ' + titel + ' – ' + datum;
  var opts = {
    subject: subject,
    body: body,
    name: 'Boulderverein Zugzwang e.V.'
  };

  var result = sendMailChunk(opts, recipients);
  if (result.remaining.length > 0) {
    enqueueMail({
      type: 'event_cancel',
      subject: subject,
      plainBody: body,
      remainingEmails: result.remaining,
      failedEmails: result.failed,
      totalRecipients: recipients.length
    });
    setupMailQueueTrigger();
  } else if (result.failed.length > 0) {
    try { sendAdminQueueReport(subject, recipients.length, result.failed); } catch (e) {}
  }

  return {
    sent: result.sent,
    queued: result.remaining.length,
    failed: result.failed.length,
    total: recipients.length
  };
}

// ── Mail-Versand: Änderung ──

function sendUpdateMail(titel, datum, wochentag, zeitVon, zeitBis, beschreibung, kalenderName, icsContent, customRecipients) {
  var recipients = getEmailRecipients(customRecipients);
  if (recipients.length === 0) return { sent: 0, queued: 0, failed: 0, total: 0 };

  var body = 'Hallo,\n\n' +
    'ein Termin im Boulderverein Zugzwang wurde geändert:\n\n' +
    titel + '\n' +
    wochentag + ', ' + datum + '\n' +
    zeitVon + ' – ' + zeitBis + ' Uhr\n';
  if (beschreibung) body += '\n' + beschreibung + '\n';
  body += '\nIm Anhang findest Du die aktualisierte Kalenderdatei (.ics).\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'https://boulderhallezugzwang.github.io/zugzwang-website';

  var subject = 'GEÄNDERT: ' + titel + ' – ' + datum;
  var opts = {
    subject: subject,
    body: body,
    name: 'Boulderverein Zugzwang e.V.',
    attachments: [Utilities.newBlob(icsContent, 'text/calendar', 'termin.ics')]
  };

  var result = sendMailChunk(opts, recipients);
  if (result.remaining.length > 0) {
    enqueueMail({
      type: 'event_update',
      subject: subject,
      plainBody: body,
      icsContent: icsContent,
      remainingEmails: result.remaining,
      failedEmails: result.failed,
      totalRecipients: recipients.length
    });
    setupMailQueueTrigger();
  } else if (result.failed.length > 0) {
    try { sendAdminQueueReport(subject, recipients.length, result.failed); } catch (e) {}
  }

  return {
    sent: result.sent,
    queued: result.remaining.length,
    failed: result.failed.length,
    total: recipients.length
  };
}

// ═══════════════════════════════════════════════════
// NEWS: CRUD für Google Docs im News-Ordner
// ═══════════════════════════════════════════════════

function getNewsList() {
  try {
    var folder = DriveApp.getFolderById(NEWS_FOLDER_ID);
    var files = folder.getFilesByType(MimeType.GOOGLE_DOCS);
    var news = [];

    while (files.hasNext()) {
      var file = files.next();
      if (file.getName().toLowerCase().indexOf('template') !== -1) continue;

      try {
        var doc = DocumentApp.openById(file.getId());
        var body = doc.getBody();
        var paragraphs = body.getParagraphs();

        var textLines = [];
        for (var i = 0; i < paragraphs.length; i++) {
          var text = paragraphs[i].getText().trim();
          if (text) textLines.push(text);
        }

        if (textLines.length < 3) continue;

        var titel = textLines[0];
        var datumStr = textLines[1];
        var autor = textLines[2];
        var inhalt = textLines.slice(3).join('\n\n');

        var parsedDate = null;
        var dateParts = datumStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (dateParts) {
          parsedDate = new Date(parseInt(dateParts[3]), parseInt(dateParts[2]) - 1, parseInt(dateParts[1])).toISOString();
        } else {
          parsedDate = file.getDateCreated().toISOString();
        }

        var hatBild = body.getImages().length > 0;

        news.push({
          id: file.getId(),
          titel: titel,
          datum: datumStr,
          datumISO: parsedDate,
          autor: autor,
          inhalt: inhalt,
          hatBild: hatBild,
          docUrl: file.getUrl()
        });
      } catch (e) {
        Logger.log('News-Fehler bei ' + file.getName() + ': ' + e.toString());
      }
    }

    news.sort(function(a, b) { return new Date(b.datumISO) - new Date(a.datumISO); });
    return { news: news };
  } catch (e) {
    return { error: 'Fehler beim Laden: ' + e.toString() };
  }
}

function createNewsDoc(titel, datum, autor, inhalt, bildBase64, bildMimeType) {
  try {
    var doc = DocumentApp.create(titel);
    var body = doc.getBody();

    body.clear();
    body.appendParagraph(titel).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(datum);
    body.appendParagraph(autor);

    if (bildBase64) {
      try {
        var decoded = Utilities.base64Decode(bildBase64);
        var blob = Utilities.newBlob(decoded, bildMimeType, 'news-bild');
        body.appendImage(blob);
      } catch (e) {
        Logger.log('Bild-Fehler: ' + e.toString());
      }
    }

    if (inhalt) {
      var absaetze = inhalt.split('\n');
      for (var i = 0; i < absaetze.length; i++) {
        body.appendParagraph(absaetze[i]);
      }
    }

    doc.saveAndClose();

    var file = DriveApp.getFileById(doc.getId());
    var folder = DriveApp.getFolderById(NEWS_FOLDER_ID);
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);

    return { ok: true, message: 'News "' + titel + '" erstellt.', docId: doc.getId() };
  } catch (e) {
    return { error: 'Fehler beim Erstellen: ' + e.toString() };
  }
}

function deleteNewsDoc(docId) {
  try {
    var file = DriveApp.getFileById(docId);
    var titel = file.getName();
    file.setTrashed(true);
    return { ok: true, message: 'News "' + titel + '" gelöscht.' };
  } catch (e) {
    return { error: 'Fehler beim Löschen: ' + e.toString() };
  }
}

function updateNewsDoc(docId, titel, datum, autor, inhalt, bildBase64, bildMimeType) {
  try {
    var doc = DocumentApp.openById(docId);
    var body = doc.getBody();

    body.clear();
    body.appendParagraph(titel).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(datum);
    body.appendParagraph(autor);

    if (bildBase64) {
      try {
        var decoded = Utilities.base64Decode(bildBase64);
        var blob = Utilities.newBlob(decoded, bildMimeType, 'news-bild');
        body.appendImage(blob);
      } catch (e) {
        Logger.log('Bild-Fehler: ' + e.toString());
      }
    }

    if (inhalt) {
      var absaetze = inhalt.split('\n');
      for (var i = 0; i < absaetze.length; i++) {
        body.appendParagraph(absaetze[i]);
      }
    }

    doc.saveAndClose();
    DriveApp.getFileById(docId).setName(titel);

    return { ok: true, message: 'News "' + titel + '" aktualisiert.' };
  } catch (e) {
    return { error: 'Fehler beim Aktualisieren: ' + e.toString() };
  }
}

// ═══════════════════════════════════════════════════
// MITGLIEDSANTRAG: Formular-Verarbeitung
// ═══════════════════════════════════════════════════

var VEREIN_EMAIL_FALLBACK = 'boulderhallezugzwang@gmail.com';

var MA_HEADERS = [
  'Nachname', 'Vorname', 'Ort', 'E-Mail', 'Geburtsdatum',
  'Mandatsreferenz', 'Status', 'Eintritt',
  'Zahlungspflichtiges Mitglied', 'Adresse', 'PLZ', 'Telefon Mobil',
  'Bemerkungen', 'IBAN', 'BIC', 'Kontoinhaber',
  'SEPA-Lastschrift erlauben', 'Mandat Unterschriftsdatum', 'Lastschriftart',
  'Chip', 'ChipNr.'
];

function maToDe(isoDate) {
  if (!isoDate) return '';
  var parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return parts[2] + '.' + parts[1] + '.' + parts[0];
}

function maTodayDe() {
  var d = new Date();
  var dd = ('0' + d.getDate()).slice(-2);
  var mm = ('0' + (d.getMonth() + 1)).slice(-2);
  return dd + '.' + mm + '.' + d.getFullYear();
}

function maGenerateMandatsreferenz(sheet) {
  var year = new Date().getFullYear();
  var prefix = 'ZZ-' + year + '-';
  var lastRow = sheet.getLastRow();
  var maxNum = 0;

  if (lastRow > 1) {
    var refs = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
    refs.forEach(function(row) {
      var ref = row[0].toString();
      if (ref.indexOf(prefix) === 0) {
        var num = parseInt(ref.replace(prefix, ''), 10);
        if (num > maxNum) maxNum = num;
      }
    });
  }

  var nextNum = ('0000' + (maxNum + 1)).slice(-4);
  return prefix + nextNum;
}

function handleMitgliedsantrag(data) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Mitglieder');

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(MA_HEADERS);
    sheet.getRange(1, 1, 1, MA_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var eintrittDe = maTodayDe();
  var geburtsDe = maToDe(data.geburtsdatum);
  var mandatsRef = maGenerateMandatsreferenz(sheet);
  var fullName = data.vorname + ' ' + data.nachname;

  sheet.appendRow([
    data.nachname, data.vorname, data.ort, data.email, geburtsDe,
    mandatsRef, data.kategorie, eintrittDe,
    '', data.strasse, data.plz, data.telefon || '',
    data.kommentar || '', data.iban, data.bic || '', data.kontoinhaber,
    'Ja', eintrittDe, 'Erst-Lastschrift', '', ''
  ]);

  if (data.familienmitglieder && data.familienmitglieder.length > 0) {
    data.familienmitglieder.forEach(function(fm) {
      sheet.appendRow([
        fm.nachname, fm.vorname, data.ort, data.email, maToDe(fm.geburtsdatum),
        '', data.kategorie, eintrittDe,
        fullName, data.strasse, data.plz, '',
        '', '', '', '',
        '', '', 'Erst-Lastschrift', '', ''
      ]);
    });
  }

  if (SEND_CONFIRMATION && data.email) {
    maSendConfirmation(data, eintrittDe, mandatsRef);
  }
  maSendNotification(data, eintrittDe, mandatsRef);

  return ContentService.createTextOutput(
    JSON.stringify({ status: 'ok' })
  ).setMimeType(ContentService.MimeType.JSON);
}

function maSendConfirmation(data, eintrittDe, mandatsRef) {
  var geburtsDe = maToDe(data.geburtsdatum);

  var familyText = '';
  if (data.familienmitglieder && data.familienmitglieder.length > 0) {
    familyText = '\n\nMitangemeldete Familienmitglieder:\n';
    data.familienmitglieder.forEach(function(fm) {
      familyText += '  - ' + fm.vorname + ' ' + fm.nachname + ' (geb. ' + maToDe(fm.geburtsdatum) + ')\n';
    });
  }

  var body = 'Hallo ' + data.vorname + ',\n\n' +
    'Vielen Dank für Deinen Antrag. Du bist jetzt Mitglied beim Boulderverein Zugzwang e.V.!\n\n' +
    'Zur Übergabe deines Zutrittschips melde dich bitte bei:\n' +
    '  Detlef Müller, Tel. +49 160 884 3412\n\n' +
    'Wir haben folgende Daten erhalten:\n\n' +
    '  Name:           ' + data.vorname + ' ' + data.nachname + '\n' +
    '  Geburtsdatum:   ' + geburtsDe + '\n' +
    '  Adresse:        ' + data.strasse + ', ' + data.plz + ' ' + data.ort + '\n' +
    '  E-Mail:         ' + data.email + '\n' +
    '  Mobilnummer:    ' + (data.telefon || '–') + '\n' +
    '  Kategorie:      ' + data.kategorie + '\n' +
    '  Eintritt:       ' + eintrittDe + '\n' +
    '  Kontoinhaber:   ' + data.kontoinhaber + '\n' +
    '  IBAN:           ' + data.iban + '\n' +
    '  Mandatsreferenz: ' + mandatsRef + '\n' +
    familyText + '\n' +
    'Bei Fragen erreichst du uns unter ' + (getConfigValue('kontakt_mitgliedsantrag_email') || VEREIN_EMAIL_FALLBACK) + '.\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'Neuhauser Straße 1\n' +
    '91275 Auerbach i.d.OPf.\n\n' +
    'https://boulderhallezugzwang.github.io/zugzwang-website';

  MailApp.sendEmail({
    to: data.email,
    subject: 'Dein Mitgliedsantrag beim Boulderverein Zugzwang e.V.',
    body: body,
    name: 'Boulderverein Zugzwang e.V.'
  });
}

function maSendNotification(data, eintrittDe, mandatsRef) {
  // Config prüfen: Benachrichtigung aktiv?
  var aktiv = getConfigValue('notify_mitgliedsantrag_aktiv');
  if (aktiv === 'nein') return;
  var notifyEmail = getConfigValue('notify_mitgliedsantrag_email') || VEREIN_EMAIL_FALLBACK;

  var geburtsDe = maToDe(data.geburtsdatum);

  var familyText = '';
  if (data.familienmitglieder && data.familienmitglieder.length > 0) {
    familyText = '\n\nFamilienmitglieder:\n';
    data.familienmitglieder.forEach(function(fm) {
      familyText += '  - ' + fm.vorname + ' ' + fm.nachname + ' (geb. ' + maToDe(fm.geburtsdatum) + ')\n';
    });
  }

  var body = 'Ein neuer Mitgliedsantrag ist eingegangen:\n\n' +
    '  Name:           ' + data.vorname + ' ' + data.nachname + '\n' +
    '  Geburtsdatum:   ' + geburtsDe + '\n' +
    '  Adresse:        ' + data.strasse + ', ' + data.plz + ' ' + data.ort + '\n' +
    '  E-Mail:         ' + data.email + '\n' +
    '  Mobilnummer:    ' + (data.telefon || '–') + '\n' +
    '  Kategorie:      ' + data.kategorie + '\n' +
    '  Eintritt:       ' + eintrittDe + '\n' +
    '  Mandatsref.:    ' + mandatsRef + '\n' +
    '  Kontoinhaber:   ' + data.kontoinhaber + '\n' +
    '  IBAN:           ' + data.iban + '\n' +
    '  BIC:            ' + (data.bic || '–') + '\n' +
    familyText + '\n' +
    '  Satzung:        ' + data.satzung + '\n' +
    '  DSGVO:          ' + data.dsgvo + '\n' +
    '  SEPA-Mandat:    ' + data.sepa_consent + '\n' +
    '  Arbeitsdienst:  ' + (data.arbeitsdienst || '–') + '\n' +
    '  Kommentar:      ' + (data.kommentar || '–') + '\n\n' +
    'Eingegangen am: ' + eintrittDe;

  MailApp.sendEmail({
    to: notifyEmail,
    subject: 'Neuer Mitgliedsantrag: ' + data.vorname + ' ' + data.nachname,
    body: body,
    name: 'Mitgliedsantrag-Formular'
  });
}

// ═══════════════════════════════════════════════════
// NEWSLETTER: Mail an Mitglieder senden
// ═══════════════════════════════════════════════════

function sendNewsletter(betreff, inhalt, htmlInhalt, mailMode, mailTo) {
  try {
    var recipients = (mailMode === 'custom') ? parseCustomEmails(mailTo) : getEmailRecipients(null);
    if (recipients.length === 0) return { error: 'Keine Empfänger gefunden' };

    // Signatur aus Config oder Fallback
    var signatur = getConfigValue('mail_signatur') || 'Sportliche Grüße,\nBoulderverein Zugzwang e.V.';

    // Plaintext-Fallback
    var plainBody = 'Hallo,\n\n' + inhalt + '\n\n' + signatur + '\nhttps://zugzwang-auerbach.de';

    // Base64-Bilder aus HTML extrahieren und als CID-Inline-Images vorbereiten
    var inlineImages = {};
    var processedHtml = htmlInhalt || '';
    var imgRegex = /<img\s+[^>]*src\s*=\s*"data:([^;]+);base64,([^"]+)"[^>]*>/g;
    var imgMatch;
    var imgIndex = 0;
    while ((imgMatch = imgRegex.exec(htmlInhalt || '')) !== null) {
      var mimeType = imgMatch[1];
      var base64Data = imgMatch[2];
      var cidKey = 'nlImg' + imgIndex;
      try {
        inlineImages[cidKey] = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, cidKey);
        processedHtml = processedHtml.replace(imgMatch[0],
          imgMatch[0].replace(/src\s*=\s*"data:[^"]+"/,  'src="cid:' + cidKey + '"'));
      } catch (e) {
        Logger.log('Inline-Bild ' + imgIndex + ' Fehler: ' + e.toString());
      }
      imgIndex++;
    }

    // Signatur als HTML
    var sigHtml = signatur.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>');

    // HTML-Version mit Logo-Layout
    var htmlBody = '<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">' +
      '<div style="background:#1a1a1a;padding:24px 20px;text-align:center;">' +
        '<img src="https://zugzwang-auerbach.de/img/logo.png" alt="Zugzwang" style="height:60px;width:auto;max-width:200px;margin-bottom:8px;">' +
        '<div style="font-size:14px;color:#d4a020;text-transform:uppercase;letter-spacing:2px;">Boulderverein Zugzwang e.V.</div>' +
      '</div>' +
      '<div style="background:#d4a020;height:3px;"></div>' +
      '<div style="padding:28px 24px;font-size:15px;color:#333;line-height:1.7;">' +
        processedHtml +
        '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e0e0e0;font-size:14px;color:#666;line-height:1.6;">' + sigHtml + '</div>' +
      '</div>' +
      '<div style="background:#1a1a1a;padding:16px 20px;text-align:center;">' +
        '<div style="font-size:12px;color:#888;">Boulderverein Zugzwang e.V. &middot; Neuhauser Stra&szlig;e 1 &middot; 91275 Auerbach i.d.OPf.</div>' +
        '<a href="https://zugzwang-auerbach.de" style="font-size:12px;color:#d4a020;text-decoration:none;">zugzwang-auerbach.de</a>' +
      '</div>' +
      '</div>';

    var opts = {
      subject: betreff,
      body: plainBody,
      name: 'Boulderverein Zugzwang e.V.'
    };
    if (processedHtml) {
      opts.htmlBody = htmlBody;
      if (Object.keys(inlineImages).length > 0) opts.inlineImages = inlineImages;
    }

    var result = sendMailChunk(opts, recipients);

    if (result.remaining.length > 0) {
      // Inline-Bilder fuer den Queue-Drain auf Drive persistieren
      var folderId = (processedHtml && Object.keys(inlineImages).length > 0)
        ? persistInlineImages(inlineImages) : '';
      enqueueMail({
        type: 'newsletter',
        subject: betreff,
        plainBody: plainBody,
        htmlBody: processedHtml ? htmlBody : '',
        inlineImagesFolderId: folderId,
        remainingEmails: result.remaining,
        failedEmails: result.failed,
        totalRecipients: recipients.length
      });
      setupMailQueueTrigger();
    } else if (result.failed.length > 0) {
      try { sendAdminQueueReport(betreff, recipients.length, result.failed); } catch (e) {}
    }

    var summary = formatChunkedSendMessage({
      sent: result.sent,
      queued: result.remaining.length,
      failed: result.failed.length
    }, recipients.length);
    return { ok: true, message: summary, sent: result.sent, queued: result.remaining.length, failed: result.failed.length, total: recipients.length };
  } catch (e) {
    return { error: 'Fehler beim Senden: ' + e.toString() };
  }
}

// ═══════════════════════════════════════════════════
// ERINNERUNGS-MAILS: Automatischer täglicher Versand
// ═══════════════════════════════════════════════════

/**
 * Trigger einrichten: Einmal manuell im Script-Editor ausführen.
 * Erstellt einen täglichen Trigger der sendEventReminders() aufruft.
 */
function setupReminderTrigger() {
  // Bestehende Trigger für diese Funktion entfernen
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendEventReminders') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // Einmal taeglich um 8:00 Berlin — zwischen processMailQueue 6:00 (drain Queue
  // damit Quota frei ist) und processMailQueue 18:00 (drain neu eingestellte Reminder).
  ScriptApp.newTrigger('sendEventReminders')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .inTimezone('Europe/Berlin')
    .create();
  Logger.log('Erinnerungs-Trigger erstellt (taeglich 8:00 Berlin).');
}

/**
 * Prüft alle Kalender-Termine auf fällige Erinnerungen und sendet E-Mails.
 * Wird automatisch durch den Trigger aufgerufen.
 */
function sendEventReminders() {
  var now = new Date();
  var maxFuture = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 Tage voraus prüfen

  var keys = Object.keys(KALENDER);
  var totalSent = 0;

  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var cal = CalendarApp.getCalendarById(KALENDER[key]);
    if (!cal) continue;

    var events = cal.getEvents(now, maxFuture);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var desc = ev.getDescription() || '';

      // Schon erinnert? → überspringen
      if (desc.indexOf('[ZZ-REMINDED]') !== -1) continue;

      // Hat Erinnerung?
      var remindHours = parseRemindTag(desc);
      if (!remindHours) continue;

      // Ist es Zeit für die Erinnerung?
      var start = ev.getStartTime();
      var remindTime = new Date(start.getTime() - remindHours * 60 * 60 * 1000);
      if (now < remindTime) continue; // Noch zu früh

      // Empfänger ermitteln
      var mailInfo = getMailRecipients(desc);
      var recipients = [];
      if (mailInfo.mode === 'all') {
        recipients = getEmailRecipients(null);
      } else if (mailInfo.mode === 'custom') {
        recipients = mailInfo.addresses;
      } else {
        // Keine Mails gesendet → auch keine Erinnerung
        continue;
      }

      if (recipients.length === 0) continue;

      // Erinnerungsmail senden
      var titel = ev.getTitle();
      var end = ev.getEndTime();
      var datumFormatiert = ('0' + start.getDate()).slice(-2) + '.' + ('0' + (start.getMonth() + 1)).slice(-2) + '.' + start.getFullYear();
      var wochentag = WOCHENTAGE_LANG[start.getDay()];
      var zeitVon = ('0' + start.getHours()).slice(-2) + ':' + ('0' + start.getMinutes()).slice(-2);
      var zeitBis = ('0' + end.getHours()).slice(-2) + ':' + ('0' + end.getMinutes()).slice(-2);
      var cleanDesc = stripTags(desc);

      var body = 'Hallo,\n\n' +
        'Erinnerung an den kommenden Termin im Boulderverein Zugzwang:\n\n' +
        titel + '\n' +
        wochentag + ', ' + datumFormatiert + '\n' +
        zeitVon + ' – ' + zeitBis + ' Uhr\n';

      if (cleanDesc) body += '\n' + cleanDesc + '\n';

      body += '\nWir freuen uns auf Dich!\n\n' +
        'Sportliche Grüße,\n' +
        'Boulderverein Zugzwang e.V.\n' +
        'https://boulderhallezugzwang.github.io/zugzwang-website';

      var subject = 'Erinnerung: ' + titel + ' – ' + datumFormatiert;
      var opts = {
        subject: subject,
        body: body,
        name: 'Boulderverein Zugzwang e.V.'
      };

      // Chunked Versand wie bei Event-Mails: was sofort geht, geht sofort.
      // Der Rest landet in der Queue und wird ueber die naechsten Tage versandt.
      var result = sendMailChunk(opts, recipients);
      if (result.remaining.length > 0) {
        enqueueMail({
          type: 'event_reminder',
          subject: subject,
          plainBody: body,
          remainingEmails: result.remaining,
          failedEmails: result.failed,
          totalRecipients: recipients.length
        });
        setupMailQueueTrigger();
      } else if (result.failed.length > 0) {
        try { sendAdminQueueReport(subject, recipients.length, result.failed); } catch (e) {}
      }

      // Als erinnert markieren (auch wenn nur ein Teil sofort raus ging — der Rest ist in der Queue)
      var newDesc = desc.replace(REMIND_TAG_RE, '') + '\n[ZZ-REMINDED]';
      ev.setDescription(newDesc);

      totalSent += result.sent;
      Logger.log('Erinnerung fuer "' + titel + '": ' + result.sent + ' sofort versandt, ' + result.remaining.length + ' in Queue, ' + result.failed.length + ' fehlgeschlagen');
    }
  }

  if (totalSent > 0) {
    Logger.log('Gesamt: ' + totalSent + ' Erinnerungs-Mail(s) gesendet.');
  }
}
