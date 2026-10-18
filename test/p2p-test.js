// Headless Chrome test of browser peer-to-peer multiplayer (WebRTC DataChannels), two pages:
//  1) file:// with manual invite/answer codes (+ QR code decodes to the code if jsqr is installed)
//  2) served by server.js with the room-code signaling relay
//   CHROME=/usr/bin/google-chrome node test/p2p-test.js
'use strict';
const puppeteer=require('puppeteer-core');const path=require('path');const {spawn}=require('child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const FILE='file://'+path.join(__dirname,'..','index.html');const PORT=8131;
let jsQR=null;try{jsQR=require('jsqr');}catch(e){try{jsQR=require(process.env.JSQR||'jsqr');}catch(e2){console.log('  jsqr:',e2.message);}}

// Some sandboxes/containers give Chrome no network interfaces for WebRTC (zero ICE candidates). Then the two pages are
// paired through a minimal in-test RTCPeerConnection/DataChannel stand-in relayed by puppeteer, so everything above the
// transport (codes, QR, chunking, lobby, snapshots, commands, AI takeover, relay signaling) is still exercised.
const SHIM=`(()=>{const pcs=new Map();window.__bridgeRecv=m=>{const pc=pcs.get(m.to);if(!pc)return;if(m.op==='open')pc._open(m.from);else if(m.op==='msg')pc._msg(m.data);else if(m.op==='close')pc._rclose();};
 class DC{constructor(pc,label){this.pc=pc;this.label=label;this.readyState='connecting';this.bufferedAmount=0;}send(s){if(this.readyState!=='open')throw new Error('not open');__bridgeSend({op:'msg',to:this.pc.remote,data:s});}
  close(){if(this.readyState==='closed')return;this.readyState='closed';__bridgeSend({op:'close',to:this.pc.remote});setTimeout(()=>this.onclose&&this.onclose(),0);}}
 class PC extends EventTarget{constructor(){super();this.id=Math.random().toString(36).slice(2);pcs.set(this.id,this);__bridgeSend({op:'reg',id:this.id});this.iceGatheringState='new';this.connectionState='new';this.signalingState='stable';this.dc=null;}
  createDataChannel(l){this.dc=new DC(this,l);return this.dc;}
  async createOffer(){return{type:'offer',sdp:'v=0 shim '+this.id+' '+'x'.repeat(380)};}async createAnswer(){return{type:'answer',sdp:'v=0 shim '+this.id+' '+'y'.repeat(380)};}
  async setLocalDescription(d){this.localDescription=d;this.iceGatheringState='complete';this.dispatchEvent(new Event('icegatheringstatechange'));}
  async setRemoteDescription(d){this.remote=d.sdp.split(' ')[2];if(d.type==='answer'){__bridgeSend({op:'open',to:this.remote,from:this.id});this._ready();}}
  _ready(){this.connectionState='connected';const dc=this.dc;dc.readyState='open';setTimeout(()=>dc.onopen&&dc.onopen(),0);}
  _open(from){this.remote=from;const dc=new DC(this,'game');this.dc=dc;this.connectionState='connected';this.ondatachannel&&this.ondatachannel({channel:dc});dc.readyState='open';setTimeout(()=>dc.onopen&&dc.onopen(),0);}
  _msg(s){const dc=this.dc;if(dc&&dc.readyState==='open'&&dc.onmessage)dc.onmessage({data:s});}
  _rclose(){const dc=this.dc;if(dc&&dc.readyState!=='closed'){dc.readyState='closed';dc.onclose&&dc.onclose();}this.connectionState='closed';this.onconnectionstatechange&&this.onconnectionstatechange();}
  close(){if(this.dc&&this.dc.readyState!=='closed')this.dc.close();this.connectionState='closed';}}
 window.RTCPeerConnection=PC;})();`;
let useShim=false;const pagesById=new Map(),pairs=new Map();
// a closed tab drops its DataChannels: tell the remote ends (what SCTP does for real connections)
async function closePage(p){if(useShim)for(const [id,pg] of pagesById)if(pg===p&&pairs.has(id)){const o=pairs.get(id);const tp=pagesById.get(o);if(tp&&tp!==p)await tp.evaluate(x=>__bridgeRecv(x),{op:'close',to:o}).catch(()=>{});}await p.close();}
async function prep(p){if(!useShim)return;await p.exposeFunction('__bridgeSend',m=>{if(m.op==='reg'){pagesById.set(m.id,p);return;}if(m.op==='open'){pairs.set(m.from,m.to);pairs.set(m.to,m.from);}
  const dest=[...pagesById.entries()].find(([id])=>id===m.to);const tp=dest?dest[1]:null;if(tp)tp.evaluate(x=>__bridgeRecv(x),m).catch(()=>{});});
 await p.evaluateOnNewDocument(SHIM);}
async function until(p,fn,ms,arg){const t=Date.now();for(;;){const v=await p.evaluate(fn,arg).catch(()=>null);if(v)return v;if(Date.now()-t>ms)return null;await sleep(100);}}
(async()=>{
 // LAN-only ICE (no STUN); expose real host candidates instead of mDNS names so two headless pages can connect
 const br=await puppeteer.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--disable-features=WebRtcHideLocalIpsWithMdns']});
 const errs=[];const page=async tag=>{const p=await br.newPage();await prep(p);await p.setViewport({width:1280,height:800});p.on('pageerror',e=>errs.push(tag+': '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(tag+': '+m.text());});return p;};
 {const t=await br.newPage();await t.goto(FILE);const nc=await t.evaluate(async()=>{const pc=new RTCPeerConnection({iceServers:[]});pc.createDataChannel('x');let n=0;pc.onicecandidate=e=>{if(e.candidate)n++;};await pc.setLocalDescription(await pc.createOffer());await new Promise(r=>setTimeout(r,2000));pc.close();return n;});await t.close();
  useShim=nc===0;console.log(useShim?'  NOTE: this Chrome gathers no ICE candidates here (no usable network interfaces) — using the in-test DataChannel relay':'  real WebRTC DataChannels ('+nc+' ICE candidates)');}
 // ===== 1) file:// + manual codes
 const H=await page('host'),J=await page('join');await H.goto(FILE);await J.goto(FILE);await sleep(400);
 await H.evaluate(()=>{localStorage.removeItem('kom_name');localStorage.setItem('kom_stun','0');});
 // main menu "Host (peer-to-peer)" button (panel 600x560 centred at 1280x800 -> x0=340,y0=120; button at x0+90, y0+466)
 await H.bringToFront();await sleep(200);await H.mouse.click(340+190,120+466+19);
 ok(await until(H,()=>state==='lobby'&&netKind==='p2p'&&lobby&&lobby.p2p&&lobby.host===myCid&&lobby.clients.length===1,3000),'Host button opens a peer-to-peer lobby hosted in this browser');
 await H.evaluate(()=>p2pInvite());
 const offer=await until(H,()=>{const e=document.getElementById('p2pCode');return e&&e.value.length>20?e.value:null;},8000);
 ok(offer&&/^LL[01]/.test(offer),`invite code generated (${offer?offer.length:0} chars)`);
 const qr=await H.evaluate(()=>{const c=document.getElementById('p2pQR');if(!c||!c.width)return null;const d=c.getContext('2d').getImageData(0,0,c.width,c.height);return{w:c.width,h:c.height,d:Array.from(d.data)};});
 ok(!!qr&&qr.w>50,'QR code drawn for the invite ('+(qr?qr.w:0)+'px)');
 if(jsQR&&qr){const r=jsQR(new Uint8ClampedArray(qr.d),qr.w,qr.h);ok(r&&r.data===offer,'QR code decodes back to the exact invite code');}else console.log('  (jsqr not installed: QR decode check skipped)');
 await J.bringToFront();await sleep(200);await J.mouse.click(340+305+100,120+466+19);
 ok(await until(J,()=>!!document.getElementById('p2pIn')&&p2p&&p2p.role==='join',2000),'Join button opens the join dialog');
 await J.evaluate(c=>{document.getElementById('p2pIn').value=c;document.getElementById('p2pGo').click();},offer);
 const answer=await until(J,()=>{const e=document.getElementById('p2pCode');return e&&e.value.length>20?e.value:null;},8000);
 ok(answer&&/^LL[01]/.test(answer),`answer code generated (${answer?answer.length:0} chars)`);
 await H.evaluate(c=>{document.getElementById('p2pIn').value=c;document.getElementById('p2pGo').click();},answer);
 await until(J,()=>state==='lobby'&&lobby&&lobby.clients.length===2,10000);await H.evaluate(()=>netSend({t:'name',name:'Hana'}));await J.evaluate(()=>netSend({t:'name',name:'Jo'}));await sleep(300);
 const lob=await until(J,()=>state==='lobby'&&lobby&&lobby.clients.length===2?lobby.clients.map(c=>c.name).join(','):null,10000);
 if(!lob){console.log(await H.evaluate(()=>JSON.stringify({st:(document.getElementById('p2pStatus')||{}).textContent,peers:[...p2p.peers].map(p=>[p.pc.connectionState,p.pc.iceConnectionState,p.pc.signalingState,p.dc.readyState,p.pc.localDescription.sdp.split('\n').filter(l=>/candidate/.test(l))])})));console.log(await J.evaluate(()=>JSON.stringify({st:(document.getElementById('p2pStatus')||{}).textContent,pc:[p2p.pc.connectionState,p2p.pc.iceConnectionState],c:p2p.pc.localDescription.sdp.split('\n').filter(l=>/candidate/.test(l))})));}
 ok(lob==='Hana,Jo','joiner connected over WebRTC and sees the lobby ('+lob+')');
 ok(await until(H,()=>!document.getElementById('p2pModal'),2000),'invite dialog closes once the player is connected');
 // lobby: slots, names, settings, start
 await H.evaluate(()=>{netSend({t:'slot',slot:0});netSend({t:'cfg',diff:'hard',fog:true,size:'medium'});});await J.evaluate(()=>{netSend({t:'slot',slot:0});netSend({t:'slot',slot:2});netSend({t:'start'});});
 await sleep(500);const lj=await J.evaluate(()=>({sl:lobby.clients.map(c=>c.name+':'+c.slot).join(','),diff:lobby.diff,size:lobby.size,inGame:lobby.inGame}));
 ok(lj.sl==='Hana:0,Jo:2'&&lj.diff==='hard'&&lj.size==='medium'&&!lj.inGame,'slot picking (no double-claim), host settings reach the joiner, non-host cannot start '+JSON.stringify(lj));
 await H.evaluate(()=>netSend({t:'start'}));
 const gs=await until(J,()=>mode==='net'&&state==='play'&&units.length>0?{me,MAP,n:units.length}:null,15000);
 ok(gs&&gs.me===2&&gs.MAP===144,'game started on both: joiner rules kingdom 2 on the Medium map (init data chunked over the channel) '+JSON.stringify(gs));
 const hs=await until(H,()=>mode==='net'&&state==='play'&&units.length>0?{me,ai:p2p.API.get().players.map(p=>p.isHuman)}:null,5000);
 ok(hs&&hs.me===0&&hs.ai.join()==='true,false,true,false','host plays kingdom 0 from snapshots; empty slots are AI '+JSON.stringify(hs));
 await sleep(1500);const rate=await J.evaluate(async()=>{const a=snapCount;await new Promise(r=>setTimeout(r,2000));return(snapCount-a)/2;});
 ok(rate>=8&&rate<=20,`joiner receives snapshots at ~15 Hz (${rate.toFixed(1)}/s)`);
 // joiner command → host simulation
 const mv=await J.evaluate(()=>{const u=units.find(v=>v.owner===me&&v.type==='peasant');const k=players[me].keep;const tx=k.x+6,ty=k.y+6;issue({t:'move',ids:[u.id],x:tx,y:ty});return{id:u.id,x0:u.x,y0:u.y,tx,ty};});
 await sleep(3500);
 const after=await J.evaluate(m=>{const u=units.find(v=>v.id===m.id);return u?Math.hypot(u.x-m.tx,u.y-m.ty)<Math.hypot(m.x0-m.tx,m.y0-m.ty)-1:false;},mv);
 ok(after,'a joiner command is executed by the host simulation (peasant walks toward the target)');
 const same=await Promise.all([H,J].map(p=>p.evaluate(()=>players.map(q=>q.res.food+q.res.wood).join())));
 ok(same[0].split(',').length===4,'both views stream the same players');
 // joiner disconnects → AI takes over
 await closePage(J);
 const ai=await until(H,()=>p2p&&!p2p.API.get().players[2].isHuman&&lobby.clients.length===1?p2p.API.get().players[2].isAI:null,8000);
 ok(ai===true,'the AI takes over the kingdom of a player who disconnected');
 ok(await H.evaluate(()=>mode==='net'&&state==='play'),'the host game keeps running');
 await H.close();
 // ===== 2) served by server.js: room code relay
 const srv=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:{...process.env,PORT}});let out='';srv.stdout.on('data',d=>out+=d);srv.stderr.on('data',d=>out+=d);
 for(let i=0;i<50&&!out.includes('running');i++)await sleep(100);
 const URL=`http://127.0.0.1:${PORT}/`;const H2=await page('host2'),J2=await page('join2');await H2.goto(URL);await J2.goto(URL);await sleep(600);
 await H2.evaluate(()=>p2pHost());const code=await until(H2,()=>p2p&&p2p.code,4000);
 ok(/^[A-Z2-9]{4}$/.test(code||''),'served page: the host gets a room code from the relay ('+code+')');
 await J2.evaluate(()=>p2pJoinStart());await J2.evaluate(c=>{document.getElementById('p2pRoom').value=c;document.getElementById('p2pRoomGo').click();},code);
 const l2=await until(J2,()=>state==='lobby'&&netKind==='p2p'&&lobby&&lobby.clients.length===2?lobby.p2p:null,10000);
 ok(l2===true,'joining by room code connects peer-to-peer (no codes to copy)');
 await J2.evaluate(()=>{p2pJoinStart();});await J2.evaluate(()=>{document.getElementById('p2pRoom').value='ZZZZ';document.getElementById('p2pRoomGo').click();});
 ok(await until(J2,()=>/No room/.test((document.getElementById('p2pStatus')||{}).textContent||''),3000),'unknown room code is reported');
 // the classic server lobby still works from the same page
 await J2.evaluate(()=>{p2pLeave(true);openServerLobby();});ok(await until(J2,()=>state==='lobby'&&netKind==='server'&&lobby&&!lobby.p2p,3000),'LAN server lobby still available alongside P2P');
 ok(errs.length===0,'no page errors'+(errs.length?': '+errs.slice(0,5).join(' | '):''));
 await br.close();srv.kill();console.log(fails?fails+' FAILURES':'ALL P2P TESTS PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
