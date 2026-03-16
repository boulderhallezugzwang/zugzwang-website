// ═══════════════════════════════════════════════════════════════
// Google Apps Script – Haftungsausschluss Backend
// Boulderverein Zugzwang e.V.
//
// 1. Speichert Haftungsausschlüsse im Tab "Haftungsausschlüsse"
// 2. Generiert ein PDF mit dem Waiver-Text + Unterschriftsdaten
// 3. Speichert das PDF in einem Google Drive Ordner
// 4. Sendet Bestätigungsmail mit PDF-Anhang
//
// ⚠️ Als EIGENES Projekt anlegen (script.google.com → Neues Projekt)
//    Dann als Web-App deployen (Ausführen als: Ich, Zugriff: Jeder)
//
// ⚠️ ORDNER-ID anpassen! Einen Ordner "Haftungsausschlüsse" in
//    Google Drive anlegen und die ID hier eintragen.
// ═══════════════════════════════════════════════════════════════

const SPREADSHEET_ID = '1HGhz-q7zWtYYFvLr8hnUZ2Yzz8p_p_e5NPYmwokluN8';
const SHEET_NAME = 'Haftungsausschlüsse';
const PDF_FOLDER_ID = '1ntwXqyKsHCf1Eea-9LcR0QMy2UIpd5gJ'; // ← Google Drive Ordner-ID

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

function sendNotifyHaftung(typ, name, datum) {
  var aktiv = getConfigValue('notify_haftung_aktiv');
  if (aktiv !== 'ja') return;
  var email = getConfigValue('notify_haftung_email');
  if (!email) return;
  MailApp.sendEmail({
    to: email,
    subject: 'Neuer Haftungsausschluss: ' + name,
    body: 'Ein neuer Haftungsausschluss ist eingegangen:\n\n' +
      '  Typ:    ' + typ + '\n' +
      '  Name:   ' + name + '\n' +
      '  Datum:  ' + datum + '\n',
    name: 'Haftungsausschluss-Formular'
  });
}

const HEADERS_ADULT = [
  'Vorname', 'Nachname', 'Geburtsdatum', 'E-Mail', 'Datum', 'Typ', 'PDF-Link'
];

const HEADERS_MINOR = [
  'Erziehungsberechtigter', 'E-Mail', 'Kinder', 'Datum', 'Typ', 'PDF-Link'
];

// Einheitliche Spalten für beide Typen
const HEADERS = [
  'Typ', 'Vorname/Erziehungsberechtigter', 'Nachname', 'Geburtsdatum',
  'E-Mail', 'Adresse', 'Kinder', 'Datum', 'PDF-Link'
];

// ═══════════════════════════════════════════════════
// WAIVER TEXT
// ═══════════════════════════════════════════════════

const WAIVER_TEXT = [
  'Mir ist bewusst, dass Klettern und Bouldern Risikosportarten sind, bei denen Fehler und mögliche Stürze schwerwiegende Folgen haben können. Ich verfüge über die nötige Disziplin, gesunde Selbsteinschätzung und Risikowahrnehmung um diesen Sport verantwortungsvoll auszuüben.',
  'Ich versichere hiermit, die Benutzerordnung und die Hallenregeln, die u.a. am Eingang oder in der Boulderhalle einzusehen sind, in ihrer neuesten Fassung gelesen und verstanden zu haben. Diese erkenne ich an und werde mich an sie halten.',
  'Ich werde mich an die Anweisungen des Hallenpersonals halten. Bei Unsicherheiten, Fragen oder beim Erkennen von Mängeln an der Anlage werde ich mich an das Personal wenden.',
  'Ich bekräftige hiermit ausdrücklich, dass ich die Boulderhalle Zugzwang eigenverantwortlich und auf eigenes Risiko nutze. Für selbstverschuldete Personen- und Sachschäden hafte ich persönlich, nicht der Betreiber der Boulderhalle Zugzwang.',
  'Die Haftung des Betreibers ist generell ausgeschlossen, sofern nicht Vorsatz, Pflichtverletzung oder Fahrlässigkeit vorliegen. Auch für Garderobe, Wertsachen oder Verlust und Verschleiß von Kletterausrüstung wird keine Haftung übernommen.'
];

