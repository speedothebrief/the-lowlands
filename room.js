'use strict';
// ===== game room (lobby + authoritative loop) used by server.js =====
// API: the simulation instance. opt.log(msg); test hooks: opt.speed (>1 = game runs faster than real time, i.e. like a
// proportionally slower CPU), opt.autoplay (AI plays the human kingdoms).
// join(sendStr, info, io) returns {cid, msg(obj), leave()}; io.buffered() = bytes still queued on that socket,
// io.close() = drop the socket.
//
// Network rules (v1.2.2):
//  - the simulation runs at 30 steps/s; when the CPU can't keep up it runs at most MAX_STEPS per tick and drops the
//    rest of the backlog (the game slows down instead of spiralling into ever longer catch-up bursts);
//  - at most one snapshot per tick and at most SNAP_HZ per second, whatever the catch-up;
//  - backpressure: clients acknowledge every snapshot ({t:'ack',n}); a client with more than MAX_INFLIGHT snapshots
//    unacknowledged, or whose socket still has more than BP_BYTES queued (slow / lossy Wi-Fi, busy browser), skips
//    snapshots instead of queueing them (the OS socket buffer alone can hold a minute of them), so its view is never more than a few snapshots behind. One-shot events in the skipped
//    snapshots (depleted resources, rubble/corpses, messages, pings) are merged into the next one it gets;
//  - clients identify themselves with a per-tab token, so a dropped connection can rejoin its kingdom (full resync).
const SNAP_HZ=15,MAX_STEPS=4,BP_BYTES=96*1024,MAX_INFLIGHT=3,REJOIN_MS=120000;
function createRoom(API,opt){opt=opt||{};const log=opt.log||(()=>{});
 const speed=Math.max(.1,+opt.speed||1);
 let nextCid=1,host=null,inGame=false,cfg={diff:'normal',fog:true,size:'small'},loop=null,cmdQ=[],stepN=0,lastT=0,acc=0,seq=0,lastSnapT=0,gameMeta=null;
 const clients=new Map(),departed=new Map();
 const stats={tickMs:0,tickMax:0,stepMs:0,droppedMs:0,snaps:0,skipped:0,lastSnapBytes:0};
 const send=(c,o)=>{try{c.send(typeof o==='string'?o:JSON.stringify(o));}catch(e){}};
 const lobbyMsg=()=>({t:'lobby',host,inGame,diff:cfg.diff,fog:cfg.fog,size:cfg.size,clients:[...clients.entries()].map(([cid,c])=>({cid,name:c.name,slot:c.slot}))});
 const broadcastLobby=()=>{const m=JSON.stringify(lobbyMsg());for(const c of clients.values())send(c,m);};
 const cleanName=(n,cid)=>{n=String(n||'').replace(/[^\w \-.']/g,'').trim().slice(0,16);return n||('Player '+cid);};
 const initMsg=c=>Object.assign({t:'init',you:c.pid},gameMeta,API.mapData(),{players:API.playersMeta()});
 function startGame(){
  const slots=[0,1,2,3].map(i=>{const c=[...clients.values()].find(c=>c.slot===i);return c?{human:true,name:c.name}:{human:false};});
  if(!slots.some(s=>s.human))return;
  const seed=Math.floor(Math.random()*1e9);API.setupGame(seed,slots,cfg.diff,cfg.fog,cfg.size);
  if(opt.autoplay){const P=API.get().players;slots.forEach((s,i)=>{if(s.human){API.makeAI(i);P[i].isHuman=true;}});}
  gameMeta={seed,diff:cfg.diff,fog:cfg.fog};inGame=true;cmdQ=[];stepN=0;acc=0;lastT=Date.now();lastSnapT=0;departed.clear();
  for(const c of clients.values()){c.pid=c.slot;c.pend=null;c.ackN=c.lastSent=seq;if(c.slot>=0)send(c,initMsg(c));}
  broadcastLobby();{const h=setInterval(tick,1000/60);loop=()=>clearInterval(h);}
  log(`Game started: ${slots.map((s,i)=>s.human?s.name:'AI').join(' | ')} (difficulty ${cfg.diff}, fog ${cfg.fog?'on':'off'}, map ${cfg.size})`);}
 function tick(){const t0=Date.now();const stepMs=API.STEP*1000;acc+=Math.min(250,t0-lastT)*speed;lastT=t0;let n=0;
  while(acc>=stepMs&&n<MAX_STEPS*speed){acc-=stepMs;n++;
   for(const q of cmdQ.splice(0)){try{API.applyCmd(q.pid,q.c);}catch(e){log('bad command '+e.message);}}
   const s0=Date.now();try{API.sim(API.STEP);}catch(e){log('sim error '+(e&&e.stack||e));}stats.stepMs=stats.stepMs*.95+(Date.now()-s0)*.05;stepN++;}
  if(acc>stepMs*2){stats.droppedMs+=acc-stepMs;acc=stepMs;}   // can't keep up: slow the game down rather than pile up work
  const now=Date.now();if(n&&now-lastSnapT>=1000/SNAP_HZ-4){lastSnapT=now;broadcastSnap();}
  const dt=Date.now()-t0;stats.tickMs=stats.tickMs*.95+dt*.05;stats.tickMax=Math.max(stats.tickMax*.999,dt);}
 const cap=(a,n)=>a.length>n?a.slice(a.length-n):a;
 function broadcastSnap(){const s=API.makeSnap();const M=s.M;delete s.M;seq++;s.n=seq;stats.snaps++;let base=null;
  for(const c of clients.values()){if(c.pid==null||c.pid<0)continue;const mine=M.filter(m=>m[2]===-1||m[2]===c.pid);
   if((c.acks&&c.lastSent-c.ackN>=MAX_INFLIGHT)||(c.buffered&&c.buffered()>BP_BYTES)){   // socket backed up: skip this snapshot, keep its one-shot events
    const p=c.pend||(c.pend={R:[],D:[],K:[],M:[]});p.R.push(...s.R);p.D=cap(p.D.concat(s.D),400);p.K=cap(p.K.concat(s.K),20);p.M=cap(p.M.concat(mine),40);
    c.skipped=(c.skipped||0)+1;stats.skipped++;continue;}
   let str;
   if(c.pend){const p=c.pend;c.pend=null;str=JSON.stringify(Object.assign({t:'snap'},s,{R:p.R.concat(s.R),D:p.D.concat(s.D),K:p.K.concat(s.K),M:cap(p.M.concat(mine),40),sk:c.skipped||0}));}
   else{if(base==null)base=JSON.stringify(s);str='{"t":"snap","sk":'+(c.skipped||0)+',"M":'+JSON.stringify(mine)+','+base.slice(1);}
   c.lastSent=seq;stats.lastSnapBytes=str.length;send(c,str);}}
 function endGame(){if(loop)loop();loop=null;inGame=false;departed.clear();for(const c of clients.values()){c.pid=null;c.pend=null;send(c,{t:'tolobby'});}broadcastLobby();log('Returned to lobby.');}
 // a client came back with the token of a dropped (or still half-open) connection: give it its kingdom back
 function resume(cid,c,token){
  for(const [ocid,o] of clients)if(o!==c&&o.token===token){clients.delete(ocid);if(host===ocid)host=cid;if(o.close)try{o.close();}catch(e){}
   departed.set(token,{slot:o.slot,pid:o.pid,name:o.name,t:Date.now(),live:true});log(`Client ${ocid} (${o.name}) replaced by a new connection`);}
  const d=departed.get(token);if(!d||Date.now()-d.t>REJOIN_MS)return;departed.delete(token);
  if(inGame&&d.pid!=null&&d.pid>=0&&![...clients.values()].some(o=>o!==c&&o.pid===d.pid)){
   c.pid=d.pid;c.slot=d.slot;if(!d.live){try{API.makeHuman(d.pid,c.name);}catch(e){log(String(e));}}
   c.ackN=c.lastSent=seq;c.pend=null;send(c,initMsg(c));log(`Client ${cid} (${c.name}) rejoined as kingdom ${d.pid}`);}
  else if(!inGame&&d.slot>=0&&![...clients.values()].some(o=>o!==c&&o.slot===d.slot))c.slot=d.slot;}
 function onMsg(cid,c,m){if(!m||typeof m.t!=='string')return;
  switch(m.t){
  case 'hello':c.name=cleanName(m.name,cid);if(m.acks){c.acks=true;c.ackN=c.lastSent=seq;}if(typeof m.token==='string'&&/^[\w-]{16,64}$/.test(m.token)&&!c.token){c.token=m.token;resume(cid,c,m.token);}broadcastLobby();break;
  case 'name':c.name=cleanName(m.name,cid);broadcastLobby();break;
  case 'ack':{const n=m.n|0;if(n>c.ackN&&n<=seq)c.ackN=n;}break;
  case 'ping':send(c,{t:'pong',c:typeof m.c==='number'?m.c:0,n:seq,tm:inGame?Math.round(API.get().time*100)/100:0,sk:c.skipped||0});break;
  case 'clienterr':log(`Client ${cid} (${c.name}) error: ${String(m.msg||'').slice(0,300)}`);break;
  case 'slot':if(inGame)break;{const s=m.slot|0;if(s<0)c.slot=-1;else if(s<4&&![...clients.values()].some(o=>o!==c&&o.slot===s))c.slot=s;broadcastLobby();}break;
  case 'cfg':if(cid!==host||inGame)break;if(['easy','normal','hard'].includes(m.diff))cfg.diff=m.diff;cfg.fog=!!m.fog;if(['small','medium','large'].includes(m.size))cfg.size=m.size;broadcastLobby();break;
  case 'start':if(cid===host&&!inGame)startGame();break;
  case 'cmd':if(inGame&&c.pid!=null&&c.pid>=0&&m.c&&typeof m.c==='object'&&cmdQ.length<5000)cmdQ.push({pid:c.pid,c:m.c});break;
  case 'surrender':if(inGame&&c.pid>=0){const p=API.get().players[c.pid];if(p&&!p.surrendered)API.surrender(p,p.lastAttackedBy>=0?p.lastAttackedBy:-1,'yield');}break;
  case 'tolobby':if(cid===host&&inGame)endGame();break;}}
 function leave(cid){const c=clients.get(cid);if(!c)return;clients.delete(cid);log(`Client ${cid} (${c.name}) left`);
  if(c.token)departed.set(c.token,{slot:c.slot,pid:c.pid,name:c.name,t:Date.now()});
  for(const [k,d] of departed)if(Date.now()-d.t>REJOIN_MS)departed.delete(k);
  // the AI takes over a kingdom whose player disconnected (until they rejoin)
  if(inGame&&c.pid!=null&&c.pid>=0){try{API.makeAI(c.pid);}catch(e){log(String(e));}}
  if(host===cid)host=clients.size?[...clients.keys()][0]:null;
  if(inGame&&![...clients.values()].some(o=>o.pid!=null&&o.pid>=0))endGame();
  broadcastLobby();}
 return{join(sendStr,info,io){io=io||{};const cid=nextCid++;const c={send:sendStr,buffered:io.buffered,close:io.close,name:'Player '+cid,slot:-1,pid:null,token:null,pend:null,skipped:0,acks:false,ackN:0,lastSent:0};clients.set(cid,c);if(host==null)host=cid;
   log(`Client ${cid} connected${info?' from '+info:''}`);send(c,{t:'welcome',cid});broadcastLobby();
   return{cid,msg:m=>onMsg(cid,c,m),leave:()=>leave(cid)};},
  get inGame(){return inGame;},clients,lobby:lobbyMsg,broadcastLobby,stats,
  close(){if(loop)loop();loop=null;inGame=false;clients.clear();}};}
module.exports=createRoom;
