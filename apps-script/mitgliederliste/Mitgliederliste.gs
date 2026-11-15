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

// ── POST-Endpunkt ──

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = (body.action || '').toString();

    // Kein action-Feld → Mitgliedsantrag-Formular
    if (!action) {
      return handleMitgliedsantrag(body);
    }

    // Oeffentlich (ohne Anmeldung): Zu-/Absage zu einem Termin
    if (action === 'rsvpInfo') return jsonResponse(rsvpInfo(body.t));
    if (action === 'rsvp') return jsonResponse(rsvpAntwort(body.t, body.antwort, body.vorher));

    // Oeffentlich (ohne Anmeldung): Helferdienste ansehen, eintragen, austragen
    if (action === 'helferListe') return jsonResponse(helferListeOeffentlich());
    if (action === 'helferEintragen') return jsonResponse(helferEintragen(body));
    if (action === 'dienstInfo') return jsonResponse(helferDienstInfo(body.c));
    if (action === 'dienstAustragen') return jsonResponse(helferDienstAustragen(body.c));

    // iPad in der Halle: Dienste von heute ansehen und mit Unterschrift abhaken
    if (action === 'quittListe') return jsonResponse(quittListe());
    if (action === 'quittieren') return jsonResponse(quittieren(body.id, body.unterschrift));
    if (action === 'quittSpontan') return jsonResponse(quittSpontan(body));

    // Oeffentlich: aktuelle Ersatzbeitraege (fuer Mitgliedsantrag und Vereinsseite)
    if (action === 'ersatzInfo' || action === 'beitragsInfo') return jsonResponse(beitragsInfo());

    // Intern: einzelnen Helfer streichen
    if (action === 'helferStreichen') {
      var hsUser = authenticateUser(body.username, body.password);
      if (!hsUser) return jsonResponse({ error: 'Nicht authentifiziert' });
      return jsonResponse(helferStreichen((body.dienstId || '').toString()));
    }

    // Intern (nur Admin): Übersicht "wer hat noch keinen Dienst", Befreiung, Ersatzbeitrag
    if (action === 'dienstUebersicht' || action === 'dienstBefreien' || action === 'dienstQuittAdmin') {
      var ebUser = authenticateUser(body.username, body.password);
      if (!ebUser) return jsonResponse({ error: 'Nicht authentifiziert' });
      if (ebUser.rolle !== 'admin') return jsonResponse({ error: 'Keine Berechtigung' });
      if (action === 'dienstUebersicht') {
        try { ersatzSchreibeFamilien(); } catch (eFam) { console.error('Familien-Spalte: ' + eFam); }
        return jsonResponse(ersatzUebersicht(body.jahr, true));
      }
      if (action === 'dienstQuittAdmin') return jsonResponse(quittAdmin((body.dienstId || '').toString(), body.geleistet === true));
      return jsonResponse(ersatzSetze(body.row, (body.key || '').toString(), (body.feld || '').toString(), body.wert));
    }

    if (action === 'login') {
      if (authIsLocked(body.username)) return jsonResponse({ error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' });
      var user = authenticateUser(body.username, body.password, true);
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
      if (newPassword.length < 8) return jsonResponse({ error: 'Passwort muss mindestens 8 Zeichen lang sein' });
      if (newPassword.length > 200) return jsonResponse({ error: 'Passwort ist zu lang' });
      if (newPassword === oldPassword) return jsonResponse({ error: 'Bitte ein neues Passwort wählen' });
      var user = authenticateUser(username, oldPassword, true);
      if (!user) return jsonResponse({ error: 'Authentifizierung fehlgeschlagen' });
      var sheet = getBenutzerSheet();
      sheet.getRange(user.row, 4).setValue(pwMake(newPassword));  // nur der Hash wird gespeichert
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
        var rsvpOpts = rsvpParseOpts(body);
        if (rsvpOpts.error) return jsonResponse({ error: rsvpOpts.error });
        var helferOpts = helferParseOpts(body, kalender);
        if (helferOpts.error) return jsonResponse({ error: helferOpts.error });
        var result = createCalEvent(kalender, titel, datum, zeitVon, zeitBis, beschreibung, mailMode, mailTo, remindHours, rsvpOpts, helferOpts);
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
        var rsvpOpts = rsvpParseOpts(body);
        if (rsvpOpts.error) return jsonResponse({ error: rsvpOpts.error });
        var helferOpts = helferParseOpts(body, kalender);
        if (helferOpts.error) return jsonResponse({ error: helferOpts.error });
        return jsonResponse(updateCalEvent(kalender, eventId, titel, datum, zeitVon, zeitBis, beschreibung, mailMode, mailTo, remindHours, rsvpOpts, helferOpts));
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

    // Chip-Daten aktualisieren (nur Admin). Per POST, damit Benutzername und
    // Passwort nicht mehr in der URL (Verlauf, Protokolle) landen.
    if (action === 'updateChip') {
      var user = authenticateUser(body.username, body.password);
      if (!user) return jsonResponse({ error: 'Nicht authentifiziert' });
      if (user.rolle !== 'admin') return jsonResponse({ error: 'Keine Berechtigung' });
      return jsonResponse(updateChipInSheet({
        nachname: (body.nachname || '').toString(),
        vorname: (body.vorname || '').toString(),
        chip: sheetSafe((body.chip || '').toString()),
        chipnr: sheetSafe((body.chipnr || '').toString())
      }));
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
  var rsvpMap = rsvpLoadMap();
  var helferMap = helferLadeMapIntern();
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
        erinnerung: parseRemindTag(ev.getDescription() || ''),
        rsvp: rsvpMap[ev.getId()] || null,
        helfer: helferMap[ev.getId()] || null
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
    try { rsvpRemove(eventId); } catch (eRsvp) { console.error('Rueckmeldung entfernen fehlgeschlagen: ' + eRsvp); }
    var helferAbgesagt = 0;
    try { helferAbgesagt = helferRemove(eventId, true); } catch (eHelfer) { console.error('Helferdienst entfernen fehlgeschlagen: ' + eHelfer); }

    var msg = 'Termin "' + titel + '" gelöscht.';
    if (helferAbgesagt > 0) msg += ' ' + helferAbgesagt + ' eingetragene Helfer wurden benachrichtigt.';

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

function updateCalEvent(kalender, eventId, titel, datumISO, zeitVon, zeitBis, beschreibung, mailMode, mailTo, remindHours, rsvpOpts, helferOpts) {
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

    // Rueckmeldung: einschalten/aktualisieren oder ausschalten
    var rsvpToken = '';
    if (rsvpOpts && rsvpOpts.aktiv) {
      rsvpToken = rsvpUpsert(eventId, kalender, titel, startDate, rsvpOpts.email);
    } else {
      rsvpRemove(eventId);
    }

    // Helferdienst: einschalten/aktualisieren oder ausschalten
    var helferAktiv = !!(helferOpts && helferOpts.aktiv);
    if (helferAktiv) {
      helferUpsert(eventId, titel, startDate, endDate, beschreibung, helferOpts.plaetze, remindHours);
    } else {
      helferRemove(eventId, true);
    }

    var mailResult = { sent: 0, queued: 0, failed: 0, total: 0 };
    var actualRecipients = [];

    if (mailMode !== 'none') {
      var datumFormatiert = ('0' + startDate.getDate()).slice(-2) + '.' + ('0' + (startDate.getMonth() + 1)).slice(-2) + '.' + startDate.getFullYear();
      var wochentag = WOCHENTAGE_LANG[startDate.getDay()];
      var icsContent = generateICS(titel, startDate, endDate, beschreibung, remindHours);
      var customRecipients = (mailMode === 'custom') ? parseCustomEmails(mailTo) : null;
      actualRecipients = customRecipients || getEmailRecipients(null);
      mailResult = sendUpdateMail(titel, datumFormatiert, wochentag, zeitVon, zeitBis, beschreibung, KALENDER_NAMEN[kalender], icsContent, customRecipients, rsvpToken, helferAktiv ? helferOpts.plaetze : 0);
    }

    // Mail-Status + Erinnerung in Beschreibung aktualisieren (Total-Empfaengerzahl, nicht "sent")
    var descWithTag = (beschreibung || '') + buildMailTag(mailMode, mailResult.total, mailMode === 'custom' ? actualRecipients : null) + buildRemindTag(remindHours);
    ev.setDescription(descWithTag);

    var msg = 'Termin aktualisiert.';
    if (mailResult.total > 0) msg += ' ' + formatChunkedSendMessage(mailResult, mailResult.total);
    if (remindHours && remindHours !== '0') msg += ' Erinnerung ' + remindHours + 'h vorher aktiv.';
    if (rsvpToken) msg += ' Rückmeldung aktiv' + (mailMode === 'none' ? ' (ohne Mail kennt aber niemand den Link).' : '.');
    if (helferAktiv) msg += ' Helferdienst mit ' + helferOpts.plaetze + ' Plätzen.';

    return { ok: true, message: msg };
  } catch (e) {
    return { error: 'Fehler beim Ändern: ' + e.toString() };
  }
}

function createCalEvent(kalenderKey, titel, datumISO, zeitVon, zeitBis, beschreibung, mailMode, mailTo, remindHours, rsvpOpts, helferOpts) {
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

  // Der Link in der Mail braucht nur das Token; die Termin-ID gibt es erst
  // nach dem Anlegen im Kalender.
  var rsvpAktiv = !!(rsvpOpts && rsvpOpts.aktiv);
  var rsvpToken = rsvpAktiv ? rsvpNewToken() : '';
  var helferAktiv = !!(helferOpts && helferOpts.aktiv);

  if (mailMode !== 'none') {
    var icsContent = generateICS(titel, startDate, endDate, beschreibung, remindHours);
    var wochentag = WOCHENTAGE_LANG[startDate.getDay()];
    var datumFormatiert = ('0' + startDate.getDate()).slice(-2) + '.' +
      ('0' + (startDate.getMonth() + 1)).slice(-2) + '.' + startDate.getFullYear();

    var customRecipients = (mailMode === 'custom') ? parseCustomEmails(mailTo) : null;
    actualRecipients = customRecipients || getEmailRecipients(null);
    mailResult = sendEventMail(titel, datumFormatiert, wochentag, zeitVon, zeitBis,
      beschreibung, KALENDER_NAMEN[kalenderKey], icsContent, customRecipients, rsvpToken, helferAktiv ? helferOpts.plaetze : 0);
  }

  // Mail-Status + Erinnerung in Beschreibung speichern (Total-Empfaengerzahl, nicht "sent")
  var descWithTag = (beschreibung || '') + buildMailTag(mailMode, mailResult.total, mailMode === 'custom' ? actualRecipients : null) + buildRemindTag(remindHours);

  var eventOptions = { description: descWithTag };
  var neuerTermin = cal.createEvent(titel, startDate, endDate, eventOptions);
  if (rsvpAktiv) rsvpInsert(rsvpToken, neuerTermin.getId(), kalenderKey, titel, startDate, rsvpOpts.email);
  if (helferAktiv) helferUpsert(neuerTermin.getId(), titel, startDate, endDate, beschreibung, helferOpts.plaetze, remindHours);

  var msg = 'Termin "' + titel + '" erstellt.';
  if (mailResult.total > 0) msg += ' ' + formatChunkedSendMessage(mailResult, mailResult.total);
  if (remindHours && remindHours !== '0') msg += ' Erinnerung ' + remindHours + 'h vorher aktiv.';
  if (rsvpAktiv) msg += ' Rückmeldung aktiv' + (mailMode === 'none' ? ' (ohne Mail kennt aber niemand den Link).' : '.');
  if (helferAktiv) msg += ' Helferdienst mit ' + helferOpts.plaetze + ' Plätzen – Eintragung auf der Vereinsseite.';

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

// ── Externer Maildienst (Brevo) fuer Rundmails ──
//
// Das Gmail-Konto darf per Apps Script nur ~100 Empfaenger/Tag anschreiben.
// Rundmails (Termine, Erinnerungen, Newsletter, Warteschlange) gehen deshalb
// ueber die Brevo-API, sobald in den Skripteigenschaften
// (Editor → Projekteinstellungen → Skripteigenschaften) gesetzt ist:
//   BREVO_API_KEY      API-Schluessel (NIE ins Repo schreiben)
//   MAIL_FROM_EMAIL    bei Brevo bestaetigte Absenderadresse der eigenen Domain
//   MAIL_REPLY_TO      optional, Antwortadresse (Standard: Vereins-Gmail)
//   BREVO_DAILY_LIMIT  optional, Standard 300 (kostenlose Stufe)
// Fehlt der Schluessel, laeuft alles wie bisher ueber Gmail. Ist das Brevo-
// Tageslimit erreicht, geht der Rest noch am selben Tag ueber Gmail, was dann
// noch uebrig bleibt in die Warteschlange.
// Einzelmails (Antrag, Hallendienst, Kuendigung ...) bleiben bei Gmail.

var BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
var BREVO_DEFAULT_LIMIT = 300;
var BREVO_BILDER_ORDNER = 'Zugzwang_Newsletter_Bilder';

function brevoConfig() {
  var props = PropertiesService.getScriptProperties();
  var key = (props.getProperty('BREVO_API_KEY') || '').trim();
  var from = (props.getProperty('MAIL_FROM_EMAIL') || '').trim();
  if (!key || !maIsEmail(from)) return null;
  var limit = parseInt(props.getProperty('BREVO_DAILY_LIMIT') || '', 10);
  return {
    key: key,
    from: from,
    replyTo: (props.getProperty('MAIL_REPLY_TO') || '').trim() || VEREIN_EMAIL_FALLBACK,
    limit: (limit > 0) ? limit : BREVO_DEFAULT_LIMIT
  };
}

// Brevo zaehlt pro UTC-Tag; wir fuehren den Zaehler selbst mit.
function brevoCountKey() {
  return 'brevo_count_' + Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
}

function brevoRemaining(cfg) {
  var used = parseInt(PropertiesService.getScriptProperties().getProperty(brevoCountKey()) || '0', 10) || 0;
  return Math.max(0, cfg.limit - used);
}

function brevoAddCount(n) {
  if (n <= 0) return;
  var props = PropertiesService.getScriptProperties();
  var key = brevoCountKey();
  props.setProperty(key, String((parseInt(props.getProperty(key) || '0', 10) || 0) + n));
}

// Wie viele Rundmail-Empfaenger gehen jetzt noch raus (Brevo + Gmail)?
function mailCapacityNow() {
  var cfg = brevoConfig();
  var gmail = Math.max(0, MailApp.getRemainingDailyQuota() - MAIL_QUOTA_BUFFER);
  return (cfg ? brevoRemaining(cfg) : 0) + gmail;
}

function mailEscHtml(t) {
  return String(t === null || t === undefined ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Reiner Text → schlichtes HTML (Brevo verlangt immer eine HTML-Fassung)
function mailTextToHtml(text) {
  var html = mailEscHtml(text)
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1">$1</a>')
    .replace(/\r?\n/g, '<br>\n');
  return '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;">' + html + '</div>';
}

// Brevo kann keine eingebetteten (cid:) Bilder. Newsletter-Bilder werden
// deshalb dauerhaft in einem per Link lesbaren Drive-Ordner abgelegt und im
// HTML verlinkt. Der Dateiname ist der Hash des Inhalts → kein Doppel-Upload.
function brevoHostInlineImages(html, inlineImages) {
  var keys = Object.keys(inlineImages || {});
  if (keys.length === 0) return html;
  var it = DriveApp.getFoldersByName(BREVO_BILDER_ORDNER);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(BREVO_BILDER_ORDNER);
  for (var i = 0; i < keys.length; i++) {
    var blob = inlineImages[keys[i]];
    var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, blob.getBytes())
      .map(function(b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
    var vorhanden = folder.getFilesByName(hash);
    var file = vorhanden.hasNext() ? vorhanden.next() : folder.createFile(blob.copyBlob().setName(hash));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    html = html.split('cid:' + keys[i]).join('https://lh3.googleusercontent.com/d/' + file.getId());
  }
  return html;
}

// Versand ueber Brevo. Rueckgabe wie sendMailChunk, zusaetzlich
//   fallback: true  → Schluessel/Konto abgelehnt, bitte Gmail nehmen
function sendMailChunkBrevo(cfg, opts, recipients) {
  var out = { sent: 0, remaining: [], failed: [], fallback: false };
  var maxNow = Math.min(recipients.length, brevoRemaining(cfg));
  if (maxNow <= 0) { out.remaining = recipients.slice(); return out; }

  var html;
  try {
    html = opts.htmlBody ? brevoHostInlineImages(opts.htmlBody, opts.inlineImages) : mailTextToHtml(opts.body || '');
  } catch (eImg) {
    console.error('[Brevo] Bilder konnten nicht abgelegt werden: ' + eImg);
    out.remaining = recipients.slice(); out.fallback = true;
    return out;
  }

  var base = {
    sender: { name: opts.name || 'Boulderverein Zugzwang e.V.', email: cfg.from },
    replyTo: { email: cfg.replyTo },
    subject: opts.subject,
    htmlContent: html,
    textContent: opts.body || ''
  };
  if (opts.attachments && opts.attachments.length) {
    base.attachment = opts.attachments.map(function(blob) {
      return { name: blob.getName() || 'anhang.ics', content: Utilities.base64Encode(blob.getBytes()) };
    });
  }

  var i = 0;
  for (; i < maxNow; i++) {
    var payload = {};
    for (var k in base) payload[k] = base[k];
    payload.to = [{ email: recipients[i] }];
    var code = 0, text = '';
    try {
      var resp = UrlFetchApp.fetch(BREVO_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'api-key': cfg.key, 'accept': 'application/json' },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      code = resp.getResponseCode();
      text = resp.getContentText() || '';
    } catch (eNet) {
      console.error('[Brevo] Netzwerkfehler: ' + eNet);
      break;                                   // Rest spaeter erneut versuchen
    }

    if (code === 201 || code === 202) { out.sent++; continue; }

    var errCode = '';
    try { errCode = (JSON.parse(text).code || '').toString(); } catch (eJson) {}
    console.error('[Brevo] HTTP ' + code + ' ' + errCode + ' an ' + recipients[i] + ': ' + text.slice(0, 200));

    if (code === 401 || code === 403 || errCode === 'unauthorized' || errCode === 'permission_denied') {
      out.fallback = true;                     // Schluessel/Absender nicht (mehr) gueltig
      break;
    }
    if (code === 402 || code === 429 || /credits/i.test(errCode)) {
      // Tageslimit bei Brevo erreicht: eigenen Zaehler hochsetzen, Rest wandert weiter
      PropertiesService.getScriptProperties().setProperty(brevoCountKey(), String(cfg.limit));
      break;
    }
    if (code >= 500) break;                    // Stoerung bei Brevo → spaeter erneut
    if (code === 400 && (errCode === 'invalid_parameter' || errCode === 'missing_parameter')) {
      out.failed.push(recipients[i]);          // diese eine Adresse wird nicht angenommen
      continue;
    }
    // Alles andere liegt nicht am Empfaenger (Kontingent, Konto, unbekannter
    // Fehler): niemanden als fehlgeschlagen abschreiben, Rest ueber Gmail.
    out.fallback = true;
    break;
  }

  brevoAddCount(out.sent);
  out.remaining = recipients.slice(i);
  Logger.log('  [Brevo] sent=' + out.sent + ', failed=' + out.failed.length + ', remaining=' + out.remaining.length + ', fallback=' + out.fallback);
  return out;
}

// Sendet so viele Mails wie heute noch moeglich sind: zuerst ueber Brevo
// (falls eingerichtet), den Rest ueber Gmail.
// Gibt zurueck: { sent, remaining: [], failed: [] }
function sendMailChunk(opts, recipients) {
  var cfg = brevoConfig();
  if (!cfg) return sendMailChunkGmail(opts, recipients);

  var b = sendMailChunkBrevo(cfg, opts, recipients);
  if (b.remaining.length === 0) return { sent: b.sent, remaining: [], failed: b.failed };

  var g = sendMailChunkGmail(opts, b.remaining);
  return { sent: b.sent + g.sent, remaining: g.remaining, failed: b.failed.concat(g.failed) };
}

// Einmal im Skript-Editor ausfuehren, um die Einrichtung zu pruefen:
// schickt EINE Testmail ueber Brevo an die Admin-Adresse und protokolliert das Ergebnis.
function testMailProvider() {
  var cfg = brevoConfig();
  if (!cfg) { Logger.log('Brevo ist nicht eingerichtet: BREVO_API_KEY und MAIL_FROM_EMAIL in den Skripteigenschaften setzen.'); return; }
  var an = getAdminMailAddress();
  var r = sendMailChunkBrevo(cfg, {
    subject: 'Testmail über Brevo – Boulderverein Zugzwang',
    body: 'Diese Testmail wurde über den externen Maildienst verschickt.\n\nAbsender: ' + cfg.from + '\nAntwort an: ' + cfg.replyTo + '\nhttps://zugzwang-auerbach.de',
    name: 'Boulderverein Zugzwang e.V.'
  }, [an]);
  Logger.log('Testmail an ' + an + ': ' + JSON.stringify({ sent: r.sent, failed: r.failed.length, fallback: r.fallback }) +
    ' | heute über Brevo noch möglich: ' + brevoRemaining(cfg));
}

// Versand ueber das Gmail-Konto (MailApp), begrenzt durch dessen Tageskontingent.
function sendMailChunkGmail(opts, recipients) {
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
    var quotaNow = mailCapacityNow();
    Logger.log('  Kapazitaet vor Versand (Brevo + Gmail): ' + quotaNow);
    if (quotaNow <= 0) {
      Logger.log('  -> break (Kontingent erschoepft)');
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

function sendEventMail(titel, datum, wochentag, zeitVon, zeitBis, beschreibung, kalenderName, icsContent, customRecipients, rsvpToken, helferPlaetze) {
  var recipients = getEmailRecipients(customRecipients);
  if (recipients.length === 0) return { sent: 0, queued: 0, failed: 0, total: 0 };

  var body = 'Hallo,\n\n' +
    'es gibt einen neuen Termin im Boulderverein Zugzwang:\n\n' +
    titel + '\n' +
    wochentag + ', ' + datum + '\n' +
    zeitVon + ' – ' + zeitBis + ' Uhr\n';
  if (beschreibung) body += '\n' + beschreibung + '\n';
  body += rsvpMailBlock(rsvpToken);
  body += helferMailBlock(helferPlaetze);
  body += '\nIm Anhang findest Du eine Kalenderdatei (.ics) zum Importieren in Deinen Kalender.\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'https://zugzwang-auerbach.de';

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

function sendUpdateMail(titel, datum, wochentag, zeitVon, zeitBis, beschreibung, kalenderName, icsContent, customRecipients, rsvpToken, helferPlaetze) {
  var recipients = getEmailRecipients(customRecipients);
  if (recipients.length === 0) return { sent: 0, queued: 0, failed: 0, total: 0 };

  var body = 'Hallo,\n\n' +
    'ein Termin im Boulderverein Zugzwang wurde geändert:\n\n' +
    titel + '\n' +
    wochentag + ', ' + datum + '\n' +
    zeitVon + ' – ' + zeitBis + ' Uhr\n';
  if (beschreibung) body += '\n' + beschreibung + '\n';
  body += rsvpMailBlock(rsvpToken);
  body += helferMailBlock(helferPlaetze);
  body += '\nIm Anhang findest Du die aktualisierte Kalenderdatei (.ics).\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'https://zugzwang-auerbach.de';

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

// Liefert die Datei nur, wenn sie ein Google Doc direkt im News-Ordner ist.
// Ohne diese Pruefung konnte jeder eingeloggte Benutzer ueber die News-
// Aktionen JEDE Drive-Datei des Vereinskontos loeschen oder leeren
// (z.B. die Mitgliederliste).
function getNewsFile(docId) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(docId || '')) throw new Error('Ungültige Doc-ID');
  var file = DriveApp.getFileById(docId);
  if (file.getMimeType() !== MimeType.GOOGLE_DOCS) throw new Error('Keine News-Datei');
  var parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === NEWS_FOLDER_ID) return file;
  }
  throw new Error('Datei liegt nicht im News-Ordner');
}

function deleteNewsDoc(docId) {
  try {
    var file = getNewsFile(docId);
    var titel = file.getName();
    file.setTrashed(true);
    return { ok: true, message: 'News "' + titel + '" gelöscht.' };
  } catch (e) {
    return { error: 'Fehler beim Löschen: ' + e.toString() };
  }
}

function updateNewsDoc(docId, titel, datum, autor, inhalt, bildBase64, bildMimeType) {
  try {
    var newsFile = getNewsFile(docId);
    var doc = DocumentApp.openById(docId);
    var body = doc.getBody();

    // Vorhandenes Bild merken: body.clear() entfernt es, und der Client
    // schickt beim Bearbeiten nur dann ein Bild mit, wenn ein neues gewaehlt wurde.
    var altesBild = null;
    if (!bildBase64) {
      var bilder = body.getImages();
      if (bilder.length > 0) altesBild = bilder[0].getBlob();
    }

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
    } else if (altesBild) {
      try { body.appendImage(altesBild); } catch (e2) { Logger.log('Bild-Fehler (altes Bild): ' + e2.toString()); }
    }

    if (inhalt) {
      var absaetze = inhalt.split('\n');
      for (var i = 0; i < absaetze.length; i++) {
        body.appendParagraph(absaetze[i]);
      }
    }

    doc.saveAndClose();
    newsFile.setName(titel);

    return { ok: true, message: 'News "' + titel + '" aktualisiert.' };
  } catch (e) {
    return { error: 'Fehler beim Aktualisieren: ' + e.toString() };
  }
}

// ═══════════════════════════════════════════════════
// MITGLIEDSANTRAG: Formular-Verarbeitung
// ═══════════════════════════════════════════════════

var VEREIN_EMAIL_FALLBACK = 'boulderhallezugzwang@gmail.com';

// Bestaetigungsmail an den Antragsteller senden? (Die Konstante fehlte
// frueher: der ReferenceError hat BEIDE Mails verhindert.)
var SEND_CONFIRMATION = true;

// Text aus oeffentlichen Formularen sicher in eine Zelle schreiben:
// Sheets wertet per setValue/appendRow geschriebene Texte wie eine
// Benutzereingabe aus – ein fuehrendes = + - @ wuerde zur Formel.
// Ein vorangestelltes Hochkomma erzwingt Text (wird nicht angezeigt).
function sheetSafe(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return v;
  var s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 2000);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function maIsEmail(s) {
  return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test((s || '').toString());
}

// Pflichtfelder pruefen; gibt Fehlermeldung oder '' zurueck.
function maValidate(data) {
  if (!data || typeof data !== 'object') return 'Ungültige Anfrage';
  var pflicht = ['nachname', 'vorname', 'strasse', 'plz', 'ort', 'email', 'geburtsdatum', 'kategorie', 'iban', 'kontoinhaber'];
  for (var i = 0; i < pflicht.length; i++) {
    var val = data[pflicht[i]];
    if (typeof val !== 'string' || !val.trim()) return 'Pflichtfeld fehlt: ' + pflicht[i];
    if (val.length > 200) return 'Eingabe zu lang: ' + pflicht[i];
  }
  if (!maIsEmail(data.email)) return 'Ungültige E-Mail-Adresse';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.geburtsdatum)) return 'Ungültiges Geburtsdatum';
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(data.iban.replace(/\s+/g, '').toUpperCase())) return 'Ungültige IBAN';
  if (data.helferdienst !== undefined && data.helferdienst !== 'dienst' && data.helferdienst !== 'ersatz') return 'Ungültige Auswahl beim Helferdienst';
  var fam = data.familienmitglieder;
  if (fam !== undefined && fam !== null) {
    if (!Array.isArray(fam) || fam.length > 10) return 'Ungültige Familienmitglieder';
    for (var j = 0; j < fam.length; j++) {
      var fm = fam[j] || {};
      if (typeof fm.vorname !== 'string' || !fm.vorname.trim() ||
          typeof fm.nachname !== 'string' || !fm.nachname.trim() ||
          fm.vorname.length > 200 || fm.nachname.length > 200 ||
          !/^\d{4}-\d{2}-\d{2}$/.test((fm.geburtsdatum || '').toString())) {
        return 'Ungültige Angaben bei Familienmitglied ' + (j + 1);
      }
    }
  }
  return '';
}

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
  var fehler = maValidate(data);
  if (fehler) return jsonResponse({ status: 'error', message: fehler });

  var S = sheetSafe;
  var eintrittDe = maTodayDe();
  var geburtsDe = maToDe(data.geburtsdatum);
  var fullName = data.vorname + ' ' + data.nachname;
  var mandatsRef;

  // Sperre: Mandatsreferenz ermitteln + Zeilen anhaengen muss atomar sein,
  // sonst bekommen zwei gleichzeitige Antraege dieselbe Referenz.
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Mitglieder');

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(MA_HEADERS);
      sheet.getRange(1, 1, 1, MA_HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    mandatsRef = maGenerateMandatsreferenz(sheet);

    sheet.appendRow([
      S(data.nachname), S(data.vorname), S(data.ort), S(data.email), geburtsDe,
      mandatsRef, S(data.kategorie), eintrittDe,
      '', S(data.strasse), S(data.plz), S(data.telefon || ''),
      S(data.kommentar || ''), S(data.iban), S(data.bic || ''), S(data.kontoinhaber),
      'Ja', eintrittDe, 'Erst-Lastschrift', '', ''
    ]);
    // Wahl "Ersatzbeitrag statt Helferdienst" beim Hauptmitglied vermerken (gilt dauerhaft)
    if (data.helferdienst === 'ersatz') {
      sheet.getRange(sheet.getLastRow(), ersatzSpalte(sheet, ERSATZ_SPALTE_GEWAEHLT) + 1).setValue('Ja');
    }

    if (data.familienmitglieder && data.familienmitglieder.length > 0) {
      data.familienmitglieder.forEach(function(fm) {
        sheet.appendRow([
          S(fm.nachname), S(fm.vorname), S(data.ort), S(data.email), maToDe(fm.geburtsdatum),
          '', S(data.kategorie), eintrittDe,
          mandatsRef, S(data.strasse), S(data.plz), '',  // Verweis aufs Hauptmitglied (eindeutig)
          '', '', '', '',
          '', '', 'Erst-Lastschrift', '', ''
        ]);
      });
    }
    try { ersatzSchreibeFamilien(); } catch (eFam) { console.error('Familien-Spalte: ' + eFam); }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  // Der Antrag ist ab hier gespeichert. Ein Mail-Fehler (Kontingent leer,
  // Adresse unzustellbar) darf daraus keinen Fehler machen – sonst schickt
  // der Antragsteller erneut ab und es entstehen doppelte Zeilen. Beide
  // Mails unabhaengig voneinander versuchen.
  var mailBestaetigung = false;
  if (SEND_CONFIRMATION && data.email) {
    try {
      maSendConfirmation(data, eintrittDe, mandatsRef);
      mailBestaetigung = true;
    } catch (err) {
      console.error('Mitgliedsantrag ' + mandatsRef + ': Bestaetigungsmail fehlgeschlagen: ' + err);
    }
  }
  try {
    maSendNotification(data, eintrittDe, mandatsRef, mailBestaetigung);
  } catch (err2) {
    console.error('Mitgliedsantrag ' + mandatsRef + ': Benachrichtigung fehlgeschlagen: ' + err2);
  }

  return jsonResponse({ status: 'ok', mailBestaetigung: mailBestaetigung });
}

function maHelferdienstText(data) {
  // Vor dem Startjahr dazusagen, ab wann die Regelung gilt
  var ab = new Date().getFullYear() < ersatzStartJahr() ? ' (gilt ab ' + ersatzStartJahr() + ')' : '';
  if (data.helferdienst === 'ersatz') return 'Ersatzbeitrag statt Helferdienst' + ab;
  if (data.helferdienst === 'dienst') return 'mindestens ein Helfer- oder Hallendienst pro Jahr' + ab;
  return data.arbeitsdienst || '–';
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
    '  Helferdienst:   ' + maHelferdienstText(data) + '\n' +
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

function maSendNotification(data, eintrittDe, mandatsRef, mailBestaetigung) {
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
    '  Helferdienst:   ' + maHelferdienstText(data) + '\n' +
    '  Kommentar:      ' + (data.kommentar || '–') + '\n\n' +
    'Eingegangen am: ' + eintrittDe +
    (mailBestaetigung === false
      ? '\n\nACHTUNG: Die Bestätigungsmail an den Antragsteller konnte NICHT gesendet werden. Bitte persönlich melden.'
      : '');

  MailApp.sendEmail({
    to: notifyEmail,
    subject: 'Neuer Mitgliedsantrag: ' + data.vorname + ' ' + data.nachname,
    body: body,
    name: 'Mitgliedsantrag-Formular'
  });
}

// ═══════════════════════════════════════════════════
// RÜCKMELDUNG (Zu-/Absage) ZU TERMINEN
// ═══════════════════════════════════════════════════
//
// Beim Termin laesst sich eine Rueckmeldung einschalten. Die Termin-Mail
// enthaelt dann einen Link auf rueckmeldung.html (dort Zusage / Absage). Gezaehlt
// wird bewusst OHNE Namen: nur wie viele Zu- und Absagen es gibt.
// Die Links fuehren auf eine Bestaetigungsseite und zaehlen erst nach einem
// Klick dort – Mailprogramme rufen Links oft vorab automatisch auf.
//
// Tab "Rückmeldungen", eine Zeile je Termin:
//   A Token | B Termin-ID | C Kalender | D Titel | E Start | F Melde-E-Mail
//   G Zusagen | H Absagen | I Gemeldet Zusagen | J Gemeldet Absagen | K Erstellt
// "Gemeldet" = Stand der letzten Zusammenfassungs-Mail an die Melde-Adresse.

var RSVP_SHEET = 'Rückmeldungen';
var RSVP_HEADERS = ['Token', 'Termin-ID', 'Kalender', 'Titel', 'Start', 'Melde-E-Mail',
  'Zusagen', 'Absagen', 'Gemeldet Zusagen', 'Gemeldet Absagen', 'Erstellt'];
var RSVP_SITE = 'https://zugzwang-auerbach.de';
var RSVP_MAX_PER_HOUR = 400;   // Antworten je Termin und Stunde (Schutz vor Dauerklicken)

function rsvpSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(RSVP_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(RSVP_SHEET);
    sheet.getRange(1, 1, 1, RSVP_HEADERS.length).setValues([RSVP_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rsvpRows(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, RSVP_HEADERS.length).getValues();
}

function rsvpNum(v) {
  var n = parseInt(v, 10);
  return (n > 0) ? n : 0;
}

function rsvpNewToken() {
  // beginnt mit einem Buchstaben, damit Sheets das Token nie als Zahl deutet
  return 'a' + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 39);
}

function rsvpValidToken(t) {
  return typeof t === 'string' && /^[0-9a-f]{40}$/.test(t);
}

// Parameter aus der Anfrage des Intern-Bereichs
function rsvpParseOpts(body) {
  var aktiv = body.rsvpAktiv === true || body.rsvpAktiv === 'true';
  if (!aktiv) return { aktiv: false, email: '' };
  var email = (body.rsvpEmail || '').toString().trim();
  if (!maIsEmail(email) || email.length > 120) return { error: 'Bitte eine gültige E-Mail-Adresse für die Rückmeldungen angeben' };
  return { aktiv: true, email: email };
}

function rsvpInsert(token, eventId, kalender, titel, startDate, email) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    rsvpSheet().appendRow([token, eventId, kalender, sheetSafe(titel), startDate, sheetSafe(email), 0, 0, 0, 0, new Date()]);
  } finally {
    lock.releaseLock();
  }
}

// Vorhandene Zeile aktualisieren (Zaehler bleiben) oder neu anlegen. Gibt das Token zurueck.
function rsvpUpsert(eventId, kalender, titel, startDate, email) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = rsvpSheet();
    var rows = rsvpRows(sheet);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][1] === eventId) {
        sheet.getRange(i + 2, 3, 1, 4).setValues([[kalender, sheetSafe(titel), startDate, sheetSafe(email)]]);
        return rows[i][0].toString();
      }
    }
    var token = rsvpNewToken();
    sheet.appendRow([token, eventId, kalender, sheetSafe(titel), startDate, sheetSafe(email), 0, 0, 0, 0, new Date()]);
    return token;
  } finally {
    lock.releaseLock();
  }
}