const JUGEND_TEXT = [
  'Hiermit erkläre ich als Erziehungsberechtigte/r, dass mein Kind die Boulderhalle Zugzwang selbstständig und ohne Begleitung eines Erziehungsberechtigten nutzen darf.',
  'Mir ist bewusst, dass Bouldern eine Risikosportart ist, bei der Stürze und Verletzungen nicht ausgeschlossen werden können. Mein Kind wurde von mir über die Risiken aufgeklärt und verfügt über die nötige Reife und Disziplin, um den Sport eigenverantwortlich auszuüben.',
  'Mein Kind hat die Hallenregeln und die Benutzerordnung gelesen und verstanden. Es wird sich an die Anweisungen des Hallenpersonals halten.',
  'Ich erkläre ausdrücklich, dass mein Kind die Boulderhalle auf eigenes Risiko nutzt. Für selbstverschuldete Personen- und Sachschäden hafte ich als Erziehungsberechtigte/r bzw. haftet mein Kind persönlich, nicht der Betreiber der Boulderhalle Zugzwang.',
  'Die Haftung des Betreibers ist generell ausgeschlossen, sofern nicht Vorsatz, Pflichtverletzung oder Fahrlässigkeit vorliegen.',
  'Diese Einverständniserklärung gilt bis auf Widerruf bzw. bis zur Vollendung des 18. Lebensjahres.'
];

const DSGVO_TEXT = [
  'Der Boulderverein Zugzwang e.V. nutzt Google Workspace (Google Drive, Google Sheets, Google Forms) zur Verwaltung von Mitgliederdaten, Formularen und Vereinskommunikation. Die Daten werden auf Servern von Google LLC verarbeitet und gespeichert.',
  'Alle Mitglieder im Boulderverein Zugzwang e.V., die Daten über Einzelpersonen verarbeiten oder von diesen Daten Kenntnis erlangen, sind nach § 5 Bundesdatenschutzgesetz, beziehungsweise nach Art 32 (4) Datenschutzgrundverordnung zur Einhaltung des Datengeheimnisses verpflichtet.',
  'Personenbezogene Daten sind alle Daten, in denen Einzelangaben über persönliche oder sachliche Verhältnisse einer bestimmten oder bestimmbaren Person abgespeichert sind. Kein Mitglied darf geschützte personenbezogene Daten unbefugt erheben, verarbeiten, zugänglich machen oder nutzen.',
  'Verstöße gegen das Datengeheimnis können mit Geld- oder Freiheitsstrafe geahndet werden.'
];

// ═══════════════════════════════════════════════════
// HAUPTFUNKTION
// ═══════════════════════════════════════════════════

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ── Sheet anlegen oder finden ──
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    var datum = data.datum || todayDe();
    var pdfFile;

    if (data.typ === 'erwachsen') {
      // ── Erwachsener ──
      var geb = formatDate(data.geburtsdatum);
      pdfFile = generatePdfAdult(data, geb, datum);
      var pdfUrl = pdfFile.getUrl();

      var adresse = (data.strasse || '') + ', ' + (data.plz || '') + ' ' + (data.ort || '');
      sheet.appendRow([
        'Haftungsausschluss (Erwachsen)',
        data.vorname,
        data.nachname,
        geb,
        data.email,
        adresse,
        '',
        datum,
        pdfUrl
      ]);

      sendBestaetigungAdult(data, datum, pdfFile);
      sendNotifyHaftung('Erwachsener', data.vorname + ' ' + data.nachname, datum);

    } else if (data.typ === 'erziehungsberechtigter') {
      // ── Erziehungsberechtigter + Kinder ──
      var kinderStr = data.kinder.map(function(k) {
        return k.vorname + ' ' + k.nachname + ' (' + formatDate(k.geburtsdatum) + ')';
      }).join(', ');

      pdfFile = generatePdfMinor(data, datum);
      var pdfUrl = pdfFile.getUrl();

      var adresse = (data.strasse || '') + ', ' + (data.plz || '') + ' ' + (data.ort || '');
      sheet.appendRow([
        'Haftungsausschluss (Minderjährige)',
        data.eVorname,
        data.eNachname,
        '',
        data.email,
        adresse,
        kinderStr,
        datum,
        pdfUrl
      ]);

      sendBestaetigungMinor(data, datum, pdfFile);
      sendNotifyHaftung('Minderjährige', data.eVorname + ' ' + data.eNachname + ' (für ' + kinderStr + ')', datum);

    } else if (data.typ === 'jugendlicher') {
      // ── Einverständnis Jugendlicher ──
      var kGeb = formatDate(data.kGeburtsdatum);
      pdfFile = generatePdfJugend(data, kGeb, datum);
      var pdfUrl = pdfFile.getUrl();

      var adresse = (data.strasse || '') + ', ' + (data.plz || '') + ' ' + (data.ort || '');
      var jugendInfo = data.kVorname + ' ' + data.kNachname + ' (' + kGeb + ')';
      sheet.appendRow([
        'Einverständniserklärung',
        data.eVorname,
        data.eNachname,
        '',
        data.email,
        adresse,
        jugendInfo,
        datum,
        pdfUrl
      ]);

      sendBestaetigungJugend(data, kGeb, datum, pdfFile);
      sendNotifyHaftung('Einverständnis Jugendliche/r', data.eVorname + ' ' + data.eNachname + ' (für ' + data.kVorname + ' ' + data.kNachname + ')', datum);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ status: 'ok' })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Fehler: ' + error.toString());
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ═══════════════════════════════════════════════════
// PDF GENERIERUNG
// ═══════════════════════════════════════════════════

