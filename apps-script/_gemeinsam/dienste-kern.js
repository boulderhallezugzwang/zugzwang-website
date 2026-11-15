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