function rsvpRemove(eventId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(RSVP_SHEET);
  if (!sheet) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rows = rsvpRows(sheet);
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i][1] === eventId) sheet.deleteRow(i + 2);
    }
  } finally {
    lock.releaseLock();
  }
}

// Termin-ID → { aktiv, email, ja, nein } (mitToken: zusaetzlich token)
function rsvpLoadMap(mitToken) {
  var map = {};
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RSVP_SHEET);
  if (!sheet) return map;
  var rows = rsvpRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    var e = { aktiv: true, email: rows[i][5].toString(), ja: rsvpNum(rows[i][6]), nein: rsvpNum(rows[i][7]) };
    if (mitToken) e.token = rows[i][0].toString();
    map[rows[i][1]] = e;
  }
  return map;
}

// Textblock fuer Termin-, Aenderungs- und Erinnerungsmail
function rsvpMailBlock(token) {
  if (!token) return '';
  // Bewusst EIN Link ohne Antwort in der Adresse: der Maildienst zaehlt Klicks
  // je Empfaenger mit. Die Zu- oder Absage wird erst auf der Seite gewaehlt,
  // so erfaehrt niemand, wer wie geantwortet hat.
  return '\nKommst Du? Bitte gib uns kurz Bescheid – Zusage oder Absage mit einem Klick:\n' +
    '  ' + RSVP_SITE + '/rueckmeldung.html?t=' + token + '\n';
}

