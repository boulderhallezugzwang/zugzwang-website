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
  c.Utilities.newBlob=(d,t,n)=>({getName(){return n||''},getBytes(){return [...Buffer.from(String(d))]},copyBlob(){return this},setName(){return this}});
  c.Session={getEffectiveUser(){return{getEmail(){return 'admin@example.org'}}},getActiveUser(){return{getEmail(){return ''}}}};
  c.brevo={calls:[],respond:()=>({code:201,body:'{"messageId":"x"}'})};
  c.UrlFetchApp={fetch(url,o){ const p=JSON.parse(o.payload); c.brevo.calls.push({url,key:o.headers['api-key'],p}); const r=c.brevo.respond(p,c.brevo.calls.length); if(r.throw) throw new Error('net'); return {getResponseCode(){return r.code},getContentText(){return r.body||''}}; }};
  c.gmailQuota=100; c.MailApp.getRemainingDailyQuota=()=>c.gmailQuota;
  const origSend=c.MailApp.sendEmail; c.MailApp.sendEmail=(m)=>{ origSend(m); c.gmailQuota--; };
  const cals={}; c.cals=cals; let seq=0;
  c.CalendarApp={getCalendarById(id){ if(!cals[id]) cals[id]=[]; const list=cals[id]; const wrap=e=>({getId(){return e.id},getTitle(){return e.titel},getStartTime(){return e.start},getEndTime(){return e.end},getDescription(){return e.desc},setTitle(t){e.titel=t},setTime(a,b){e.start=a;e.end=b},setDescription(d){e.desc=d},deleteEvent(){list.splice(list.indexOf(e),1)}});
    return { createEvent(t,a,b,o){const e={id:'ev'+(++seq)+'@google.com',titel:t,start:a,end:b,desc:(o&&o.description)||''};list.push(e);return wrap(e);}, getEventById(i){const e=list.find(x=>x.id===i);return e?wrap(e):null;}, getEvents(a,b){return list.filter(e=>e.start>=a&&e.start<=b).map(wrap);}, getEventsForDay(d){return list.filter(e=>e.start.toDateString()===d.toDateString()).map(wrap);} }; }};
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

