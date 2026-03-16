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
      ['kontakt_email', 'boulderhallezugzwang@gmail.com', 'Kontakt-E-Mail in Antwortmails an Ausfüller']
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
      members.push({
        nachname: nachname.toString(),
        vorname: vorname.toString(),
        telefon: (row[colIdx['Telefon Mobil']] || '').toString(),
        email: (row[colIdx['E-Mail']] || '').toString(),
        status: (row[colIdx['Status']] || '').toString(),
        ort: (row[colIdx['Ort']] || '').toString(),
        chip: (row[colIdx['Chip']] || '').toString(),
        chipnr: (row[colIdx['ChipNr.']] || '').toString(),
        eintritt: row[colIdx['Eintritt']] instanceof Date ? Utilities.formatDate(row[colIdx['Eintritt']], 'Europe/Berlin', 'dd.MM.yyyy') : (row[colIdx['Eintritt']] || '').toString()
      });
    }
  });

  return {
    members: members,
    count: members.length,
    user: { displayName: user.anzeigename, rolle: user.rolle }
  };
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
  var bis = new Date();
  bis.setMonth(bis.getMonth() + 6);

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
      var emailCount = sendCancelMail(titel, datumFormatiert, wochentag, zeitVon, zeitBis, KALENDER_NAMEN[kalender], recipients);
      msg += ' ' + emailCount + ' Absagemail(s) gesendet.';
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

    var emailCount = 0;
    var actualRecipients = [];

    if (mailMode !== 'none') {
      var datumFormatiert = ('0' + startDate.getDate()).slice(-2) + '.' + ('0' + (startDate.getMonth() + 1)).slice(-2) + '.' + startDate.getFullYear();
      var wochentag = WOCHENTAGE_LANG[startDate.getDay()];
      var icsContent = generateICS(titel, startDate, endDate, beschreibung, remindHours);
      var customRecipients = (mailMode === 'custom') ? parseCustomEmails(mailTo) : null;
      actualRecipients = customRecipients || getEmailRecipients(null);
      emailCount = sendUpdateMail(titel, datumFormatiert, wochentag, zeitVon, zeitBis, beschreibung, KALENDER_NAMEN[kalender], icsContent, customRecipients);
    }

    // Mail-Status + Erinnerung in Beschreibung aktualisieren
    var descWithTag = (beschreibung || '') + buildMailTag(mailMode, emailCount, mailMode === 'custom' ? actualRecipients : null) + buildRemindTag(remindHours);
    ev.setDescription(descWithTag);

    var msg = 'Termin aktualisiert.';
    if (emailCount > 0) msg += ' ' + emailCount + ' Änderungsmail(s) gesendet.';
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

  var emailCount = 0;
  var actualRecipients = [];

  if (mailMode !== 'none') {
    var icsContent = generateICS(titel, startDate, endDate, beschreibung, remindHours);
    var wochentag = WOCHENTAGE_LANG[startDate.getDay()];
    var datumFormatiert = ('0' + startDate.getDate()).slice(-2) + '.' +
      ('0' + (startDate.getMonth() + 1)).slice(-2) + '.' + startDate.getFullYear();

    var customRecipients = (mailMode === 'custom') ? parseCustomEmails(mailTo) : null;
    actualRecipients = customRecipients || getEmailRecipients(null);
    emailCount = sendEventMail(titel, datumFormatiert, wochentag, zeitVon, zeitBis,
      beschreibung, KALENDER_NAMEN[kalenderKey], icsContent, customRecipients);
  }

  // Mail-Status + Erinnerung in Beschreibung speichern
  var descWithTag = (beschreibung || '') + buildMailTag(mailMode, emailCount, mailMode === 'custom' ? actualRecipients : null) + buildRemindTag(remindHours);

  var eventOptions = { description: descWithTag };
  cal.createEvent(titel, startDate, endDate, eventOptions);

  var msg = 'Termin "' + titel + '" erstellt.';
  if (emailCount > 0) msg += ' ' + emailCount + ' E-Mail(s) gesendet.';
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

function sendEventMail(titel, datum, wochentag, zeitVon, zeitBis, beschreibung, kalenderName, icsContent, customRecipients) {
  var recipients = getEmailRecipients(customRecipients);
  if (recipients.length === 0) return 0;

  var icsBlob = Utilities.newBlob(icsContent, 'text/calendar', 'termin.ics');

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

  var count = 0;
  for (var i = 0; i < recipients.length; i++) {
    try {
      MailApp.sendEmail({
        to: recipients[i],
        subject: kalenderName + ': ' + titel + ' – ' + datum,
        body: body,
        name: 'Boulderverein Zugzwang e.V.',
        attachments: [icsBlob]
      });
      count++;
    } catch (e) {
      Logger.log('Mail-Fehler an ' + recipients[i] + ': ' + e.toString());
    }
  }
  return count;
}