function generatePdfAdult(data, geb, datum) {
  var gebForFile = geb.replace(/\./g, '-');
  var doc = DocumentApp.create('Haftungsausschluss_' + data.nachname + '_' + data.vorname + '_' + gebForFile);
  var body = doc.getBody();

  // Titel
  var title = body.appendParagraph('HAFTUNGSAUSSCHLUSS');
  title.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  title.setAttributes({ FONT_SIZE: 18, BOLD: true, FONT_FAMILY: 'Arial' });

  var subtitle = body.appendParagraph('Boulderhalle Zugzwang — Boulderverein Zugzwang e.V.');
  subtitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  subtitle.setAttributes({ FONT_SIZE: 11, FOREGROUND_COLOR: '#666666' });

  body.appendParagraph('');

  // Waiver Text
  WAIVER_TEXT.forEach(function(para) {
    var p = body.appendParagraph(para);
    p.setAttributes({ FONT_SIZE: 11, FONT_FAMILY: 'Arial' });
    p.setSpacingAfter(8);
  });

  body.appendParagraph('');
  body.appendHorizontalRule();

  // Datenschutzerklärung
  var dsgvoTitle = body.appendParagraph('DATENSCHUTZERKLÄRUNG');
  dsgvoTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  dsgvoTitle.setAttributes({ FONT_SIZE: 14, BOLD: true, FONT_FAMILY: 'Arial' });

  DSGVO_TEXT.forEach(function(para) {
    var p = body.appendParagraph(para);
    p.setAttributes({ FONT_SIZE: 11, FONT_FAMILY: 'Arial' });
    p.setSpacingAfter(8);
  });

  body.appendParagraph('');
  body.appendHorizontalRule();
  body.appendParagraph('');

  // Persönliche Daten
  var dataTitle = body.appendParagraph('Persönliche Daten');
  dataTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  dataTitle.setAttributes({ FONT_SIZE: 13, BOLD: true });

  appendField(body, 'Name', data.vorname + ' ' + data.nachname);
  appendField(body, 'Geburtsdatum', geb);
  appendField(body, 'Adresse', data.strasse + ', ' + data.plz + ' ' + data.ort);
  appendField(body, 'E-Mail', data.email);
  appendField(body, 'Datum', datum);

  body.appendParagraph('');

  // Bestätigungen
  var c1 = body.appendParagraph('☑ Ich habe den Haftungsausschluss gelesen und erkenne ihn an.');
  c1.setAttributes({ FONT_SIZE: 11, BOLD: true });
  var c2 = body.appendParagraph('☑ Ich habe die Datenschutzerklärung gelesen und stimme der Verarbeitung meiner Daten zu.');
  c2.setAttributes({ FONT_SIZE: 11, BOLD: true });

  body.appendParagraph('');

  // Unterschrift
  var sigTitle = body.appendParagraph('Unterschrift');
  sigTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  sigTitle.setAttributes({ FONT_SIZE: 13, BOLD: true });

  if (data.unterschrift) {
    appendSignatureImage(body, data.unterschrift);
  } else {
    var sig = body.appendParagraph('_________________________________');
    sig.setAttributes({ FONT_SIZE: 11 });
  }
  var sigLabel = body.appendParagraph(data.vorname + ' ' + data.nachname + ', ' + datum);
  sigLabel.setAttributes({ FONT_SIZE: 10, FOREGROUND_COLOR: '#666666' });

  // Footer
  body.appendParagraph('');
  var footer = body.appendParagraph('Boulderverein Zugzwang e.V. · Neuhauser Straße 1 · 91275 Auerbach i.d.OPf.');
  footer.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  footer.setAttributes({ FONT_SIZE: 9, FOREGROUND_COLOR: '#999999' });

  doc.saveAndClose();

  // Als PDF exportieren
  var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf');
  pdfBlob.setName('Haftungsausschluss_' + data.nachname + '_' + data.vorname + '_' + gebForFile + '.pdf');

  // In Zielordner speichern
  var folder = DriveApp.getFolderById(PDF_FOLDER_ID);
  var pdfFile = folder.createFile(pdfBlob);

  // Temporäres Google Doc löschen
  DriveApp.getFileById(doc.getId()).setTrashed(true);

  return pdfFile;
}

