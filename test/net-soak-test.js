// Multiplayer soak: 3 players (AI-driven via the test hook) on a medium map, the server running SPEED× faster than
// real time (= a CPU SPEED× slower, e.g. 5 ≈ a Synology DS918 / Celeron J3455), for SOAK_SEC wall seconds.
// Player C is on a slow, stalling link; player B drops its connection and rejoins; a 4th, lobby-only client goes
// half-open. Checks timing, size and lag budgets.   usage: node test/net-soak-test.js   (SOAK_SEC=120 SPEED=5 LINK_KBS=40)
'use strict';
const {spawn}=require('child_process');const path=require('path');const WebSocket=require('ws');
const PORT=8126,SPEED=+(process.env.SPEED||5),SEC=+(process.env.SOAK_SEC||120);
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const srv=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:{...process.env,PORT,LOWLANDS_NO_UPDATE:'1',LOWLANDS_TEST_AUTOPLAY:'1',LOWLANDS_TEST_SPEED:String(SPEED)}});
let srvOut='';srv.stdout.on('data',d=>srvOut+=d);srv.stderr.on('data',d=>{srvOut+=d;process.stderr.write(d);});
const stats=async()=>(await fetch(`http://127.0.0.1:${PORT}/stats`)).json();
let latestTm=0;   // newest game time seen by any fast client
function client(name,token,o={}){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
 const c={ws,name,token,snaps:0,inits:[],lobby:null,last:null,lags:[],sk:0,send:x=>{if(ws.readyState===1)ws.send(JSON.stringify(x));},stalled:false};
 ws.on('message',d=>{const m=JSON.parse(d);if(m.t==='welcome')c.cid=m.cid;if(m.t==='lobby')c.lobby=m;if(m.t==='init')c.inits.push(m);
  if(m.t==='snap'){c.snaps++;c.last=m;c.sk=m.sk;if(o.fast)latestTm=Math.max(latestTm,m.tm);else c.lags.push({t:Date.now(),lag:Math.max(0,latestTm-m.tm)/SPEED});
   if(o.acks!==false)ws.send('{"t":"ack","n":'+m.n+'}');}});
 ws.on('error',()=>{});ws.on('open',()=>{c.send({t:'hello',name,token,acks:o.acks!==false});res(c);});});}