function rsvpFind(sheet, token) {
  var rows = rsvpRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === token) return { row: i + 2, v: rows[i] };
  }
  return null;
}

function rsvpStart(v) {
  var d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Oeffentlich: Angaben zum Termin fuer die Bestaetigungsseite (keine Zaehler, keine E-Mail)
function rsvpInfo(token) {
  if (!rsvpValidToken(token)) return { error: 'Dieser Link ist ungültig.' };
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RSVP_SHEET);
  var hit = sheet ? rsvpFind(sheet, token) : null;
  if (!hit) return { error: 'Zu diesem Termin ist keine Rückmeldung (mehr) möglich.' };
  var start = rsvpStart(hit.v[4]);
  if (!start) return { error: 'Zu diesem Termin ist keine Rückmeldung (mehr) möglich.' };
  return {
    ok: true,
    titel: hit.v[3].toString(),
    wochentag: WOCHENTAGE_LANG[start.getDay()],
    datum: ('0' + start.getDate()).slice(-2) + '.' + ('0' + (start.getMonth() + 1)).slice(-2) + '.' + start.getFullYear(),
    zeit: ('0' + start.getHours()).slice(-2) + ':' + ('0' + start.getMinutes()).slice(-2),
    vorbei: start.getTime() <= Date.now()
  };
}

// Oeffentlich: Zu-/Absage zaehlen. "vorher" = fruehere Antwort aus demselben
// Browser (dort gemerkt), damit jemand seine Antwort aendern kann, ohne
// doppelt gezaehlt zu werden.
function rsvpAntwort(token, antwort, vorher) {
  if (!rsvpValidToken(token)) return { error: 'Dieser Link ist ungültig.' };
  if (antwort !== 'ja' && antwort !== 'nein') return { error: 'Ungültige Antwort.' };
  if (vorher !== 'ja' && vorher !== 'nein') vorher = '';
  if (vorher === antwort) return { ok: true, antwort: antwort };

  var cache = CacheService.getScriptCache();
  var rateKey = 'rsvp_' + token;
  var n = parseInt(cache.get(rateKey) || '0', 10);
  if (n >= RSVP_MAX_PER_HOUR) return { error: 'Im Moment gehen zu viele Rückmeldungen ein. Bitte später noch einmal versuchen.' };
  cache.put(rateKey, String(n + 1), 3600);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RSVP_SHEET);
    var hit = sheet ? rsvpFind(sheet, token) : null;
    if (!hit) return { error: 'Zu diesem Termin ist keine Rückmeldung (mehr) möglich.' };
    var start = rsvpStart(hit.v[4]);
    if (!start || start.getTime() <= Date.now()) return { error: 'Der Termin hat bereits begonnen – eine Rückmeldung ist nicht mehr möglich.' };

    var ja = rsvpNum(hit.v[6]);
    var nein = rsvpNum(hit.v[7]);
    if (vorher === 'ja') ja = Math.max(0, ja - 1);
    if (vorher === 'nein') nein = Math.max(0, nein - 1);
    if (antwort === 'ja') ja++; else nein++;
    sheet.getRange(hit.row, 7, 1, 2).setValues([[ja, nein]]);
    SpreadsheetApp.flush();
    return { ok: true, antwort: antwort };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Einmal taeglich: je Termin EINE Mail an die Melde-Adresse, aber nur wenn
 * seit der letzten Meldung Zu-/Absagen dazugekommen sind und der Termin noch
 * nicht begonnen hat. Wird von sendEventReminders() mit aufgerufen; der
 * Datums-Merker verhindert Mehrfachversand, falls der Trigger oefter laeuft.
 */
