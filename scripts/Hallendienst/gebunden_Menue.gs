// ═══════════════════════════════════════════════════════════════
// Menue.gs — Einziges Script mit onOpen()
// Alle Menüs für das Spreadsheet: ClubDesk + Hallendienst
// ═══════════════════════════════════════════════════════════════

var HD_SHEET_NAME = 'Hallendienst';
var HD_HEADERS = ['Datum', 'Status', 'Vorname', 'Nachname', 'E-Mail', 'Mobilnr'];
var HD_CALENDAR_ID = '701eb54a002f16ec329ce8f473337455832df22c4bdc86ee12065b780a6e50c6@group.calendar.google.com';

var VERTEILER_GROUP = 'zugzwang-mitglieder@googlegroups.com';

function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu('ClubDesk')
    .addItem('Auswahl als CSV exportieren', 'exportSelectionAsClubDeskCSV')
    .addSeparator()
    .addItem('ClubDesk-Export importieren', 'importClubDeskCSV')
    .addToUi();

  ui.createMenu('Hallendienst')
    .addItem('Termine generieren…', 'hdShowGenerateDialog')
    .addSeparator()
    .addItem('Ausgewählte Termine absagen (mit E-Mail)', 'hdTermineAbsagen')
    .addSeparator()
    .addItem('Vergangene Termine → inaktiv', 'hdHideVergangene')
    .addToUi();

  ui.createMenu('Verteiler')
    .addItem('E-Mail-Verteiler abgleichen…', 'verteilerAbgleichen')
    .addToUi();
}

// ═══════════════════════════════════════════════════
// HALLENDIENST: Dialog
// ═══════════════════════════════════════════════════

function hdShowGenerateDialog() {
  var heute = new Date();
  var in3m = new Date();
  in3m.setMonth(in3m.getMonth() + 3);

  var vonDefault = Utilities.formatDate(heute, 'Europe/Berlin', 'yyyy-MM-dd');
  var bisDefault = Utilities.formatDate(in3m, 'Europe/Berlin', 'yyyy-MM-dd');

  var html = HtmlService.createHtmlOutput(
    '<style>' +
    '  body { font-family: Arial, sans-serif; padding: 16px; }' +
    '  label { display: block; margin-bottom: 4px; font-size: 13px; font-weight: 600; }' +
    '  input[type=date] { width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }' +
    '  .cb-group { display: flex; gap: 16px; margin-bottom: 16px; }' +
    '  .cb-group label { display: flex; align-items: center; gap: 6px; font-weight: 400; cursor: pointer; }' +
    '  .cb-group input[type=checkbox] { width: 18px; height: 18px; cursor: pointer; }' +
    '  .info { background: #e8f5e9; border-radius: 4px; padding: 10px; font-size: 12px; margin-bottom: 16px; color: #2e7d32; }' +
    '  button { padding: 10px 24px; font-size: 14px; font-weight: 700; border: none; border-radius: 4px; cursor: pointer; }' +
    '  .ok { background: #4CAF50; color: white; margin-right: 8px; }' +
    '  .ok:hover { background: #43A047; }' +
    '  .cancel { background: #eee; color: #333; }' +
    '  .cancel:hover { background: #ddd; }' +
    '  #result { margin-top: 12px; font-size: 13px; color: #1565C0; display: none; }' +
    '</style>' +
    '<div class="info">' +
    '  Erzeugt Termine für die gewählten Wochentage.<br>' +
    '  Bereits vorhandene Termine werden übersprungen.' +
    '</div>' +
    '<label>Von:</label>' +
    '<input type="date" id="von" value="' + vonDefault + '">' +
    '<label>Bis:</label>' +
    '<input type="date" id="bis" value="' + bisDefault + '">' +
    '<label>Wochentage:</label>' +
    '<div class="cb-group">' +
    '  <label><input type="checkbox" id="cbMi" checked> Mi (18–21)</label>' +
    '  <label><input type="checkbox" id="cbFr" checked> Fr (18–21)</label>' +
    '  <label><input type="checkbox" id="cbSo" checked> So (14–17)</label>' +
    '</div>' +
    '<div>' +
    '  <button class="ok" onclick="go()">Termine erzeugen</button>' +
    '  <button class="cancel" onclick="google.script.host.close()">Abbrechen</button>' +
    '</div>' +
    '<div id="result"></div>' +
    '<script>' +
    '  function go() {' +
    '    var v = document.getElementById("von").value;' +
    '    var b = document.getElementById("bis").value;' +
    '    if (!v || !b) { alert("Bitte beide Daten ausfüllen."); return; }' +
    '    var tage = [];' +
    '    if (document.getElementById("cbMi").checked) tage.push(3);' +
    '    if (document.getElementById("cbFr").checked) tage.push(5);' +
    '    if (document.getElementById("cbSo").checked) tage.push(0);' +
    '    if (tage.length === 0) { alert("Bitte mindestens einen Wochentag wählen."); return; }' +
    '    document.getElementById("result").style.display = "block";' +
    '    document.getElementById("result").textContent = "Termine werden erstellt…";' +
    '    google.script.run' +
    '      .withSuccessHandler(function(msg) { document.getElementById("result").textContent = msg; })' +
    '      .withFailureHandler(function(e) { document.getElementById("result").textContent = "Fehler: " + e.message; document.getElementById("result").style.color = "red"; })' +
    '      .hdGenerateRange(v, b, tage);' +
    '  }' +
    '</script>'
  ).setWidth(360).setHeight(380);

  SpreadsheetApp.getUi().showModalDialog(html, 'Hallendienst-Termine generieren');
}