function generatePdfMinor(data, datum) {
  var kinderNamen = data.kinder.map(function(k) { return k.vorname + ' ' + k.nachname; }).join(', ');
  var erstesKind = data.kinder[0];
  var docName = 'Haftungsausschluss_' + data.eNachname + '_Kinder';

  var doc = DocumentApp.create(docName);
  var body = doc.getBody();

  // Titel
  var title = body.appendParagraph('HAFTUNGSAUSSCHLUSS');
  title.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  title.setAttributes({ FONT_SIZE: 18, BOLD: true, FONT_FAMILY: 'Arial' });

  var subtitle = body.appendParagraph('Boulderhalle Zugzwang — Boulderverein Zugzwang e.V.');
  subtitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  subtitle.setAttributes({ FONT_SIZE: 11, FOREGROUND_COLOR: '#666666' });

  var minorNote = body.appendParagraph('Für Minderjährige — bestätigt durch Erziehungsberechtigte/n');
  minorNote.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  minorNote.setAttributes({ FONT_SIZE: 11, FOREGROUND_COLOR: '#cc0000', ITALIC: true });

  body.appendParagraph('');

  // Waiver Text
  WAIVER_TEXT.forEach(function(para) {
    var p = body.appendParagraph(para);
    p.setAttributes({ FONT_SIZE: 11, FONT_FAMILY: 'Arial' });
    p.setSpacingAfter(8);
  });

  body.appendParagraph('');
  body.appendHorizontalRule();

  // Datenschutzerklärung
  var dsgvoTitle = body.appendParagraph('DATENSCHUTZERKLÄRUNG');
  dsgvoTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  dsgvoTitle.setAttributes({ FONT_SIZE: 14, BOLD: true, FONT_FAMILY: 'Arial' });

  DSGVO_TEXT.forEach(function(para) {
    var p = body.appendParagraph(para);
    p.setAttributes({ FONT_SIZE: 11, FONT_FAMILY: 'Arial' });
    p.setSpacingAfter(8);
  });

  body.appendParagraph('');
  body.appendHorizontalRule();
  body.appendParagraph('');

  // Erziehungsberechtigter
  var eTitle = body.appendParagraph('Erziehungsberechtigte/r');
  eTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  eTitle.setAttributes({ FONT_SIZE: 13, BOLD: true });

  appendField(body, 'Name', data.eVorname + ' ' + data.eNachname);
  appendField(body, 'Adresse', data.strasse + ', ' + data.plz + ' ' + data.ort);
  appendField(body, 'E-Mail', data.email);

  body.appendParagraph('');

  // Kinder
  var kTitle = body.appendParagraph('Kind(er), für die der Haftungsausschluss gilt');
  kTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  kTitle.setAttributes({ FONT_SIZE: 13, BOLD: true });

  data.kinder.forEach(function(kind, idx) {
    var geb = formatDate(kind.geburtsdatum);
    var p = body.appendParagraph((idx + 1) + '.  ' + kind.vorname + ' ' + kind.nachname + '  —  geb. ' + geb);
    p.setAttributes({ FONT_SIZE: 11 });
    p.setSpacingAfter(4);
  });

  body.appendParagraph('');
  appendField(body, 'Datum', datum);

  body.appendParagraph('');

  // Bestätigungen
  var c1 = body.appendParagraph('☑ Ich habe den Haftungsausschluss gelesen und erkenne ihn an.');
  c1.setAttributes({ FONT_SIZE: 11, BOLD: true });
  var c2 = body.appendParagraph('☑ Ich habe die Datenschutzerklärung gelesen und stimme der Verarbeitung meiner Daten zu.');
  c2.setAttributes({ FONT_SIZE: 11, BOLD: true });
  var c3 = body.appendParagraph('☑ Ich bestätige als Erziehungsberechtigte/r, dass der Haftungsausschluss für alle oben genannten Kinder gilt.');
  c3.setAttributes({ FONT_SIZE: 11, BOLD: true });

  body.appendParagraph('');

  // Unterschrift
  var sigTitle2 = body.appendParagraph('Unterschrift Erziehungsberechtigte/r');
  sigTitle2.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  sigTitle2.setAttributes({ FONT_SIZE: 13, BOLD: true });

  if (data.unterschrift) {
    appendSignatureImage(body, data.unterschrift);
  } else {
    var sig = body.appendParagraph('_________________________________');
    sig.setAttributes({ FONT_SIZE: 11 });
  }
  var sigLabel = body.appendParagraph(data.eVorname + ' ' + data.eNachname + ' (Erziehungsberechtigte/r), ' + datum);
  sigLabel.setAttributes({ FONT_SIZE: 10, FOREGROUND_COLOR: '#666666' });

  // Footer
  body.appendParagraph('');
  var footer = body.appendParagraph('Boulderverein Zugzwang e.V. · Neuhauser Straße 1 · 91275 Auerbach i.d.OPf.');
  footer.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  footer.setAttributes({ FONT_SIZE: 9, FOREGROUND_COLOR: '#999999' });

  doc.saveAndClose();

  // Als PDF exportieren
  var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf');
  pdfBlob.setName(docName + '.pdf');

  var folder = DriveApp.getFolderById(PDF_FOLDER_ID);
  var pdfFile = folder.createFile(pdfBlob);

  // Temporäres Google Doc löschen
  DriveApp.getFileById(doc.getId()).setTrashed(true);

  return pdfFile;
}

