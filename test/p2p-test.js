// Headless Chrome test of browser peer-to-peer multiplayer with REAL WebRTC DataChannels between two pages.
// Headless Chrome here (like Brave with its default WebRTC IP-handling policy) exposes no host candidates, so a
// connection only works with STUN — server.js runs a tiny STUN responder (STUN_PORT) that makes this testable offline.
//  0) reproduction: copy-paste codes without STUN carry zero addresses → the dialog warns (Brave advice)
//  1) file:// copy-paste codes + STUN: real WebRTC; checksum rejects truncated codes; lobby, chunked init, 15 Hz, commands, AI takeover
//  2) served page: short room code → real WebRTC
//  3) WebRTC blocked (candidates stripped) → after ~10 s the game is relayed through the server's websocket
//  4) file:// pages joining by short room code through a saved signaling server; unreachable server; origin null; room expiry
//   CHROME=/usr/bin/google-chrome node test/p2p-test.js        (optional: npm i --no-save jsqr, or JSQR=path, for the QR decode check)
'use strict';
const puppeteer=require('puppeteer-core');const path=require('path');const os=require('os');const {spawn}=require('child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const FILE='file://'+path.join(__dirname,'..','index.html');const PORT=8131,STUN=3491;
let jsQR=null;try{jsQR=require(process.env.JSQR||'jsqr');}catch(e){}
// a non-loopback IPv4 of this machine (srflx candidates on 127.0.0.1 are ignored by Chrome)
const LANIP=(()=>{for(const l of Object.values(os.networkInterfaces()))for(const n of l||[])if((n.family==='IPv4'||n.family===4)&&!n.internal)return n.address;return '127.0.0.1';})();
async function until(p,fn,ms,arg){const t=Date.now();for(;;){const v=await p.evaluate(fn,arg).catch(()=>null);if(v)return v;if(Date.now()-t>ms)return null;await sleep(100);}}
// test-only sabotage: drop every ICE candidate this page sends or receives (like client isolation / blocked UDP)
const BLOCK=()=>{const R=window.RTCPeerConnection;window.RTCPeerConnection=function(c){const pc=new R(c);const srd=pc.setRemoteDescription.bind(pc);
   const strip=d=>d&&{type:d.type,sdp:d.sdp.split('\r\n').filter(l=>!/^a=candidate/.test(l)).join('\r\n')};
   pc.setRemoteDescription=d=>srd(strip(d));Object.defineProperty(pc,'localDescription',{get:()=>strip(R.prototype.__lookupGetter__('localDescription').call(pc))});return pc;};window.RTCPeerConnection.prototype=R.prototype;};
const valOf=(p,id)=>until(p,i=>{const e=document.getElementById(i);return e&&e.value.length>20?e.value:null;},8000,id);
(async()=>{
 const srv=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:{...process.env,PORT,STUN_PORT:STUN,LOWLANDS_NO_UPDATE:'1'}});let out='';srv.stdout.on('data',d=>out+=d);srv.stderr.on('data',d=>out+=d);
 for(let i=0;i<150&&!(out.includes('STUN')&&out.includes('running'));i++)await sleep(100);ok(out.includes('STUN:   udp port '+STUN),'server runs its STUN responder'+(out.includes('STUN:')?'':': '+out));
 const br=await puppeteer.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']});
 const errs=[];const page=async tag=>{const p=await br.newPage();await p.setViewport({width:1280,height:800});p.on('pageerror',e=>errs.push(tag+': '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(tag+': '+m.text());});return p;};
 // ===== 0) reproduction of the bug report: no STUN → the codes contain no addresses
 const H=await page('host'),J=await page('join');await H.goto(FILE);await J.goto(FILE);await sleep(400);
 await H.evaluate(()=>{localStorage.clear();localStorage.setItem('kom_stun','0');});
 await H.bringToFront();await sleep(200);await H.mouse.click(340+190,120+466+19);   // main menu "Host (peer-to-peer)"
 ok(await until(H,()=>state==='lobby'&&netKind==='p2p'&&lobby&&lobby.p2p&&lobby.host===myCid&&lobby.clients.length===1,3000),'Host button opens a peer-to-peer lobby hosted in this browser');
 await H.evaluate(()=>p2pInvite());const off0=await valOf(H,'p2pCode');
 const c0=await H.evaluate(async c=>candSummary((await decodeSig(c)).s).n,off0);
 ok(c0===0,`reproduced: without STUN this browser puts ${c0} addresses into the invite code (so "connecting" forever)`);
 ok(await until(H,()=>{const w=document.getElementById('p2pWarn');return w&&w.style.display!=='none'&&/Brave/.test(w.textContent)&&/brave:\/\/settings\/privacy/.test(w.textContent);},6000),'the dialog warns: no network addresses, with Brave WebRTC policy advice');
 ok(await H.evaluate(()=>/ICE gathering: complete/.test(document.getElementById('p2pDiag').textContent)),'ICE diagnostics are shown in the dialog');
 await H.evaluate(()=>{p2pLeave(true);state='menu';});
 // ===== 1) file:// copy-paste codes with STUN → real WebRTC
 await H.evaluate(u=>{localStorage.setItem('kom_stun_url',u);},`stun:${LANIP}:${STUN}`);
 ok(await H.evaluate(()=>p2pPublicStun()===false&&localStorage.getItem('kom_stun')==='0'),'(public STUN off for this offline test; it is ON by default)');
 await H.evaluate(()=>localStorage.removeItem('kom_stun'));ok(await H.evaluate(()=>p2pPublicStun()),'STUN is on by default');await H.evaluate(()=>localStorage.setItem('kom_stun','0'));
 await H.evaluate(()=>p2pHost());await H.evaluate(()=>p2pInvite());const offer=await valOf(H,'p2pCode');
 const oc=await H.evaluate(async c=>candSummary((await decodeSig(c)).s),offer);
 if(!oc.n)console.log("DBG",await H.evaluate(async c=>JSON.stringify({ice:p2pIce(),d:await decodeSig(c),ls:{...localStorage}}),offer));
 ok(/^LL2[\w-]+\.[0-9a-z]+$/.test(offer)&&oc.srflx>=1,`invite code (${offer.length} chars, checksummed) now carries addresses: ${JSON.stringify(oc)}`);
 const qr=await H.evaluate(()=>{const c=document.getElementById('p2pQR');if(!c||!c.width)return null;const d=c.getContext('2d').getImageData(0,0,c.width,c.height);return{w:c.width,h:c.height,d:Array.from(d.data)};});
 ok(!!qr&&qr.w>50,'QR code drawn for the invite code');
 if(jsQR&&qr){const r=jsQR(new Uint8ClampedArray(qr.d),qr.w,qr.h);ok(r&&r.data===offer,'QR code decodes back to the exact invite code');}else console.log('  (jsqr not installed: QR decode check skipped)');
 await J.bringToFront();await sleep(200);await J.mouse.click(340+305+100,120+466+19);   // "Join (peer-to-peer)"
 ok(await until(J,()=>!!document.getElementById('p2pIn')&&p2p&&p2p.role==='join',2000),'Join button opens the join dialog');
 await J.evaluate(c=>{document.getElementById('p2pIn').value=c.slice(0,-7);document.getElementById('p2pGo').click();},offer);
 ok(await until(J,()=>/incomplete or damaged/.test(document.getElementById('p2pStatus').textContent),3000),'a truncated code is rejected with a clear "incomplete or damaged" message');
 await J.evaluate(c=>{document.getElementById('p2pIn').value=c;document.getElementById('p2pGo').click();},offer);
 const answer=await valOf(J,'p2pCode');ok(/^LL2/.test(answer||''),`answer code generated (${answer?answer.length:0} chars)`);
 const t0=Date.now();await H.evaluate(c=>{document.getElementById('p2pIn').value=c;document.getElementById('p2pGo').click();},answer);
 await until(J,()=>state==='lobby'&&lobby&&lobby.clients.length===2,10000);
 ok(await J.evaluate(()=>p2p&&!p2p.relayChan&&p2p.dc instanceof RTCDataChannel&&p2p.dc.readyState==='open'&&p2p.pc.connectionState==='connected'),`real WebRTC DataChannel connected in ${Date.now()-t0} ms (no relay)`);
 await H.evaluate(()=>netSend({t:'name',name:'Hana'}));await J.evaluate(()=>netSend({t:'name',name:'Jo'}));await sleep(300);
 ok(await J.evaluate(()=>lobby.clients.map(c=>c.name).join(','))==='Hana,Jo','joiner sees the lobby');
 ok(await until(H,()=>!document.getElementById('p2pModal'),2000),'invite dialog closes once the player is connected');
 await H.evaluate(()=>{netSend({t:'slot',slot:0});netSend({t:'cfg',diff:'hard',fog:true,size:'medium'});});await J.evaluate(()=>{netSend({t:'slot',slot:0});netSend({t:'slot',slot:2});netSend({t:'start'});});
 await sleep(500);const lj=await J.evaluate(()=>({sl:lobby.clients.map(c=>c.name+':'+c.slot).join(','),diff:lobby.diff,size:lobby.size,inGame:lobby.inGame}));
 ok(lj.sl==='Hana:0,Jo:2'&&lj.diff==='hard'&&lj.size==='medium'&&!lj.inGame,'slot picking (no double-claim), host settings reach the joiner, non-host cannot start '+JSON.stringify(lj));
 await H.evaluate(()=>netSend({t:'start'}));
 const gs=await until(J,()=>mode==='net'&&state==='play'&&units.length>0?{me,MAP}:null,15000);
 ok(gs&&gs.me===2&&gs.MAP===144,'game started: joiner rules kingdom 2 on the Medium map (init data chunked over WebRTC) '+JSON.stringify(gs));
 const hs=await until(H,()=>mode==='net'&&state==='play'&&units.length>0?{me,ai:p2p.API.get().players.map(p=>p.isHuman)}:null,5000);
 ok(hs&&hs.me===0&&hs.ai.join()==='true,false,true,false','host plays kingdom 0; empty slots are AI');
 await sleep(1500);const rate=await J.evaluate(async()=>{const a=snapCount;await new Promise(r=>setTimeout(r,2000));return(snapCount-a)/2;});
 ok(rate>=8&&rate<=20,`joiner receives snapshots at ~15 Hz (${rate.toFixed(1)}/s)`);
 const mv=await J.evaluate(()=>{const u=units.find(v=>v.owner===me&&v.type==='peasant');const k=players[me].keep;const tx=k.x+6,ty=k.y+6;issue({t:'move',ids:[u.id],x:tx,y:ty});return{id:u.id,x0:u.x,y0:u.y,tx,ty};});
 await sleep(3500);ok(await J.evaluate(m=>{const u=units.find(v=>v.id===m.id);return u?Math.hypot(u.x-m.tx,u.y-m.ty)<Math.hypot(m.x0-m.tx,m.y0-m.ty)-1:false;},mv),'a joiner command is executed by the host simulation');
 await J.close();
 ok(await until(H,()=>p2p&&!p2p.API.get().players[2].isHuman&&p2p.API.get().players[2].isAI,25000),'the AI takes over when the joiner closes the tab (DataChannel closed)');
 await H.evaluate(()=>{p2pLeave(true);localStorage.clear();});await H.close();
 // ===== 2) served page: short room code, real WebRTC (server's STUN learned automatically)
 const URL=`http://${LANIP}:${PORT}/`;const H2=await page('host2'),J2=await page('join2');await H2.goto(URL);await J2.goto(URL);await sleep(600);
 for(const p of [H2,J2])await p.evaluate(()=>{localStorage.clear();localStorage.setItem('kom_stun','0');});
 await H2.evaluate(()=>p2pHost());const code=await until(H2,()=>p2p&&p2p.code,4000);
 ok(/^[ACDEFHJKMNPRTUVWXY]{4,5}$/.test(code||''),'served page: the host gets a short room code ('+code+')');
 ok(await H2.evaluate(p=>p2pSrvStun&&p2pSrvStun.endsWith(':'+p)&&JSON.stringify(p2pIce()).includes('stun:'),STUN),'the signaling server announces its STUN responder, which is used for ICE');
 await J2.evaluate(()=>p2pJoinStart());await J2.type('#p2pRoom',code.toLowerCase()+'\n');
 ok(await until(J2,()=>state==='lobby'&&netKind==='p2p'&&lobby&&lobby.clients.length===2&&p2p.dc instanceof RTCDataChannel&&p2p.dc.readyState==='open',10000),'typing the room code connects over real WebRTC');
 await J2.evaluate(()=>{p2pJoinStart();document.getElementById('p2pRoom').value='ZZZZ';document.getElementById('p2pRoomGo').click();});
 ok(await until(J2,()=>/No open room/.test((document.getElementById('p2pStatus')||{}).textContent||''),3000),'unknown room code is reported');
 await J2.evaluate(()=>{p2pLeave(true);openServerLobby();});ok(await until(J2,()=>state==='lobby'&&netKind==='server'&&lobby&&!lobby.p2p,3000),'LAN server lobby still available alongside P2P');
 await until(H2,()=>lobby&&lobby.clients.length===1,5000);
 // ===== 3) WebRTC blocked: strip every candidate the joiner receives (like client isolation / blocked UDP)
 const J3=await page('join-blocked');await J3.evaluateOnNewDocument(BLOCK);
 await J3.goto(URL);await sleep(500);await J3.evaluate(()=>{localStorage.setItem('kom_stun','0');p2pJoinStart();});
 const tb=Date.now();await J3.type('#p2pRoom',code+'\n');
 ok(await until(J3,()=>state==='lobby'&&lobby&&lobby.clients.length===2&&p2p&&!!p2p.relayChan,25000),`WebRTC could not connect → after ${((Date.now()-tb)/1000).toFixed(1)} s the joiner plays through the server relay`);
 await J3.evaluate(()=>netSend({t:'slot',slot:2}));await H2.evaluate(()=>{netSend({t:'slot',slot:0});});await sleep(300);await H2.evaluate(()=>netSend({t:'start'}));
 ok(await until(J3,()=>mode==='net'&&state==='play'&&units.length>0&&me===2,15000),'the relayed player gets the game (chunked init through the relay)');
 await sleep(1000);const r3=await J3.evaluate(async()=>{const a=snapCount;await new Promise(r=>setTimeout(r,2000));return(snapCount-a)/2;});ok(r3>=8,`relayed snapshots at ~15 Hz (${r3.toFixed(1)}/s)`);
 const mv3=await J3.evaluate(()=>{const u=units.find(v=>v.owner===me&&v.type==='peasant');const k=players[me].keep;issue({t:'move',ids:[u.id],x:k.x-6,y:k.y-6});return{id:u.id,x0:u.x,y0:u.y,tx:k.x-6,ty:k.y-6};});
 await sleep(3500);ok(await J3.evaluate(m=>{const u=units.find(v=>v.id===m.id);return u?Math.hypot(u.x-m.tx,u.y-m.ty)<Math.hypot(m.x0-m.tx,m.y0-m.ty)-1:false;},mv3),'relayed commands reach the host simulation');
 await J3.close();ok(await until(H2,()=>p2p&&p2p.API.get().players[2].isAI,8000),'relayed player disconnects → AI takes over');
 await H2.evaluate(()=>p2pLeave(true));await H2.close();
 // ===== 4) file:// pages using the server only for signaling (short code), unreachable server, origin null, expiry
 {const info=await fetch(URL+'sig/info');ok(info.ok&&info.headers.get('access-control-allow-origin')==='*','/sig/info answers with CORS for other origins / file://');}
 const H3=await page('host-file-sig'),J4=await page('join-file-sig');await H3.goto(FILE);await J4.goto(FILE);await sleep(300);
 await H3.evaluate(a=>{localStorage.clear();localStorage.setItem('kom_sig',a);localStorage.setItem('kom_stun','0');},`${LANIP}:${PORT}`);
 await H3.evaluate(()=>p2pHost());const code3=await until(H3,()=>p2p&&p2p.code,4000);
 ok(/^[ACDEFHJKMNPRTUVWXY]{4,5}$/.test(code3||''),'file:// host registers a short room code via the saved signaling server ('+code3+')');
 await J4.evaluate(()=>p2pJoinStart());
 ok(await J4.evaluate(a=>document.getElementById('p2pSigNow').textContent.includes(a)&&document.activeElement&&document.activeElement.id==='p2pRoom',LANIP),'join dialog: room code field focused, saved server shown');
 await J4.type('#p2pRoom',' '+code3.toLowerCase()+'\n');
 ok(await until(J4,()=>state==='lobby'&&netKind==='p2p'&&lobby&&lobby.clients.length===2,10000),'file:// joiner connects by typing only the short code');
 // copy-paste codes while WebRTC is blocked: the joiner stands by on the host's signaling server and gets relayed
 {await J4.evaluate(()=>p2pLeave(true));const J5=await page('join-file-blocked');await J5.evaluateOnNewDocument(BLOCK);await J5.goto(FILE);await sleep(300);
  await H3.evaluate(()=>p2pInvite());const off=await valOf(H3,'p2pCode');await J5.evaluate(()=>p2pJoinStart());
  await J5.evaluate(c=>{document.getElementById('p2pIn').value=c;document.getElementById('p2pGo').click();},off);const ans=await valOf(J5,'p2pCode');
  const tt=Date.now();await H3.evaluate(c=>{document.getElementById('p2pIn').value=c;document.getElementById('p2pGo').click();},ans);
  ok(await until(J5,()=>state==='lobby'&&lobby&&lobby.clients.length>=2&&p2p&&!!p2p.relayChan,25000),`copy-paste codes with WebRTC blocked → relayed through the host's signaling server after ${((Date.now()-tt)/1000).toFixed(1)} s`);
  await J5.evaluate(()=>p2pLeave(true));await J5.close();}
 await J4.evaluate(()=>{p2pLeave(true);localStorage.setItem('kom_sig','127.0.0.1:65530');p2pJoinStart();document.getElementById('p2pRoom').value='ACDE';document.getElementById('p2pRoomGo').click();});
 ok(await until(J4,()=>/Can't reach/.test((document.getElementById('p2pStatus')||{}).textContent||''),8000),'an unreachable signaling server is reported');
 await J4.evaluate(()=>{p2pLeave(true);localStorage.clear();});await H3.evaluate(()=>{p2pLeave(true);localStorage.clear();});
 {const WS=require('ws');const P2=PORT+1;const s2=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:{...process.env,PORT:P2,STUN_PORT:0,LOWLANDS_NO_UPDATE:'1',SIG_ROOM_TTL_MS:'1500'}});let o2='';s2.stdout.on('data',d=>o2+=d);
  for(let i=0;i<50&&!o2.includes('running');i++)await sleep(100);
  const h=new WS(`ws://127.0.0.1:${P2}/sig`,{headers:{Origin:'null'}});const hm=[];h.on('message',d=>hm.push(JSON.parse(d)));await new Promise(r=>h.on('open',r));h.send(JSON.stringify({t:'host'}));await sleep(300);
  const c=(hm.find(m=>m.t==='code')||{}).code;ok(!!c,'relay accepts a WebSocket with Origin "null" (file:// page) and hands out a code');
  await sleep(2600);const j=new WS(`ws://127.0.0.1:${P2}/sig`);const jm=[];j.on('message',d=>jm.push(JSON.parse(d)));await new Promise(r=>j.on('open',r));j.send(JSON.stringify({t:'join',code:c}));await sleep(300);
  ok(jm.some(m=>m.t==='nocode')&&hm.some(m=>m.t==='expired'),'rooms expire after their TTL (host told, code no longer joinable)');h.close();j.close();s2.kill();}
 const errs2=errs.filter(e=>!e.includes('127.0.0.1:65530'));ok(errs2.length===0,'no page errors'+(errs2.length?': '+errs2.slice(0,5).join(' | '):''));
 await br.close();srv.kill();console.log(fails?fails+' FAILURES':'ALL P2P TESTS PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