function sendRsvpSummaries() {
  var props = PropertiesService.getScriptProperties();
  var heute = Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd');
  if (props.getProperty('rsvp_summary_tag') === heute) return;

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RSVP_SHEET);
  if (!sheet) { props.setProperty('rsvp_summary_tag', heute); return; }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rows = rsvpRows(sheet);
    var now = Date.now();
    var alt = now - 60 * 24 * 60 * 60 * 1000;   // Zeilen 60 Tage nach dem Termin aufraeumen

    for (var i = rows.length - 1; i >= 0; i--) {
      var v = rows[i];
      var start = rsvpStart(v[4]);
      if (!start) continue;
      if (start.getTime() < alt) { sheet.deleteRow(i + 2); continue; }
      if (start.getTime() <= now) continue;                 // Termin war schon → keine Mail mehr

      var ja = rsvpNum(v[6]), nein = rsvpNum(v[7]);
      var gJa = rsvpNum(v[8]), gNein = rsvpNum(v[9]);
      if (ja === gJa && nein === gNein) continue;           // nichts Neues → keine Mail

      var email = v[5].toString().trim();
      if (!maIsEmail(email)) continue;
      if (MailApp.getRemainingDailyQuota() < 1) break;      // morgen erneut versuchen

      var diff = function(neu, alt2) { var d = neu - alt2; return (d > 0 ? '+' : '') + d; };
      var datum = ('0' + start.getDate()).slice(-2) + '.' + ('0' + (start.getMonth() + 1)).slice(-2) + '.' + start.getFullYear();
      var zeit = ('0' + start.getHours()).slice(-2) + ':' + ('0' + start.getMinutes()).slice(-2);
      MailApp.sendEmail({
        to: email,
        subject: 'Rückmeldungen: ' + v[3] + ' – ' + datum + ' (' + ja + ' Zusagen, ' + nein + ' Absagen)',
        body: 'Rückmeldungen zum Termin\n\n' +
          '  ' + v[3] + '\n' +
          '  ' + WOCHENTAGE_LANG[start.getDay()] + ', ' + datum + ', ' + zeit + ' Uhr\n\n' +
          'Aktueller Stand:\n' +
          '  Zusagen: ' + ja + '\n' +
          '  Absagen: ' + nein + '\n\n' +
          'Seit der letzten Meldung:\n' +
          '  Zusagen: ' + diff(ja, gJa) + '\n' +
          '  Absagen: ' + diff(nein, gNein) + '\n\n' +
          'Diese Mail kommt höchstens einmal täglich und nur, wenn sich etwas geändert hat.\n' +
          'Den aktuellen Stand siehst Du jederzeit im internen Bereich unter „Termine“.',
        name: 'Boulderverein Zugzwang e.V.'
      });
      sheet.getRange(i + 2, 9, 1, 2).setValues([[ja, nein]]);
    }
    SpreadsheetApp.flush();
    props.setProperty('rsvp_summary_tag', heute);
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════
// HELFERDIENSTE
// ═══════════════════════════════════════════════════
//
// Ein Helferdienst ist ein Termin im Kalender "Arbeitsdienste" mit einer
// festen Zahl Helferplaetze. Mitglieder tragen sich auf der Vereinsseite ein;
// oeffentlich sichtbar ist nur "3 von 5 belegt", nie ein Name.
//
// Tab "Helferdienste", eine Zeile je Dienst:
//   A ID | B Termin-ID | C Titel | D Start | E Ende | F Beschreibung
//   G Plätze | H Erinnerung (h) | I Erinnert | J Erstellt
// Wer sich eingetragen hat, steht im Tab "Dienste" (Art "helferdienst",
// Dienst = ID von hier). Status dort:
//   eingetragen – belegt einen Platz
//   warteliste  – Dienst war voll; rueckt nach, sobald ein Platz frei wird
//   ohne_platz  – hat die Jahresgrenze schon erreicht: darf kommen, belegt
//                 aber keinen Platz

var HELFER_TAB = 'Helferdienste';
var HELFER_HEADERS = ['ID', 'Termin-ID', 'Titel', 'Start', 'Ende', 'Beschreibung',
  'Plätze', 'Erinnerung (h)', 'Erinnert', 'Erstellt'];
var HELFER_SEITE = DIENST_SITE + '/verein.html#helferdienste';

function helferSheet(nichtAnlegen) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(HELFER_TAB);
  if (!sheet && !nichtAnlegen) {
    sheet = ss.insertSheet(HELFER_TAB);
    sheet.getRange(1, 1, 1, HELFER_HEADERS.length).setValues([HELFER_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function helferRows(sheet) {
  if (!sheet) return [];
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HELFER_HEADERS.length).getValues();
}

function helferGueltigeId(id) {
  return typeof id === 'string' && /^h[0-9a-f]{39}$/.test(id);
}

// Datumswerte aus der Tabelle erkennen (instanceof ist ueber Kontexte hinweg unzuverlaessig)
function helferIstDatum(v) {
  return !!v && typeof v.getTime === 'function' && !isNaN(v.getTime());
}

function helferZeit(d) {
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}

// Parameter aus dem internen Bereich
function helferParseOpts(body, kalender) {
  var aktiv = body.helferAktiv === true || body.helferAktiv === 'true';
  if (!aktiv) return { aktiv: false, plaetze: 0 };
  if (kalender !== 'arbeitsdienst') return { error: 'Helferdienste gehören in den Kalender „Arbeitsdienste“' };
  var n = parseInt(body.helferPlaetze, 10);
  if (!(n >= 1 && n <= 200)) return { error: 'Bitte die Anzahl der Helfer angeben (1 bis 200)' };
  return { aktiv: true, plaetze: n };
}

// Textblock fuer Termin- und Aenderungsmail
function helferMailBlock(plaetze) {
  if (!plaetze) return '';
  return '\nWir suchen ' + plaetze + ' Helferinnen und Helfer. Hier kannst Du Dich eintragen:\n' +
    '  ' + HELFER_SEITE + '\n';
}

// Zaehlt die Eintraege eines Helferdienstes (drows = dienstRows)
function helferStand(drows, helferId) {
  var st = { belegt: 0, warteliste: 0, ohnePlatz: 0, liste: [] };
  for (var i = 0; i < drows.length; i++) {
    var r = drows[i];
    if (r[1] !== 'helferdienst' || r[2] !== helferId) continue;
    if (r[8] === 'eingetragen') st.belegt++;
    else if (r[8] === 'warteliste') st.warteliste++;
    else if (r[8] === 'ohne_platz') st.ohnePlatz++;
    else continue;
    st.liste.push({ dienstId: r[0], name: r[6] + ' ' + r[5], email: String(r[7]), status: r[8], row: i + 2, seit: r[9] });
  }
  return st;
}

// Anlegen oder aktualisieren; werden es mehr Plaetze, rueckt die Warteliste nach.
function helferUpsert(eventId, titel, start, end, beschreibung, plaetze, remindHours) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = helferSheet();
    var rows = helferRows(sheet);
    var rh = parseInt(remindHours, 10) || 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][1] !== eventId) continue;
      // Neuer Zeitpunkt → Erinnerung darf erneut gehen
      var verschoben = !helferIstDatum(rows[i][3]) || rows[i][3].getTime() !== start.getTime();
      sheet.getRange(i + 2, 3, 1, 7).setValues([[sheetSafe(titel), start, end, sheetSafe(beschreibung || ''), plaetze, rh,
        verschoben ? '' : rows[i][8]]]);
      helferDatumNachziehen(rows[i][0], start);
      helferNachruecken(rows[i][0]);
      return rows[i][0];
    }
    var id = 'h' + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 39);
    sheet.appendRow([id, eventId, sheetSafe(titel), start, end, sheetSafe(beschreibung || ''), plaetze, rh, '', new Date()]);
    return id;
  } finally {
    lock.releaseLock();
  }
}

// Wird der Dienst verschoben, muss das Datum im Protokoll mit (Jahreszaehlung!).
function helferDatumNachziehen(helferId, start) {
  var dsheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DIENSTE_TAB);
  if (!dsheet) return;
  var drows = dienstRows(dsheet);
  var tag = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (var i = 0; i < drows.length; i++) {
    if (drows[i][1] === 'helferdienst' && drows[i][2] === helferId) dsheet.getRange(i + 2, 4).setValue(tag);
  }
}

// Dienst entfernen (Termin geloescht oder Helferdienst ausgeschaltet):
// Eintraege streichen, Eingetragene benachrichtigen. Gibt deren Anzahl zurueck.
function helferRemove(eventId, benachrichtigen) {
  var sheet = helferSheet(true);
  if (!sheet) return 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rows = helferRows(sheet);
    var n = 0;
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i][1] !== eventId) continue;
      var dsheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DIENSTE_TAB);
      var liste = dsheet ? helferStand(dienstRows(dsheet), rows[i][0]).liste : [];
      dienstMarkiereDienst('helferdienst', rows[i][0], 'gestrichen');
      if (benachrichtigen) {
        var start = rows[i][3];
        for (var j = 0; j < liste.length; j++) {
          helferMail(liste[j].email, 'Helferdienst entfällt: ' + rows[i][2],
            'Hallo ' + liste[j].name.split(' ')[0] + ',\n\n' +
            'der Helferdienst „' + rows[i][2] + '“ am ' + dienstDatumDE(start) + ' findet nicht statt bzw. wurde geändert. ' +
            'Deine Eintragung ist damit hinfällig und zählt nicht.\n\nDanke für Deine Bereitschaft!');
        }
      }
      n += liste.length;
      sheet.deleteRow(i + 2);
    }
    return n;
  } finally {
    lock.releaseLock();
  }
}

function helferMail(to, subject, body) {
  if (!maIsEmail(to)) return;
  try {
    var signatur = getConfigValue('mail_signatur') || 'Sportliche Grüße,\nBoulderverein Zugzwang e.V.';
    MailApp.sendEmail({ to: to, subject: subject, body: body + '\n\n' + signatur + '\n' + DIENST_SITE, name: 'Boulderverein Zugzwang e.V.' });
  } catch (e) {
    console.error('Helferdienst-Mail an ' + to + ' fehlgeschlagen: ' + e);
  }
}

function helferBeschreibe(v) {
  var start = v[3];
  return '  ' + v[2] + '\n  ' + WOCHENTAGE_LANG[start.getDay()] + ', ' + dienstDatumDE(start) + ', ' +
    helferZeit(start) + ' – ' + helferZeit(v[4]) + ' Uhr\n';
}

function helferAustragenText(dienstId) {
  return 'Wichtig: Bitte hake Deinen Dienst am Tag selbst am iPad in der Halle ab („Dienst quittieren“) – nur abgehakte Dienste zählen.\n\n' +
    'Falls Du doch nicht kannst: Bis ' + dienstAustragenTage() + ' Tage vorher kannst Du Dich hier selbst wieder austragen:\n' +
    '  ' + DIENST_SITE + '/dienst.html?k=e&c=' + dienstId + '\n';
}

// Oeffentlich: kommende Helferdienste mit Belegung – ohne Namen
function helferListeOeffentlich() {
  var rows = helferRows(helferSheet(true));
  var dsheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DIENSTE_TAB);
  var drows = dsheet ? dienstRows(dsheet) : [];
  var jetzt = Date.now();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var start = rows[i][3], end = rows[i][4];
    if (!helferIstDatum(start) || start.getTime() <= jetzt) continue;
    var st = helferStand(drows, rows[i][0]);
    var plaetze = parseInt(rows[i][6], 10) || 0;
    out.push({
      id: rows[i][0],
      titel: String(rows[i][2]),
      beschreibung: String(rows[i][5] || ''),
      datum: dienstDatumDE(start),
      wochentag: WOCHENTAGE_LANG[start.getDay()],
      zeit: helferZeit(start) + ' – ' + helferZeit(end),
      plaetze: plaetze,
      belegt: Math.min(st.belegt, plaetze),
      voll: st.belegt >= plaetze,
      start: start.getTime()
    });
  }
  out.sort(function(a, b) { return a.start - b.start; });
  return { ok: true, dienste: out };
}

// Intern: Termin-ID → Belegung samt Namensliste
function helferLadeMapIntern() {
  var map = {};
  var rows = helferRows(helferSheet(true));
  if (rows.length === 0) return map;
  var dsheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DIENSTE_TAB);
  var drows = dsheet ? dienstRows(dsheet) : [];
  for (var i = 0; i < rows.length; i++) {
    var st = helferStand(drows, rows[i][0]);
    map[rows[i][1]] = {
      aktiv: true,
      plaetze: parseInt(rows[i][6], 10) || 0,
      belegt: st.belegt, warteliste: st.warteliste, ohnePlatz: st.ohnePlatz,
      liste: st.liste.map(function(e) { return { dienstId: e.dienstId, name: e.name, email: e.email, status: e.status }; })
    };
  }
  return map;
}

