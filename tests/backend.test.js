const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),path=require('path');
const repo=process.argv[2]; let fails=0;
const ok=(c,m)=>{ if(!c){fails++;console.log('FAIL',m);} else console.log('ok  ',m); };
function mkSheet(rows){ return {
  rows, getLastRow(){return rows.length}, getLastColumn(){return rows[0]?rows[0].length:0},
  getRange(r,c,nr=1,nc=1){ const sh=this; return {
    getValues(){ const o=[]; for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((rows[r-1+i]||[])[c-1+j]??'');o.push(row);} return o; },
    getValue(){ return (rows[r-1]||[])[c-1]??''; },
    setValue(v){ while(rows.length<r)rows.push([]); rows[r-1][c-1]=v; return this; },
    setValues(vs){ vs.forEach((vr,i)=>vr.forEach((v,j)=>{rows[r-1+i][c-1+j]=v;})); return this; },
    setFontWeight(){return this;} }; },
  appendRow(r){rows.push(r.slice());}, setFrozenRows(){} }; }
function ctx(sheets){ const mails=[]; const cache={};
  const c={ console:{error(){},log(){}}, Logger:{log(){}}, mails,
   SpreadsheetApp:{ openById(){ return { getSheetByName(n){return sheets[n]||null}, getSheets(){return Object.values(sheets)}, insertSheet(n){sheets[n]=mkSheet([]);return sheets[n];} }; }, flush(){} },
   LockService:{getScriptLock(){return{waitLock(){},releaseLock(){}}}},
   CacheService:{getScriptCache(){return{get(k){return cache[k]||null},put(k,v){cache[k]=v}}}},
   MailApp:{sendEmail(m){ if(c.mailFail) throw new Error('quota'); mails.push(m);} , getRemainingDailyQuota(){return 100}},
   ContentService:{createTextOutput(t){return{t,setMimeType(){return this}}},MimeType:{JSON:1}},
   Utilities:{DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},
     computeDigest(a,d){ return [...crypto.createHash('sha256').update(typeof d==='string'?Buffer.from(d,'utf8'):Buffer.from(d.map(x=>x&255))).digest()]; },
     base64Encode(b){return Buffer.from(b.map(x=>x&255)).toString('base64')}, getUuid(){return crypto.randomUUID()} },
   MimeType:{GOOGLE_DOCS:'gdoc'}, DriveApp:{}, DocumentApp:{}, CalendarApp:{}, PropertiesService:{}, ScriptApp:{}, HtmlService:{} };
  return vm.createContext(c); }
const load=(c,f)=>vm.runInContext(fs.readFileSync(path.join(repo,f),'utf8').replace(/^const /gm,'var '),c);
const post=(c,obj)=>JSON.parse(vm.runInContext('doPost',c)({postData:{contents:JSON.stringify(obj)}}).t);

