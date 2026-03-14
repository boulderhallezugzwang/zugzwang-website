// ═══════════════════════════════════════════════════════════════
// Google Apps Script – Mitgliederliste API
// Boulderverein Zugzwang e.V.
//
// Separates Script-Projekt, liefert Mitgliederdaten als JSON.
// Passwortgeschützt.
// ═══════════════════════════════════════════════════════════════

// ── PASSWORT HIER ÄNDERN ──
const API_PASSWORD = 'ZugZwang!2026';

function doGet(e) {
  // CORS Headers
  var output;

  try {
    // Passwort prüfen
    var pw = e.parameter.pw || '';
    if (pw !== API_PASSWORD) {
      output = ContentService.createTextOutput(
        JSON.stringify({ error: 'Falsches Passwort' })
      );
      output.setMimeType(ContentService.MimeType.JSON);
      return output;
    }

    // Chip aktualisieren
    var action = e.parameter.action || '';
    if (action === 'updateChip') {
      var result = updateChipInSheet(e.parameter);
      output = ContentService.createTextOutput(JSON.stringify(result));
      output.setMimeType(ContentService.MimeType.JSON);
      return output;
    }

    var sheet = SpreadsheetApp.openById('1HGhz-q7zWtYYFvLr8hnUZ2Yzz8p_p_e5NPYmwokluN8').getActiveSheet();
    var lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      output = ContentService.createTextOutput(
        JSON.stringify({ members: [] })
      );
      output.setMimeType(ContentService.MimeType.JSON);
      return output;
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

    // Spalten-Indizes finden
    var colIdx = {};
    headers.forEach(function(h, i) { colIdx[h] = i; });

    var members = [];
    data.forEach(function(row) {
      var nachname = row[colIdx['Nachname']] || '';
      var vorname = row[colIdx['Vorname']] || '';
      var telefon = row[colIdx['Telefon Mobil']] || '';
      var email = row[colIdx['E-Mail']] || '';
      var status = row[colIdx['Status']] || '';
      var ort = row[colIdx['Ort']] || '';
      var chip = row[colIdx['Chip']] || '';
      var chipnr = row[colIdx['ChipNr.']] || '';

      if (nachname || vorname) {
        members.push({
          nachname: nachname.toString(),
          vorname: vorname.toString(),
          telefon: telefon.toString(),
          email: email.toString(),
          status: status.toString(),
          ort: ort.toString(),
          chip: chip.toString(),
          chipnr: chipnr.toString()
        });
      }
    });

    // Reihenfolge wie im Sheet beibehalten (wird im HTML umgekehrt)

    output = ContentService.createTextOutput(
      JSON.stringify({ members: members, count: members.length })
    );
    output.setMimeType(ContentService.MimeType.JSON);
    return output;

  } catch (error) {
    output = ContentService.createTextOutput(
      JSON.stringify({ error: error.toString() })
    );
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }
}

// ═══════════════════════════════════════════════════
// CHIP-DATEN IM SHEET AKTUALISIEREN
// ═══════════════════════════════════════════════════

function updateChipInSheet(params) {
  var nachname = params.nachname || '';
  var vorname = params.vorname || '';
  var chip = params.chip || '';
  var chipnr = params.chipnr || '';

  var sheet = SpreadsheetApp.openById('1HGhz-q7zWtYYFvLr8hnUZ2Yzz8p_p_e5NPYmwokluN8').getActiveSheet();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var lastRow = sheet.getLastRow();

  // Spalten-Indizes finden
  var colIdx = {};
  headers.forEach(function(h, i) { colIdx[h] = i + 1; }); // 1-basiert für getRange

  var nachnameCol = colIdx['Nachname'];
  var vornameCol = colIdx['Vorname'];
  var chipCol = colIdx['Chip'];
  var chipnrCol = colIdx['ChipNr.'];

  if (!chipCol || !chipnrCol) {
    return { error: 'Chip-Spalten nicht im Sheet gefunden' };
  }

  // Zeile finden und aktualisieren
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][nachnameCol - 1] == nachname && data[i][vornameCol - 1] == vorname) {
      var row = i + 2; // 1-basiert + Header
      sheet.getRange(row, chipCol).setValue(chip);
      sheet.getRange(row, chipnrCol).setValue(chipnr);
      return { ok: true, updated: vorname + ' ' + nachname };
    }
  }

  return { error: 'Mitglied nicht gefunden: ' + vorname + ' ' + nachname };
}