function generatePdfJugend(data, kGeb, datum) {
  var gebForFile = kGeb.replace(/\./g, '-');
  var docName = 'Einverstaendnis_' + data.kNachname + '_' + data.kVorname + '_' + gebForFile;
  var doc = DocumentApp.create(docName);
  var body = doc.getBody();

  // Titel
  var title = body.appendParagraph('EINVERSTÄNDNISERKLÄRUNG');
  title.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  title.setAttributes({ FONT_SIZE: 18, BOLD: true, FONT_FAMILY: 'Arial' });

  var subtitle = body.appendParagraph('Boulderhalle Zugzwang — Boulderverein Zugzwang e.V.');
  subtitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  subtitle.setAttributes({ FONT_SIZE: 11, FOREGROUND_COLOR: '#666666' });

  var note = body.appendParagraph('Für Jugendliche ab 14 Jahren zum selbstständigen Bouldern');
  note.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  note.setAttributes({ FONT_SIZE: 11, FOREGROUND_COLOR: '#cc0000', ITALIC: true });

  body.appendParagraph('');

  // Einverständnistext
  JUGEND_TEXT.forEach(function(para) {
    var p = body.appendParagraph(para);
    p.setAttributes({ FONT_SIZE: 11, FONT_FAMILY: 'Arial' });
    p.setSpacingAfter(8);
  });

  body.appendParagraph('');
  body.appendHorizontalRule();

  // Datenschutzerklärung
  var dsgvoTitle = body.appendParagraph('DATENSCHUTZERKLÄRUNG');
  dsgvoTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  dsgvoTitle.setAttributes({ FONT_SIZE: 14, BOLD: true, FONT_FAMILY: 'Arial' });

  DSGVO_TEXT.forEach(function(para) {
    var p = body.appendParagraph(para);
    p.setAttributes({ FONT_SIZE: 11, FONT_FAMILY: 'Arial' });
    p.setSpacingAfter(8);
  });

  body.appendParagraph('');
  body.appendHorizontalRule();
  body.appendParagraph('');

  // Erziehungsberechtigter
  var eTitle = body.appendParagraph('Erziehungsberechtigte/r');
  eTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  eTitle.setAttributes({ FONT_SIZE: 13, BOLD: true });

  appendField(body, 'Name', data.eVorname + ' ' + data.eNachname);
  appendField(body, 'Adresse', data.strasse + ', ' + data.plz + ' ' + data.ort);
  appendField(body, 'E-Mail', data.email);

  body.appendParagraph('');

  // Jugendlicher
  var kTitle = body.appendParagraph('Jugendliche/r');
  kTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  kTitle.setAttributes({ FONT_SIZE: 13, BOLD: true });

  appendField(body, 'Name', data.kVorname + ' ' + data.kNachname);
  appendField(body, 'Geburtsdatum', kGeb);

  body.appendParagraph('');
  appendField(body, 'Datum', datum);

  body.appendParagraph('');

  // Bestätigungen
  var c1 = body.appendParagraph('☑ Ich habe die Einverständniserklärung gelesen und stimme zu, dass mein Kind die Boulderhalle selbstständig nutzen darf.');
  c1.setAttributes({ FONT_SIZE: 11, BOLD: true });
  var c2 = body.appendParagraph('☑ Ich habe die Datenschutzerklärung gelesen und stimme der Verarbeitung meiner Daten zu.');
  c2.setAttributes({ FONT_SIZE: 11, BOLD: true });
  var c3 = body.appendParagraph('☑ Mir ist bewusst, dass zusätzlich ein Haftungsausschluss für mein Kind vorliegen muss.');
  c3.setAttributes({ FONT_SIZE: 11, BOLD: true });

  body.appendParagraph('');

  // Unterschrift
  var sigTitle = body.appendParagraph('Unterschrift Erziehungsberechtigte/r');
  sigTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  sigTitle.setAttributes({ FONT_SIZE: 13, BOLD: true });

  if (data.unterschrift) {
    appendSignatureImage(body, data.unterschrift);
  } else {
    var sig = body.appendParagraph('_________________________________');
    sig.setAttributes({ FONT_SIZE: 11 });
  }
  var sigLabel = body.appendParagraph(data.eVorname + ' ' + data.eNachname + ' (Erziehungsberechtigte/r), ' + datum);
  sigLabel.setAttributes({ FONT_SIZE: 10, FOREGROUND_COLOR: '#666666' });

  // Footer
  body.appendParagraph('');
  var footer = body.appendParagraph('Boulderverein Zugzwang e.V. · Neuhauser Straße 1 · 91275 Auerbach i.d.OPf.');
  footer.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  footer.setAttributes({ FONT_SIZE: 9, FOREGROUND_COLOR: '#999999' });

  doc.saveAndClose();

  // Als PDF exportieren
  var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf');
  pdfBlob.setName(docName + '.pdf');

  var folder = DriveApp.getFolderById(PDF_FOLDER_ID);
  var pdfFile = folder.createFile(pdfBlob);

  // Temporäres Google Doc löschen
  DriveApp.getFileById(doc.getId()).setTrashed(true);

  return pdfFile;
}