// ═══════════════════════════════════════════════════
// HALLENDIENST: Termine erzeugen
// ═══════════════════════════════════════════════════

function hdGenerateRange(vonISO, bisISO, tage) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(HD_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(HD_SHEET_NAME);
    sheet.appendRow(HD_HEADERS);
    sheet.getRange(1, 1, 1, HD_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  // Fallback: wenn keine Tage übergeben → alle drei
  if (!tage || tage.length === 0) tage = [3, 5, 0];

  var existing = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      existing[vals[i][0].toString()] = true;
    }
  }

  var d = new Date(vonISO);
  var end = new Date(bisISO);
  var count = 0;
  var skipped = 0;

  while (d <= end) {
    var dow = d.getDay();
    if (tage.indexOf(dow) >= 0) {
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
  return msg;
}

// ═══════════════════════════════════════════════════
// HALLENDIENST: Termine absagen + E-Mail
// ═══════════════════════════════════════════════════

function hdTermineAbsagen() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(HD_SHEET_NAME);
  if (!sheet) { ui.alert('Sheet "Hallendienst" nicht gefunden.'); return; }

  var rangeList = sheet.getSelection().getActiveRangeList();
  if (!rangeList) { ui.alert('Bitte zuerst Zeilen markieren.'); return; }

  // Markierte Zeilen sammeln
  var zeilen = [];
  var ranges = rangeList.getRanges();
  for (var r = 0; r < ranges.length; r++) {
    var startRow = ranges[r].getRow();
    var numRows = ranges[r].getNumRows();
    for (var i = 0; i < numRows; i++) {
      var row = startRow + i;
      if (row === 1) continue; // Header überspringen
      if (zeilen.indexOf(row) === -1) zeilen.push(row);
    }
  }

  if (zeilen.length === 0) { ui.alert('Bitte mindestens eine Datenzeile markieren.'); return; }

  // Daten der markierten Zeilen laden
  var absagen = [];
  for (var z = 0; z < zeilen.length; z++) {
    var rowNum = zeilen[z];
    var rowData = sheet.getRange(rowNum, 1, 1, 6).getValues()[0];
    var rawDatum = rowData[0];
    var datumStr;
    if (rawDatum instanceof Date) {
      datumStr = ('0' + rawDatum.getDate()).slice(-2) + '.' + ('0' + (rawDatum.getMonth() + 1)).slice(-2) + '.' + rawDatum.getFullYear();
    } else {
      datumStr = rawDatum.toString();
    }
    var status = rowData[1].toString().toLowerCase();
    var vorname = rowData[2].toString().trim();
    var nachname = rowData[3].toString().trim();
    var email = rowData[4].toString().trim();

    if (status !== 'aktiv') continue;

    absagen.push({
      rowNum: rowNum,
      datum: datumStr,
      vorname: vorname,
      nachname: nachname,
      email: email
    });
  }

  if (absagen.length === 0) { ui.alert('Keine aktiven Termine in der Auswahl.'); return; }

  // absagen als JSON im PropertiesService zwischenspeichern
  PropertiesService.getScriptProperties().setProperty('hdAbsagen', JSON.stringify(absagen));

  // HTML-Dialog mit Tabelle und Scrollbar
  var mitMail = absagen.filter(function(a) { return a.email; });
  var ohneMail = absagen.filter(function(a) { return !a.email; });

  var rows = '';
  absagen.forEach(function(a, i) {
    var hatMail = a.email ? 'Ja' : '—';
    var name = a.vorname ? (a.vorname + ' ' + a.nachname) : '(frei)';
    rows += '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + a.datum + '</td>' +
      '<td>' + name + '</td>' +
      '<td>' + (a.email || '—') + '</td>' +
      '<td>' + hatMail + '</td>' +
      '</tr>';
  });

  var html = HtmlService.createHtmlOutput(
    '<style>' +
    '  body { font-family: Arial, sans-serif; padding: 16px; margin: 0; }' +
    '  .summary { background: #fff3e0; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #e65100; margin-bottom: 12px; }' +
    '  .scroll { max-height: 280px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; }' +
    '  table { width: 100%; border-collapse: collapse; font-size: 13px; }' +
    '  th { background: #f5f5f5; position: sticky; top: 0; text-align: left; padding: 8px 10px; border-bottom: 2px solid #ddd; font-weight: 700; }' +
    '  td { padding: 6px 10px; border-bottom: 1px solid #eee; }' +
    '  tr:hover td { background: #f9f9f9; }' +
    '  .buttons { margin-top: 14px; display: flex; gap: 8px; }' +
    '  button { padding: 10px 24px; font-size: 14px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; }' +
    '  .btn-danger { background: #e53935; color: white; }' +
    '  .btn-danger:hover { background: #c62828; }' +
    '  .btn-cancel { background: #eee; color: #333; }' +
    '  .btn-cancel:hover { background: #ddd; }' +
    '  #status { margin-top: 12px; font-size: 13px; display: none; }' +
    '</style>' +
    '<div class="summary">' +
    '  <b>' + absagen.length + ' Termin(e)</b> werden abgesagt.' +
    (mitMail.length > 0 ? ' <b>' + mitMail.length + ' Absage-Mail(s)</b> werden verschickt.' : '') +
    (ohneMail.length > 0 ? ' ' + ohneMail.length + ' ohne Eintragung.' : '') +
    '</div>' +
    '<div class="scroll">' +
    '  <table>' +
    '    <tr><th>#</th><th>Datum</th><th>Name</th><th>E-Mail</th><th>Mail?</th></tr>' +
    rows +
    '  </table>' +
    '</div>' +
    '<div class="buttons">' +
    '  <button class="btn-danger" onclick="absagen()">Termine absagen</button>' +
    '  <button class="btn-cancel" onclick="google.script.host.close()">Abbrechen</button>' +
    '</div>' +
    '<div id="status"></div>' +
    '<script>' +
    '  function absagen() {' +
    '    document.getElementById("status").style.display = "block";' +
    '    document.getElementById("status").textContent = "Termine werden abgesagt…";' +
    '    document.getElementById("status").style.color = "#1565C0";' +
    '    google.script.run' +
    '      .withSuccessHandler(function(msg) {' +
    '        document.getElementById("status").innerHTML = "<b style=color:green>" + msg + "</b>";' +
    '      })' +
    '      .withFailureHandler(function(e) {' +
    '        document.getElementById("status").innerHTML = "<b style=color:red>Fehler: " + e.message + "</b>";' +
    '      })' +
    '      .hdAbsagenAusfuehren();' +
    '  }' +
    '</script>'
  ).setWidth(560).setHeight(460);

  ui.showModalDialog(html, 'Hallendienst — Termine absagen');
}

