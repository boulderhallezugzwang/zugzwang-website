const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),path=require('path');
const repo=process.argv[2]; let fails=0;
const ok=(c,m)=>{ if(!c){fails++;console.log('FAIL',m);} else console.log('ok  ',m); };
function mkSheet(rows){ return {
  rows, getLastRow(){return rows.length}, getLastColumn(){return rows[0]?rows[0].length:0},
  getRange(r,c,nr=1,nc=1){ const sh=this; return {
    getValues(){ const o=[]; for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((rows[r-1+i]||[])[c-1+j]??'');o.push(row);} return o; },
    getValue(){ return (rows[r-1]||[])[c-1]??''; },
    setValue(v){ while(rows.length<r)rows.push([]); rows[r-1][c-1]=v; return this; },
    setValues(vs){ vs.forEach((vr,i)=>{ while(rows.length<r+i)rows.push([]); vr.forEach((v,j)=>{rows[r-1+i][c-1+j]=v;}); }); return this; },
    setFontWeight(){return this;} }; },
  appendRow(r){rows.push(r.slice());}, deleteRow(n){rows.splice(n-1,1);}, setFrozenRows(){} }; }
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
   MimeType:{GOOGLE_DOCS:'gdoc'}, DriveApp:{}, DocumentApp:{}, ScriptApp:{getProjectTriggers(){return[]}}, HtmlService:{} };
  const props={}; c.props=props;
  c.PropertiesService={getScriptProperties(){return{getProperty(k){return props[k]||null},setProperty(k,v){props[k]=v}}}};
  c.Utilities.formatDate=(d)=>d.toISOString().slice(0,10);
  c.Utilities.newBlob=()=>({});
  const cals={}; c.cals=cals; let seq=0;
  c.CalendarApp={getCalendarById(id){ if(!cals[id]) cals[id]=[]; const list=cals[id]; const wrap=e=>({getId(){return e.id},getTitle(){return e.titel},getStartTime(){return e.start},getEndTime(){return e.end},getDescription(){return e.desc},setTitle(t){e.titel=t},setTime(a,b){e.start=a;e.end=b},setDescription(d){e.desc=d},deleteEvent(){list.splice(list.indexOf(e),1)}});
    return { createEvent(t,a,b,o){const e={id:'ev'+(++seq)+'@google.com',titel:t,start:a,end:b,desc:(o&&o.description)||''};list.push(e);return wrap(e);}, getEventById(i){const e=list.find(x=>x.id===i);return e?wrap(e):null;}, getEvents(a,b){return list.filter(e=>e.start>=a&&e.start<=b).map(wrap);} }; }};
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
// ---- Rueckmeldung zu Terminen
sh={Mitglieder:mkSheet([MH.slice(),['A','B','O','m1@example.org','','','Erwachsene'],['C','D','O','m2@example.org','','','Erwachsene']]),Config:mkSheet([['Key','Value','B']]),Benutzer:mkSheet([['B','A','R','P','E'],['anna','Anna','admin','geheim12','Nein']])};
c=ctx(sh); load(c,'apps-script/mitgliederliste/Mitgliederliste.gs');
const A={username:'anna',password:'geheim12'};
const zukunft=new Date(Date.now()+5*864e5).toISOString().slice(0,10);
r=post(c,{...A,action:'createEvent',kalender:'events',titel:'Sommerfest',datum:zukunft,zeitVon:'18:00',zeitBis:'21:00',beschreibung:'Grillen',mailMode:'all',remindHours:'0',rsvpAktiv:true,rsvpEmail:'kein-at'});
ok(/gültige E-Mail/.test(r.error||''),'Rueckmeldung: ungueltige Melde-Adresse abgelehnt');
r=post(c,{...A,action:'createEvent',kalender:'events',titel:'Sommerfest',datum:zukunft,zeitVon:'18:00',zeitBis:'21:00',beschreibung:'Grillen',mailMode:'all',remindHours:'0',rsvpAktiv:true,rsvpEmail:'orga@example.org'});
ok(r.ok&&/Rückmeldung aktiv/.test(r.message),'Termin mit Rueckmeldung angelegt');
const RS=sh['Rückmeldungen'].rows; const tok=RS[1][0];
ok(RS.length===2&&/^[0-9a-f]{40}$/.test(tok)&&/^a/.test(tok)&&RS[1][5]==='orga@example.org','Zeile in Tab Rueckmeldungen mit Token');
const evMail=c.mails.find(m=>/Sommerfest/.test(m.subject));
ok(evMail&&evMail.body.includes('rueckmeldung.html?t='+tok+'&a=ja')&&evMail.body.includes('&a=nein'),'Termin-Mail enthaelt Zusage- und Absage-Link');
ok(!JSON.stringify(c.mails).includes('github.io'),'Termin-Mail nennt die neue Domain');
r=post(c,{action:'rsvpInfo',t:tok}); ok(r.ok&&r.titel==='Sommerfest'&&r.vorbei===false&&!('email' in r)&&!('ja' in r),'rsvpInfo oeffentlich: Titel/Datum, keine Zaehler/E-Mail');
ok(post(c,{action:'rsvpInfo',t:'x'}).error&&post(c,{action:'rsvp',t:'a'+'0'.repeat(39),antwort:'ja'}).error,'ungueltiges/unbekanntes Token abgelehnt');
ok(post(c,{action:'rsvp',t:tok,antwort:'vielleicht'}).error,'ungueltige Antwort abgelehnt');
post(c,{action:'rsvp',t:tok,antwort:'ja'}); post(c,{action:'rsvp',t:tok,antwort:'ja'}); post(c,{action:'rsvp',t:tok,antwort:'nein'});
ok(RS[1][6]===2&&RS[1][7]===1,'2 Zusagen, 1 Absage gezaehlt');
post(c,{action:'rsvp',t:tok,antwort:'nein',vorher:'ja'}); ok(RS[1][6]===1&&RS[1][7]===2,'Antwort aendern zaehlt um statt doppelt');
r=post(c,{...A,action:'getEvents'}); const evX=r.events.find(e=>e.titel==='Sommerfest');
ok(evX&&evX.rsvp&&evX.rsvp.ja===1&&evX.rsvp.nein===2&&evX.rsvp.email==='orga@example.org'&&!('token' in evX.rsvp),'Intern-Liste zeigt Zaehler');
// Zusammenfassung
const sum=vm.runInContext('sendRsvpSummaries',c); let before=c.mails.length;
sum(); let sm=c.mails.slice(before);
ok(sm.length===1&&sm[0].to==='orga@example.org'&&/1 Zusagen, 2 Absagen/.test(sm[0].subject)&&/Zusagen: \+1/.test(sm[0].body),'Tagesmail mit Stand und Veraenderung');
c.props.rsvp_summary_tag=''; before=c.mails.length; sum(); ok(c.mails.length===before,'nichts Neues -> keine Mail');
post(c,{action:'rsvp',t:tok,antwort:'ja'}); before=c.mails.length; sum(); ok(c.mails.length===before,'am selben Tag keine zweite Mail');
c.props.rsvp_summary_tag=''; sum(); ok(c.mails.length===before+1&&/Zusagen: \+1/.test(c.mails[c.mails.length-1].body)&&/Absagen: 0/.test(c.mails[c.mails.length-1].body),'naechster Tag: nur die Veraenderung');
// Termin vorbei
RS[1][4]=new Date(Date.now()-3600e3); RS[1][6]=9; c.props.rsvp_summary_tag=''; before=c.mails.length; sum();
ok(c.mails.length===before,'Termin war schon -> keine Mail mehr');
ok(/begonnen/.test(post(c,{action:'rsvp',t:tok,antwort:'ja'}).error||'')&&post(c,{action:'rsvpInfo',t:tok}).vorbei===true,'nach Terminbeginn keine Rueckmeldung mehr');
// Bearbeiten: Zaehler bleiben, Ausschalten/Loeschen entfernt die Zeile
RS[1][4]=new Date(Date.now()+5*864e5); RS[1][6]=4; RS[1][7]=1;
r=post(c,{...A,action:'updateEvent',kalender:'events',eventId:evX.id,titel:'Sommerfest 2',datum:zukunft,zeitVon:'17:00',zeitBis:'21:00',beschreibung:'',mailMode:'none',remindHours:'0',rsvpAktiv:true,rsvpEmail:'neu@example.org'});
ok(r.ok&&RS.length===2&&RS[1][0]===tok&&RS[1][3]==='Sommerfest 2'&&RS[1][5]==='neu@example.org'&&RS[1][6]===4,'Bearbeiten behaelt Token und Zaehler');
r=post(c,{...A,action:'updateEvent',kalender:'events',eventId:evX.id,titel:'Sommerfest 2',datum:zukunft,zeitVon:'17:00',zeitBis:'21:00',beschreibung:'',mailMode:'none',remindHours:'0',rsvpAktiv:false});
ok(r.ok&&RS.length===1,'Rueckmeldung ausschalten entfernt die Zeile');
r=post(c,{...A,action:'createEvent',kalender:'events',titel:'Ohne',datum:zukunft,zeitVon:'18:00',zeitBis:'19:00',beschreibung:'',mailMode:'none',remindHours:'0'});
ok(r.ok&&RS.length===1&&!/Rückmeldung/.test(r.message),'Termin ohne Rueckmeldung wie bisher');
r=post(c,{...A,action:'createEvent',kalender:'events',titel:'Weg',datum:zukunft,zeitVon:'18:00',zeitBis:'19:00',beschreibung:'',mailMode:'none',remindHours:'0',rsvpAktiv:true,rsvpEmail:'o@example.org'});
const weg=post(c,{...A,action:'getEvents'}).events.find(e=>e.titel==='Weg');
r=post(c,{...A,action:'deleteEvent',kalender:'events',eventId:weg.id,mailMode:'none'}); ok(r.ok&&RS.length===1,'Termin loeschen entfernt die Rueckmelde-Zeile');

console.log(fails?('\n'+fails+' FEHLGESCHLAGEN'):'\nalle Tests bestanden'); process.exit(fails?1:0);