// ── Mail-Versand: Absage ──

function sendCancelMail(titel, datum, wochentag, zeitVon, zeitBis, kalenderName, customRecipients) {
  var recipients = getEmailRecipients(customRecipients);
  if (recipients.length === 0) return 0;

  var body = 'Hallo,\n\n' +
    'folgender Termin im Boulderverein Zugzwang wurde leider abgesagt:\n\n' +
    titel + '\n' +
    wochentag + ', ' + datum + '\n' +
    zeitVon + ' – ' + zeitBis + ' Uhr\n\n' +
    'Bitte entferne den Termin aus Deinem Kalender.\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'https://boulderhallezugzwang.github.io/zugzwang-website';

  var count = 0;
  for (var i = 0; i < recipients.length; i++) {
    try {
      MailApp.sendEmail({
        to: recipients[i],
        subject: 'ABGESAGT: ' + titel + ' – ' + datum,
        body: body,
        name: 'Boulderverein Zugzwang e.V.'
      });
      count++;
    } catch (e) {
      Logger.log('Mail-Fehler an ' + recipients[i] + ': ' + e.toString());
    }
  }
  return count;
}

// ── Mail-Versand: Änderung ──

function sendUpdateMail(titel, datum, wochentag, zeitVon, zeitBis, beschreibung, kalenderName, icsContent, customRecipients) {
  var recipients = getEmailRecipients(customRecipients);
  if (recipients.length === 0) return 0;

  var icsBlob = Utilities.newBlob(icsContent, 'text/calendar', 'termin.ics');

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

  var count = 0;
  for (var i = 0; i < recipients.length; i++) {
    try {
      MailApp.sendEmail({
        to: recipients[i],
        subject: 'GEÄNDERT: ' + titel + ' – ' + datum,
        body: body,
        name: 'Boulderverein Zugzwang e.V.',
        attachments: [icsBlob]
      });
      count++;
    } catch (e) {
      Logger.log('Mail-Fehler an ' + recipients[i] + ': ' + e.toString());
    }
  }
  return count;
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
    'Bei Fragen erreichst du uns unter ' + (getConfigValue('kontakt_email') || VEREIN_EMAIL_FALLBACK) + '.\n\n' +
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

    // Plaintext-Fallback
    var plainBody = 'Hallo,\n\n' + inhalt + '\n\n' +
      'Sportliche Grüße,\n' +
      'Boulderverein Zugzwang e.V.\n' +
      'https://boulderhallezugzwang.github.io/zugzwang-website';

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

    // HTML-Version
    var htmlBody = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#333;max-width:600px;">' +
      processedHtml +
      '<p style="margin-top:24px;">Sportliche Gr&uuml;&szlig;e,<br>' +
      '<strong>Boulderverein Zugzwang e.V.</strong><br>' +
      '<a href="https://boulderhallezugzwang.github.io/zugzwang-website" style="color:#d4a020;">boulderhallezugzwang.github.io</a></p>' +
      '</div>';

    var count = 0;
    for (var i = 0; i < recipients.length; i++) {
      try {
        var mailOptions = {
          to: recipients[i],
          subject: betreff,
          body: plainBody,
          name: 'Boulderverein Zugzwang e.V.'
        };
        if (processedHtml) {
          mailOptions.htmlBody = htmlBody;
          if (Object.keys(inlineImages).length > 0) {
            mailOptions.inlineImages = inlineImages;
          }
        }
        MailApp.sendEmail(mailOptions);
        count++;
      } catch (e) {
        Logger.log('Newsletter-Fehler an ' + recipients[i] + ': ' + e.toString());
      }
    }

    return { ok: true, message: count + ' E-Mail(s) gesendet.' };
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
  // Neuen täglichen Trigger erstellen (läuft jeden Tag um 8:00 Uhr)
  ScriptApp.newTrigger('sendEventReminders')
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('Erinnerungs-Trigger erstellt (stündlich).');
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

      var count = 0;
      for (var r = 0; r < recipients.length; r++) {
        try {
          MailApp.sendEmail({
            to: recipients[r],
            subject: 'Erinnerung: ' + titel + ' – ' + datumFormatiert,
            body: body,
            name: 'Boulderverein Zugzwang e.V.'
          });
          count++;
        } catch (e) {
          Logger.log('Erinnerungs-Mail-Fehler an ' + recipients[r] + ': ' + e.toString());
        }
      }

      // Als erinnert markieren
      var newDesc = desc.replace(REMIND_TAG_RE, '') + '\n[ZZ-REMINDED]';
      ev.setDescription(newDesc);

      totalSent += count;
      Logger.log('Erinnerung gesendet für "' + titel + '": ' + count + ' Mail(s)');
    }
  }

  if (totalSent > 0) {
    Logger.log('Gesamt: ' + totalSent + ' Erinnerungs-Mail(s) gesendet.');
  }
}