(async()=>{
 for(let i=0;i<50&&!srvOut.includes('LAN server running');i++)await sleep(100);
 const A=await client('Alice','tokenAAAAAAAAAAAAAAAA',{fast:true}),B=await client('Bob','tokenBBBBBBBBBBBBBBBB',{fast:true}),C=await client('Cleo','tokenCCCCCCCCCCCCCCCC');
 const E=await client('Eve','tokenEEEEEEEEEEEEEEEE');await sleep(300);
 ok(A.ws.extensions&&String(Object.keys(A.ws._extensions||{})).includes('permessage-deflate'),'snapshots are compressed (permessage-deflate negotiated)');
 A.send({t:'slot',slot:0});B.send({t:'slot',slot:1});C.send({t:'slot',slot:2});await sleep(300);
 A.send({t:'cfg',diff:'hard',fog:true,size:'medium'});await sleep(100);A.send({t:'start'});await sleep(1500);
 ok(A.inits.length&&B.inits.length&&C.inits.length,'game started for 3 players');
 const t0=Date.now(),wall=()=>(Date.now()-t0)/1000;
 // C: a slow link (LINK_KBS KB/s, default 40) that also stalls completely for 8 s at 40% of the run
 const LINK=+(process.env.LINK_KBS||40)*1024,sock=C.ws._socket;let stallAt=SEC*.4,stallDone=false,recoverAt=null,winB=0;
 sock.on('data',d=>{winB+=d.length;if(winB>LINK/10)sock.pause();});
 const thr=setInterval(()=>{winB=Math.max(0,winB-LINK/10);if(!C.stalled&&winB<=LINK/10)sock.resume();},100);
 const A0={snaps:A.snaps,bytes:A.ws._socket.bytesRead,tm:0};let samples=[],evePaused=false,bobBack=null;
 while(wall()<SEC){await sleep(1000);const w=wall();
  if(!evePaused&&w>5){evePaused=true;E.ws._socket.pause();}   // half-open: never answers pings again
  if(!stallDone&&w>stallAt){stallDone=true;C.stalled=true;sock.pause();setTimeout(()=>{C.stalled=false;sock.resume();recoverAt=Date.now();},8000);}
  if(!bobBack&&w>SEC*.6){bobBack='pending';B.ws.terminate();await sleep(1500);const B2=await client('Bob','tokenBBBBBBBBBBBBBBBB',{fast:true});bobBack=B2;}
  const s=await stats();samples.push(s);
  if(Math.round(w)%20===0)console.log(`  t=${Math.round(w)}s game ${(latestTm/60).toFixed(1)} min | tick ${s.tickMs} ms (max ${s.tickMax}) step ${s.stepMs} ms | snap ${(s.lastSnapBytes/1024).toFixed(1)} KB | skipped ${s.skipped} | buffered ${s.clients.map(c=>c.buffered).join('/')} | rss ${s.rssMB} MB | C lag ${(C.lags.length?C.lags[C.lags.length-1].lag:0).toFixed(2)} s`);}
 clearInterval(thr);sock.resume();
 const secs=wall(),gameMin=latestTm/60;const last=samples[samples.length-1];
 ok(gameMin>=SEC*SPEED/60*.85,`the server keeps up at ${SPEED}× load: ${gameMin.toFixed(1)} game-minutes in ${secs.toFixed(0)} s (${(latestTm/secs).toFixed(2)}× real time)`);
 const tk=samples.map(s=>s.tickMs);ok(Math.max(...tk)<20&&last.droppedMs<SEC*1000*.02,`server tick cost stays in budget (worst 1-s average ${Math.max(...tk).toFixed(1)} ms, longest tick ${Math.max(...samples.map(s=>s.tickMax)).toFixed(0)} ms, ${last.droppedMs} ms of backlog dropped)`);
 const rate=(A.snaps-A0.snaps)/secs,kbs=(A.ws._socket.bytesRead-A0.bytes)/1024/secs;
 ok(rate>=13&&rate<=16,`fast client gets ~15 snapshots/s, not one per catch-up step (${rate.toFixed(1)}/s)`);
 ok(kbs<60,`wire traffic per client stays small (${kbs.toFixed(1)} KB/s, last snapshot ${(last.lastSnapBytes/1024).toFixed(1)} KB uncompressed)`);
 ok(Math.max(...samples.map(s=>Math.max(0,...s.clients.map(c=>c.buffered))))<512*1024,`no socket queue grows (max buffered ${Math.max(...samples.map(s=>Math.max(0,...s.clients.map(c=>c.buffered))))} bytes)`);
 const thrLags=C.lags.filter(l=>!recoverAt||l.t<stallAt*1000+t0||l.t>recoverAt+3000).map(l=>l.lag).sort((a,b)=>a-b);const p95=thrLags[Math.floor(thrLags.length*.95)]||0;
 ok(C.snaps>secs*3&&p95<1,`slow-link client stays current: ${C.snaps} snapshots, ${C.sk} skipped by the server, lag p95 ${p95.toFixed(2)} s`);
 const after=C.lags.filter(l=>recoverAt&&l.t>recoverAt+3000&&l.t<recoverAt+8000).map(l=>l.lag);
 ok(after.length>0&&Math.max(...after)<1,`after an 8 s stall it is current again within 3 s (max lag then ${after.length?Math.max(...after).toFixed(2):'-'} s)`);
 ok(bobBack&&bobBack.inits.length===1&&bobBack.inits[0].you===1&&bobBack.last&&bobBack.last.P[1][10]===1,'a dropped player reconnects with its token and gets its kingdom back (full resync)');
 ok(last.clients.length===3,`half-open connection dropped by the heartbeat (${last.clients.length} sockets left: Alice, Cleo, Bob's new one)`);
 ok(last.rssMB<400,`server memory stays bounded (${last.rssMB} MB)`);
 for(const x of [A,C,bobBack])try{x.ws.close();}catch(e){}srv.kill();
 console.log(fails?`${fails} FAILURES`:'NET SOAK PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error(e);srv.kill();process.exit(1);});