function hdAbsagenAusfuehren() {
  var json = PropertiesService.getScriptProperties().getProperty('hdAbsagen');
  if (!json) return 'Keine Daten gefunden.';

  var absagen = JSON.parse(json);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(HD_SHEET_NAME);
  if (!sheet) return 'Sheet nicht gefunden.';

  var mailCount = 0;
  for (var a = 0; a < absagen.length; a++) {
    var termin = absagen[a];
    sheet.getRange(termin.rowNum, 2).setValue('inaktiv');

    if (termin.email) {
      hdSendeAbsageMail(termin);
      mailCount++;
    }

    hdLoescheKalenderEintrag(termin.datum);
  }

  PropertiesService.getScriptProperties().deleteProperty('hdAbsagen');
  return absagen.length + ' Termin(e) abgesagt. ' + mailCount + ' Absage-Mail(s) verschickt. Kalendereinträge entfernt.';
}

function hdLoescheKalenderEintrag(datumStr) {
  var cal = CalendarApp.getCalendarById(HD_CALENDAR_ID);
  if (!cal) return;

  var parts = datumStr.split('.');
  if (parts.length !== 3) return;
  var datum = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));

  var events = cal.getEventsForDay(datum);
  for (var i = 0; i < events.length; i++) {
    if (events[i].getTitle() === 'Oeffnungszeiten') {
      events[i].deleteEvent();
    }
  }
}