function helferValidate(data) {
  if (!data || typeof data !== 'object') return 'Ungültige Anfrage.';
  var namePattern = /^[^<>"=;{}\[\]\\\/\u0000-\u001F]{1,60}$/;
  if (typeof data.vorname !== 'string' || !namePattern.test(data.vorname.trim())) return 'Bitte einen gültigen Vornamen angeben.';
  if (typeof data.nachname !== 'string' || !namePattern.test(data.nachname.trim())) return 'Bitte einen gültigen Nachnamen angeben.';
  if (typeof data.email !== 'string' || data.email.length > 120 || !maIsEmail(data.email.trim())) return 'Bitte eine gültige E-Mail-Adresse angeben.';
  if (data.mobilnr !== undefined && data.mobilnr !== null && data.mobilnr !== '' &&
      !/^[0-9 +().\/\-]{4,30}$/.test(String(data.mobilnr).trim())) return 'Bitte eine gültige Mobilnummer angeben.';
  if (data.geburtsdatum !== undefined && data.geburtsdatum !== null && data.geburtsdatum !== '' &&
      !/^\d{4}-\d{2}-\d{2}$/.test(String(data.geburtsdatum))) return 'Ungültiges Geburtsdatum.';
  if (!helferGueltigeId(data.id)) return 'Ungültiger Dienst.';
  return '';
}

// Oeffentlich: Mitglied traegt sich fuer einen Helferdienst ein
function helferEintragen(data) {
  var fehler = helferValidate(data);
  if (fehler) return { status: 'error', message: fehler };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var antwort, mailText, mailBetreff, mitglied, zeile;
  try {
    var rows = helferRows(helferSheet(true));
    zeile = null;
    for (var i = 0; i < rows.length; i++) { if (rows[i][0] === data.id) { zeile = rows[i]; break; } }
    if (!zeile || !helferIstDatum(zeile[3])) return { status: 'error', message: 'Diesen Helferdienst gibt es nicht (mehr).' };
    if (zeile[3].getTime() <= Date.now()) return { status: 'error', message: 'Dieser Helferdienst hat bereits begonnen.' };

    var fund = dienstFindeMitglied(data.vorname, data.nachname, data.email, data.geburtsdatum, data.mobilnr);
    if (fund.status === 'geburtsdatum') {
      return { status: 'geburtsdatum',
        message: 'Wir konnten dich mit diesen Angaben nicht eindeutig zuordnen. Bitte gib zusätzlich dein Geburtsdatum an.' };
    }
    if (fund.status !== 'ok') return { status: 'unbekannt', message: dienstKontaktHinweis() };
    mitglied = fund.mitglied;

    var dsheet = dienstSheet();
    var drows = dienstRows(dsheet);
    for (var k = 0; k < drows.length; k++) {
      if (drows[k][1] === 'helferdienst' && drows[k][2] === data.id && drows[k][4] === mitglied.key &&
          (drows[k][8] === 'eingetragen' || drows[k][8] === 'warteliste' || drows[k][8] === 'ohne_platz')) {
        return { status: 'schon', message: 'Du bist für diesen Dienst bereits eingetragen. Den Link zum Austragen findest du in deiner Bestätigungsmail.' };
      }
    }

    var plaetze = parseInt(zeile[6], 10) || 0;
    var st = helferStand(drows, data.id);
    var bisher = dienstAnzahl(drows, mitglied.key, zeile[3].getFullYear());
    var status;
    if (dienstLimitErreicht(bisher)) status = 'ohne_platz';
    else if (st.belegt < plaetze) status = 'eingetragen';
    else status = 'warteliste';

    var tag = new Date(zeile[3].getFullYear(), zeile[3].getMonth(), zeile[3].getDate());
    var dienstId = dienstEintragen(dsheet, 'helferdienst', data.id, tag,
      { key: mitglied.key, nachname: mitglied.nachname, vorname: mitglied.vorname, email: data.email.trim() }, status);
    SpreadsheetApp.flush();
    try { dienstSyncMitgliederliste(); } catch (eSync) { console.error('Dienst-Zaehler nicht aktualisiert: ' + eSync); }

    var kopf = 'Hallo ' + mitglied.vorname + ',\n\n';
    if (status === 'eingetragen') {
      antwort = { status: 'ok', message: 'Du bist eingetragen – danke! Die Bestätigung kommt per E-Mail.' };
      mailBetreff = 'Helferdienst bestätigt – ' + zeile[2];
      mailText = kopf + 'danke, dass Du mithilfst! Du bist für folgenden Helferdienst eingetragen:\n\n' +
        helferBeschreibe(zeile) + '\n' + helferAustragenText(dienstId);
    } else if (status === 'warteliste') {
      antwort = { status: 'warteliste', message: 'Alle Plätze sind schon belegt – du stehst auf der Warteliste. Wird ein Platz frei, bekommst du sofort eine E-Mail.' };
      mailBetreff = 'Warteliste Helferdienst – ' + zeile[2];
      mailText = kopf + 'für diesen Helferdienst sind im Moment alle Plätze belegt. Du stehst auf der Warteliste:\n\n' +
        helferBeschreibe(zeile) + '\nSobald ein Platz frei wird, bekommst Du eine E-Mail. Solange zählt der Dienst noch nicht für Dich.\n\n' +
        helferAustragenText(dienstId);
    } else {
      antwort = { status: 'ohne_platz', message: 'Wow – du hast dich dieses Jahr schon ' + bisher + '-mal für einen Dienst gemeldet. Danke, dass du so fleißig mithilfst! ' +
        'Du darfst sehr gerne kommen. Damit auch andere ihren Dienst leisten können, belegst du diesmal aber keinen der Helferplätze.' };
      mailBetreff = 'Helferdienst – schön, dass Du dabei bist: ' + zeile[2];
      mailText = kopf + 'Du hast Dich dieses Jahr schon ' + bisher + '-mal für einen Dienst gemeldet – vielen Dank für Deinen Einsatz!\n\n' +
        'Du bist beim folgenden Helferdienst herzlich willkommen:\n\n' + helferBeschreibe(zeile) +
        '\nDamit auch andere Mitglieder ihren Dienst leisten können, belegst Du diesmal keinen der Helferplätze.\n\n' +
        helferAustragenText(dienstId);
    }
  } finally {
    lock.releaseLock();
  }
  helferMail(data.email.trim(), mailBetreff, mailText);
  return antwort;
}

// Freie Plaetze mit den Aeltesten der Warteliste fuellen (jeweils mit Mail).
// Der Aufrufer haelt die Sperre.
function helferNachruecken(helferId) {
  var hsheet = helferSheet(true);
  var zeile = null, hrows = helferRows(hsheet);
  for (var i = 0; i < hrows.length; i++) { if (hrows[i][0] === helferId) { zeile = hrows[i]; break; } }
  if (!zeile) return 0;
  var dsheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DIENSTE_TAB);
  if (!dsheet) return 0;
  var plaetze = parseInt(zeile[6], 10) || 0;
  var st = helferStand(dienstRows(dsheet), helferId);
  var warte = st.liste.filter(function(e) { return e.status === 'warteliste'; })
    .sort(function(a, b) { return new Date(a.seit).getTime() - new Date(b.seit).getTime(); });
  var n = 0;
  while (st.belegt + n < plaetze && n < warte.length) {
    var w = warte[n];
    dienstSetStatus(dsheet, w.row, 'eingetragen');
    helferMail(w.email, 'Platz frei: Du bist beim Helferdienst dabei – ' + zeile[2],
      'Hallo ' + w.name.split(' ')[0] + ',\n\n' +
      'beim folgenden Helferdienst ist ein Platz frei geworden – Du bist von der Warteliste nachgerückt und jetzt fest eingetragen:\n\n' +
      helferBeschreibe(zeile) + '\n' + helferAustragenText(w.dienstId));
    n++;
  }
  if (n > 0) {
    SpreadsheetApp.flush();
    try { dienstSyncMitgliederliste(); } catch (e) { console.error('Dienst-Zaehler nicht aktualisiert: ' + e); }
  }
  return n;
}

function helferDienstTreffer(id) {
  if (!dienstGueltigeId(id)) return null;
  var dsheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DIENSTE_TAB);
  if (!dsheet) return null;
  var hit = dienstFinde(dsheet, id);
  if (!hit || hit.v[1] !== 'helferdienst') return null;
  hit.sheet = dsheet;
  var hrows = helferRows(helferSheet(true));
  for (var i = 0; i < hrows.length; i++) { if (hrows[i][0] === hit.v[2]) { hit.dienst = hrows[i]; break; } }
  return hit;
}

// Oeffentlich: Angaben fuer die Austragen-Seite
function helferDienstInfo(id) {
  var hit = helferDienstTreffer(id);
  if (!hit) return { error: 'Dieser Link ist ungültig.' };
  var info = dienstInfoBasis(hit);
  info.titel = hit.dienst ? String(hit.dienst[2]) : 'Helferdienst';
  if (hit.dienst && helferIstDatum(hit.dienst[3])) {
    info.wochentag = WOCHENTAGE_LANG[hit.dienst[3].getDay()];
    info.zeit = helferZeit(hit.dienst[3]) + ' – ' + helferZeit(hit.dienst[4]) + ' Uhr';
  }
  return info;
}

// Oeffentlich: austragen; ein frei gewordener Platz geht an die Warteliste
function helferDienstAustragen(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var hit = helferDienstTreffer(id);
    if (!hit) return { error: 'Dieser Link ist ungültig.' };
    if (hit.v[8] === 'ausgetragen') return { ok: true, schonAusgetragen: true };
    var info = dienstInfoBasis(hit);
    if (!info.austragenMoeglich) {
      var tel = (getConfigValue('dienste_kontakt_telefon') || '').toString().trim();
      return { error: info.zuSpaet
        ? 'Austragen ist nur bis ' + info.fristTage + ' Tage vor dem Dienst möglich. ' +
          (tel ? 'Bitte melde dich direkt unter ' + tel + '.' : 'Bitte melde dich direkt beim Vorstand.')
        : 'Dieser Eintrag ist nicht mehr aktiv.' };
    }
    var hattePlatz = hit.v[8] === 'eingetragen';
    dienstSetStatus(hit.sheet, hit.row, 'ausgetragen');
    SpreadsheetApp.flush();
    if (hattePlatz) helferNachruecken(hit.v[2]);
    try { dienstSyncMitgliederliste(); } catch (e) { console.error('Dienst-Zaehler nicht aktualisiert: ' + e); }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// Intern: einen Helfer streichen (z.B. nicht erschienen) – zaehlt dann nicht
function helferStreichen(dienstId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var hit = helferDienstTreffer(dienstId);
    if (!hit) return { error: 'Eintrag nicht gefunden' };
    if (hit.v[8] !== 'eingetragen' && hit.v[8] !== 'warteliste' && hit.v[8] !== 'ohne_platz') return { error: 'Eintrag ist nicht mehr aktiv' };
    var hattePlatz = hit.v[8] === 'eingetragen';
    dienstSetStatus(hit.sheet, hit.row, 'gestrichen');
    SpreadsheetApp.flush();
    // Nachruecken nur, solange der Dienst noch bevorsteht
    var nach = 0;
    if (hattePlatz && hit.dienst && helferIstDatum(hit.dienst[3]) && hit.dienst[3].getTime() > Date.now()) nach = helferNachruecken(hit.v[2]);
    try { dienstSyncMitgliederliste(); } catch (e) { console.error('Dienst-Zaehler nicht aktualisiert: ' + e); }
    return { ok: true, message: hit.v[6] + ' ' + hit.v[5] + ' gestrichen.' + (nach ? ' ' + nach + ' von der Warteliste nachgerückt.' : '') };
  } finally {
    lock.releaseLock();
  }
}

// Taeglich: Eingetragene vor ihrem Dienst erinnern (Vorlauf wie beim Termin
// eingestellt, mindestens 24 Stunden).
function helferErinnerungen() {
  var sheet = helferSheet(true);
  var rows = helferRows(sheet);
  if (rows.length === 0) return;
  var dsheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DIENSTE_TAB);
  var drows = dsheet ? dienstRows(dsheet) : [];
  var jetzt = Date.now();
  for (var i = rows.length - 1; i >= 0; i--) {
    var start = rows[i][3];
    if (!helferIstDatum(start)) continue;
    if (start.getTime() < jetzt - 60 * 86400000) { sheet.deleteRow(i + 2); continue; }   // alte Dienste aufraeumen
    if (start.getTime() <= jetzt || rows[i][8]) continue;
    var vorlauf = Math.max(parseInt(rows[i][7], 10) || 0, 24);
    if (jetzt < start.getTime() - vorlauf * 3600000) continue;
    var liste = helferStand(drows, rows[i][0]).liste.filter(function(e) { return e.status !== 'warteliste'; });
    for (var j = 0; j < liste.length; j++) {
      helferMail(liste[j].email, 'Erinnerung Helferdienst – ' + rows[i][2],
        'Hallo ' + liste[j].name.split(' ')[0] + ',\n\nkurze Erinnerung an Deinen Helferdienst:\n\n' + helferBeschreibe(rows[i]) +
        (rows[i][5] ? '\n' + rows[i][5] + '\n' : '') + '\nDanke, dass Du dabei bist!');
    }
    sheet.getRange(i + 2, 9).setValue(new Date());
  }
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
  // Tageszusammenfassung der Rueckmeldungen laeuft im selben Trigger mit.
  try { sendRsvpSummaries(); } catch (eSum) { console.error('Rueckmelde-Zusammenfassung fehlgeschlagen: ' + eSum); }
  // Dienst-Zaehler in der Mitgliederliste einmal taeglich auffrischen (Jahreswechsel).
  try { dienstSyncMitgliederliste(); } catch (eDienst) { console.error('Dienst-Zaehler nicht aktualisiert: ' + eDienst); }
  // Lesbare Familien-Zuordnung in der Mitgliederliste auffrischen.
  try { ersatzSchreibeFamilien(); } catch (eFam) { console.error('Familien-Spalte: ' + eFam); }
  // Eingetragene Helfer vor ihrem Dienst erinnern.
  try { helferErinnerungen(); } catch (eHelferRem) { console.error('Helfer-Erinnerung fehlgeschlagen: ' + eHelferRem); }

  var rsvpMapErinnerung = {};
  try { rsvpMapErinnerung = rsvpLoadMap(true); } catch (eMap) { console.error('Rueckmeldungen nicht lesbar: ' + eMap); }

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

      var rsvpRow = rsvpMapErinnerung[ev.getId()];
      if (rsvpRow) body += rsvpMailBlock(rsvpRow.token);

      body += '\nWir freuen uns auf Dich!\n\n' +
        'Sportliche Grüße,\n' +
        'Boulderverein Zugzwang e.V.\n' +
        'https://zugzwang-auerbach.de';

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

// ═══════════════════════════════════════════════════
// ERSATZBEITRAG (wer keinen Dienst leistet, zahlt)
// ═══════════════════════════════════════════════════
//
// Pflicht je Kalenderjahr: ein Hallen- oder Helferdienst
//   - je erwachsenem Mitglied,
//   - je Familie (egal, wer aus der Familie ihn leistet),
//   - je ermaessigtem Mitglied ab 16 (Status "ermäßigt", z.B. Schueler/Studenten – auch ueber 18 –
//     sowie alle 16- und 17-Jaehrigen), das nicht zu einer Familie gehoert. Typ-Kuerzel: 'jugend'.
// Keine Pflicht: Kinder unter 16 (wer beim Eintritt noch keine 16 ist: auch im ganzen Eintrittsjahr), Foerdermitglieder, Eintritt ab 1.11. (im Eintrittsjahr),
// von Hand Befreite (Spalte "Dienst-Befreiung").
// Wer im Antrag "Ersatzbeitrag" gewaehlt hat (Spalte "Ersatzbeitrag gewählt"), zahlt jedes Jahr.
// Betraege und Startjahr stehen im Config-Tab (ersatz_betrag_*, ersatz_start_jahr).
//
// Familien: Angehoerige verweisen in "Zahlungspflichtiges Mitglied" auf das Hauptmitglied –
// per Mandatsreferenz (neu), per Name (Online-Antraege bis 2026) oder per alter Nummer
// (518 → BVZUGZWANG00518).

var ERSATZ_SPALTE_BEFREIUNG = 'Dienst-Befreiung';
var ERSATZ_SPALTE_GEWAEHLT = 'Ersatzbeitrag gewählt';
var ERSATZ_SPALTE_FAMILIE = 'Familie';
var ERSATZ_START_JAHR = 2027;
var ERSATZ_BETRAEGE = { erwachsen: 100, familie: 100, jugend: 40 };
var ERSATZ_CONFIG_KEYS = { erwachsen: 'ersatz_betrag_erwachsene', familie: 'ersatz_betrag_familie', jugend: 'ersatz_betrag_jugend' };

// Betrag in Euro; leer oder ungueltig → Standardwert, 0 = kein Ersatzbeitrag
function ersatzBetrag(typ) {
  if (!ERSATZ_CONFIG_KEYS[typ]) return 0;
  var roh = (getConfigValue(ERSATZ_CONFIG_KEYS[typ]) || '').toString().trim().replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(roh)) return ERSATZ_BETRAEGE[typ];
  return parseFloat(roh);
}

// Mitgliedsbeitraege (Euro pro Jahr); im internen Bereich unter Config aenderbar.
// Vollmitglieder zahlen Mitgliedsbeitrag + Jahreskarte, Foerdermitglieder nur den Beitrag.
var BEITRAG_STANDARD = {
  beitrag_voll_erwachsene: 40, beitrag_voll_ermaessigt: 20, beitrag_voll_familie: 80,
  jahreskarte_erwachsene: 110, jahreskarte_ermaessigt: 70, jahreskarte_familie: 220,
  beitrag_foerder_erwachsene: 20, beitrag_foerder_ermaessigt: 16, beitrag_foerder_familie: 40
};

