// ═══════════════════════════════════════════════════════════════
// Google Apps Script – ClubDesk CSV-Export/-Import (Tabellen-Menü)
// Boulderverein Zugzwang e.V.
//
// Der Mitgliedsantrag selbst wird in Mitgliederliste.gs verarbeitet
// (handleMitgliedsantrag). Die frueher hier liegende zweite doPost-/onOpen-
// Kopie wurde entfernt: zwei gleichnamige Funktionen in einem Projekt
// ueberschreiben sich je nach Dateireihenfolge gegenseitig.
//
// Sheet-Format: Exakt passend für ClubDesk CSV-Import
// Semikolon-getrennt, deutsches Datumsformat
// ═══════════════════════════════════════════════════════════════

// VEREIN_EMAIL_FALLBACK und getConfigValue() sind in mitgliederliste-script.gs definiert
// (gebundene Scripts teilen den gleichen Namespace)

// ClubDesk-Spalten (exakt wie beim Import erwartet)
const HEADERS = [
  'Nachname', 'Vorname', 'Ort', 'E-Mail', 'Geburtsdatum',
  'Mandatsreferenz', 'Status', 'Eintritt',
  'Zahlungspflichtiges Mitglied', 'Adresse', 'PLZ', 'Telefon Mobil',
  'Bemerkungen', 'IBAN', 'BIC', 'Kontoinhaber',
  'SEPA-Lastschrift erlauben', 'Mandat Unterschriftsdatum', 'Lastschriftart',
  'Chip', 'ChipNr.'
];

// ═══════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════

// Datum YYYY-MM-DD → DD.MM.YYYY
function toDe(isoDate) {
  if (!isoDate) return '';
  var parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate; // schon deutsches Format?
  return parts[2] + '.' + parts[1] + '.' + parts[0];
}

// Deutsches Datum aus Zeitstempel
function todayDe() {
  var d = new Date();
  var dd = ('0' + d.getDate()).slice(-2);
  var mm = ('0' + (d.getMonth() + 1)).slice(-2);
  return dd + '.' + mm + '.' + d.getFullYear();
}

// Mandatsreferenz generieren: ZZ-YYYY-NNNN (z.B. ZZ-2026-0042)
function generateMandatsreferenz(sheet) {
  var year = new Date().getFullYear();
  var prefix = 'ZZ-' + year + '-';

  // Höchste existierende Nummer für dieses Jahr finden
  var lastRow = sheet.getLastRow();
  var maxNum = 0;

  if (lastRow > 1) {
    var refs = sheet.getRange(2, 6, lastRow - 1, 1).getValues(); // Spalte F = Mandatsreferenz
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

// ═══════════════════════════════════════════════════
// HAUPTFUNKTION
// ═══════════════════════════════════════════════════


// ═══════════════════════════════════════════════════
// E-MAILS
// ═══════════════════════════════════════════════════



// ═══════════════════════════════════════════════════
// CLUBDESK CSV-EXPORT (Auswahl → Download)
// ═══════════════════════════════════════════════════


function exportSelectionAsClubDeskCSV() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var rangeList = sheet.getSelection().getActiveRangeList();

  if (!rangeList) {
    ui.alert('Bitte zuerst Zeilen markieren.');
    return;
  }

  // Header immer mitnehmen (Zeile 1)
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var numCols = sheet.getLastColumn();

  // Alle ausgewählten Zeilen sammeln (auch nicht-zusammenhängende)
  var data = [];
  var ranges = rangeList.getRanges();
  for (var r = 0; r < ranges.length; r++) {
    var startRow = ranges[r].getRow();
    var numRows = ranges[r].getNumRows();
    for (var i = 0; i < numRows; i++) {
      var rowNum = startRow + i;
      if (rowNum === 1) continue; // Header überspringen
      var rowData = sheet.getRange(rowNum, 1, 1, numCols).getValues()[0];
      data.push(rowData);
    }
  }

  if (data.length === 0) {
    ui.alert('Bitte mindestens eine Datenzeile markieren (nicht nur den Header).');
    return;
  }

  // CSV bauen: Semikolon-getrennt
  var lines = [];
  lines.push(csvLine(headers));
  data.forEach(function(row) {
    lines.push(csvLine(row));
  });

  var csvContent = lines.join('\r\n');

  // Als Download-Dialog anzeigen
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
    '<textarea id="csvdata" style="display:none">' + escapeHtml(csvContent) + '</textarea>' +
    '<p>Download startet automatisch...</p>' +
    '<p><a href="#" onclick="downloadCSV()">Falls nicht, hier klicken</a></p>' +
    '</body></html>'
  )
  .setWidth(300)
  .setHeight(120);

  ui.showModalDialog(html, 'ClubDesk CSV-Export');
}