function hdSendeAbsageMail(termin) {
  var body = 'Hallo ' + termin.vorname + ',\n\n' +
    'leider müssen wir dir mitteilen, dass der Hallendienst am ' + termin.datum + ' ausfällt.\n\n' +
    'Deine Eintragung für diesen Termin wurde storniert.\n\n' +
    'Falls du möchtest, kannst du dich gerne für einen anderen Termin eintragen:\n' +
    'https://boulderhallezugzwang.github.io/zugzwang-website/verein.html#hallendienst\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'Neuhauser Straße 1\n' +
    '91275 Auerbach i.d.OPf.';

  MailApp.sendEmail({
    to: termin.email,
    subject: 'Hallendienst am ' + termin.datum + ' entfällt',
    body: body,
    name: 'Boulderverein Zugzwang e.V.'
  });
}

// ═══════════════════════════════════════════════════
// HALLENDIENST: Vergangene → inaktiv
// ═══════════════════════════════════════════════════

function hdHideVergangene() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(HD_SHEET_NAME);
  if (!sheet) { SpreadsheetApp.getUi().alert('Sheet "Hallendienst" nicht gefunden.'); return; }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { SpreadsheetApp.getUi().alert('Keine Termine vorhanden.'); return; }

  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var heute = new Date();
  heute.setHours(0, 0, 0, 0);
  var count = 0;

  for (var i = 0; i < data.length; i++) {
    var parts = data[i][0].toString().split('.');
    if (parts.length !== 3) continue;
    var datum = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    if (datum < heute && data[i][1].toString().toLowerCase() === 'aktiv') {
      sheet.getRange(i + 2, 2).setValue('inaktiv');
      count++;
    }
  }

  SpreadsheetApp.getUi().alert(count + ' vergangene Termine auf "inaktiv" gesetzt.');
}

// ═══════════════════════════════════════════════════
// VERTEILER: E-Mail-Abgleich mit Google Group
// ═══════════════════════════════════════════════════

/**
 * Liest alle aktiven Mitglieder-E-Mails aus dem ersten Sheet,
 * vergleicht mit dem letzten Sync-Stand und zeigt einen Dialog
 * mit hinzuzufügenden und zu entfernenden Adressen.
 */