// ---- Hallendienst: nur Mitglieder, Dienste-Protokoll, Dreier-Sperre, Austragen
const tagDE=n=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return ('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2)+'.'+d.getFullYear();};
const jahrVon=de=>parseInt(de.split('.')[2],10);
const deObj=de=>{const q=de.split('.');return new Date(+q[2],+q[1]-1,+q[0]);};
function hdCtx(slots){
  const sheets={
    Mitglieder:mkSheet([MH.slice(),
      ['O\'Neil-Müller','Eva','A','eva@example.org','03.05.1990','','Erwachsene','','','','','+49 160 555 66 77'],
      ['Maier','Tom','A','fam@example.org',new Date(1980,1,2),'','Mitglied Familie','','','','',1705556677],
      ['Maier','Tim','A','fam@example.org','11.12.2008','','Mitglied Familie'],
      ['Doppelt','Max','A','max@example.org','01.01.1970','','Erwachsene'],
      ['Doppelt','Max','A','max@example.org','02.02.2000','','Erwachsene']]),
    Hallendienst:mkSheet([['Datum','Status','Vorname','Nachname','E-Mail','Mobil']].concat(slots.map(d=>[d,'aktiv','','','','']))),
    Config:mkSheet([['Key','Value'],['dienste_kontakt_telefon','0160 1234567']]),
    Benutzer:mkSheet([['B','A','R','P','E'],['anna','Anna','admin','geheim12','Nein']])};
  const cc=ctx(sheets); load(cc,'apps-script/hallendienst/Code.gs');
  vm.runInContext('createCalendarEvent=function(){ this.__cal=(this.__cal||0)+1; }; deleteCalendarEvent=function(){ this.__del=(this.__del||0)+1; };',cc);
  return {c:cc,sh:sheets};
}
const S1=tagDE(20), S2=tagDE(27), S3=tagDE(4), S4=tagDE(2);
let H=hdCtx([S1,S2,S3,S4]); c=H.c; sh=H.sh;
const hdRow=d=>sh.Hallendienst.rows.find(r=>r[0]===d);
const E={datum:S1,vorname:'Eva',nachname:"O'Neil-Müller",email:'eva@example.org',mobilnr:'0160/123.45-6'};
ok(post(c,{...E,vorname:'<img src=x onerror=alert(1)>'}).status==='error','Hallendienst: Skript im Namen abgelehnt');
ok(post(c,{...E,vorname:'',nachname:''}).status==='error'&&!c.__cal,'Hallendienst: leerer Name -> kein Kalendereintrag');
r=post(c,{...E,vorname:'Erika',nachname:'Fremd',email:'x@example.org'});
ok(r.status==='geburtsdatum'&&hdRow(S1)[2]==='','Unbekannte Person: erst Geburtsdatum nachfragen, Termin bleibt frei');
r=post(c,{...E,vorname:'Erika',nachname:'Fremd',email:'x@example.org',geburtsdatum:'1990-05-03'});
ok(r.status==='unbekannt'&&/0160 1234567/.test(r.message)&&hdRow(S1)[2]===''&&!sh.Dienste,'Kein Mitglied: Hinweis mit Telefonnummer, nichts eingetragen');
r=post(c,{...E,email:'andere@example.org'}); ok(r.status==='geburtsdatum','Mitglied mit anderer E-Mail und anderer Nummer: Geburtsdatum nachfragen');
// Mobilnummer als zweite Stufe (ohne Rueckfrage)
let HM=hdCtx([S1,S2]); r=post(HM.c,{...E,email:'andere@example.org',mobilnr:'0160 / 555 66-77'});
ok(r.status==='ok'&&HM.sh.Dienste.rows[1][6]==='Eva','andere E-Mail, aber hinterlegte Mobilnummer (+49 vs. 0160): erkannt ohne Rueckfrage');
r=post(HM.c,{datum:S2,vorname:'Tom',nachname:'Maier',email:'neu@example.org',mobilnr:'0170 5556677'});
ok(r.status==='ok'&&HM.sh.Dienste.rows[2][6]==='Tom','Nummer in der Tabelle als Zahl ohne fuehrende 0: trotzdem erkannt');
HM=hdCtx([S1]); r=post(HM.c,{datum:S1,vorname:'Erika',nachname:'Fremd',email:'x@example.org',mobilnr:'0160 5556677'});
ok(r.status==='geburtsdatum'&&!HM.sh.Dienste,'fremder Name mit Nummer eines Mitglieds: nicht erkannt');
const nt=vm.runInContext('dienstNormTel',HM.c); ok(nt('+49 (0)160 5556677')===nt('01605556677')&&nt('0049 160 5556677')===nt('01605556677')&&nt('160-555 66 77')===nt('+491605556677')&&nt('12')==='','Telefonnummern werden einheitlich verglichen');
r=post(c,{...E,email:'andere@example.org',geburtsdatum:'1991-01-01'}); ok(r.status==='unbekannt','falsches Geburtsdatum: nicht erkannt');
c.mailFail=true; r=post(c,{...E,vorname:' eva ',nachname:'ONeil Mueller',email:'EVA@example.org'}); c.mailFail=false;
ok(r.status==='ok'&&hdRow(S1)[2]==='Eva'&&hdRow(S1)[3]==="O'Neil-Müller"&&c.__cal===1,'Mitglied erkannt trotz Schreibweise; Name wie in der Liste; ok trotz Mailfehler');
const DR=()=>sh.Dienste.rows;
ok(DR().length===2&&DR()[1][1]==='hallendienst'&&DR()[1][2]===S1&&DR()[1][8]==='eingetragen'&&/^d[0-9a-f]{39}$/.test(DR()[1][0]),'Eintrag im Tab Dienste mit ID');
const MHd=sh.Mitglieder.rows[0], cA=MHd.indexOf('Dienste lfd. Jahr'), cL=MHd.indexOf('Letzter Dienst');
ok(cA>=21&&cL===cA+1&&sh.Mitglieder.rows[1][cA]===(jahrVon(S1)===new Date().getFullYear()?1:0)&&sh.Mitglieder.rows[2][cA]===0,'Mitgliederliste: Spalten angelegt, Zaehler gesetzt');
ok(post(c,{...E,vorname:'Zwei',nachname:'Ter',email:'z@example.org'}).status==='error','belegter Termin abgelehnt');
r=post(c,{datum:S2,vorname:'Tim',nachname:'Maier',email:'fam@example.org',mobilnr:'0160 1'});
ok(r.status==='ok'&&DR()[2][6]==='Tim'&&DR()[2][4]!==DR()[1][4],'Familie mit gemeinsamer E-Mail: richtige Person ueber den Namen');
H=hdCtx([S1]); c=H.c; sh=H.sh;
r=post(c,{datum:S1,vorname:'Max',nachname:'Doppelt',email:'max@example.org',mobilnr:'0160 1'}); ok(r.status==='geburtsdatum','Namensvetter mit gleicher E-Mail: Geburtsdatum noetig');
r=post(c,{datum:S1,vorname:'Max',nachname:'Doppelt',email:'max@example.org',mobilnr:'0160 1',geburtsdatum:'2000-02-02'}); ok(r.status==='ok'&&/02\.02\.2000$/.test(sh.Dienste.rows[1][4]),'… und damit eindeutig');
// Bestaetigungsmail mit Austragen-Link
H=hdCtx([S1,S3,S4]); c=H.c; sh=H.sh; r=post(c,E);
const bm=c.mails.find(m=>/Hallendienst bestätigt/.test(m.subject));
ok(r.status==='ok'&&bm&&bm.body.includes('/dienst.html?k=h&c='+sh.Dienste.rows[1][0])&&!bm.body.includes('github.io'),'Bestaetigungsmail enthaelt Austragen-Link');
// Dreier-Sperre
const evaKey=sh.Dienste.rows[1][4];
const vorbelegen=(jahr,n)=>{for(let i=0;i<n;i++) sh.Dienste.rows.push(['d'+String(i).padStart(39,'0'),'helferdienst','x'+i,new Date(jahr,0,10+i),evaKey,"O'Neil-Müller",'Eva','eva@example.org','eingetragen',new Date(),new Date()]);};
H=hdCtx([S1,S3]); c=H.c; sh=H.sh; post(c,{...E,datum:S3}); sh.Dienste.rows.length=1; vorbelegen(jahrVon(S1)-1,3);
ok(post(c,E).status==='ok','drei Dienste im VORJAHR sperren nicht');
H=hdCtx([S1,S3]); c=H.c; sh=H.sh; sh.Dienste=mkSheet([['ID']]); vorbelegen(jahrVon(S1),3);
r=post(c,E); ok(r.status==='limit'&&/fleißig/.test(r.message)&&sh.Hallendienst.rows[1][2]==='','ab dem 3. Dienst (Hallen- und Helferdienste zusammen): Hallendienst gesperrt');
sh.Dienste.rows[1][8]='ausgetragen'; ok(post(c,E).status==='ok','ausgetragene Dienste zaehlen nicht');
H=hdCtx([S1,S3]); c=H.c; sh=H.sh; sh.Dienste=mkSheet([['ID']]); vorbelegen(jahrVon(S3),3);
ok(post(c,{...E,datum:S3}).status==='ok','… ausser in den letzten 5 Tagen vor dem Termin');
// Grenze und Fristen sind im Config-Tab einstellbar
H=hdCtx([S1,S3]); c=H.c; sh=H.sh; sh.Dienste=mkSheet([['ID']]); vorbelegen(jahrVon(S1),3); sh.Config.rows.push(['dienste_limit','5']);
ok(post(c,E).status==='ok','Grenze auf 5 gesetzt: dritter Dienst sperrt nicht');
H=hdCtx([S1,S3]); c=H.c; sh=H.sh; sh.Dienste=mkSheet([['ID']]); vorbelegen(jahrVon(S1),1); sh.Config.rows.push(['dienste_limit','1']);
ok(post(c,E).status==='limit','Grenze auf 1 gesetzt: schon der erste Dienst sperrt');
H=hdCtx([S1,S3]); c=H.c; sh=H.sh; sh.Dienste=mkSheet([['ID']]); vorbelegen(jahrVon(S1),9); sh.Config.rows.push(['dienste_limit','0']);
ok(post(c,E).status==='ok','Grenze 0: abgeschaltet');
H=hdCtx([S1,S3]); c=H.c; sh=H.sh; sh.Dienste=mkSheet([['ID']]); vorbelegen(jahrVon(S1),3); sh.Config.rows.push(['dienste_hd_sperre_tage','30']);
ok(post(c,E).status==='ok','Sperrfrist auf 30 Tage gesetzt: Termin in 20 Tagen wieder frei');
H=hdCtx([S4]); c=H.c; sh=H.sh; sh.Config.rows.push(['dienste_austragen_tage','1'],['dienste_limit','abc']); post(c,{...E,datum:S4});
r=post(c,{action:'dienstInfo',c:sh.Dienste.rows[1][0]}); ok(r.austragenMoeglich===true&&r.fristTage===1,'Austragen-Frist auf 1 Tag gesetzt; ungueltiger Wert faellt auf Standard zurueck');
// Austragen
H=hdCtx([S1,S4]); c=H.c; sh=H.sh; post(c,E); post(c,{...E,datum:S4});
const id1=sh.Dienste.rows[1][0], id2=sh.Dienste.rows[2][0];
r=post(c,{action:'dienstInfo',c:id1}); ok(r.ok&&r.titel==='Hallendienst'&&r.vorname==='Eva'&&r.datum===S1&&r.austragenMoeglich===true&&!('email' in r)&&!JSON.stringify(r).includes('Neil'),'dienstInfo: Termin und Vorname, keine weiteren Personendaten');
ok(post(c,{action:'dienstInfo',c:'x'}).error&&post(c,{action:'dienstAustragen',c:'d'+'0'.repeat(39)}).error,'ungueltige ID abgelehnt');
r=post(c,{action:'dienstInfo',c:id2}); ok(r.ok&&r.austragenMoeglich===false&&r.zuSpaet===true,'2 Tage vorher: Austragen nicht mehr moeglich');
r=post(c,{action:'dienstAustragen',c:id2}); ok(/3 Tage/.test(r.error||'')&&/0160 1234567/.test(r.error)&&sh.Hallendienst.rows[2][2]==='Eva','zu spaet: Fehlermeldung mit Telefonnummer, Termin bleibt belegt');
let vorMails=c.mails.length; r=post(c,{action:'dienstAustragen',c:id1});
ok(r.ok&&sh.Hallendienst.rows[1][2]===''&&sh.Hallendienst.rows[1][4]===''&&sh.Dienste.rows[1][8]==='ausgetragen'&&c.__del===1,'Austragen: Termin wieder frei, Kalendereintrag weg, Protokoll aktualisiert');
ok(c.mails.length===vorMails+1&&/wieder frei/.test(c.mails[c.mails.length-1].subject),'Vorstand wird informiert');
ok(post(c,{action:'dienstAustragen',c:id1}).schonAusgetragen===true&&post(c,{action:'dienstInfo',c:id1}).status==='ausgetragen','zweiter Klick aendert nichts');
// Vorstand entfernt Person -> gestrichen
H=hdCtx([S1]); c=H.c; sh=H.sh; post(c,E);
let cm0=c.mails.length; r=post(c,{action:'clearPerson',username:'anna',password:'geheim12',datum:S1});
ok(!r.error&&sh.Dienste.rows[1][8]==='gestrichen'&&sh.Mitglieder.rows[1][sh.Mitglieder.rows[0].indexOf('Dienste lfd. Jahr')]===0,'Vorstand entfernt Person: Dienst gestrichen, Zaehler zurueck');
ok(c.mails.length===cm0+1&&c.mails[cm0].to===E.email&&/entfällt/.test(c.mails[cm0].subject)&&/findet leider nicht statt/.test(c.mails[cm0].body),'… und die Person bekommt eine Absage-Mail');
H=hdCtx([S1]); c=H.c; sh=H.sh; post(c,E); cm0=c.mails.length;
r=post(c,{action:'deleteTermin',username:'anna',password:'geheim12',datum:S1});
ok(!r.error&&c.mails.length===cm0+1&&/entfällt/.test(c.mails[cm0].subject)&&sh.Dienste.rows[1][8]==='gestrichen','Vorstand loescht Termin: Absage-Mail an den Eingetragenen');
H=hdCtx([S1]); c=H.c; sh=H.sh; cm0=c.mails.length; post(c,{action:'deleteTermin',username:'anna',password:'geheim12',datum:S1});
ok(c.mails.length===cm0,'freier Termin geloescht: keine Mail');
// Gemeinsamer Block ist in beiden Projekten identisch
const kernRe=/\/\/ >>> DIENSTE-KERN[\s\S]*?\/\/ <<< DIENSTE-KERN/, lies=f=>fs.readFileSync(path.join(repo,f),'utf8');
const kern=lies('apps-script/_gemeinsam/dienste-kern.js').trim();
ok((lies('apps-script/mitgliederliste/Mitgliederliste.gs').match(kernRe)||[])[0]===kern&&(lies('apps-script/hallendienst/Code.gs').match(kernRe)||[])[0]===kern,'Dienste-Kern in beiden Projekten identisch mit der Vorlage');

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
ok(evMail&&evMail.body.includes('rueckmeldung.html?t='+tok+'\n')&&!/[?&]a=(ja|nein)/.test(evMail.body),'Termin-Mail enthaelt einen Rueckmelde-Link ohne Antwort in der Adresse');
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

// ---- Externer Maildienst (Brevo) fuer Rundmails
const mk=n=>Array.from({length:n},(_,i)=>'m'+i+'@example.org');
function mailCtx(props){ const cc=ctx({Mitglieder:mkSheet([MH.slice()]),Config:mkSheet([['Key','Value','B']]),Benutzer:mkSheet([['B']])}); load(cc,'apps-script/mitgliederliste/Mitgliederliste.gs'); Object.assign(cc.props,props||{}); return cc; }
const O={subject:'Betreff',body:'Hallo,\nLink: https://zugzwang-auerbach.de/x.html?t=1&a=ja.\n<b>kein html</b>',name:'Verein'};
c=mailCtx(); let smc=vm.runInContext('sendMailChunk',c);
r=smc(O,mk(5)); ok(r.sent===5&&c.brevo.calls.length===0&&c.mails.length===5,'ohne Schluessel: alles wie bisher ueber Gmail');
c=mailCtx({BREVO_API_KEY:'k'}); smc=vm.runInContext('sendMailChunk',c); smc(O,mk(2)); ok(c.brevo.calls.length===0,'Schluessel ohne Absenderadresse: Brevo bleibt aus');
const BP={BREVO_API_KEY:'geheim',MAIL_FROM_EMAIL:'verein@zugzwang-auerbach.de'};
c=mailCtx(BP); smc=vm.runInContext('sendMailChunk',c);
r=smc({...O,attachments:[c.Utilities.newBlob('ICS','text/calendar','termin.ics')]},mk(3));
const bc=c.brevo.calls[0];
ok(r.sent===3&&r.remaining.length===0&&c.mails.length===0&&c.brevo.calls.length===3,'mit Schluessel: Versand ueber Brevo, Gmail unberuehrt');
ok(bc.url==='https://api.brevo.com/v3/smtp/email'&&bc.key==='geheim'&&bc.p.sender.email==='verein@zugzwang-auerbach.de'&&bc.p.replyTo.email==='boulderhallezugzwang@gmail.com'&&bc.p.to.length===1&&bc.p.to[0].email==='m0@example.org','Brevo-Anfrage: Absender, Antwortadresse, ein Empfaenger je Mail');
ok(bc.p.textContent===O.body&&bc.p.htmlContent.includes('&lt;b&gt;kein html&lt;/b&gt;')&&bc.p.htmlContent.includes('<a href="https://zugzwang-auerbach.de/x.html?t=1&amp;a=ja">')&&bc.p.htmlContent.includes('<br>'),'Text wird sicher in HTML gewandelt, Links klickbar');
ok(bc.p.attachment[0].name==='termin.ics'&&Buffer.from(bc.p.attachment[0].content,'base64').toString()==='ICS','ICS-Anhang wird mitgeschickt');
// Limit: 300 ueber Brevo, Rest ueber Gmail (98 = 100 minus Reserve), Rest in die Warteschlange
c=mailCtx(BP); smc=vm.runInContext('sendMailChunk',c);
r=smc(O,mk(450)); ok(c.brevo.calls.length===300&&c.mails.length===98&&r.sent===398&&r.remaining.length===52&&r.remaining[0]==='m398@example.org','450 Empfaenger: 300 Brevo + 98 Gmail, 52 in die Warteschlange');
r=smc(O,mk(10)); ok(c.brevo.calls.length===300&&r.sent===0&&r.remaining.length===10,'Tageslimit erreicht: nichts mehr, alles wartet');
ok(vm.runInContext('mailCapacityNow',c)()===0,'Kapazitaet 0 nach Ausschoepfen');
c=mailCtx({...BP,BREVO_DAILY_LIMIT:'20'}); smc=vm.runInContext('sendMailChunk',c); c.gmailQuota=0;
r=smc(O,mk(25)); ok(r.sent===20&&r.remaining.length===5,'eigenes Tageslimit wird beachtet');
// Fehlerfaelle
c=mailCtx(BP); smc=vm.runInContext('sendMailChunk',c); c.brevo.respond=()=>({code:401,body:'{"code":"unauthorized","message":"Key not found"}'});
r=smc(O,mk(4)); ok(r.sent===4&&c.mails.length===4&&c.brevo.calls.length===1&&r.failed.length===0,'ungueltiger Schluessel: Rueckfall auf Gmail, niemand als fehlgeschlagen');
c=mailCtx(BP); smc=vm.runInContext('sendMailChunk',c); c.gmailQuota=0; c.brevo.respond=(p,n)=>n===2?{code:400,body:'{"code":"invalid_parameter","message":"email is not valid"}'}:{code:201,body:'{}'};
r=smc(O,mk(4)); ok(r.sent===3&&r.failed.length===1&&r.failed[0]==='m1@example.org'&&r.remaining.length===0,'abgelehnte Adresse zaehlt als fehlgeschlagen, Rest geht raus');
c=mailCtx(BP); smc=vm.runInContext('sendMailChunk',c); c.gmailQuota=0; c.brevo.respond=(p,n)=>n>=3?{code:400,body:'{"code":"not_enough_credits","message":"x"}'}:{code:201,body:'{}'};
r=smc(O,mk(6)); ok(r.sent===2&&r.failed.length===0&&r.remaining.length===4,'Brevo meldet Limit: Rest wartet, niemand fehlgeschlagen');
r=smc(O,mk(2)); ok(c.brevo.calls.length===3&&r.remaining.length===2,'danach wird Brevo heute nicht mehr angefragt');
c=mailCtx(BP); smc=vm.runInContext('sendMailChunk',c); c.gmailQuota=0; c.brevo.respond=(p,n)=>n===2?{throw:true}:{code:201,body:'{}'};
r=smc(O,mk(5)); ok(r.sent===1&&r.failed.length===0&&r.remaining.length===4,'Netzwerkfehler: Rest wartet statt verloren zu gehen');
c=mailCtx(BP); smc=vm.runInContext('sendMailChunk',c); c.brevo.respond=(p,n)=>n>=3?{code:400,body:'{"code":"account_limit_reached","message":"monthly quota"}'}:{code:201,body:'{}'};
r=smc(O,mk(6)); ok(r.sent===6&&r.failed.length===0&&r.remaining.length===0&&c.mails.length===4,'unbekannter Brevo-Fehler (z.B. Monatskontingent): Rest geht ueber Gmail, niemand fehlgeschlagen');
// Termin-Mail laeuft durch denselben Weg
sh={Mitglieder:mkSheet([MH.slice(),['A','B','O','m1@example.org','','','Erwachsene'],['C','D','O','m2@example.org','','','Erwachsene']]),Config:mkSheet([['Key','Value','B']]),Benutzer:mkSheet([['B','A','R','P','E'],['anna','Anna','admin','geheim12','Nein']])};
c=ctx(sh); load(c,'apps-script/mitgliederliste/Mitgliederliste.gs'); Object.assign(c.props,BP);
r=post(c,{username:'anna',password:'geheim12',action:'createEvent',kalender:'events',titel:'Fest',datum:zukunft,zeitVon:'18:00',zeitBis:'21:00',beschreibung:'',mailMode:'all',remindHours:'0',rsvpAktiv:true,rsvpEmail:'o@example.org'});
ok(r.ok&&c.brevo.calls.length===2&&c.mails.length===0&&/<a href="https:\/\/zugzwang-auerbach\.de\/rueckmeldung\.html\?t=[0-9a-f]{40}">/.test(c.brevo.calls[0].p.htmlContent)&&c.brevo.calls[0].p.attachment[0].name==='termin.ics','Termin-Mail mit Rueckmelde-Link und ICS geht ueber Brevo');

// ---- Helferdienste
const isoIn=n=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);};
function heCtx(){
  const sheets={
    Mitglieder:mkSheet([MH.slice(),
      ['Müller','Eva','A','eva@example.org','03.05.1990','','Erwachsene'],
      ['Maier','Tom','A','tom@example.org','02.02.1980','','Erwachsene'],
      ['Maier','Tim','A','tim@example.org','11.12.2008','','Erwachsene'],
      ['Huber','Ida','A','ida@example.org','01.01.1985','','Erwachsene'],
      ['Fleißig','Fritz','A','fritz@example.org','04.04.1975','','Erwachsene']]),
    Config:mkSheet([['Key','Value','B'],['dienste_kontakt_telefon','0160 1234567','']]),
    Benutzer:mkSheet([['B','A','R','P','E'],['anna','Anna','admin','geheim12','Nein']])};
  const cc=ctx(sheets); load(cc,'apps-script/mitgliederliste/Mitgliederliste.gs'); return {c:cc,sh:sheets};
}
let HE=heCtx(); c=HE.c; sh=HE.sh;
const EV={...A,action:'createEvent',titel:'Umschrauben',datum:isoIn(10),zeitVon:'10:00',zeitBis:'14:00',beschreibung:'Bitte Akkuschrauber mitbringen',mailMode:'all',remindHours:'24'};
ok(/Arbeitsdienste/.test(post(c,{...EV,kalender:'events',helferAktiv:true,helferPlaetze:2}).error||''),'Helferdienst nur im Kalender Arbeitsdienste');
ok(/Anzahl der Helfer/.test(post(c,{...EV,kalender:'arbeitsdienst',helferAktiv:true}).error||'')&&!sh.Helferdienste,'Helferdienst ohne Anzahl abgelehnt');
r=post(c,{...EV,kalender:'arbeitsdienst',helferAktiv:true,helferPlaetze:2});
ok(r.ok&&/Helferdienst mit 2 Plätzen/.test(r.message)&&sh.Helferdienste.rows.length===2&&/^h[0-9a-f]{39}$/.test(sh.Helferdienste.rows[1][0]),'Helferdienst als Termin angelegt');
const hid=sh.Helferdienste.rows[1][0];
ok(c.mails.some(m=>/Umschrauben/.test(m.subject)&&m.body.includes('Wir suchen 2 Helferinnen und Helfer')&&m.body.includes('verein.html#helferdienste')),'Termin-Mail mit Hinweis und Link zur Eintragung');
r=post(c,{action:'helferListe'});
ok(r.ok&&r.dienste.length===1&&r.dienste[0].plaetze===2&&r.dienste[0].belegt===0&&r.dienste[0].voll===false&&r.dienste[0].titel==='Umschrauben'&&/10:00 – 14:00/.test(r.dienste[0].zeit),'oeffentliche Liste: Dienst mit Belegung');
const HEin=(v,n,e,x)=>post(c,{action:'helferEintragen',id:hid,vorname:v,nachname:n,email:e,mobilnr:'0160 1',...(x||{})});
ok(post(c,{action:'helferEintragen',id:'x',vorname:'Eva',nachname:'Müller',email:'eva@example.org'}).status==='error','ungueltige Dienst-ID abgelehnt');
ok(HEin('Erika','Fremd','x@example.org').status==='geburtsdatum'&&/0160 1234567/.test(HEin('Erika','Fremd','x@example.org',{geburtsdatum:'1990-01-01'}).message),'Nicht-Mitglied: Geburtsdatum, dann Hinweis mit Telefonnummer');
let vm0=c.mails.length; r=HEin('Eva','Mueller','eva@example.org');
const HD=()=>sh.Dienste.rows;
ok(r.status==='ok'&&HD().length===2&&HD()[1][1]==='helferdienst'&&HD()[1][2]===hid&&HD()[1][8]==='eingetragen','Mitglied eingetragen, Platz belegt');
ok(c.mails.length===vm0+1&&c.mails[vm0].to==='eva@example.org'&&c.mails[vm0].body.includes('/dienst.html?k=e&c='+HD()[1][0])&&/Umschrauben/.test(c.mails[vm0].body),'Bestaetigungsmail mit Austragen-Link');
ok(HEin('Eva','Müller','eva@example.org').status==='schon'&&HD().length===2,'doppelte Eintragung abgelehnt');
ok(HEin('Tom','Maier','tom@example.org').status==='ok','zweiter Platz belegt');
vm0=c.mails.length; r=HEin('Tim','Maier','tim@example.org');
ok(r.status==='warteliste'&&HD()[3][8]==='warteliste'&&/Warteliste/.test(c.mails[vm0].subject),'voll: Warteliste mit eigener Mail');
r=post(c,{action:'helferListe'}).dienste[0];
ok(r.belegt===2&&r.voll===true&&!JSON.stringify(r).includes('Maier')&&!JSON.stringify(r).includes('@'),'oeffentlich: 2 von 2 belegt, keine Namen oder Adressen');
const cAn=sh.Mitglieder.rows[0].indexOf('Dienste lfd. Jahr');
const istDiesesJahr=new Date(isoIn(10)).getFullYear()===new Date().getFullYear();
ok(sh.Mitglieder.rows[1][cAn]===(istDiesesJahr?1:0)&&sh.Mitglieder.rows[3][cAn]===0,'Warteliste zaehlt nicht, Eintragung zaehlt');
r=post(c,{...A,action:'getEvents'}).events.find(e=>e.titel==='Umschrauben');
ok(r.helfer&&r.helfer.plaetze===2&&r.helfer.belegt===2&&r.helfer.warteliste===1&&r.helfer.liste.length===3&&r.helfer.liste.some(h=>h.name==='Tim Maier'&&h.status==='warteliste'),'intern: Belegung und Namensliste');
const evH=r;
// fleissiger Helfer: Jahresgrenze erreicht -> darf kommen, belegt keinen Platz
const fritzKey=vm.runInContext('dienstMitgliedKey',c)('Fleißig','Fritz','04.04.1975'); const dj=new Date(isoIn(10)).getFullYear();
for(let i=0;i<3;i++) HD().push(['d'+String(i).padStart(39,'9'),'hallendienst','0'+i+'.01.'+dj,new Date(dj,0,5+i),fritzKey,'Fleißig','Fritz','fritz@example.org','eingetragen',new Date(),new Date()]);
vm0=c.mails.length; r=post(c,{action:'helferEintragen',id:hid,vorname:'Fritz',nachname:'Fleißig',email:'fritz@example.org',mobilnr:'0160 1'});
ok(r.status==='ohne_platz'&&/fleißig/.test(r.message)&&/keinen der Helferplätze/.test(r.message)&&HD()[HD().length-1][8]==='ohne_platz','ab dem 3. Dienst: Eintragung ohne Platz mit freundlicher Meldung');
ok(post(c,{action:'helferListe'}).dienste[0].belegt===2&&/herzlich willkommen/.test(c.mails[vm0].body),'… belegt keinen Platz, bekommt eine nette Mail');
// Austragen -> Warteliste rueckt nach
const evaId=HD()[1][0];
r=post(c,{action:'dienstInfo',c:evaId}); ok(r.ok&&r.titel==='Umschrauben'&&r.vorname==='Eva'&&/10:00/.test(r.zeit)&&r.austragenMoeglich===true,'Austragen-Seite: Angaben zum Helferdienst');
vm0=c.mails.length; r=post(c,{action:'dienstAustragen',c:evaId});
ok(r.ok&&HD()[1][8]==='ausgetragen'&&HD()[3][8]==='eingetragen','Austragen: Platz geht an die Warteliste');
ok(c.mails.slice(vm0).some(m=>m.to==='tim@example.org'&&/Platz frei/.test(m.subject)&&/dienst\.html\?k=e&c=/.test(m.body)),'Nachruecker bekommt eine Mail');
ok(post(c,{action:'dienstAustragen',c:evaId}).schonAusgetragen===true,'zweites Austragen aendert nichts');
// mehr Plaetze -> Warteliste rueckt nach
HEin('Ida','Huber','ida@example.org'); ok(HD()[HD().length-1][8]==='warteliste','wieder voll: Ida auf der Warteliste');
r=post(c,{...A,action:'updateEvent',kalender:'arbeitsdienst',eventId:evH.id,titel:'Umschrauben',datum:isoIn(10),zeitVon:'10:00',zeitBis:'14:00',beschreibung:'',mailMode:'none',remindHours:'24',helferAktiv:true,helferPlaetze:3});
ok(r.ok&&HD()[HD().length-1][8]==='eingetragen'&&sh.Helferdienste.rows[1][6]===3,'Plaetze erhoeht: Warteliste rueckt nach');
// Vorstand streicht einen Helfer
const tomId=HD()[2][0]; ok(post(c,{action:'helferStreichen',dienstId:tomId}).error==='Nicht authentifiziert','Streichen nur mit Anmeldung');
const sm0=c.mails.length; r=post(c,{...A,action:'helferStreichen',dienstId:tomId}); ok(r.ok&&HD()[2][8]==='gestrichen'&&/Tom Maier gestrichen/.test(r.message),'Vorstand streicht Helfer: zaehlt nicht mehr');
ok(c.mails.slice(sm0).some(m=>/Eintragung wurde herausgenommen/.test(m.subject)&&/Hallo Tom,/.test(m.body)),'… und der Gestrichene bekommt eine Mail');
// Erinnerung
sh.Helferdienste.rows[1][3]=new Date(Date.now()+20*3600e3); sh.Helferdienste.rows[1][4]=new Date(Date.now()+24*3600e3);
const morgen=new Date(Date.now()+20*3600e3); HD().forEach((x,i)=>{ if(i>0&&x[1]==='helferdienst') x[3]=new Date(morgen.getFullYear(),morgen.getMonth(),morgen.getDate()); });
const erin=vm.runInContext('helferErinnerungen',c); vm0=c.mails.length; erin();
let em=c.mails.slice(vm0);
ok(em.length===3&&em.every(m=>/Erinnerung Helferdienst/.test(m.subject))&&em.some(m=>m.to==='fritz@example.org')&&!em.some(m=>m.to==='tom@example.org'||m.to==='eva@example.org'),'Erinnerung an alle, die kommen (nicht an Gestrichene/Ausgetragene)');
vm0=c.mails.length; erin(); ok(c.mails.length===vm0,'Erinnerung nur einmal');
r=post(c,{action:'dienstAustragen',c:HD()[3][0]}); ok(/3 Tage/.test(r.error||'')&&/0160 1234567/.test(r.error),'kurz vorher: Austragen nur noch per Telefon');
// Termin loeschen -> Helfer informieren, Eintraege streichen
sh.Helferdienste.rows[1][3]=new Date(Date.now()+10*86400e3);
vm0=c.mails.length; r=post(c,{...A,action:'deleteEvent',kalender:'arbeitsdienst',eventId:evH.id,mailMode:'none'});
ok(r.ok&&/3 eingetragene Helfer wurden benachrichtigt/.test(r.message)&&sh.Helferdienste.rows.length===1&&c.mails.slice(vm0).filter(m=>/Helferdienst entfällt/.test(m.subject)).length===3,'Termin geloescht: Helfer benachrichtigt, Dienst entfernt');
ok(HD().filter(x=>x[1]==='helferdienst'&&(x[8]==='eingetragen'||x[8]==='ohne_platz'||x[8]==='warteliste')).length===0&&post(c,{action:'helferListe'}).dienste.length===0,'… alle Eintraege gestrichen, Liste leer');
// Helferdienst ausschalten beim Bearbeiten
HE=heCtx(); c=HE.c; sh=HE.sh; post(c,{...EV,kalender:'arbeitsdienst',mailMode:'none',helferAktiv:true,helferPlaetze:1});
post(c,{action:'helferEintragen',id:sh.Helferdienste.rows[1][0],vorname:'Eva',nachname:'Müller',email:'eva@example.org',mobilnr:'0160 1'});
const ev2=post(c,{...A,action:'getEvents'}).events[0];
r=post(c,{...A,action:'updateEvent',kalender:'arbeitsdienst',eventId:ev2.id,titel:'Umschrauben',datum:isoIn(10),zeitVon:'10:00',zeitBis:'14:00',beschreibung:'',mailMode:'none',remindHours:'0',helferAktiv:false});
ok(r.ok&&sh.Helferdienste.rows.length===1&&sh.Dienste.rows[1][8]==='gestrichen','Helferdienst ausgeschaltet: Eintragung gestrichen');
r=post(c,{...A,action:'createEvent',kalender:'events',titel:'Normal',datum:isoIn(5),zeitVon:'18:00',zeitBis:'19:00',beschreibung:'',mailMode:'none',remindHours:'0'});
ok(r.ok&&!/Helferdienst/.test(r.message),'normaler Termin unveraendert');