// Oeffentlich: alle Betraege fuer Mitgliedsantrag, Vereinsseite und Einzug
function beitragsInfo() {
  var cfg = {};
  var alle = getConfigAll();
  if (Array.isArray(alle)) alle.forEach(function(c) { cfg[c.key] = c.value; });
  var beitraege = {};
  Object.keys(BEITRAG_STANDARD).forEach(function(key) {
    var roh = (cfg[key] || '').toString().trim().replace(',', '.');
    beitraege[key] = /^\d{1,4}(\.\d{1,2})?$/.test(roh) ? parseFloat(roh) : BEITRAG_STANDARD[key];
  });
  return { ok: true, startJahr: ersatzStartJahr(), erwachsen: ersatzBetrag('erwachsen'),
    familie: ersatzBetrag('familie'), jugend: ersatzBetrag('jugend'), beitraege: beitraege };
}

function ersatzStartJahr() {
  var roh = (getConfigValue('ersatz_start_jahr') || '').toString().trim();
  return /^20\d{2}$/.test(roh) ? parseInt(roh, 10) : ERSATZ_START_JAHR;
}

// Spaltenindex (0-basiert) einer Zusatzspalte; legt sie rechts an, wenn sie fehlt
function ersatzSpalte(sheet, name) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === name) return i;
  }
  sheet.getRange(1, headers.length + 1).setValue(name).setFontWeight('bold');
  return headers.length;
}

function ersatzLadeMitglieder() {
  var sheet = dienstMitgliederSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var colIdx = {};
  headers.forEach(function(h, i) { colIdx[String(h).trim()] = i; });
  var liste = [];
  if (lastRow < 2 || colIdx['Nachname'] === undefined || colIdx['Vorname'] === undefined) return liste;
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var zelle = function(row, name) { return colIdx[name] === undefined ? '' : row[colIdx[name]]; };
  var text = function(row, name) { var v = zelle(row, name); return String(v === null || v === undefined ? '' : v).trim(); };
  for (var i = 0; i < data.length; i++) {
    var nach = text(data[i], 'Nachname'), vor = text(data[i], 'Vorname');
    if (!nach && !vor) continue;
    liste.push({
      row: i + 2,
      nachname: nach,
      vorname: vor,
      geburt: dienstDatumObj(zelle(data[i], 'Geburtsdatum')),
      key: dienstMitgliedKey(nach, vor, zelle(data[i], 'Geburtsdatum')),
      status: text(data[i], 'Status'),
      eintritt: dienstDatumObj(zelle(data[i], 'Eintritt')),
      mandatsref: text(data[i], 'Mandatsreferenz'),
      verweis: text(data[i], 'Zahlungspflichtiges Mitglied'),
      iban: text(data[i], 'IBAN'),
      bic: text(data[i], 'BIC'),
      kontoinhaber: text(data[i], 'Kontoinhaber'),
      mandatDatum: dienstDatumDE(zelle(data[i], 'Mandat Unterschriftsdatum')) || text(data[i], 'Mandat Unterschriftsdatum'),
      befreiung: text(data[i], ERSATZ_SPALTE_BEFREIUNG),
      gewaehlt: /^(ja|x|true|1)$/i.test(text(data[i], ERSATZ_SPALTE_GEWAEHLT))
    });
  }
  return liste;
}

// Sucht das Hauptmitglied, auf das ein Angehoeriger verweist.
// Ergebnis: Index in der Liste, -1 = nicht gefunden, -2 = mehrdeutig.
function ersatzFindeHaupt(verweis, liste, selbst) {
  var v = String(verweis || '').trim();
  if (!v) return -1;
  var treffer = [];
  var i;
  // 1. Mandatsreferenz (eindeutig, so schreibt es der Antrag seit Nov. 2026)
  for (i = 0; i < liste.length; i++) {
    if (i !== selbst && liste[i].mandatsref && liste[i].mandatsref.toLowerCase() === v.toLowerCase()) treffer.push(i);
  }
  // 2. Alte Nummer: Endziffern der Mandatsreferenz aus dem frueheren System (nicht ZZ-JJJJ-NNNN)
  if (treffer.length === 0 && /^\d{1,8}$/.test(v)) {
    var nr = parseInt(v, 10);
    for (i = 0; i < liste.length; i++) {
      if (i === selbst || !liste[i].mandatsref || /^ZZ-/i.test(liste[i].mandatsref)) continue;
      var end = liste[i].mandatsref.match(/(\d+)$/);
      if (end && parseInt(end[1], 10) === nr) treffer.push(i);
    }
  }
  // 3. Name "Vorname Nachname" (oder umgekehrt); Hauptmitglieder haben selbst keinen Verweis
  if (treffer.length === 0) {
    var nv = dienstNorm(v);
    for (i = 0; i < liste.length; i++) {
      if (i === selbst || liste[i].verweis) continue;
      if (dienstNorm(liste[i].vorname + liste[i].nachname) === nv ||
          dienstNorm(liste[i].nachname + liste[i].vorname) === nv) treffer.push(i);
    }
  }
  if (treffer.length === 1) return treffer[0];
  return treffer.length === 0 ? -1 : -2;
}

// Alter in vollen Jahren an einem Stichtag
function ersatzAlterAm(geburt, stichtag) {
  var a = stichtag.getFullYear() - geburt.getFullYear();
  if (stichtag.getMonth() < geburt.getMonth() ||
      (stichtag.getMonth() === geburt.getMonth() && stichtag.getDate() < geburt.getDate())) a--;
  return a;
}

// Ordnet Angehoerige ihrem Hauptmitglied zu: { hauptVon: {Index: Index}, unklar: [...] }
function ersatzZuordnung(liste) {
  var hauptVon = {}, unklar = [];
  for (var i = 0; i < liste.length; i++) {
    if (!liste[i].verweis) continue;
    var h = ersatzFindeHaupt(liste[i].verweis, liste, i);
    // Verweist das "Hauptmitglied" selbst weiter, gilt dessen Hauptmitglied
    var schritte = 0;
    while (h >= 0 && liste[h].verweis && schritte++ < 3) {
      var weiter = ersatzFindeHaupt(liste[h].verweis, liste, h);
      if (weiter < 0 || weiter === i) break;
      h = weiter;
    }
    if (h >= 0) hauptVon[i] = h;
    else unklar.push({
      row: liste[i].row, nachname: liste[i].nachname, vorname: liste[i].vorname,
      verweis: liste[i].verweis, grund: h === -2 ? 'mehrdeutig' : 'nicht gefunden'
    });
  }
  return { hauptVon: hauptVon, unklar: unklar };
}

// Schreibt in die Mitgliederliste, zu welchem Hauptmitglied jemand gehoert (nur zum
// Lesen – massgeblich bleibt "Zahlungspflichtiges Mitglied"). Hauptmitglied und
// Angehoerige bekommen denselben Eintrag, z.B. "Taubmann, Thomas"; "?" = nicht zuzuordnen.
function ersatzSchreibeFamilien() {
  var liste = ersatzLadeMitglieder();
  if (liste.length === 0) return;
  var sheet = dienstMitgliederSheet();
  var col = ersatzSpalte(sheet, ERSATZ_SPALTE_FAMILIE);
  var zeilen = sheet.getLastRow() - 1;
  var alt = sheet.getRange(2, col + 1, zeilen, 1).getValues();
  var zu = ersatzZuordnung(liste);
  var hatAngehoerige = {};
  for (var k in zu.hauptVon) hatAngehoerige[zu.hauptVon[k]] = true;
  var neu = [];
  for (var z = 0; z < zeilen; z++) neu.push(['']);
  var name = function(m) { return sheetSafe(m.nachname + ', ' + m.vorname); };
  for (var i = 0; i < liste.length; i++) {
    var wert = '';
    if (zu.hauptVon[i] !== undefined) wert = name(liste[zu.hauptVon[i]]);
    else if (liste[i].verweis) wert = '?';
    else if (hatAngehoerige[i] || liste[i].status.toLowerCase().indexOf('familie') !== -1) wert = name(liste[i]);
    neu[liste[i].row - 2] = [wert];
  }
  var gleich = true;
  for (var j = 0; j < zeilen && gleich; j++) gleich = String(alt[j][0]) === String(neu[j][0]);
  if (!gleich) sheet.getRange(2, col + 1, zeilen, 1).setValues(neu);
}

// Uebersicht fuer ein Jahr: je Einheit (Person oder Familie) der Stand.
// mitBank = true liefert zusaetzlich die Einzugsdaten (nur fuer Admins).
function ersatzUebersicht(jahr, mitBank) {
  jahr = parseInt(jahr, 10);
  var aktJahr = new Date().getFullYear();
  if (!jahr || jahr < 2020 || jahr > aktJahr + 1) jahr = aktJahr;

  var liste = ersatzLadeMitglieder();
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var dsheet = ss.getSheetByName(DIENSTE_TAB);
  var drows = dsheet ? dienstRows(dsheet) : [];

  var zu = ersatzZuordnung(liste);
  var hauptVon = zu.hauptVon, unklar = zu.unklar;
  var i;

  var angehoerige = {};
  for (var k in hauptVon) {
    (angehoerige[hauptVon[k]] || (angehoerige[hauptVon[k]] = [])).push(parseInt(k, 10));
  }

  var einheiten = [];
  var summe = { offen: 0, gewaehlt: 0, erfuellt: 0, befreit: 0, neu: 0, betrag: 0 };
  for (i = 0; i < liste.length; i++) {
    var m = liste[i];
    if (m.verweis) continue;                                     // Angehoerige zaehlen beim Hauptmitglied
    if (m.eintritt && m.eintritt.getFullYear() > jahr) continue; // in dem Jahr noch kein Mitglied
    var fam = angehoerige[i] || [];
    var statusKlein = m.status.toLowerCase();
    var foerder = statusKlein.indexOf('förder') !== -1 || statusKlein.indexOf('foerder') !== -1;
    var typ;
    if (fam.length > 0 || statusKlein.indexOf('familie') !== -1) typ = 'familie';
    else if (m.geburt && jahr - m.geburt.getFullYear() < 16) typ = 'kind';
    else if ((m.geburt && jahr - m.geburt.getFullYear() < 18) ||
             statusKlein.indexOf('ermäßigt') !== -1 || statusKlein.indexOf('ermaessigt') !== -1) typ = 'jugend';
    else typ = 'erwachsen';

    var personen = [m].concat(fam.map(function(x) { return liste[x]; }));
    var dienste = 0, eingetragen = 0, befreiung = '', gewaehlt = false;
    personen.forEach(function(p) {
      var geleistet = dienstGeleistetAnzahl(drows, p.key, jahr);   // nur Quittiertes zaehlt
      dienste += geleistet;
      eingetragen += dienstAnzahl(drows, p.key, jahr) - geleistet;
      if (p.befreiung && !befreiung) befreiung = p.befreiung;
      if (p.gewaehlt) gewaehlt = true;
    });

    var stand;
    if (foerder) stand = 'foerder';
    else if (typ === 'kind') stand = 'kind';
    else if (typ !== 'familie' && m.geburt && m.eintritt && m.eintritt.getFullYear() === jahr &&
             ersatzAlterAm(m.geburt, m.eintritt) < 16) stand = 'kind';   // beim Eintritt noch keine 16: Eintrittsjahr frei
    else if (m.eintritt && m.eintritt.getFullYear() === jahr && m.eintritt.getMonth() >= 10) stand = 'neu';
    else if (befreiung) stand = 'befreit';
    else if (gewaehlt) stand = 'gewaehlt';
    else if (dienste >= 1) stand = 'erfuellt';
    else stand = 'offen';

    var betrag = (stand === 'offen' || stand === 'gewaehlt') ? ersatzBetrag(typ) : 0;
    if (summe[stand] !== undefined) summe[stand]++;
    summe.betrag += betrag;

    var e = {
      row: m.row, key: m.key, typ: typ, nachname: m.nachname, vorname: m.vorname,
      personen: personen.length,
      angehoerige: fam.map(function(x) { return liste[x].vorname; }),
      status: m.status, eintritt: dienstDatumDE(m.eintritt),
      dienste: dienste, eingetragen: eingetragen, stand: stand, betrag: betrag,
      befreiung: m.befreiung, befreiungFamilie: befreiung, gewaehlt: m.gewaehlt
    };
    if (mitBank) {
      e.iban = m.iban; e.bic = m.bic; e.mandatsreferenz = m.mandatsref;
      e.kontoinhaber = m.kontoinhaber; e.mandatDatum = m.mandatDatum;
    }
    einheiten.push(e);
  }

  return {
    ok: true, jahr: jahr, startJahr: ersatzStartJahr(), aktiv: jahr >= ersatzStartJahr(),
    betraege: { erwachsen: ersatzBetrag('erwachsen'), familie: ersatzBetrag('familie'), jugend: ersatzBetrag('jugend') },
    summe: summe, einheiten: einheiten, unklar: unklar,
    offeneQuittungen: quittOffene(drows, jahr)
  };
}