function verteilerAbgleichen() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheets()[0]; // Erstes Sheet = Mitgliederliste

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('Keine Mitglieder gefunden.');
    return;
  }

  // Spalte D = E-Mail (4), Spalte G = Status (7)
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();

  // Aktive Mitglieder-E-Mails sammeln (unique, lowercase)
  var emailSet = {};
  for (var i = 0; i < data.length; i++) {
    var status = data[i][6].toString().toLowerCase(); // Spalte G
    var email = data[i][3].toString().trim().toLowerCase(); // Spalte D

    // Nur aktive Mitglieder (nicht gekündigt, nicht leer)
    if (!email) continue;
    if (status.indexOf('gekündigt') !== -1) continue;
    if (status.indexOf('inaktiv') !== -1) continue;

    emailSet[email] = true;
  }

  var aktuelleEmails = Object.keys(emailSet).sort();

  // Letzten Sync-Stand laden
  var props = PropertiesService.getScriptProperties();
  var letzterSync = props.getProperty('verteiler_emails');
  var letzteEmails = letzterSync ? JSON.parse(letzterSync) : [];

  // Differenz berechnen
  var letzteSet = {};
  letzteEmails.forEach(function(e) { letzteSet[e] = true; });

  var hinzufuegen = aktuelleEmails.filter(function(e) { return !letzteSet[e]; });
  var entfernen = letzteEmails.filter(function(e) { return !emailSet[e]; });

  // Dialog anzeigen
  verteilerZeigeDialog(aktuelleEmails, hinzufuegen, entfernen, letzteEmails.length === 0);
}