// ---- Ersatzbeitrag: Familien-Zuordnung, Uebersicht, Befreiung, Antrag
{
const Y=new Date().getFullYear();
const EH=['Nachname','Vorname','Ort','E-Mail','Geburtsdatum','Mandatsreferenz','Status','Eintritt','Zahlungspflichtiges Mitglied','Adresse','PLZ','Telefon Mobil','Bemerkungen','IBAN','BIC','Kontoinhaber','SEPA-Lastschrift erlauben','Mandat Unterschriftsdatum','Lastschriftart','Chip','ChipNr.','Dienst-Befreiung','Ersatzbeitrag gewählt'];
const M=(nn,vn,geb,ref,status,eintritt,zm,bef,gew)=>[nn,vn,'Ort','x@example.org',geb,ref,status,eintritt,zm,'Weg 1','91275','','',ref?'DE89370400440532013000':'',ref?'GENODEM1GLS':'',ref?vn+' '+nn:'','Ja','04.01.2026','Erst-Lastschrift','','',bef||'',gew||''];
const es={Mitglieder:mkSheet([EH.slice(),
  M('Taubmann','Thomas','27.03.1988','BVZUGZWANG00518','Mitglied Familie','04.01.2026',''),
  M('Taubmann','Carolin','04.08.1990','','Mitglied','04.01.2026',518),
  M('Taubmann','Jacobo','19.05.2023','','Mitglied','04.01.2026',518),
  M('Berg','Anna','01.01.1985','ZZ-2026-0001','Mitglied Familie','10.02.2026',''),
  M('Berg','Ben','01.01.2012','','Mitglied Familie','10.02.2026','Anna Berg'),
  M('Clar','Cora','01.01.1985','ZZ-2026-0002','Mitglied Familie','10.02.2026',''),
  M('Clar','Cid','01.01.2012','','Mitglied Familie','10.02.2026','ZZ-2026-0002'),
  M('Dorn','Dirk','01.01.1980','ZZ-2026-0518','Mitglied','10.02.2026',''),
  M('Eck','Emil','01.06.'+(Y-16),'ZZ-2026-0004','Mitglied ermäßigt','10.02.2020',''),
  M('Noll','Nils','31.12.'+(Y-16),'ZZ-2026-0012','Mitglied ermäßigt','10.02.'+Y,''),
  M('Fux','Fina','01.06.'+(Y-10),'ZZ-2026-0005','Mitglied ermäßigt','10.02.2026',''),
  M('Mohn','Mia','01.01.1999','ZZ-2026-0011','Mitglied ermäßigt','10.02.2026',''),
  M('Gans','Gerd','01.01.1970','ZZ-2026-0006','Fördermitglied','10.02.2026',''),
  M('Hahn','Hans','01.01.1970','ZZ-2026-0007','Mitglied','05.11.'+Y,''),
  M('Igel','Ina','01.01.1970','ZZ-2026-0008','Mitglied','10.02.2020','','Vorstand'),
  M('Jost','Jan','01.01.1970','ZZ-2026-0009','Mitglied','10.02.2020','','','Ja'),
  M('Kurz','Kai','01.01.2010','','Mitglied','10.02.2020','Niemand Da'),
  M('Lang','Lea','01.01.1970','ZZ-2026-0010','Mitglied','10.02.'+(Y+1),'')
 ]),Config:mkSheet([['Key','Value','B']]),
 Benutzer:mkSheet([['B','A','R','P','E'],['anna','Anna','admin','geheim12','Nein'],['tom','Tom','mitglied','pass1234','Nein']])};
const ec=ctx(es); load(ec,'apps-script/mitgliederliste/Mitgliederliste.gs');
const AD={username:'anna',password:'geheim12'};
const key=vm.runInContext('dienstMitgliedKey',ec)('Taubmann','Carolin','04.08.1990');
es.Dienste=mkSheet([['ID','Art','Dienst','Datum','Mitglied','Nachname','Vorname','E-Mail','Status','E','G'],
  ['d1','hallendienst','x',new Date(Y,5,1),key,'Taubmann','Carolin','','geleistet','',''],
  ['d3','hallendienst','y',new Date(Y,0,2),vm.runInContext('dienstMitgliedKey',ec)('Berg','Anna','01.01.1985'),'Berg','Anna','','eingetragen','',''],
  ['d2','hallendienst','x',new Date(Y-1,5,1),vm.runInContext('dienstMitgliedKey',ec)('Dorn','Dirk','01.01.1980'),'Dorn','Dirk','','eingetragen','','']]);
ok(post(ec,{action:'dienstUebersicht',username:'tom',password:'pass1234'}).error==='Keine Berechtigung','Uebersicht: nur Admin');
ok(!!post(ec,{action:'dienstUebersicht'}).error,'Uebersicht: ohne Anmeldung abgelehnt');
let u=post(ec,{...AD,action:'dienstUebersicht',jahr:Y});
const E=(nn)=>u.einheiten.find(e=>e.nachname===nn);
ok(u.ok&&u.einheiten.length===12,'Uebersicht: 12 Einheiten (Angehoerige zaehlen beim Hauptmitglied, kuenftiges Mitglied fehlt): '+u.einheiten.length);
ok(E('Taubmann').typ==='familie'&&E('Taubmann').personen===3&&E('Taubmann').dienste===1&&E('Taubmann').stand==='erfuellt','alte Nummer 518 -> Familie; Dienst der Ehefrau zaehlt fuer die Familie');
ok(E('Berg').personen===2&&E('Berg').stand==='offen'&&E('Berg').betrag===100&&E('Berg').dienste===0&&E('Berg').eingetragen===1,'Verweis per Name -> Familie; nur eingetragen (nicht quittiert) zaehlt nicht');
ok(u.offeneQuittungen.length===1&&u.offeneQuittungen[0].nachname==='Berg'&&u.offeneQuittungen[0].titel==='Hallendienst','nicht abgehakter vergangener Dienst steht in offeneQuittungen');
ok(E('Clar').personen===2&&E('Clar').typ==='familie','Verweis per Mandatsreferenz -> Familie');
ok(E('Dorn').personen===1&&E('Dorn').typ==='erwachsen'&&E('Dorn').stand==='offen'&&E('Dorn').dienste===0,'ZZ-…-0518 wird nicht mit alter Nummer 518 verwechselt; Dienst aus dem Vorjahr zaehlt nicht');
ok(E('Eck').typ==='jugend'&&E('Eck').betrag===40,'Jugend ab 16: 40');
ok(E('Mohn').typ==='jugend'&&E('Mohn').betrag===40,'Ermaessigt ueber 18 (Student): 40');
ok(E('Noll').stand==='kind'&&E('Noll').betrag===0,'beim Eintritt noch keine 16: Eintrittsjahr frei');
ok(E('Fux').stand==='kind'&&E('Fux').betrag===0,'unter 16: keine Pflicht');
ok(E('Gans').stand==='foerder'&&E('Gans').betrag===0,'Foerdermitglied: keine Pflicht');
ok(E('Hahn').stand==='neu'&&E('Hahn').betrag===0,'Eintritt ab 1.11.: im Eintrittsjahr befreit');
ok(E('Igel').stand==='befreit'&&E('Igel').betrag===0,'von Hand befreit');
ok(E('Jost').stand==='gewaehlt'&&E('Jost').betrag===100,'Ersatzbeitrag gewaehlt: zahlt');
{const fi=es.Mitglieder.rows[0].indexOf('Familie'); const F=n=>es.Mitglieder.rows.find(x=>x[1]===n)[fi];
ok(fi===EH.length&&F('Thomas')==='Taubmann, Thomas'&&F('Carolin')==='Taubmann, Thomas'&&F('Ben')==='Berg, Anna'&&F('Cid')==='Clar, Cora'&&F('Kai')==='?'&&!F('Dirk'),'Spalte Familie: Name des Hauptmitglieds, ? bei unklar, leer bei Einzelmitglied');}
ok(u.unklar.length===1&&u.unklar[0].nachname==='Kurz'&&!E('Kurz'),'unklarer Verweis wird gemeldet, nicht berechnet');
ok(u.summe.betrag===480&&u.summe.offen===5&&u.summe.erfuellt===1,'Summe 440: '+JSON.stringify(u.summe));
ok(E('Dorn').iban&&E('Dorn').mandatsreferenz==='ZZ-2026-0518','Einzugsdaten fuer Admin');
ok(u.aktiv===(Y>=2027)&&u.startJahr===2027,'Startjahr 2027');
u=post(ec,{...AD,action:'dienstUebersicht',jahr:Y+1});
ok(E('Noll').stand==='offen'&&E('Noll').betrag===40,'… im Folgejahr pflichtig (40)');
ok(E('Hahn').stand==='offen'&&!!E('Lang'),'Folgejahr: Neumitglied ist pflichtig, kuenftiges Mitglied erscheint');
es.Config.rows.push(['ersatz_betrag_jugend','0',''],['ersatz_betrag_familie','120,50',''],['ersatz_start_jahr',String(Y),'']);
u=post(ec,{...AD,action:'dienstUebersicht',jahr:Y});
ok(E('Eck').betrag===0&&E('Berg').betrag===120.5&&u.aktiv===true,'Betraege und Startjahr aus Config');
r=post(ec,{action:'ersatzInfo'});
ok(r.ok&&r.erwachsen===100&&r.familie===120.5&&r.jugend===0,'ersatzInfo oeffentlich');
ok(r.beitraege.beitrag_voll_erwachsene===40&&r.beitraege.jahreskarte_familie===220&&r.beitraege.beitrag_foerder_ermaessigt===16,'beitragsInfo: Standardbeitraege');
es.Config.rows.push(['jahreskarte_erwachsene','125',''],['beitrag_voll_familie','abc','']); r=post(ec,{action:'beitragsInfo'});
ok(r.beitraege.jahreskarte_erwachsene===125&&r.beitraege.beitrag_voll_familie===80,'beitragsInfo: Config-Wert gilt, Unsinn -> Standard');
// Befreien / Wahl setzen
const dorn=E('Dorn');
ok(!!post(ec,{action:'dienstBefreien',username:'tom',password:'pass1234',row:dorn.row,key:dorn.key,feld:'befreiung',wert:'x'}).error,'Befreien: nur Admin');
ok(!!post(ec,{...AD,action:'dienstBefreien',row:dorn.row,key:'falsch',feld:'befreiung',wert:'x'}).error,'Befreien: falscher Schluessel abgelehnt');
ok(!!post(ec,{...AD,action:'dienstBefreien',row:dorn.row,key:dorn.key,feld:'iban',wert:'x'}).error,'Befreien: fremdes Feld abgelehnt');
r=post(ec,{...AD,action:'dienstBefreien',row:dorn.row,key:dorn.key,feld:'befreiung',wert:'=Trainer'});
ok(r.ok&&es.Mitglieder.rows[dorn.row-1][21]==="'=Trainer",'Befreiung gespeichert (Formel neutralisiert)');
u=post(ec,{...AD,action:'dienstUebersicht',jahr:Y}); ok(E('Dorn').stand==='befreit','… Stand befreit');
post(ec,{...AD,action:'dienstBefreien',row:dorn.row,key:dorn.key,feld:'befreiung',wert:''});
post(ec,{...AD,action:'dienstBefreien',row:dorn.row,key:dorn.key,feld:'gewaehlt',wert:true});
u=post(ec,{...AD,action:'dienstUebersicht',jahr:Y}); ok(E('Dorn').stand==='gewaehlt'&&es.Mitglieder.rows[dorn.row-1][22]==='Ja','Wahl Ersatzbeitrag von Hand gesetzt');
// Erinnerungsmails (April/August/Oktober, Monatsanfang)
{
const RealDate=Date; const setNow=(y,m,d)=>{ vm.runInContext('Date',ec); ec.__now=new RealDate(y,m-1,d,8,0).getTime(); vm.runInContext('(function(){var R=Date; if(R.__fake) R=R.__real; function F(a,b,c,d,e,f,g){ if(arguments.length===0) return new R(__now); return new R(...arguments); } F.now=function(){return __now}; F.prototype=R.prototype; F.__fake=true; F.__real=R; Date=F;})()',ec); };
const mi=()=>es.Mitglieder.rows[0].indexOf('Dienst-Erinnerung');
for(let i=es.Config.rows.length-1;i>0;i--) if(/^ersatz_/.test(es.Config.rows[i][0])) es.Config.rows.splice(i,1); es.Config.rows.push(['ersatz_start_jahr',String(Y),'']);
const E0=ec.mails.length;
setNow(Y,5,2); vm.runInContext('ersatzErinnerungen()',ec); ok(ec.mails.length===E0,'Erinnerung: im Mai keine Mail');
setNow(Y,4,15); vm.runInContext('ersatzErinnerungen()',ec); ok(ec.mails.length===E0,'Erinnerung: Mitte April keine Mail (nur Monatsanfang)');
setNow(Y,4,2); let er=vm.runInContext('ersatzErinnerungen()',ec);
const neu=ec.mails.slice(E0), an=n=>neu.find(m=>new RegExp('Hallo '+n+',').test(m.body));
ok(er.gesendet===neu.length&&neu.length>=4,'Erinnerung Anfang April: Mails verschickt: '+neu.length);
ok(an('Thomas')&&/1 geleisteter Dienst vermerkt/.test(an('Thomas').body)&&/alles erledigt/.test(an('Thomas').body)&&/dürft Ihr gern noch einmal mithelfen/.test(an('Thomas').body)&&/^Danke für Euren Dienst/.test(an('Thomas').subject),'Familie mit Dienst: Dank und Stand');
ok(an('Anna')&&/noch kein geleisteter Dienst/.test(an('Anna').body)&&/für 1 Dienst eingetragen/.test(an('Anna').body)&&/Ersatzbeitrag von 100 € für die Familie/.test(an('Anna').body)&&/^Kleine Erinnerung: Euer Helferdienst/.test(an('Anna').subject),'Familie ohne Dienst: Erinnerung, Hinweis aufs Quittieren, Betrag');
ok(an('Mia')&&/Ersatzbeitrag von 40 €/.test(an('Mia').body)&&/verein\.html#helferdienste/.test(an('Mia').body),'Ermaessigt: 40 €, Links zu den Terminen');
ok(!an('Ina')&&!an('Jan')&&!an('Gerd')&&!an('Fina')&&!an('Carolin')&&!an('Kai'),'keine Mail an Befreite, Ersatzbeitrag-Waehler, Foerdermitglieder, Kinder, Angehoerige');
ok(es.Mitglieder.rows.find(x=>x[1]==='Anna')[mi()]===Y+'-04','Monat in Spalte Dienst-Erinnerung vermerkt');
const E1=ec.mails.length; setNow(Y,4,3); vm.runInContext('ersatzErinnerungen()',ec); ok(ec.mails.length===E1,'zweiter Lauf im April: niemand doppelt');
setNow(Y,10,1); vm.runInContext('ersatzErinnerungen()',ec); ok(ec.mails.slice(E1).some(m=>/^Zum Jahresende: /.test(m.subject)),'Oktober: letzte Erinnerung');
const E2=ec.mails.length; es.Config.rows.find(x=>x[0]==='ersatz_start_jahr')[1]=String(Y+1); setNow(Y,8,1); vm.runInContext('ersatzErinnerungen()',ec); ok(ec.mails.length===E2,'vor dem Startjahr keine Erinnerung');
es.Config.rows.find(x=>x[0]==='ersatz_start_jahr')[1]=String(Y); ec.gmailQuota=25; setNow(Y,8,1); er=vm.runInContext('ersatzErinnerungen()',ec);
ok(er.gesendet===3&&er.offen>0,'knappes Mailkontingent: Rest folgt am naechsten Tag (Reserve bleibt frei): '+JSON.stringify(er));
ec.gmailQuota=100;
// Jahresabschluss Anfang Januar fuer das Vorjahr
const A0=ec.mails.length; setNow(Y+1,1,1); vm.runInContext('ersatzAbschlussMails()',ec); ok(ec.mails.length===A0,'Abschluss: am 1.1. noch keine Mail');
setNow(Y+1,1,2); let ar=vm.runInContext('ersatzAbschlussMails()',ec); const am=ec.mails.slice(A0), aan=n=>am.find(m=>new RegExp('Hallo '+n+',').test(m.body));
ok(ar.gesendet===am.length&&aan('Anna')&&new RegExp('für '+Y+' kein geleisteter Dienst eingetragen').test(aan('Anna').body)&&/nicht am iPad in der Halle quittiert/.test(aan('Anna').body)&&/Ersatzbeitrag von 100 € für die Familie/.test(aan('Anna').body)&&/bis zum 31\. Januar/.test(aan('Anna').body),'Abschluss am 2.1.: Mail an Familie ohne Dienst mit Betrag und Frist');
ok(aan('Mia')&&/40 €/.test(aan('Mia').body)&&!aan('Thomas')&&!aan('Ina')&&!aan('Jan')&&!aan('Gerd')&&!aan('Hans'),'Abschluss: nur wer offen ist (nicht erfuellt, befreit, gewaehlt, Foerder, neu)');
ok(es.Mitglieder.rows.find(x=>x[1]==='Anna')[mi()]===Y+'-Abschluss','Abschluss in Spalte Dienst-Erinnerung vermerkt');
const A1=ec.mails.length; setNow(Y+1,1,3); vm.runInContext('ersatzAbschlussMails()',ec); ok(ec.mails.length===A1,'Abschluss nicht doppelt');
setNow(Y+1,2,2); vm.runInContext('ersatzAbschlussMails()',ec); ok(ec.mails.length===A1,'Abschluss: im Februar nichts');
vm.runInContext('Date=Date.__real',ec);
}
// Antrag: Wahl + Verweis per Mandatsreferenz; Zusatzspalten werden angelegt
const as={Mitglieder:mkSheet([MH.slice()]),Config:mkSheet([['Key','Value','B']]),Benutzer:mkSheet([['B']])};
const ac=ctx(as); load(ac,'apps-script/mitgliederliste/Mitgliederliste.gs');
r=post(ac,{...antrag,nachname:'Muster',kategorie:'Mitglied Familie',helferdienst:'ersatz'});
const gi=as.Mitglieder.rows[0].indexOf('Ersatzbeitrag gewählt');
ok(r.status==='ok'&&gi===MH.length&&as.Mitglieder.rows[1][gi]==='Ja'&&!as.Mitglieder.rows[2][gi],'Antrag: Wahl Ersatzbeitrag beim Hauptmitglied vermerkt');
ok(as.Mitglieder.rows[2][8]===as.Mitglieder.rows[1][5]&&/^ZZ-/.test(as.Mitglieder.rows[2][8]),'Antrag: Angehoerige verweisen per Mandatsreferenz');
ok(ac.mails.some(m=>/Ersatzbeitrag statt Helferdienst/.test(m.body)),'Antrag: Wahl steht in der Mail');
ok(post(ac,{...antrag,helferdienst:'quatsch'}).status==='error','Antrag: ungueltige Wahl abgelehnt');
ok(post(ac,{...antrag,nachname:'Alt'}).status==='ok','Antrag ohne Wahl (alte Seite im Cache) geht weiter');
}

// ---- Dienst quittieren (iPad)
{
const now=new Date(), T0=new Date(now.getFullYear(),now.getMonth(),now.getDate(),0,0), T1=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59);
const gestern=new Date(T0.getTime()-86400000);
const QH=['Nachname','Vorname','Ort','E-Mail','Geburtsdatum','Mandatsreferenz','Status','Eintritt','Zahlungspflichtiges Mitglied','Adresse','PLZ','Telefon Mobil'];
const did=n=>'d'+String(n).padStart(39,'0');
const qs={Mitglieder:mkSheet([QH.slice(),
   ['Müller','Eva','O','eva@example.org','03.05.1990','ZZ-1','Mitglied','01.01.2020','','','',''],
   ['Kern','Karl','O','karl@example.org','04.06.1985','ZZ-2','Mitglied','01.01.2020','','','',''],
   ['Spontan','Susi','O','susi@example.org','07.08.1992','ZZ-3','Mitglied','01.01.2020','','','','']]),
 Config:mkSheet([['Key','Value','B']]),
 Benutzer:mkSheet([['B','A','R','P','E'],['anna','Anna','admin','geheim12','Nein']]),
 Helferdienste:mkSheet([['ID','Termin-ID','Titel','Start','Ende','Beschreibung','Plätze','Erinnerung (h)','Erinnert','Erstellt'],
   ['hA','ev1','Umschrauben',T0,T1,'',5,0,'',T0],
   ['hB','ev2','Abendputz',T1,T1,'',5,0,'',T0]])};
const qc=ctx(qs); load(qc,'apps-script/mitgliederliste/Mitgliederliste.gs');
const K=vm.runInContext('dienstMitgliedKey',qc);
qs.Dienste=mkSheet([['ID','Art','Dienst','Datum','Mitglied','Nachname','Vorname','E-Mail','Status','E','G'],
  [did(1),'helferdienst','hA',T0,K('Müller','Eva','03.05.1990'),'Müller','Eva','','eingetragen','',''],
  [did(2),'helferdienst','hB',T0,K('Kern','Karl','04.06.1985'),'Kern','Karl','','eingetragen','',''],
  [did(3),'helferdienst','hX',gestern,K('Kern','Karl','04.06.1985'),'Kern','Karl','','eingetragen','',''],
  [did(4),'helferdienst','hA',T0,K('Kern','Karl','04.06.1985'),'Kern','Karl','','ausgetragen','','']]);
const st=n=>qs.Dienste.rows[n][8];
const SIG='data:image/png;base64,'+'A'.repeat(800); const drive=[]; qc.DriveApp={getFoldersByName(){return{hasNext(){return false}}},createFolder(n){return{createFile(b){drive.push(b.getName());return{getUrl(){return 'https://drive.example/'+drive.length}}}}}}; qc.Utilities.base64Decode=x=>[...Buffer.from(x,'base64')];
const C={unterschrift:SIG};
r=post(qc,{...C,action:'quittListe'});
const hA=r.dienste.find(d=>d.ref==='hA'), hB=r.dienste.find(d=>d.ref==='hB');
ok(r.ok&&hA&&hA.begonnen&&hA.personen.length===1&&hA.personen[0].name==='Eva M.'&&!hA.personen[0].geleistet,'Liste: heutiger Dienst, Name gekuerzt, Ausgetragene fehlen');
ok(hB&&!hB.begonnen&&!JSON.stringify(r).includes('Müller')&&!JSON.stringify(r).includes('example.org'),'Liste: spaeterer Dienst noch nicht begonnen; keine Nachnamen/E-Mails');
ok(/erst ab 23:59 Uhr/.test(post(qc,{...C,action:'quittieren',id:did(2)}).error)&&st(2)==='eingetragen','vor Beginn: Abhaken abgelehnt');
ok(/nur am Tag des Dienstes/.test(post(qc,{...C,action:'quittieren',id:did(3)}).error),'Dienst von gestern: Abhaken abgelehnt');
ok(/nicht mehr aktiv/.test(post(qc,{...C,action:'quittieren',id:did(4)}).error),'ausgetragene Eintragung: Abhaken abgelehnt');
r=post(qc,{...C,action:'quittieren',id:did(1)});
ok(r.ok&&r.name==='Eva M.'&&st(1)==='geleistet','Abhaken: Status geleistet');
ok(post(qc,{...C,action:'quittieren',id:did(1)}).schon===true,'zweites Abhaken: schon erledigt');
r=post(qc,{...C,action:'quittSpontan',art:'helferdienst',ref:'hA',vorname:'susi',nachname:'SPONTAN',geburtsdatum:'1992-08-07'});
ok(r.ok&&r.name==='Susi S.'&&qs.Dienste.rows.length===6&&st(5)==='geleistet'&&qs.Dienste.rows[5][2]==='hA','spontaner Helfer: Mitglied erkannt, neue Zeile geleistet');
ok(post(qc,{...C,action:'quittSpontan',art:'helferdienst',ref:'hA',vorname:'Susi',nachname:'Spontan',geburtsdatum:'1992-08-07'}).schon===true&&qs.Dienste.rows.length===6,'spontan doppelt: keine zweite Zeile');
r=post(qc,{...C,action:'quittSpontan',art:'helferdienst',ref:'hA',vorname:'Susi',nachname:'Spontan',geburtsdatum:'1990-01-01'});
ok(r.status==='unbekannt'&&qs.Dienste.rows.length===6,'spontan: falsches Geburtsdatum -> nicht erkannt');
ok(/erst ab/.test(post(qc,{...C,action:'quittSpontan',art:'helferdienst',ref:'hB',vorname:'Susi',nachname:'Spontan',geburtsdatum:'1992-08-07'}).error),'spontan vor Beginn abgelehnt');
ok(!!post(qc,{...C,action:'quittSpontan',art:'helferdienst',ref:'gibtsnicht',vorname:'Susi',nachname:'Spontan',geburtsdatum:'1992-08-07'}).error,'spontan: unbekannter Dienst abgelehnt');
qs.Dienste.rows[1][8]='eingetragen';
r=post(qc,{...C,action:'quittSpontan',art:'helferdienst',ref:'hA',vorname:'Eva',nachname:'Müller',geburtsdatum:'1990-05-03'});
ok(r.ok&&st(1)==='geleistet'&&qs.Dienste.rows.length===6,'spontan, obwohl eingetragen: bestehende Zeile wird abgehakt');
// Erinnerung drei Tage vor dem Hallendienst
const morgenD=new Date(T0.getTime()+3*86400000+3600000*12), in4=new Date(T0.getTime()+4*86400000+3600000*12);
qs.Dienste.rows.push([did(7),'hallendienst','x',morgenD,K('Kern','Karl','04.06.1985'),'Kern','Karl','karl@example.org','eingetragen','',''],
  [did(8),'hallendienst','x',morgenD,K('Müller','Eva','03.05.1990'),'Müller','Eva','eva@example.org','ausgetragen','',''],
  [did(9),'hallendienst','x',in4,K('Spontan','Susi','07.08.1992'),'Spontan','Susi','susi@example.org','eingetragen','','']);
const H0=qc.mails.length; let hn=vm.runInContext('hdErinnerungen()',qc); const hm=qc.mails[H0];
ok(hn===1&&qc.mails.length===H0+1&&hm.to==='karl@example.org'&&/^Erinnerung Hallendienst – /.test(hm.subject)&&/schön, dass Du am /.test(hm.body)&&/Dienst quittieren/.test(hm.body)&&!/dienst\.html|austragen/i.test(hm.body),'Hallendienst-Erinnerung 3 Tage vorher: nur Eingetragene (nicht der Dienst in 4 Tagen), mit Quittier-Hinweis, ohne Austragen-Link');
ok(vm.runInContext('hdErinnerungen()',qc)===0&&qc.mails.length===H0+1,'Hallendienst-Erinnerung nicht doppelt');
qs.Dienste.rows.splice(qs.Dienste.rows.length-3,3);
// Nachtragen durch Admin
const AD2={username:'anna',password:'geheim12'};
ok(!!post(qc,{action:'dienstQuittAdmin',dienstId:did(3),geleistet:true}).error,'Nachtragen: nur mit Anmeldung');
r=post(qc,{...AD2,action:'dienstQuittAdmin',dienstId:did(3),geleistet:true});
ok(r.ok&&st(3)==='geleistet','Admin traegt vergangenen Dienst als geleistet nach');
ok(!!post(qc,{...AD2,action:'dienstQuittAdmin',dienstId:did(4),geleistet:true}).error,'Admin: ausgetragene Eintragung nicht nachtragbar');
ok(drive.length===3&&/_Mller_Eva_|_Müller_Eva_/.test(drive[0])&&/^https:\/\/drive/.test(String(qs.Dienste.rows[1][11]))&&qs.Dienste.rows[0][11]==='Unterschrift','Unterschriften liegen in Drive, Link in Spalte L');
ok(qs.Dienste.rows[3][11]==='vom Vorstand nachgetragen','Nachtragen vermerkt in Spalte Unterschrift');
qs.Dienste.rows[1][8]='eingetragen';
ok(post(qc,{action:'quittieren',id:did(1)}).error==='Bitte unterschreiben.'&&post(qc,{action:'quittieren',id:did(1),unterschrift:'data:image/png;base64,<script>'}).error==='Bitte unterschreiben.'&&st(1)==='eingetragen','ohne gueltige Unterschrift kein Abhaken');
qc.DriveApp={getFoldersByName(){throw new Error('drive')}};
r=post(qc,{...C,action:'quittieren',id:did(1)});
ok(r.ok&&st(1)==='geleistet'&&/Bild nicht gespeichert/.test(qs.Dienste.rows[1][11]),'Drive-Fehler verhindert das Quittieren nicht');
}

console.log(fails?('\n'+fails+' FEHLGESCHLAGEN'):'\nalle Tests bestanden'); process.exit(fails?1:0);
