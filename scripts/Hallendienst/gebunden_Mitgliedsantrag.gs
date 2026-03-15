// ═══════════════════════════════════════════════════════════════
// Mitgliedsantrag.gs — ClubDesk Export/Import Funktionen
// (Kein onOpen, kein doPost — diese laufen in separaten Web-Apps)
// ═══════════════════════════════════════════════════════════════

var MA_HEADERS = [
  'Nachname', 'Vorname', 'Ort', 'E-Mail', 'Geburtsdatum',
  'Mandatsreferenz', 'Status', 'Eintritt',
  'Zahlungspflichtiges Mitglied', 'Adresse', 'PLZ', 'Telefon Mobil',
  'Bemerkungen', 'IBAN', 'BIC', 'Kontoinhaber',
  'SEPA-Lastschrift erlauben', 'Mandat Unterschriftsdatum', 'Lastschriftart',
  'Chip', 'ChipNr.'
];

// ═══════════════════════════════════════════════════
// CLUBDESK CSV-EXPORT
// ═══════════════════════════════════════════════════

function exportSelectionAsClubDeskCSV() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var rangeList = sheet.getSelection().getActiveRangeList();

  if (!rangeList) {
    ui.alert('Bitte zuerst Zeilen markieren.');
    return;
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var numCols = sheet.getLastColumn();

  var data = [];
  var ranges = rangeList.getRanges();
  for (var r = 0; r < ranges.length; r++) {
    var startRow = ranges[r].getRow();
    var numRows = ranges[r].getNumRows();
    for (var i = 0; i < numRows; i++) {
      var rowNum = startRow + i;
      if (rowNum === 1) continue;
      var rowData = sheet.getRange(rowNum, 1, 1, numCols).getValues()[0];
      data.push(rowData);
    }
  }

  if (data.length === 0) {
    ui.alert('Bitte mindestens eine Datenzeile markieren (nicht nur den Header).');
    return;
  }

  var lines = [];
  lines.push(maCsvLine(headers));
  data.forEach(function(row) {
    lines.push(maCsvLine(row));
  });

  var csvContent = lines.join('\r\n');

  var html = HtmlService.createHtmlOutput(
    '<html><head><meta charset="iso-8859-1">' +
    '<script>' +
    'function downloadCSV() {' +
    '  var csv = document.getElementById("csvdata").value;' +
    '  var blob = new Blob([csv], {type: "text/csv;charset=iso-8859-1"});' +
    '  var a = document.createElement("a");' +
    '  a.href = URL.createObjectURL(blob);' +
    '  a.download = "clubdesk_import.csv";' +
    '  a.click();' +
    '  google.script.host.close();' +
    '}' +
    '</script></head><body onload="downloadCSV()">' +
    '<textarea id="csvdata" style="display:none">' + maEscapeHtml(csvContent) + '</textarea>' +
    '<p>Download startet automatisch...</p>' +
    '<p><a href="#" onclick="downloadCSV()">Falls nicht, hier klicken</a></p>' +
    '</body></html>'
  )
  .setWidth(300)
  .setHeight(120);

  ui.showModalDialog(html, 'ClubDesk CSV-Export');
}

// ═══════════════════════════════════════════════════
// CLUBDESK CSV-IMPORT
// ═══════════════════════════════════════════════════

function importClubDeskCSV() {
  var html = HtmlService.createHtmlOutput(
    '<html><head>' +
    '<style>' +
    'body { font-family: Arial, sans-serif; padding: 16px; }' +
    'h3 { margin-top: 0; }' +
    'input[type=file] { margin: 12px 0; }' +
    'button { padding: 8px 20px; background: #2a7d6e; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }' +
    'button:hover { background: #1f5f54; }' +
    '#status { margin-top: 12px; font-size: 13px; color: #333; }' +
    '</style>' +
    '</head><body>' +
    '<h3>ClubDesk-Export importieren</h3>' +
    '<p style="font-size:13px;color:#666;">CSV-Datei aus ClubDesk hochladen. Die Daten werden unten ans Sheet angefügt.</p>' +
    '<input type="file" id="csvFile" accept=".csv">' +
    '<br><button onclick="doImport()">Importieren</button>' +
    '<div id="status"></div>' +
    '<script>' +
    'function doImport() {' +
    '  var file = document.getElementById("csvFile").files[0];' +
    '  if (!file) { document.getElementById("status").textContent = "Bitte Datei auswählen."; return; }' +
    '  document.getElementById("status").textContent = "Wird importiert...";' +
    '  var reader = new FileReader();' +
    '  reader.onload = function(e) {' +
    '    google.script.run' +
    '      .withSuccessHandler(function(msg) { document.getElementById("status").innerHTML = "<b style=color:green>" + msg + "</b>"; })' +
    '      .withFailureHandler(function(err) { document.getElementById("status").innerHTML = "<b style=color:red>Fehler: " + err.message + "</b>"; })' +
    '      .processClubDeskImport(e.target.result);' +
    '  };' +
    '  reader.readAsText(file, "iso-8859-1");' +
    '}' +
    '</script></body></html>'
  )
  .setWidth(420)
  .setHeight(240);

  SpreadsheetApp.getUi().showModalDialog(html, 'ClubDesk CSV-Import');
}

function processClubDeskImport(csvText) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(MA_HEADERS);
    sheet.getRange(1, 1, 1, MA_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var rows = maParseCSV(csvText, ';');
  if (rows.length < 2) return 'Keine Daten in der Datei gefunden.';

  var csvHeaders = rows[0];
  var colIdx = {};
  csvHeaders.forEach(function(h, i) {
    colIdx[h.replace(/^\"|\"$/g, '').trim()] = i;
  });

  var count = 0;
  for (var r = 1; r < rows.length; r++) {
    var csvRow = rows[r];
    if (!csvRow || csvRow.length < 2) continue;

    var sheetRow = MA_HEADERS.map(function(sheetCol) {
      var idx = colIdx[sheetCol];
      if (idx === undefined) return '';
      var val = csvRow[idx] || '';
      return val.replace(/^\"|\"$/g, '').trim();
    });

    if (sheetRow[0] || sheetRow[1]) {
      sheet.appendRow(sheetRow);
      count++;
    }
  }

  return '✓ ' + count + ' Mitglieder importiert.';
}

// ═══════════════════════════════════════════════════
// HILFSFUNKTIONEN (mit ma-Prefix um Konflikte zu vermeiden)
// ═══════════════════════════════════════════════════

function maCsvLine(row) {
  return row.map(function(cell) {
    if (cell === null || cell === undefined) return '';
    if (cell instanceof Date) {
      var dd = ('0' + cell.getDate()).slice(-2);
      var mm = ('0' + (cell.getMonth() + 1)).slice(-2);
      return dd + '.' + mm + '.' + cell.getFullYear();
    }
    var val = cell.toString();
    if (val.indexOf(';') >= 0 || val.indexOf('"') >= 0 || val.indexOf('\n') >= 0) {
      val = '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  }).join(';');
}

function maEscapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function maParseCSV(text, delimiter) {
  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;

  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    var next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        row.push(field);
        field = '';
      } else if (c === '\r') {
        // Skip
      } else if (c === '\n') {
        row.push(field);
        field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }

  return rows;
}