// Befreiung bzw. "Ersatzbeitrag gewaehlt" von Hand setzen (nur Admin).
// key sichert ab, dass die Zeile noch dieselbe Person ist (Liste kann sortiert worden sein).
function ersatzSetze(row, key, feld, wert) {
  row = parseInt(row, 10);
  if (feld !== 'befreiung' && feld !== 'gewaehlt') return { error: 'Ungültiges Feld' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var liste = ersatzLadeMitglieder();
    var m = null;
    for (var i = 0; i < liste.length; i++) {
      if (liste[i].row === row && liste[i].key === key) { m = liste[i]; break; }
    }
    if (!m) return { error: 'Mitglied nicht gefunden – bitte Übersicht neu laden.' };
    var sheet = dienstMitgliederSheet();
    if (feld === 'befreiung') {
      var grund = String(wert === null || wert === undefined ? '' : wert).trim().slice(0, 100);
      sheet.getRange(row, ersatzSpalte(sheet, ERSATZ_SPALTE_BEFREIUNG) + 1).setValue(sheetSafe(grund));
    } else {
      sheet.getRange(row, ersatzSpalte(sheet, ERSATZ_SPALTE_GEWAEHLT) + 1).setValue(wert ? 'Ja' : '');
    }
    SpreadsheetApp.flush();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════
// DIENST QUITTIEREN (iPad in der Halle)
// ═══════════════════════════════════════════════════
//
// Am Tag des Dienstes, ab dessen Beginn, hakt jede Person ihren Hallen- oder
// Helferdienst am iPad ab (quittung.html). Der Eintrag im Tab "Dienste" bekommt
// dann den Status "geleistet" – nur das zaehlt fuer den Ersatzbeitrag.
// Wer nicht eingetragen war, kann sich mit Name und Geburtsdatum nachtragen.
// Jede Quittung wird unterschrieben; das Bild liegt in Drive, der Link im Tab "Dienste".
// Bewusst ohne Geraetecode (Detlef, 15.11.2026): soll einfach bleiben, es gibt Zeugen.

var QUITT_HD_START = { 3: '18:00', 5: '18:00', 0: '14:00' };   // Hallendienst: Mi, Fr, So (wie im Hallendienst-Skript)
var QUITT_ORDNER = 'Zugzwang_Dienst_Quittungen';
var QUITT_SPALTE = 12;   // Tab "Dienste", Spalte L: Link zur Unterschrift

// Legt das Unterschriftsbild in Drive ab (Ordner "Zugzwang_Dienst_Quittungen") und
// vermerkt den Link in Spalte L des Tabs "Dienste". Ein Fehler dabei verhindert das
// Quittieren nicht – dann steht dort ein Hinweis.
function quittUnterschriftGueltig(u) {
  return typeof u === 'string' && u.length > 500 && u.length < 600000 && /^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(u);
}

function quittSpeichereUnterschrift(dsheet, row, v, dataUrl) {
  var vermerk;
  try {
    var bytes = Utilities.base64Decode(dataUrl.replace(/^data:image\/png;base64,/, ''));
    var name = Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd') + '_' +
      String(v[5]).replace(/[^A-Za-zÄÖÜäöüß0-9-]/g, '') + '_' + String(v[6]).replace(/[^A-Za-zÄÖÜäöüß0-9-]/g, '') +
      '_' + String(v[0]).slice(1, 9) + '.png';
    var it = DriveApp.getFoldersByName(QUITT_ORDNER);
    var ordner = it.hasNext() ? it.next() : DriveApp.createFolder(QUITT_ORDNER);
    vermerk = ordner.createFile(Utilities.newBlob(bytes, 'image/png', name)).getUrl();
  } catch (e) {
    console.error('Unterschrift nicht gespeichert: ' + e);
    vermerk = 'unterschrieben (Bild nicht gespeichert)';
  }
  if (!String(dsheet.getRange(1, QUITT_SPALTE).getValue())) dsheet.getRange(1, QUITT_SPALTE).setValue('Unterschrift').setFontWeight('bold');
  dsheet.getRange(row, QUITT_SPALTE).setValue(vermerk);
}

function quittName(vorname, nachname) {
  var n = String(nachname || '').trim();
  return String(vorname || '').trim() + (n ? ' ' + n.charAt(0).toUpperCase() + '.' : '');
}

// Die Dienste von heute: [{ art, ref, titel, zeit, startMs, begonnen }]
function quittDiensteHeute() {
  var jetzt = new Date();
  var heuteDE = dienstDatumDE(jetzt);
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var liste = [];

  // Hallendienst: heute ist ein Hallendienst-Tag und es gibt einen Termin oder eine Eintragung
  var hdStart = QUITT_HD_START[jetzt.getDay()];
  if (hdStart) {
    var gibtEs = false;
    var hsheet = ss.getSheetByName('Hallendienst');
    if (hsheet && hsheet.getLastRow() >= 2) {
      var hd = hsheet.getRange(2, 1, hsheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < hd.length && !gibtEs; i++) gibtEs = dienstDatumDE(hd[i][0]) === heuteDE;
    }
    if (!gibtEs) {
      var dsheet = ss.getSheetByName(DIENSTE_TAB);
      var drows = dsheet ? dienstRows(dsheet) : [];
      for (var j = 0; j < drows.length && !gibtEs; j++) {
        gibtEs = drows[j][1] === 'hallendienst' && dienstDatumDE(drows[j][3]) === heuteDE;
      }
    }
    if (gibtEs) {
      var hm = hdStart.split(':');
      var hs = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), parseInt(hm[0], 10), parseInt(hm[1], 10));
      liste.push({ art: 'hallendienst', ref: heuteDE, titel: 'Hallendienst', zeit: hdStart, startMs: hs.getTime() });
    }
  }

  // Helferdienste, die heute beginnen
  var hrows = helferRows(helferSheet(true));
  for (var k = 0; k < hrows.length; k++) {
    var start = hrows[k][3];
    if (!helferIstDatum(start) || dienstDatumDE(start) !== heuteDE) continue;
    liste.push({ art: 'helferdienst', ref: String(hrows[k][0]), titel: String(hrows[k][2]), zeit: helferZeit(start), startMs: start.getTime() });
  }

  liste.sort(function(a, b) { return a.startMs - b.startMs; });
  liste.forEach(function(d) { d.begonnen = jetzt.getTime() >= d.startMs; });
  return liste;
}

function quittFindeDienst(dienste, art, ref) {
  for (var i = 0; i < dienste.length; i++) {
    if (dienste[i].art === art && dienste[i].ref === String(ref)) return dienste[i];
  }
  return null;
}

// Liste fuer das iPad: Dienste von heute mit den Eingetragenen (Vorname + Anfangsbuchstabe)
function quittListe() {
  var dienste = quittDiensteHeute();
  var heuteDE = dienstDatumDE(new Date());
  var dsheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DIENSTE_TAB);
  var drows = dsheet ? dienstRows(dsheet) : [];
  var out = dienste.map(function(d) {
    var personen = [];
    for (var i = 0; i < drows.length; i++) {
      var r = drows[i];
      if (r[1] !== d.art || String(r[2]) !== d.ref || dienstDatumDE(r[3]) !== heuteDE) continue;
      if (r[8] !== 'eingetragen' && r[8] !== 'ohne_platz' && r[8] !== 'warteliste' && r[8] !== 'geleistet') continue;
      personen.push({ id: r[0], name: quittName(r[6], r[5]), geleistet: r[8] === 'geleistet' });
    }
    personen.sort(function(a, b) { return a.name.localeCompare(b.name); });
    return { art: d.art, ref: d.ref, titel: d.titel, zeit: d.zeit, begonnen: d.begonnen, personen: personen };
  });
  return { ok: true, datum: heuteDE, dienste: out };
}

// Eine Eintragung abhaken
function quittieren(id, unterschrift) {
  if (!quittUnterschriftGueltig(unterschrift)) return { error: 'Bitte unterschreiben.' };
  if (!dienstGueltigeId(id)) return { error: 'Eintrag nicht gefunden' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var dsheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DIENSTE_TAB);
    var hit = dsheet ? dienstFinde(dsheet, id) : null;
    if (!hit) return { error: 'Eintrag nicht gefunden' };
    if (dienstDatumDE(hit.v[3]) !== dienstDatumDE(new Date())) return { error: 'Quittieren geht nur am Tag des Dienstes.' };
    var d = quittFindeDienst(quittDiensteHeute(), hit.v[1], hit.v[2]);
    if (!d) return { error: 'Dieser Dienst findet heute nicht statt.' };
    if (!d.begonnen) return { error: 'Quittieren ist erst ab ' + d.zeit + ' Uhr möglich.' };
    var name = quittName(hit.v[6], hit.v[5]);
    if (hit.v[8] === 'geleistet') return { ok: true, schon: true, name: name };
    if (hit.v[8] !== 'eingetragen' && hit.v[8] !== 'ohne_platz' && hit.v[8] !== 'warteliste') return { error: 'Diese Eintragung ist nicht mehr aktiv.' };
    dienstSetStatus(dsheet, hit.row, 'geleistet');
    quittSpeichereUnterschrift(dsheet, hit.row, hit.v, unterschrift);
    SpreadsheetApp.flush();
    try { dienstSyncMitgliederliste(); } catch (e) { console.error('Dienst-Zaehler nicht aktualisiert: ' + e); }
    return { ok: true, name: name };
  } finally {
    lock.releaseLock();
  }
}

// Spontaner Helfer: war nicht eingetragen, weist sich mit Name und Geburtsdatum als Mitglied aus
function quittSpontan(data) {
  data = data || {};
  if (!quittUnterschriftGueltig(data.unterschrift)) return { error: 'Bitte unterschreiben.' };
  var vor = String(data.vorname || '').trim(), nach = String(data.nachname || '').trim();
  var geb = dienstDatumDE(data.geburtsdatum);
  if (!vor || !nach || vor.length > 100 || nach.length > 100) return { error: 'Bitte Vor- und Nachnamen angeben.' };
  if (!geb) return { error: 'Bitte das Geburtsdatum angeben.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = quittFindeDienst(quittDiensteHeute(), String(data.art || ''), String(data.ref || ''));
    if (!d) return { error: 'Dieser Dienst findet heute nicht statt.' };
    if (!d.begonnen) return { error: 'Quittieren ist erst ab ' + d.zeit + ' Uhr möglich.' };
    var fund = dienstFindeMitglied(vor, nach, '', geb, '');
    if (fund.status !== 'ok') return { status: 'unbekannt', message: dienstKontaktHinweis() };
    var m = fund.mitglied;
    var dsheet = dienstSheet();
    var drows = dienstRows(dsheet);
    var heuteDE = dienstDatumDE(new Date());
    var name = quittName(m.vorname, m.nachname);
    for (var i = 0; i < drows.length; i++) {
      var r = drows[i];
      if (r[4] !== m.key || r[1] !== d.art || String(r[2]) !== d.ref || dienstDatumDE(r[3]) !== heuteDE) continue;
      if (r[8] === 'geleistet') return { ok: true, schon: true, name: name };
      if (r[8] === 'eingetragen' || r[8] === 'ohne_platz' || r[8] === 'warteliste') {
        dienstSetStatus(dsheet, i + 2, 'geleistet');
        quittSpeichereUnterschrift(dsheet, i + 2, r, data.unterschrift);
        SpreadsheetApp.flush();
        try { dienstSyncMitgliederliste(); } catch (e1) { console.error('Dienst-Zaehler nicht aktualisiert: ' + e1); }
        return { ok: true, name: name };
      }
    }
    var neueId = dienstEintragen(dsheet, d.art, d.ref, new Date(), m, 'geleistet');
    quittSpeichereUnterschrift(dsheet, dsheet.getLastRow(), [neueId, '', '', '', '', m.nachname, m.vorname], data.unterschrift);
    SpreadsheetApp.flush();
    try { dienstSyncMitgliederliste(); } catch (e2) { console.error('Dienst-Zaehler nicht aktualisiert: ' + e2); }
    return { ok: true, name: name };
  } finally {
    lock.releaseLock();
  }
}

// Vorstand: Dienst nachtragen ("geleistet") oder das Abhaken zuruecknehmen
function quittAdmin(id, geleistet) {
  if (!dienstGueltigeId(id)) return { error: 'Eintrag nicht gefunden' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var dsheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DIENSTE_TAB);
    var hit = dsheet ? dienstFinde(dsheet, id) : null;
    if (!hit) return { error: 'Eintrag nicht gefunden' };
    var st = hit.v[8];
    if (geleistet) {
      if (st !== 'eingetragen' && st !== 'ohne_platz' && st !== 'warteliste' && st !== 'geleistet') return { error: 'Diese Eintragung ist ausgetragen oder gestrichen.' };
      if (st !== 'geleistet') {
        dienstSetStatus(dsheet, hit.row, 'geleistet');
        if (!String(dsheet.getRange(1, QUITT_SPALTE).getValue())) dsheet.getRange(1, QUITT_SPALTE).setValue('Unterschrift').setFontWeight('bold');
        dsheet.getRange(hit.row, QUITT_SPALTE).setValue('vom Vorstand nachgetragen');
      }
    } else {
      if (st !== 'geleistet') return { error: 'Dieser Dienst ist nicht als geleistet vermerkt.' };
      dienstSetStatus(dsheet, hit.row, 'eingetragen');
    }
    SpreadsheetApp.flush();
    try { dienstSyncMitgliederliste(); } catch (e) { console.error('Dienst-Zaehler nicht aktualisiert: ' + e); }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// Fuer die Uebersicht im internen Bereich: vergangene Eintragungen des Jahres, die nicht abgehakt wurden
function quittOffene(drows, jahr) {
  var heute = new Date();
  var grenze = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + 1).getTime();
  var titel = {};
  helferRows(helferSheet(true)).forEach(function(h) { titel[String(h[0])] = String(h[2]); });
  var out = [];
  for (var i = 0; i < drows.length; i++) {
    var r = drows[i];
    if (r[8] !== 'eingetragen' && r[8] !== 'ohne_platz') continue;
    var d = dienstDatumObj(r[3]);
    if (!d || d.getFullYear() !== jahr || d.getTime() >= grenze) continue;
    out.push({ id: r[0], art: r[1], datum: dienstDatumDE(d), ts: d.getTime(),
      titel: r[1] === 'hallendienst' ? 'Hallendienst' : (titel[String(r[2])] || 'Helferdienst'),
      nachname: String(r[5]), vorname: String(r[6]) });
  }
  out.sort(function(a, b) { return b.ts - a.ts; });
  return out;
}

// >>> DIENSTE-KERN (identisch in mitgliederliste/Mitgliederliste.gs und hallendienst/Code.gs)
//
// Vorlage: apps-script/_gemeinsam/dienste-kern.js. Aenderungen dort machen und
// mit `node tests/sync-dienste-kern.js` in beide Projekte uebernehmen; der Test
// prueft, dass alle drei Fassungen gleich sind.
//
// Hallen- und Helferdienste werden je Mitglied im Tab "Dienste" protokolliert:
//   A ID | B Art | C Dienst | D Datum | E Mitglied | F Nachname | G Vorname
//   H E-Mail | I Status | J Eingetragen am | K Geändert am
// Art:    hallendienst | helferdienst
// Dienst: Hallendienst = Datum (TT.MM.JJJJ), Helferdienst = dessen ID
// Status: eingetragen | ohne_platz | warteliste | geleistet | ausgetragen | gestrichen
// "geleistet" = am Tag des Dienstes am iPad in der Halle quittiert (oder vom Vorstand nachgetragen).
// Fuer die Jahresgrenze (dienste_limit) zaehlen "eingetragen", "ohne_platz" und "geleistet",
// je Kalenderjahr des Dienstes, Hallen- und Helferdienste zusammen.
// Fuer den Ersatzbeitrag zaehlt nur "geleistet" (dienstGeleistetAnzahl).