function csvLine(row) {
  return row.map(function(cell) {
    if (cell === null || cell === undefined) return '';
    // Date-Objekte → DD.MM.YYYY
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

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════
// CLUBDESK CSV-IMPORT (Datei hochladen → Zeilen anfügen)
// ═══════════════════════════════════════════════════

function importClubDeskCSV() {
  var ui = SpreadsheetApp.getUi();

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
    '      .withSuccessHandler(function(msg) { var st = document.getElementById("status"); st.textContent = msg; st.style.color = "green"; st.style.fontWeight = "bold"; })' +
    '      .withFailureHandler(function(err) { var st = document.getElementById("status"); st.textContent = "Fehler: " + err.message; st.style.color = "red"; st.style.fontWeight = "bold"; })' +
    '      .processClubDeskImport(e.target.result);' +
    '  };' +
    '  reader.readAsText(file, "iso-8859-1");' +
    '}' +
    '</script></body></html>'
  )
  .setWidth(420)
  .setHeight(240);

  ui.showModalDialog(html, 'ClubDesk CSV-Import');
}

function processClubDeskImport(csvText) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Header anlegen falls Sheet leer
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  // CSV parsen (Semikolon-getrennt, Anführungszeichen)
  var rows = parseCSV(csvText, ';');
  if (rows.length < 2) return 'Keine Daten in der Datei gefunden.';

  var csvHeaders = rows[0];

  // Spalten-Index-Map für ClubDesk-Header
  var colIdx = {};
  csvHeaders.forEach(function(h, i) {
    colIdx[h.replace(/^\"|\"$/g, '').trim()] = i;
  });

  // Mapping: ClubDesk-Spalte → unsere Sheet-Spalte
  var mapping = {
    'Nachname': 'Nachname',
    'Vorname': 'Vorname',
    'Ort': 'Ort',
    'E-Mail': 'E-Mail',
    'Geburtsdatum': 'Geburtsdatum',
    'Mandatsreferenz': 'Mandatsreferenz',
    'Status': 'Status',
    'Eintritt': 'Eintritt',
    'Zahlungspflichtiges Mitglied': 'Zahlungspflichtiges Mitglied',
    'Adresse': 'Adresse',
    'PLZ': 'PLZ',
    'Telefon Mobil': 'Telefon Mobil',
    'Bemerkungen': 'Bemerkungen',
    'IBAN': 'IBAN',
    'BIC': 'BIC',
    'Kontoinhaber': 'Kontoinhaber',
    'SEPA-Lastschrift erlauben': 'SEPA-Lastschrift erlauben',
    'Mandat Unterschriftsdatum': 'Mandat Unterschriftsdatum',
    'Lastschriftart': 'Lastschriftart',
    'Chip': 'Chip',
    'ChipNr.': 'ChipNr.'
  };

  var count = 0;
  for (var r = 1; r < rows.length; r++) {
    var csvRow = rows[r];
    if (!csvRow || csvRow.length < 2) continue;

    var sheetRow = HEADERS.map(function(sheetCol) {
      var srcCol = mapping[sheetCol];
      var idx = colIdx[srcCol];
      if (idx === undefined) return '';
      var val = csvRow[idx] || '';
      // Anführungszeichen entfernen
      val = val.replace(/^\"|\"$/g, '').trim();
      return val;
    });

    // Nur hinzufügen wenn mindestens Nachname oder Vorname vorhanden
    if (sheetRow[0] || sheetRow[1]) {
      sheet.appendRow(sheetRow);
      count++;
    }
  }

  return '✓ ' + count + ' Mitglieder importiert.';
}

// Einfacher CSV-Parser mit Unterstützung für Anführungszeichen
function parseCSV(text, delimiter) {
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
        i++; // Skip escaped quote
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

  // Letzte Zeile
  if (field || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }

  return rows;
}

// ═══════════════════════════════════════════════════
// TEST
// ═══════════════════════════════════════════════════