function appendSignatureImage(body, dataUrl) {
  // data:image/png;base64,xxxx → Blob
  var base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/png', 'unterschrift.png');
  var img = body.appendImage(blob);
  // Breite auf 250pt setzen, Höhe proportional
  var w = img.getWidth();
  var h = img.getHeight();
  var targetW = 250;
  img.setWidth(targetW);
  img.setHeight(Math.round(h * targetW / w));
}

function appendField(body, label, value) {
  var p = body.appendParagraph('');
  var text = p.appendText(label + ':  ');
  text.setBold(true);
  text.setFontSize(11);
  var val = p.appendText(value);
  val.setBold(false);
  val.setFontSize(11);
}

// ═══════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════

function todayDe() {
  var d = new Date();
  return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  var d = new Date(isoDate);
  return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
}

// ═══════════════════════════════════════════════════
// E-MAILS
// ═══════════════════════════════════════════════════

function sendBestaetigungAdult(data, datum, pdfFile) {
  var body = 'Hallo ' + data.vorname + ',\n\n' +
    'vielen Dank! Dein Haftungsausschluss für die Boulderhalle Zugzwang wurde erfolgreich gespeichert.\n\n' +
    'Folgende Daten wurden übermittelt:\n\n' +
    '  Name:           ' + data.vorname + ' ' + data.nachname + '\n' +
    '  Geburtsdatum:   ' + formatDate(data.geburtsdatum) + '\n' +
    '  Datum:          ' + datum + '\n\n' +
    'Im Anhang findest du eine PDF-Kopie des Haftungsausschlusses.\n\n' +
    'Bei Fragen erreichst du uns unter ' + (getConfigValue('kontakt_haftung_email') || 'boulderhallezugzwang@gmail.com') + '.\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'Neuhauser Straße 1\n' +
    '91275 Auerbach i.d.OPf.\n\n' +
    'https://boulderhallezugzwang.github.io/zugzwang-website';

  MailApp.sendEmail({
    to: data.email,
    subject: 'Haftungsausschluss bestätigt – Boulderhalle Zugzwang',
    body: body,
    name: 'Boulderverein Zugzwang e.V.',
    attachments: [pdfFile.getAs(MimeType.PDF)]
  });
}