function verteilerZeigeDialog(alleEmails, hinzufuegen, entfernen, erstesSync) {
  var html = HtmlService.createHtmlOutput(
    '<style>' +
    '  body { font-family: Arial, sans-serif; padding: 16px; margin: 0; }' +
    '  .info { background: #e3f2fd; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #1565c0; margin-bottom: 12px; }' +
    '  .warn { background: #fff3e0; color: #e65100; }' +
    '  .ok { background: #e8f5e9; color: #2e7d32; }' +
    '  h3 { margin: 12px 0 6px; font-size: 14px; }' +
    '  .scroll { max-height: 180px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; padding: 8px; font-size: 12px; font-family: monospace; background: #fafafa; margin-bottom: 12px; }' +
    '  .empty { color: #999; font-style: italic; font-family: Arial; }' +
    '  .count { font-size: 12px; color: #666; margin-bottom: 4px; }' +
    '  button { padding: 10px 20px; font-size: 14px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; margin-right: 8px; }' +
    '  .btn-ok { background: #4CAF50; color: white; }' +
    '  .btn-ok:hover { background: #43A047; }' +
    '  .btn-copy { background: #1976D2; color: white; }' +
    '  .btn-copy:hover { background: #1565C0; }' +
    '  .btn-cancel { background: #eee; color: #333; }' +
    '  .btn-cancel:hover { background: #ddd; }' +
    '  .copied { font-size: 12px; color: #2e7d32; margin-left: 8px; display: none; }' +
    '  #status { margin-top: 12px; font-size: 13px; display: none; }' +
    '  textarea { width: 100%; height: 1px; opacity: 0; position: absolute; }' +
    '</style>' +

    '<div class="info">' +
    '  Google Group: <b>' + VERTEILER_GROUP + '</b><br>' +
    '  Aktive Mitglieder mit E-Mail: <b>' + alleEmails.length + '</b>' +
    '</div>' +

    // ── Hinzufügen ──
    (hinzufuegen.length > 0 ?
      '<h3>➕ Hinzufügen (' + hinzufuegen.length + ')</h3>' +
      '<div class="scroll" id="addList">' + hinzufuegen.join('<br>') + '</div>' +
      '<button class="btn-copy" onclick="copyList(\'add\')">Kopieren</button>' +
      '<span class="copied" id="addCopied">✓ Kopiert!</span><br><br>'
    : (erstesSync ?
      '<h3>Alle E-Mails (' + alleEmails.length + ')</h3>' +
      '<p style="font-size:12px;color:#666;">Erster Abgleich — alle Adressen werden angezeigt.</p>' +
      '<div class="scroll" id="addList">' + alleEmails.join('<br>') + '</div>' +
      '<button class="btn-copy" onclick="copyList(\'add\')">Alle kopieren</button>' +
      '<span class="copied" id="addCopied">✓ Kopiert!</span><br><br>'
    :
      '<div class="info ok">Keine neuen E-Mails hinzuzufügen.</div>'
    )) +

    // ── Entfernen ──
    (entfernen.length > 0 ?
      '<h3>➖ Entfernen (' + entfernen.length + ')</h3>' +
      '<div class="scroll" id="removeList">' + entfernen.join('<br>') + '</div>' +
      '<button class="btn-copy" onclick="copyList(\'remove\')">Kopieren</button>' +
      '<span class="copied" id="removeCopied">✓ Kopiert!</span><br><br>'
    : (!erstesSync ?
      '<div class="info ok">Keine E-Mails zu entfernen.</div>'
    : '')) +

    '<hr style="margin: 16px 0; border: none; border-top: 1px solid #eee;">' +

    '<p style="font-size:12px;color:#666;">Nach dem Abgleich in Google Groups auf <b>„Sync speichern"</b> klicken, damit der nächste Abgleich nur noch Änderungen zeigt.</p>' +

    '<button class="btn-ok" onclick="saveSync()">Sync speichern</button>' +
    '<button class="btn-cancel" onclick="google.script.host.close()">Schließen</button>' +
    '<div id="status"></div>' +

    '<textarea id="copyArea"></textarea>' +

    '<script>' +
    '  var emailsToAdd = ' + JSON.stringify(hinzufuegen.length > 0 ? hinzufuegen : alleEmails) + ';' +
    '  var emailsToRemove = ' + JSON.stringify(entfernen) + ';' +
    '' +
    '  function copyList(type) {' +
    '    var emails = type === "add" ? emailsToAdd : emailsToRemove;' +
    '    var text = emails.join("\\n");' +
    '    var ta = document.getElementById("copyArea");' +
    '    ta.style.height = "40px"; ta.style.opacity = "1";' +
    '    ta.value = text;' +
    '    ta.select();' +
    '    document.execCommand("copy");' +
    '    ta.style.height = "1px"; ta.style.opacity = "0";' +
    '    var id = type === "add" ? "addCopied" : "removeCopied";' +
    '    document.getElementById(id).style.display = "inline";' +
    '    setTimeout(function() { document.getElementById(id).style.display = "none"; }, 2000);' +
    '  }' +
    '' +
    '  function saveSync() {' +
    '    document.getElementById("status").style.display = "block";' +
    '    document.getElementById("status").textContent = "Wird gespeichert…";' +
    '    document.getElementById("status").style.color = "#1565C0";' +
    '    google.script.run' +
    '      .withSuccessHandler(function(msg) {' +
    '        document.getElementById("status").innerHTML = "<b style=color:green>" + msg + "</b>";' +
    '      })' +
    '      .withFailureHandler(function(e) {' +
    '        document.getElementById("status").innerHTML = "<b style=color:red>Fehler: " + e.message + "</b>";' +
    '      })' +
    '      .verteilerSyncSpeichern();' +
    '  }' +
    '</script>'
  ).setWidth(520).setHeight(560);

  SpreadsheetApp.getUi().showModalDialog(html, 'E-Mail-Verteiler abgleichen');
}

/**
 * Speichert den aktuellen Stand der aktiven E-Mails als Referenz
 * für den nächsten Abgleich.
 */
function verteilerSyncSpeichern() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheets()[0];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'Keine Daten.';

  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var emailSet = {};

  for (var i = 0; i < data.length; i++) {
    var status = data[i][6].toString().toLowerCase();
    var email = data[i][3].toString().trim().toLowerCase();

    if (!email) continue;
    if (status.indexOf('gekündigt') !== -1) continue;
    if (status.indexOf('inaktiv') !== -1) continue;

    emailSet[email] = true;
  }

  var emails = Object.keys(emailSet).sort();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('verteiler_emails', JSON.stringify(emails));

  var now = new Date();
  var syncDatum = ('0' + now.getDate()).slice(-2) + '.' +
    ('0' + (now.getMonth() + 1)).slice(-2) + '.' +
    now.getFullYear() + ', ' +
    ('0' + now.getHours()).slice(-2) + ':' +
    ('0' + now.getMinutes()).slice(-2);

  props.setProperty('verteiler_letzer_sync', syncDatum);

  return '✓ Sync gespeichert (' + emails.length + ' E-Mails, ' + syncDatum + ')';
}
