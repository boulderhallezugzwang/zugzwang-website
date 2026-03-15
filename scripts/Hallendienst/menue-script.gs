// ═══════════════════════════════════════════════════════════════
// Menü-Script (gebunden an das Spreadsheet)
//
// Bündelt alle Menüs: ClubDesk + Hallendienst
//
// In Mitgliedsantrag.gs die Funktion onOpen() LÖSCHEN
// (die ClubDesk-Funktionen wie exportSelectionAsClubDeskCSV
//  etc. dort drin lassen — nur onOpen raus!)
// ═══════════════════════════════════════════════════════════════

var HD_SHEET_NAME = 'Hallendienst';
var HD_HEADERS = ['Datum', 'Status', 'Vorname', 'Nachname', 'E-Mail', 'Mobilnr'];

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
    .addItem('Vergangene Termine → inaktiv', 'hdHideVergangene')
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
    '  input { width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }' +
    '  .info { background: #e8f5e9; border-radius: 4px; padding: 10px; font-size: 12px; margin-bottom: 16px; color: #2e7d32; }' +
    '  button { padding: 10px 24px; font-size: 14px; font-weight: 700; border: none; border-radius: 4px; cursor: pointer; }' +
    '  .ok { background: #4CAF50; color: white; margin-right: 8px; }' +
    '  .ok:hover { background: #43A047; }' +
    '  .cancel { background: #eee; color: #333; }' +
    '  .cancel:hover { background: #ddd; }' +
    '  #result { margin-top: 12px; font-size: 13px; color: #1565C0; display: none; }' +
    '</style>' +
    '<div class="info">' +
    '  Erzeugt Termine für <b>Mi (18–21)</b>, <b>Fr (18–21)</b> und <b>So (14–17)</b>.<br>' +
    '  Bereits vorhandene Termine werden übersprungen.' +
    '</div>' +
    '<label>Von:</label>' +
    '<input type="date" id="von" value="' + vonDefault + '">' +
    '<label>Bis:</label>' +
    '<input type="date" id="bis" value="' + bisDefault + '">' +
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
    '    document.getElementById("result").style.display = "block";' +
    '    document.getElementById("result").textContent = "Termine werden erstellt…";' +
    '    google.script.run' +
    '      .withSuccessHandler(function(msg) { document.getElementById("result").textContent = msg; })' +
    '      .withFailureHandler(function(e) { document.getElementById("result").textContent = "Fehler: " + e.message; document.getElementById("result").style.color = "red"; })' +
    '      .hdGenerateRange(v, b);' +
    '  }' +
    '</script>'
  ).setWidth(360).setHeight(330);

  SpreadsheetApp.getUi().showModalDialog(html, 'Hallendienst-Termine generieren');
}

// ═══════════════════════════════════════════════════
// HALLENDIENST: Termine erzeugen
// ═══════════════════════════════════════════════════

function hdGenerateRange(vonISO, bisISO) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(HD_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(HD_SHEET_NAME);
    sheet.appendRow(HD_HEADERS);
    sheet.getRange(1, 1, 1, HD_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

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
    if (dow === 3 || dow === 5 || dow === 0) {
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