var DIENSTE_TAB = 'Dienste';
var DIENSTE_HEADERS = ['ID', 'Art', 'Dienst', 'Datum', 'Mitglied', 'Nachname', 'Vorname',
  'E-Mail', 'Status', 'Eingetragen am', 'Geändert am'];
// Standardwerte; im internen Bereich unter Config aenderbar (siehe dienstEinstellung)
var DIENST_LIMIT = 3;              // ab so vielen Diensten im Jahr gelten die Sonderregeln (0 = keine Grenze)
var DIENST_HD_SPERRE_TAGE = 5;     // Hallendienst: Sperre entfaellt so viele Tage vorher
var DIENST_AUSTRAGEN_TAGE = 3;     // Austragen per Link bis so viele Tage vorher
var DIENST_SITE = 'https://zugzwang-auerbach.de';
var DIENST_SPALTE_ANZAHL = 'Dienste lfd. Jahr';
var DIENST_SPALTE_LETZTER = 'Letzter Dienst';

// Zahl aus dem Config-Tab lesen; leer oder ungueltig → Standardwert
function dienstEinstellung(key, standard) {
  var roh = (getConfigValue(key) || '').toString().trim();
  if (!/^\d{1,3}$/.test(roh)) return standard;
  return parseInt(roh, 10);
}
function dienstLimit() { return dienstEinstellung('dienste_limit', DIENST_LIMIT); }
function dienstHdSperreTage() { return dienstEinstellung('dienste_hd_sperre_tage', DIENST_HD_SPERRE_TAGE); }
function dienstAustragenTage() { return dienstEinstellung('dienste_austragen_tage', DIENST_AUSTRAGEN_TAGE); }

// Hat das Mitglied die Jahresgrenze erreicht? (Grenze 0 = abgeschaltet)
function dienstLimitErreicht(anzahl) {
  var limit = dienstLimit();
  return limit > 0 && anzahl >= limit;
}

function dienstSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(DIENSTE_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(DIENSTE_TAB);
    sheet.getRange(1, 1, 1, DIENSTE_HEADERS.length).setValues([DIENSTE_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function dienstRows(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, DIENSTE_HEADERS.length).getValues();
}

// Namen/E-Mails vergleichbar machen: Gross-/Kleinschreibung, Umlaute,
// Bindestriche und Leerzeichen spielen keine Rolle.
function dienstNorm(s) {
  return String(s === null || s === undefined ? '' : s).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9@._]/g, '');
}

// Telefonnummern vergleichbar machen: nur Ziffern, ohne fuehrende 0 bzw.
// Laendervorwahl (+49 / 0049). In der Tabelle fehlt die fuehrende 0 oft, weil
// Sheets die Nummer als Zahl speichert. Zu kurze Nummern gelten als leer.
function dienstNormTel(v) {
  var d = String(v === null || v === undefined ? '' : v).replace(/\D/g, '');
  d = d.replace(/^00/, '');
  if (d.indexOf('49') === 0 && d.length > 10) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d.length >= 6 ? d : '';
}

// Datum (Date, "TT.MM.JJJJ" oder "JJJJ-MM-TT") → "TT.MM.JJJJ"; sonst ''
function dienstDatumDE(v) {
  if (v && typeof v.getDate === 'function') {
    if (isNaN(v.getTime())) return '';
    return ('0' + v.getDate()).slice(-2) + '.' + ('0' + (v.getMonth() + 1)).slice(-2) + '.' + v.getFullYear();
  }
  var s = String(v === null || v === undefined ? '' : v).trim();
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return iso[3] + '.' + iso[2] + '.' + iso[1];
  var de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (de) return ('0' + de[1]).slice(-2) + '.' + ('0' + de[2]).slice(-2) + '.' + de[3];
  return '';
}

function dienstDatumObj(v) {
  if (v && typeof v.getDate === 'function') return isNaN(v.getTime()) ? null : v;
  var de = dienstDatumDE(v);
  if (!de) return null;
  var p = de.split('.');
  return new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
}

// Ganze Kalendertage von heute bis zum Datum (0 = heute, negativ = vorbei)
function dienstTageBis(datum) {
  var d = dienstDatumObj(datum);
  if (!d) return -1;
  var heute = new Date();
  var a = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate()).getTime();
  var b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

function dienstNeueId() {
  return 'd' + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 39);
}

function dienstGueltigeId(id) {
  return typeof id === 'string' && /^d[0-9a-f]{39}$/.test(id);
}

function dienstMitgliedKey(nachname, vorname, geburtsdatum) {
  return dienstNorm(nachname) + '|' + dienstNorm(vorname) + '|' + dienstDatumDE(geburtsdatum);
}

function dienstMitgliederSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName('Mitglieder') || ss.getSheets()[0];
}

// Liest die Mitgliederliste: { sheet, headers, colIdx, mitglieder: [...] }
function dienstLadeMitglieder() {
  var sheet = dienstMitgliederSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var colIdx = {};
  headers.forEach(function(h, i) { colIdx[String(h).trim()] = i; });
  var out = { sheet: sheet, headers: headers, colIdx: colIdx, mitglieder: [] };
  if (lastRow < 2 || colIdx['Nachname'] === undefined || colIdx['Vorname'] === undefined) return out;
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var zelle = function(row, name) { return colIdx[name] === undefined ? '' : row[colIdx[name]]; };
  for (var i = 0; i < data.length; i++) {
    var nach = String(zelle(data[i], 'Nachname')).trim();
    var vor = String(zelle(data[i], 'Vorname')).trim();
    if (!nach && !vor) continue;
    out.mitglieder.push({
      row: i + 2,
      nachname: nach,
      vorname: vor,
      email: String(zelle(data[i], 'E-Mail')).trim(),
      geburtsdatum: dienstDatumDE(zelle(data[i], 'Geburtsdatum')),
      mobil: dienstNormTel(zelle(data[i], 'Telefon Mobil')),
      status: String(zelle(data[i], 'Status')),
      key: dienstMitgliedKey(nach, vor, zelle(data[i], 'Geburtsdatum'))
    });
  }
  return out;
}

// Erkennt ein Mitglied in dieser Reihenfolge:
//   1. Name + E-Mail
//   2. Name + Mobilnummer (steht ohnehin im Formular, wird still geprueft)
//   3. Name + Geburtsdatum (wird erst nachgefragt, wenn 1 und 2 nicht reichen)
// Ergebnis:
//   { status: 'ok', mitglied }
//   { status: 'geburtsdatum' }  → bitte Geburtsdatum nachfragen
//   { status: 'unbekannt' }     → nicht zuzuordnen (Kontakt anzeigen)
// Ob es an Name, E-Mail, Nummer oder Geburtsdatum lag, wird nach aussen nicht verraten.
function dienstFindeMitglied(vorname, nachname, email, geburtsdatum, mobil) {
  var liste = dienstLadeMitglieder().mitglieder;
  var nv = dienstNorm(vorname), nn = dienstNorm(nachname), ne = dienstNorm(email);
  var gd = dienstDatumDE(geburtsdatum);
  var nt = dienstNormTel(mobil);
  if (!nv || !nn) return { status: 'unbekannt' };
  var namensgleich = liste.filter(function(m) {
    return dienstNorm(m.vorname) === nv && dienstNorm(m.nachname) === nn;
  });
  var perMail = ne ? namensgleich.filter(function(m) { return dienstNorm(m.email) === ne; }) : [];
  if (perMail.length === 1) return { status: 'ok', mitglied: perMail[0] };
  // Mehrere Treffer per E-Mail (Namensvettern) → nur unter diesen weitersuchen
  var auswahl = perMail.length > 1 ? perMail : namensgleich;
  if (nt) {
    var perMobil = auswahl.filter(function(m) { return m.mobil && m.mobil === nt; });
    if (perMobil.length === 1) return { status: 'ok', mitglied: perMobil[0] };
  }
  if (!gd) return { status: 'geburtsdatum' };
  var perGeburt = auswahl.filter(function(m) { return m.geburtsdatum && m.geburtsdatum === gd; });
  if (perGeburt.length === 1) return { status: 'ok', mitglied: perGeburt[0] };
  return { status: 'unbekannt' };
}

function dienstZaehlt(status) {
  return status === 'eingetragen' || status === 'ohne_platz' || status === 'geleistet';
}

// Anzahl quittierter Dienste eines Mitglieds im Jahr (rows = dienstRows)
function dienstGeleistetAnzahl(rows, key, jahr) {
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][4] !== key || rows[i][8] !== 'geleistet') continue;
    var d = dienstDatumObj(rows[i][3]);
    if (d && d.getFullYear() === jahr) n++;
  }
  return n;
}

// Anzahl gezaehlter Dienste eines Mitglieds im Jahr (rows = dienstRows)
function dienstAnzahl(rows, key, jahr) {
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][4] !== key || !dienstZaehlt(rows[i][8])) continue;
    var d = dienstDatumObj(rows[i][3]);
    if (d && d.getFullYear() === jahr) n++;
  }
  return n;
}

// Neue Zeile ins Protokoll; gibt die ID zurueck (zugleich Schluessel fuer den Austragen-Link)
function dienstEintragen(sheet, art, ref, datum, mitglied, status) {
  var id = dienstNeueId();
  var jetzt = new Date();
  sheet.appendRow([id, art, sheetSafe(String(ref)), dienstDatumObj(datum), mitglied.key,
    sheetSafe(mitglied.nachname), sheetSafe(mitglied.vorname), sheetSafe(mitglied.email),
    status, jetzt, jetzt]);
  return id;
}

function dienstFinde(sheet, id) {
  var rows = dienstRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === id) return { row: i + 2, v: rows[i] };
  }
  return null;
}

function dienstSetStatus(sheet, row, status) {
  sheet.getRange(row, 9).setValue(status);
  sheet.getRange(row, 11).setValue(new Date());
}

// Setzt alle noch laufenden Eintraege eines Dienstes (z.B. wenn der Vorstand
// einen Termin absagt oder eine Person entfernt) auf den neuen Status.
// Gibt die Anzahl geaenderter Zeilen zurueck.
function dienstMarkiereDienst(art, ref, status) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(DIENSTE_TAB);
  if (!sheet) return 0;
  var rows = dienstRows(sheet);
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][1] !== art || String(rows[i][2]) !== String(ref)) continue;
    var st = rows[i][8];
    if (st !== 'eingetragen' && st !== 'ohne_platz' && st !== 'warteliste') continue;
    dienstSetStatus(sheet, i + 2, status);
    n++;
  }
  if (n > 0) dienstSyncMitgliederliste();
  return n;
}

// Schreibt je Mitglied Anzahl und letztes Dienst-Datum des laufenden Jahres in
// die Mitgliederliste (Spalten werden bei Bedarf rechts angelegt). Laeuft nach
// jeder Aenderung und einmal taeglich – so stimmt die Zahl auch nach Neujahr.
function dienstSyncMitgliederliste() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var dsheet = ss.getSheetByName(DIENSTE_TAB);
  var rows = dsheet ? dienstRows(dsheet) : [];
  var m = dienstLadeMitglieder();
  if (m.mitglieder.length === 0) return;

  var colAnzahl = m.colIdx[DIENST_SPALTE_ANZAHL];
  var colLetzter = m.colIdx[DIENST_SPALTE_LETZTER];
  var naechste = m.headers.length;
  if (colAnzahl === undefined) {
    colAnzahl = naechste++;
    m.sheet.getRange(1, colAnzahl + 1).setValue(DIENST_SPALTE_ANZAHL).setFontWeight('bold');
  }
  if (colLetzter === undefined) {
    colLetzter = naechste++;
    m.sheet.getRange(1, colLetzter + 1).setValue(DIENST_SPALTE_LETZTER).setFontWeight('bold');
  }

  var jahr = new Date().getFullYear();
  var stand = {};
  for (var i = 0; i < rows.length; i++) {
    if (!dienstZaehlt(rows[i][8])) continue;
    var d = dienstDatumObj(rows[i][3]);
    if (!d || d.getFullYear() !== jahr) continue;
    var s = stand[rows[i][4]] || (stand[rows[i][4]] = { n: 0, letzter: null });
    s.n++;
    if (!s.letzter || d.getTime() > s.letzter.getTime()) s.letzter = d;
  }
  // Beide Spalten in je einem Schreibvorgang (Zeilen ohne Mitglied bleiben leer)
  var anzahlWerte = [], letzterWerte = [];
  var zeilen = m.sheet.getLastRow() - 1;
  for (var z = 0; z < zeilen; z++) { anzahlWerte.push(['']); letzterWerte.push(['']); }
  for (var j = 0; j < m.mitglieder.length; j++) {
    var mg = m.mitglieder[j];
    var st = stand[mg.key];
    anzahlWerte[mg.row - 2] = [st ? st.n : 0];
    letzterWerte[mg.row - 2] = [st ? dienstDatumDE(st.letzter) : ''];
  }
  m.sheet.getRange(2, colAnzahl + 1, zeilen, 1).setValues(anzahlWerte);
  m.sheet.getRange(2, colLetzter + 1, zeilen, 1).setValues(letzterWerte);
}

// Kontakt fuer Leute, die das System nicht als Mitglied erkennt (einstellbar
// im internen Bereich unter Config).
function dienstKontaktHinweis() {
  var tel = (getConfigValue('dienste_kontakt_telefon') || '').toString().trim();
  return tel
    ? 'Wir konnten dich leider nicht in der Mitgliederliste finden. Schreib uns bitte kurz eine Nachricht an ' + tel + ' – wir tragen dich dann ein.'
    : 'Wir konnten dich leider nicht in der Mitgliederliste finden. Bitte melde dich beim Vorstand unter boulderhallezugzwang@gmail.com – wir tragen dich dann ein.';
}

// Angaben zu einem Protokoll-Eintrag fuer die Austragen-Seite (ohne Nachname/E-Mail)
function dienstInfoBasis(hit) {
  var d = dienstDatumObj(hit.v[3]);
  var tage = dienstTageBis(d);
  var frist = dienstAustragenTage();
  var aktiv = hit.v[8] === 'eingetragen' || hit.v[8] === 'ohne_platz' || hit.v[8] === 'warteliste';
  return {
    ok: true,
    art: hit.v[1],
    vorname: String(hit.v[6]),
    datum: dienstDatumDE(d),
    status: hit.v[8],
    austragenMoeglich: aktiv && tage >= frist,
    zuSpaet: aktiv && tage < frist,
    fristTage: frist
  };
}
// <<< DIENSTE-KERN
