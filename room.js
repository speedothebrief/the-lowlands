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
//  - at most one snapshot per tick and at most SNAP_HZ per second, whatever the catch-up (10/s once > 450 units are on the
//    map, e.g. 3-4 kingdoms near the 200 population cap: the client interpolates, and it keeps wire traffic in budget);
//  - backpressure: clients acknowledge every snapshot ({t:'ack',n}); a client with more than MAX_INFLIGHT snapshots
//    unacknowledged, or whose socket still has more than BP_BYTES queued (slow / lossy Wi-Fi, busy browser), skips
//    snapshots instead of queueing them (the OS socket buffer alone can hold a minute of them), so its view is never more than a few snapshots behind. One-shot events in the skipped
//    snapshots (depleted resources, rubble/corpses, messages, pings) are merged into the next one it gets;
//  - delta units (v1.3.2): a client that says {delta:true} gets only the unit rows that changed since the snapshot it
//    last acknowledged ({Ub:base seq, U:changed rows, Ug:removed ids}); it rebuilds the full list itself and asks for a
//    full one ({t:'full'}) if it ever lacks the base. Cuts wire traffic ~3x in big battles.
//  - clients identify themselves with a per-tab token, so a dropped connection can rejoin its kingdom (full resync).
// Chat (v1.3.0): {t:'chat',text} is sanitized, rate-limited (CHAT_RATE per CHAT_WIN ms) and relayed to every client of
// this room (players, unassigned/spectating clients); the last CHAT_HIST messages incl. system notices go to new joiners.
const SNAP_HZ=15,SNAP_HZ_BIG=10,BIG_UNITS=450,MAX_STEPS=4,BP_BYTES=96*1024,MAX_INFLIGHT=3,UHIST=12,REJOIN_MS=120000;
function createRoom(API,opt){opt=opt||{};const log=opt.log||(()=>{});
 const speed=Math.max(.1,+opt.speed||1);
 let nextCid=1,host=null,inGame=false,cfg={diff:'normal',fog:true,size:'small'},loop=null,cmdQ=[],stepN=0,lastT=0,acc=0,seq=0,lastSnapT=0,snapHz=SNAP_HZ,gameMeta=null,uHist=new Map();
 const clients=new Map(),departed=new Map();
 const now=opt.now||Date.now;
 const CHAT_MAX=200,CHAT_HIST=50,CHAT_RATE=5,CHAT_WIN=5000;
 const chatHist=[];let chatId=1,announced=new Set();
 // chat text: string only, no control / invisible / bidi-override characters, whitespace collapsed, max 200 characters
 const cleanChat=t=>{if(typeof t!=='string')return '';t=t.slice(0,4000);try{t=t.normalize('NFC');}catch(e){}
  t=t.replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B\u200C\u200E\u200F\u2028-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]/g,' ').replace(/\s+/g,' ').trim();
  const a=Array.from(t);return a.length>CHAT_MAX?a.slice(0,CHAT_MAX).join('').trim():t;};
 const kname=i=>{const k=(API.KINGDOMS||[])[i];return k?k.name:'Kingdom '+(i+1);};
 function chatPush(o){o.id=chatId++;o.ts=Date.now();chatHist.push(o);if(chatHist.length>CHAT_HIST)chatHist.shift();const s=JSON.stringify(Object.assign({t:'chat'},o));for(const c of clients.values())send(c,s);}
 const sysChat=text=>chatPush({sys:true,text});
 function onChat(cid,c,m){const text=cleanChat(m.text);if(!text)return;const t=now();
  c.chatT=(c.chatT||[]).filter(x=>t-x<CHAT_WIN);
  if(c.chatT.length>=CHAT_RATE){if(t-(c.chatWarnT||-1e9)>1000){c.chatWarnT=t;send(c,{t:'chat',sys:true,local:true,id:0,ts:Date.now(),text:'You are sending messages too fast. Wait a few seconds.'});}return;}
  c.chatT.push(t);const slot=inGame?(c.pid!=null?c.pid:-1):c.slot;
  chatPush({cid,name:c.name,slot,ch:'all',text});}
 // defeats / victory, announced once per game
 // test hook (high-population soak): every kingdom starts with Houses up to the cap and ~POP_MAX population of mixed units
 function fillPop(){const G=API.get(),MAXP=API.POP_MAX||200;
  for(const p of G.players){const k=p.keep;let cap=10,r=4;const pop=()=>G.units.filter(u=>u.owner===p.id&&!u.dead).reduce((a,u)=>a+API.UNITS[u.type].pop,0);
   while(cap<MAXP&&r<26){for(let a=0;a<24&&cap<MAXP;a++){const tx=Math.round(k.x+Math.cos(a/24*6.283)*r)-1,ty=Math.round(k.y+Math.sin(a/24*6.283)*r)-1;if(!API.canPlace('house',tx,ty,p.id,null)){API.spawnBld('house',tx,ty,p.id,true);cap+=8;}}r+=3;}
   const mix=['peasant','peasant','spearman','archer','peasant','knight','spearman','archer'];let n=0;
   while(pop()<MAXP-4){const t=mix[n++%mix.length],a=n*0.7,d=3+(n%9)*.6;API.spawnUnit(t,k.x+Math.cos(a)*d,k.y+Math.sin(a)*d,p.id);}
   for(const r2 of ['food','wood','stone','gold'])p.res[r2]+=2000;}
  log(`Test: filled every kingdom to ~${MAXP} population (${API.get().units.filter(u=>!u.dead).length} units)`);}
 function checkDefeats(){let P;try{P=API.get().players;}catch(e){return;}if(!P)return;
  for(const p of P)if(p.surrendered&&!announced.has(p.id)){announced.add(p.id);sysChat(`${p.name}${p.isHuman&&p.pname?' ('+p.pname+')':''} has been defeated.`);}
  const alive=P.filter(p=>!p.surrendered);if(alive.length===1&&!announced.has('win')){announced.add('win');const w=alive[0];sysChat(`${w.name}${w.isHuman&&w.pname?' ('+w.pname+')':''} is victorious!`);}}
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
  if(opt.fillPop)fillPop();
  gameMeta={seed,diff:cfg.diff,fog:cfg.fog};inGame=true;uHist.clear();cmdQ=[];stepN=0;acc=0;lastT=Date.now();lastSnapT=0;departed.clear();
  for(const c of clients.values()){c.pid=c.slot;c.pend=null;c.ackN=c.lastSent=c.d0=seq;if(c.slot>=0)send(c,initMsg(c));}
  announced=new Set();sysChat('The game has started: '+slots.map((s,i)=>`${kname(i)} (${s.human?s.name:'AI'})`).join(', ')+'.');
  broadcastLobby();{const h=setInterval(tick,1000/60);loop=()=>clearInterval(h);}
  log(`Game started: ${slots.map((s,i)=>s.human?s.name:'AI').join(' | ')} (difficulty ${cfg.diff}, fog ${cfg.fog?'on':'off'}, map ${cfg.size})`);}
 function tick(){const t0=Date.now();const stepMs=API.STEP*1000;acc+=Math.min(250,t0-lastT)*speed;lastT=t0;let n=0;
  while(acc>=stepMs&&n<MAX_STEPS*speed){acc-=stepMs;n++;
   for(const q of cmdQ.splice(0)){try{API.applyCmd(q.pid,q.c);}catch(e){log('bad command '+e.message);}}
   const s0=Date.now();try{API.sim(API.STEP);}catch(e){log('sim error '+(e&&e.stack||e));}stats.stepMs=stats.stepMs*.95+(Date.now()-s0)*.05;stepN++;}
  if(acc>stepMs*2){stats.droppedMs+=acc-stepMs;acc=stepMs;}   // can't keep up: slow the game down rather than pile up work
  const now=Date.now();if(n&&now-lastSnapT>=1000/snapHz-4){lastSnapT=now;broadcastSnap();checkDefeats();}
  const dt=Date.now()-t0;stats.tickMs=stats.tickMs*.95+dt*.05;stats.tickMax=Math.max(stats.tickMax*.999,dt);}
 const cap=(a,n)=>a.length>n?a.slice(a.length-n):a;
 function broadcastSnap(){const s=API.makeSnap();const M=s.M;delete s.M;snapHz=s.U.length>BIG_UNITS?SNAP_HZ_BIG:SNAP_HZ;seq++;s.n=seq;stats.snaps++;let base=null;
  const rows=s.U.map(a=>JSON.stringify(a)),rmap=new Map();for(let i=0;i<rows.length;i++)rmap.set(s.U[i][0],rows[i]);uHist.set(seq,rmap);uHist.delete(seq-UHIST);let full=null;
  const uPart=c=>{const bm=c.delta&&c.ackN>c.d0&&uHist.get(c.ackN);if(!bm)return full||(full='"U":['+rows.join(',')+']');
   const ch=[],g=[];for(const [id,r] of rmap)if(bm.get(id)!==r)ch.push(r);for(const id of bm.keys())if(!rmap.has(id))g.push(id);
   return '"Ub":'+c.ackN+',"Ug":'+JSON.stringify(g)+',"U":['+ch.join(',')+']';};
  delete s.U;
  for(const c of clients.values()){if(c.pid==null||c.pid<0)continue;const mine=M.filter(m=>m[2]===-1||m[2]===c.pid);
   if((c.acks&&c.lastSent-c.ackN>=MAX_INFLIGHT)||(c.buffered&&c.buffered()>BP_BYTES)){   // socket backed up: skip this snapshot, keep its one-shot events
    const p=c.pend||(c.pend={R:[],D:[],K:[],M:[]});p.R.push(...s.R);p.D=cap(p.D.concat(s.D),400);p.K=cap(p.K.concat(s.K),20);p.M=cap(p.M.concat(mine),40);
    c.skipped=(c.skipped||0)+1;stats.skipped++;continue;}
   let str;
   if(c.pend){const p=c.pend;c.pend=null;str='{"t":"snap","sk":'+(c.skipped||0)+','+uPart(c)+','+JSON.stringify(Object.assign({},s,{R:p.R.concat(s.R),D:p.D.concat(s.D),K:p.K.concat(s.K),M:cap(p.M.concat(mine),40)})).slice(1);}
   else{if(base==null)base=JSON.stringify(s);str='{"t":"snap","sk":'+(c.skipped||0)+',"M":'+JSON.stringify(mine)+','+uPart(c)+','+base.slice(1);}
   c.lastSent=seq;stats.lastSnapBytes=str.length;send(c,str);}}
 function endGame(why){if(loop)loop();loop=null;inGame=false;sysChat(why||'The game has ended. Everyone is back in the lobby.');departed.clear();for(const c of clients.values()){c.pid=null;c.pend=null;send(c,{t:'tolobby'});}broadcastLobby();log('Returned to lobby.');}
 // a client came back with the token of a dropped (or still half-open) connection: give it its kingdom back
 function resume(cid,c,token){
  for(const [ocid,o] of clients)if(o!==c&&o.token===token){clients.delete(ocid);if(host===ocid)host=cid;if(o.close)try{o.close();}catch(e){}
   departed.set(token,{slot:o.slot,pid:o.pid,name:o.name,t:Date.now(),live:true});log(`Client ${ocid} (${o.name}) replaced by a new connection`);}
  const d=departed.get(token);if(!d||Date.now()-d.t>REJOIN_MS)return;departed.delete(token);
  if(inGame&&d.pid!=null&&d.pid>=0&&![...clients.values()].some(o=>o!==c&&o.pid===d.pid)){
   c.pid=d.pid;c.slot=d.slot;if(!d.live){try{API.makeHuman(d.pid,c.name);}catch(e){log(String(e));}}
   c.ackN=c.lastSent=c.d0=seq;c.pend=null;send(c,initMsg(c));sysChat(`${c.name} reconnected and rules ${kname(d.pid)} again.`);log(`Client ${cid} (${c.name}) rejoined as kingdom ${d.pid}`);}
  else if(!inGame&&d.slot>=0&&![...clients.values()].some(o=>o!==c&&o.slot===d.slot))c.slot=d.slot;}
 function onMsg(cid,c,m){if(!m||typeof m.t!=='string')return;
  switch(m.t){
  case 'hello':{c.name=cleanName(m.name,cid);if(m.acks){c.acks=true;c.delta=!!m.delta;c.ackN=c.lastSent=c.d0=seq;}let back=false;
   if(typeof m.token==='string'&&/^[\w-]{16,64}$/.test(m.token)&&!c.token){c.token=m.token;back=departed.has(m.token)||[...clients.values()].some(o=>o!==c&&o.token===m.token);resume(cid,c,m.token);}
   if(!c.greeted){c.greeted=true;if(!back)sysChat(`${c.name} joined${inGame?' (a game is in progress)':''}.`);else if(c.pid==null||c.pid<0)sysChat(`${c.name} is back.`);}broadcastLobby();break;}
  case 'name':{const old=c.name;c.name=cleanName(m.name,cid);if(old!==c.name&&c.greeted)sysChat(`${old} is now known as ${c.name}.`);broadcastLobby();break;}
  case 'chat':onChat(cid,c,m);break;
  case 'ack':{const n=m.n|0;if(n>c.ackN&&n<=seq)c.ackN=n;}break;
  case 'full':c.d0=seq;break;   // client lost its delta base: next snapshot carries every unit
  case 'ping':send(c,{t:'pong',c:typeof m.c==='number'?m.c:0,n:seq,tm:inGame?Math.round(API.get().time*100)/100:0,sk:c.skipped||0});break;
  case 'clienterr':log(`Client ${cid} (${c.name}) error: ${String(m.msg||'').slice(0,300)}`);break;
  case 'slot':if(inGame)break;{const s=m.slot|0;if(s<0)c.slot=-1;else if(s<4&&![...clients.values()].some(o=>o!==c&&o.slot===s))c.slot=s;broadcastLobby();}break;
  case 'cfg':if(cid!==host||inGame)break;if(['easy','normal','hard'].includes(m.diff))cfg.diff=m.diff;cfg.fog=!!m.fog;if(['small','medium','large'].includes(m.size))cfg.size=m.size;broadcastLobby();break;
  case 'start':if(cid===host&&!inGame)startGame();break;
  case 'cmd':if(inGame&&c.pid!=null&&c.pid>=0&&m.c&&typeof m.c==='object'&&cmdQ.length<5000)cmdQ.push({pid:c.pid,c:m.c});break;
  case 'surrender':if(inGame&&c.pid>=0){const p=API.get().players[c.pid];if(p&&!p.surrendered)API.surrender(p,p.lastAttackedBy>=0?p.lastAttackedBy:-1,'yield');}break;
  case 'tolobby':if(cid===host&&inGame)endGame(`${c.name} (host) ended the game. Everyone is back in the lobby.`);break;}}
 function leave(cid){const c=clients.get(cid);if(!c)return;clients.delete(cid);log(`Client ${cid} (${c.name}) left`);
  if(c.token)departed.set(c.token,{slot:c.slot,pid:c.pid,name:c.name,t:Date.now()});
  for(const [k,d] of departed)if(Date.now()-d.t>REJOIN_MS)departed.delete(k);
  // the AI takes over a kingdom whose player disconnected (until they rejoin)
  const wasPlaying=inGame&&c.pid!=null&&c.pid>=0;
  if(wasPlaying){try{API.makeAI(c.pid);}catch(e){log(String(e));}}
  if(c.greeted)sysChat(wasPlaying?`${c.name} disconnected. The AI rules ${kname(c.pid)} until they reconnect.`:`${c.name} left.`);
  if(host===cid){host=clients.size?[...clients.keys()][0]:null;if(host!=null&&clients.get(host).greeted)sysChat(`${clients.get(host).name} is now the host.`);}
  if(inGame&&![...clients.values()].some(o=>o.pid!=null&&o.pid>=0))endGame('All players left the game. Back to the lobby.');
  broadcastLobby();}
 return{join(sendStr,info,io){io=io||{};const cid=nextCid++;const c={send:sendStr,buffered:io.buffered,close:io.close,name:'Player '+cid,slot:-1,pid:null,token:null,pend:null,skipped:0,acks:false,ackN:0,lastSent:0};clients.set(cid,c);if(host==null)host=cid;
   log(`Client ${cid} connected${info?' from '+info:''}`);send(c,{t:'welcome',cid});send(c,{t:'chathist',items:chatHist});broadcastLobby();
   return{cid,msg:m=>onMsg(cid,c,m),leave:()=>leave(cid)};},
  get inGame(){return inGame;},clients,chatHist,cleanChat,lobby:lobbyMsg,broadcastLobby,stats,
  close(){if(loop)loop();loop=null;inGame=false;clients.clear();}};}
module.exports=createRoom;
