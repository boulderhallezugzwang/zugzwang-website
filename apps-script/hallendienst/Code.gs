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
  if (data.geburtsdatum !== undefined && data.geburtsdatum !== null && data.geburtsdatum !== '' &&
      !/^\d{4}-\d{2}-\d{2}$/.test(String(data.geburtsdatum))) return 'Ungültiges Geburtsdatum.';
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

    // ── Öffentlich: Austragen-Seite (Link aus der Bestaetigungsmail) ──
    if (action === 'dienstInfo' || action === 'dienstAustragen') {
      var antwort = (action === 'dienstInfo') ? hdDienstInfo(data.c) : hdDienstAustragen(data.c);
      lock.releaseLock();
      return jsonResponse(antwort);
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

    // Nur Mitglieder: Name + E-Mail, sonst Name + Mobilnummer, sonst Name + Geburtsdatum
    var fund = dienstFindeMitglied(data.vorname, data.nachname, data.email, data.geburtsdatum, data.mobilnr);
    if (fund.status === 'geburtsdatum') {
      lock.releaseLock();
      return jsonResponse({ status: 'geburtsdatum',
        message: 'Wir konnten dich mit diesen Angaben nicht eindeutig zuordnen. Bitte gib zusätzlich dein Geburtsdatum an.' });
    }
    if (fund.status !== 'ok') {
      lock.releaseLock();
      return jsonResponse({ status: 'unbekannt', message: dienstKontaktHinweis() });
    }
    var mitglied = fund.mitglied;

    // Ab dem dritten Dienst im Jahr ist der Hallendienst gesperrt – ausser kurz
    // vorher, damit kein Termin unbesetzt bleibt.
    var terminDatum = parseDatumDE(data.datum);
    var dsheet = dienstSheet();
    var bisher = dienstAnzahl(dienstRows(dsheet), mitglied.key, terminDatum.getFullYear());
    var sperreTage = dienstHdSperreTage();
    if (dienstLimitErreicht(bisher) && dienstTageBis(terminDatum) > sperreTage) {
      lock.releaseLock();
      return jsonResponse({ status: 'limit',
        message: 'Danke, dass du so fleißig mithilfst! Du hast dich dieses Jahr schon ' + bisher +
          '-mal für einen Dienst eingetragen. Damit auch andere zum Zug kommen, kannst du weitere Hallendienste erst ' +
          sperreTage + ' Tage vor dem Termin übernehmen, falls er dann noch frei ist.' });
    }

    // Im Termin steht der Name so, wie er in der Mitgliederliste gefuehrt wird.
    data.vorname = mitglied.vorname;
    data.nachname = mitglied.nachname;
    sheet.getRange(targetRow, 3, 1, 4).setValues([[
      sheetSafe(data.vorname), sheetSafe(data.nachname), sheetSafe(data.email), sheetSafe(data.mobilnr)
    ]]);
    data.dienstId = dienstEintragen(dsheet, 'hallendienst', data.datum, terminDatum,
      { key: mitglied.key, nachname: mitglied.nachname, vorname: mitglied.vorname, email: data.email }, 'eingetragen');
    SpreadsheetApp.flush();
    try { dienstSyncMitgliederliste(); }
    catch (errSync) { console.error('Hallendienst ' + data.datum + ': Zaehler in der Mitgliederliste nicht aktualisiert: ' + errSync); }

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
// AUSTRAGEN (oeffentlich, per Link aus der Bestaetigungsmail)
// ═══════════════════════════════════════════════════

function hdDienstTreffer(id) {
  if (!dienstGueltigeId(id)) return null;
  var dsheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(DIENSTE_TAB);
  if (!dsheet) return null;
  var hit = dienstFinde(dsheet, id);
  if (!hit || hit.v[1] !== 'hallendienst') return null;
  hit.sheet = dsheet;
  return hit;
}

function hdDienstInfo(id) {
  var hit = hdDienstTreffer(id);
  if (!hit) return { error: 'Dieser Link ist ungültig.' };
  var info = dienstInfoBasis(hit);
  var d = dienstDatumObj(hit.v[3]);
  var zeit = d ? ZEITEN[d.getDay()] : null;
  info.titel = 'Hallendienst';
  info.wochentag = d ? WOCHENTAGE_LANG[d.getDay()] : '';
  info.zeit = zeit ? zeit.start + ' – ' + zeit.end + ' Uhr' : '';
  return info;
}

function hdDienstAustragen(id) {
  var hit = hdDienstTreffer(id);
  if (!hit) return { error: 'Dieser Link ist ungültig.' };
  var info = dienstInfoBasis(hit);
  if (hit.v[8] === 'ausgetragen') return { ok: true, schonAusgetragen: true };
  if (!info.austragenMoeglich) {
    return { error: info.zuSpaet
      ? 'Austragen ist nur bis ' + info.fristTage + ' Tage vor dem Termin möglich. ' + hdSpaetHinweis()
      : 'Dieser Eintrag ist nicht mehr aktiv.' };
  }

  var datumStr = info.datum;
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (sheet && sheet.getLastRow() >= 2) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (dienstDatumDE(rows[i][0]) !== datumStr) continue;
      // nur leeren, wenn dort noch dieselbe Person steht
      if (dienstNorm(rows[i][2]) === dienstNorm(hit.v[6]) && dienstNorm(rows[i][3]) === dienstNorm(hit.v[5])) {
        sheet.getRange(i + 2, 3, 1, 4).setValues([['', '', '', '']]);
        deleteCalendarEvent(datumStr);
      }
      break;
    }
  }
  dienstSetStatus(hit.sheet, hit.row, 'ausgetragen');
  SpreadsheetApp.flush();
  try { dienstSyncMitgliederliste(); } catch (eSync) { console.error('Zaehler nicht aktualisiert: ' + eSync); }

  // Vorstand informieren – der Termin ist jetzt wieder frei (und ohne
  // Eintragung gibt es an dem Tag keine Oeffnungszeit).
  try {
    var an = getConfigValue('notify_hallendienst_email') || getConfigValue('kontakt_hallendienst_email') || 'boulderhallezugzwang@gmail.com';
    MailApp.sendEmail({
      to: an,
      subject: 'Hallendienst wieder frei: ' + datumStr,
      body: hit.v[6] + ' ' + hit.v[5] + ' hat sich vom Hallendienst am ' + datumStr + ' ausgetragen.\n' +
        'Der Termin ist wieder frei und der Kalendereintrag wurde entfernt.',
      name: 'Hallendienst-Formular'
    });
  } catch (eMail) { console.error('Austragen ' + datumStr + ': Benachrichtigung fehlgeschlagen: ' + eMail); }

  return { ok: true };
}