// ---- Mitgliederliste: Antrag + Auth
const MH=['Nachname','Vorname','Ort','E-Mail','Geburtsdatum','Mandatsreferenz','Status','Eintritt','ZM','Adresse','PLZ','Telefon Mobil','Bem','IBAN','BIC','Kontoinhaber','SEPA','MU','LA','Chip','ChipNr.'];
let sh={Mitglieder:mkSheet([MH.slice()]),Config:mkSheet([['Key','Value','B']]),Benutzer:mkSheet([['B','A','R','P','E'],['anna','Anna','admin','geheim12','Nein'],['neu','Neu','mitglied','start123','Ja']])};
let c=ctx(sh); load(c,'apps-script/mitgliederliste/Mitgliederliste.gs');
const antrag={vorname:'Max',nachname:'=HYPERLINK("x")',geburtsdatum:'1990-05-03',strasse:'Weg 1',plz:'91275',ort:'Auerbach',email:'max@example.org',telefon:'+49160123',kategorie:'Erwachsene',kontoinhaber:'Max M',iban:'DE89370400440532013000',familienmitglieder:[{vorname:'Kim',nachname:'M',geburtsdatum:'2015-01-01'}]};
let r=post(c,antrag);
ok(r.status==='ok'&&r.mailBestaetigung===true,'Antrag ok');
ok(c.mails.length===2,'Antrag: 2 Mails (Bestaetigung + Vorstand): '+c.mails.length);
ok(sh.Mitglieder.rows.length===3,'Antrag: Haupt- + Familienzeile');
ok(sh.Mitglieder.rows[1][0]==="'=HYPERLINK(\"x\")",'Formel neutralisiert');
ok(sh.Mitglieder.rows[1][11]==="'+49160123",'Telefon mit + als Text');
ok(/^ZZ-\d{4}-0001$/.test(sh.Mitglieder.rows[1][5]),'Mandatsreferenz');
ok(post(c,{}).status==='error','leerer POST abgelehnt'); ok(sh.Mitglieder.rows.length===3,'keine Zeile bei leerem POST');
ok(post(c,{...antrag,email:'x'}).status==='error','ungueltige E-Mail abgelehnt');
c.mailFail=true; r=post(c,{...antrag,nachname:'Muster'}); c.mailFail=false;
ok(r.status==='ok'&&r.mailBestaetigung===false,'Mailfehler -> trotzdem ok, Zeile gespeichert'); 
// Auth
r=post(c,{action:'login',username:'anna',password:'geheim12'});
ok(!r.error&&r.user&&r.user.rolle==='admin','Login Klartext-Altbestand');
ok(/^zz1\$300\$/.test(sh.Benutzer.rows[1][3]),'Passwort wurde gehasht: '+String(sh.Benutzer.rows[1][3]).slice(0,12));
ok(!post(c,{action:'login',username:'anna',password:'geheim12'}).error,'Login gegen Hash');
ok(post(c,{action:'login',username:'anna',password:'falsch'}).error,'falsches Passwort abgelehnt');
ok(post(c,{action:'login',username:'neu',password:'start123'}).needsPassword===true,'Erstanmeldung -> needsPassword');
ok(post(c,{action:'getNews',username:'neu',password:'start123'}).error==='Nicht authentifiziert','Erstanmeldung fuer andere Aktionen gesperrt');
ok(post(c,{action:'setPassword',username:'neu',oldPassword:'start123',newPassword:'kurz1'}).error,'zu kurzes Passwort');
r=post(c,{action:'setPassword',username:'neu',oldPassword:'start123',newPassword:'neuesPasswort9'});
ok(!r.error&&sh.Benutzer.rows[2][4]==='Nein'&&/^zz1\$/.test(sh.Benutzer.rows[2][3]),'setPassword speichert Hash');
ok(!post(c,{action:'login',username:'neu',password:'neuesPasswort9'}).error,'Login mit neuem Passwort');
for(let i=0;i<10;i++) post(c,{action:'login',username:'anna',password:'x'+i});
ok(/Zu viele/.test(post(c,{action:'login',username:'anna',password:'geheim12'}).error||''),'Sperre nach 10 Fehlversuchen');
// Chip per POST, nur Admin
sh.Benutzer.rows.push(['bob','Bob','mitglied','bobpasswort','Nein']);
ok(post(c,{action:'updateChip',username:'bob',password:'bobpasswort',nachname:'Muster',vorname:'Max',chip:'Ja',chipnr:'7'}).error==='Keine Berechtigung','updateChip nur Admin');

// ---- Kuendigung
sh={Mitglieder:mkSheet([MH.slice(),['Huber','Max','A','max@example.org','','','Erwachsene'],['Huber','Max','A','senior@example.org','','','Rentner'],['Ohne','Mail','A','','','','Erwachsene']]),Config:mkSheet([['Key','Value']])};
c=ctx(sh); load(c,'apps-script/kuendigung/Code.gs');
r=post(c,{vorname:'Max',nachname:'Huber',email:'angreifer@evil.test'});
ok(r.status==='ok'&&sh.Mitglieder.rows[1][6]==='Erwachsene'&&sh.Mitglieder.rows[2][6]==='Rentner','fremde E-Mail: niemand gekuendigt');
ok(c.mails.some(m=>/BITTE PRÜFEN/.test(m.subject)&&m.to==='boulderhallezugzwang@gmail.com'),'Vorstand wird zur Pruefung benachrichtigt');
ok(/WEICHT AB/.test(sh['Kündigungen'].rows[1][4]),'Protokoll vermerkt Abweichung');
r=post(c,{vorname:'max',nachname:'HUBER',email:'Max@Example.org'});
ok(/^gekündigt/.test(sh.Mitglieder.rows[1][6])&&sh.Mitglieder.rows[2][6]==='Rentner','passende E-Mail: nur diese Zeile gekuendigt');
ok(c.mails.some(m=>/Bestätigung Deiner Kündigung/.test(m.subject)),'Bestaetigungsmail');
post(c,{vorname:'Mail',nachname:'Ohne',email:'a@b.de'}); ok(sh.Mitglieder.rows[3][6]==='Erwachsene','ohne hinterlegte E-Mail: nicht gekuendigt');
ok(post(c,{vorname:'<img src=x>',nachname:'H',email:'a@b.de'}).status==='error','HTML im Namen abgelehnt');
r=post(c,{vorname:'Nie',nachname:'Mand',email:'a@b.de'}); ok(c.mails.some(m=>/nicht gefunden/.test(m.subject)),'nicht gefunden -> Hinweis-Mail');