function sendBestaetigungMinor(data, datum, pdfFile) {
  var kinderListe = data.kinder.map(function(k) {
    return '  - ' + k.vorname + ' ' + k.nachname + ' (geb. ' + formatDate(k.geburtsdatum) + ')';
  }).join('\n');

  var body = 'Hallo ' + data.eVorname + ',\n\n' +
    'vielen Dank! Der Haftungsausschluss für die Boulderhalle Zugzwang wurde erfolgreich gespeichert.\n\n' +
    'Erziehungsberechtigte/r:\n' +
    '  ' + data.eVorname + ' ' + data.eNachname + '\n\n' +
    'Der Haftungsausschluss gilt für folgende Kinder:\n' +
    kinderListe + '\n\n' +
    '  Datum:  ' + datum + '\n\n' +
    'Im Anhang findest du eine PDF-Kopie des Haftungsausschlusses.\n\n' +
    'Bei Fragen erreichst du uns unter ' + (getConfigValue('kontakt_haftung_email') || 'boulderhallezugzwang@gmail.com') + '.\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'Neuhauser Straße 1\n' +
    '91275 Auerbach i.d.OPf.\n\n' +
    'https://boulderhallezugzwang.github.io/zugzwang-website';

  MailApp.sendEmail({
    to: data.email,
    subject: 'Haftungsausschluss bestätigt – Boulderhalle Zugzwang',
    body: body,
    name: 'Boulderverein Zugzwang e.V.',
    attachments: [pdfFile.getAs(MimeType.PDF)]
  });
}

function sendBestaetigungJugend(data, kGeb, datum, pdfFile) {
  var body = 'Hallo ' + data.eVorname + ',\n\n' +
    'vielen Dank! Die Einverständniserklärung für die Boulderhalle Zugzwang wurde erfolgreich gespeichert.\n\n' +
    'Erziehungsberechtigte/r:\n' +
    '  ' + data.eVorname + ' ' + data.eNachname + '\n\n' +
    'Die Einverständniserklärung gilt für:\n' +
    '  ' + data.kVorname + ' ' + data.kNachname + ' (geb. ' + kGeb + ')\n\n' +
    '  Datum:  ' + datum + '\n\n' +
    'Die Einverständniserklärung gilt bis auf Widerruf bzw. bis zur Vollendung des 18. Lebensjahres.\n\n' +
    'Bitte beachte, dass zusätzlich ein Haftungsausschluss für dein Kind vorliegen muss.\n\n' +
    'Im Anhang findest du eine PDF-Kopie der Einverständniserklärung.\n\n' +
    'Bei Fragen erreichst du uns unter ' + (getConfigValue('kontakt_haftung_email') || 'boulderhallezugzwang@gmail.com') + '.\n\n' +
    'Sportliche Grüße,\n' +
    'Boulderverein Zugzwang e.V.\n' +
    'Neuhauser Straße 1\n' +
    '91275 Auerbach i.d.OPf.\n\n' +
    'https://boulderhallezugzwang.github.io/zugzwang-website';

  MailApp.sendEmail({
    to: data.email,
    subject: 'Einverständniserklärung bestätigt – Boulderhalle Zugzwang',
    body: body,
    name: 'Boulderverein Zugzwang e.V.',
    attachments: [pdfFile.getAs(MimeType.PDF)]
  });
}