function hdSpaetHinweis() {
  var tel = (getConfigValue('dienste_kontakt_telefon') || '').toString().trim();
  return tel ? 'Bitte melde dich direkt unter ' + tel + '.' : 'Bitte melde dich direkt beim Vorstand.';
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
      try { dienstMarkiereDienst('hallendienst', datumStr, 'gestrichen'); } catch (eD) { console.error('Dienste-Protokoll: ' + eD); }
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
      try { dienstMarkiereDienst('hallendienst', datumStr, 'gestrichen'); } catch (eD) { console.error('Dienste-Protokoll: ' + eD); }
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
    'Sportliche Grüße,\nBoulderverein Zugzwang e.V.\nNeuhauser Straße 1\n91275 Auerbach i.d.OPf.\n\nhttps://zugzwang-auerbach.de';

  var body = 'Hallo ' + data.vorname + ',\n\n' +
    introText + '\n\n' +
    '  Datum:    ' + wochentag + ', ' + data.datum + '\n' +
    '  Uhrzeit:  ' + zeit.start + ' – ' + zeit.end + ' Uhr\n\n' +
    hinweisText + '\n\n' +
    (data.dienstId
      ? 'Falls du doch nicht kannst: Bis ' + dienstAustragenTage() + ' Tage vor dem Termin kannst du dich hier selbst wieder austragen:\n' +
        '  ' + DIENST_SITE + '/dienst.html?k=h&c=' + data.dienstId + '\n\n'
      : '') +
    'Bei Fragen erreichst du uns unter ' + (getConfigValue('kontakt_hallendienst_email') || 'boulderhallezugzwang@gmail.com') + '.\n\n' +
    signatur;

  MailApp.sendEmail({
    to: data.email,
    subject: 'Hallendienst bestätigt – ' + data.datum,
    body: body,
    name: 'Boulderverein Zugzwang e.V.'
  });
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
// Status: eingetragen | ohne_platz | warteliste | ausgetragen | gestrichen
// Gezaehlt werden "eingetragen" und "ohne_platz", je Kalenderjahr des Dienstes,
// Hallen- und Helferdienste zusammen.

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
  return status === 'eingetragen' || status === 'ohne_platz';
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