// ---- Hallendienst oeffentlich
sh={Hallendienst:mkSheet([['Datum','Status','Vorname','Nachname','E-Mail','Mobil'],['20.11.2026','aktiv','','','','']]),Config:mkSheet([['Key','Value']]),Benutzer:mkSheet([['B']])};
c=ctx(sh); load(c,'apps-script/hallendienst/Code.gs');
vm.runInContext('createCalendarEvent=function(){ this.__cal=(this.__cal||0)+1; }; sendBestaetigungsMail=function(d){ MailApp.sendEmail({to:d.email,subject:"HD"}); }; sendNotifyHallendienst=function(){};',c);
ok(post(c,{datum:'20.11.2026',vorname:'<img src=x onerror=alert(1)>',nachname:'X',email:'a@b.de',mobilnr:'0160 1'}).status==='error','Hallendienst: Skript im Namen abgelehnt');
ok(post(c,{datum:'20.11.2026',vorname:'',nachname:'',email:'a@b.de'}).status==='error'&&!c.__cal,'Hallendienst: leerer Name -> kein Kalendereintrag');
c.mailFail=true; r=post(c,{datum:'20.11.2026',vorname:'Eva',nachname:"O'Neil-Müller",email:'eva@example.org',mobilnr:'0160/123.45-6'}); c.mailFail=false;
ok(r.status==='ok'&&sh.Hallendienst.rows[1][2]==='Eva'&&sh.Hallendienst.rows[1][3]==="O'Neil-Müller",'Hallendienst: Eintragung trotz Mailfehler ok');
ok(post(c,{datum:'20.11.2026',vorname:'Zwei',nachname:'Ter',email:'z@example.org',mobilnr:'0160 1234'}).status==='error','belegter Termin abgelehnt');

// ---- Jugendtraining + Haftung Validierung
sh={Config:mkSheet([['Key','Value']])}; c=ctx(sh); load(c,'apps-script/jugendtraining/Jugendtraining.gs');
vm.runInContext('sendBestaetigungsMail=function(){};sendNotifyJugendtraining=function(){};',c);
const jt={nachname:'@SUM(1)',vorname:'Lea',geburtsdatum:'2014-03-04',strasse:'W 1',plz:'91275',ort:'A',email:'e@example.org',telefon:'0160',kontoinhaber:'E',iban:'DE89 3704 0044 0532 0130 00'};
r=post(c,jt); const jsName=Object.keys(sh).find(k=>k!=='Config');
ok(r.status==='ok'&&sh[jsName].rows[1][0]==="'@SUM(1)"&&sh[jsName].rows[1][2]==='04.03.2014','Jugendtraining: Zeile, Formel neutralisiert, Datum');
ok(post(c,{...jt,iban:'x'}).status==='error','Jugendtraining: ungueltige IBAN');
c=ctx({Config:mkSheet([['Key','Value']])}); load(c,'apps-script/haftung/haftung-script.gs'); const v=vm.runInContext('validateHaftung',c);
const sig='data:image/png;base64,AAAA';
ok(v({typ:'erwachsen',vorname:'A',nachname:'B',geburtsdatum:'1990-01-01',email:'a@b.de',strasse:'s',plz:'1',ort:'o',datum:'x',unterschrift:sig})==='','Haftung erwachsen gueltig');
ok(v({typ:'erziehungsberechtigter',eVorname:'A',eNachname:'B',email:'a@b.de',kinder:[{vorname:'K',nachname:'B',geburtsdatum:'2015-01-01'}],unterschrift:sig})==='','Haftung Kinder gueltig');
ok(v({typ:'jugendlicher',eVorname:'A',eNachname:'B',email:'a@b.de',kVorname:'K',kNachname:'B',kGeburtsdatum:'2010-01-01',unterschrift:sig})==='','Haftung Jugend gueltig');
ok(v({typ:'quatsch',email:'a@b.de',unterschrift:sig})!==''&&v({typ:'erwachsen',vorname:'A',nachname:'B',geburtsdatum:'1',email:'a@b.de'})!=='','Haftung: unbekannter Typ / fehlende Unterschrift abgelehnt');
console.log(fails?('\n'+fails+' FEHLGESCHLAGEN'):'\nalle Tests bestanden'); process.exit(fails?1:0);
