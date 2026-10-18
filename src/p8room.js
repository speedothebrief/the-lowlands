// ===== game room (lobby + authoritative loop) — shared by server.js (Node) and the browser P2P host =====
// API: the simulation instance; opt.log(msg). join(sendStr) returns {msg(obj), leave()}.
function createRoom(API,opt){opt=opt||{};const log=opt.log||(()=>{});
 let nextCid=1,host=null,inGame=false,cfg={diff:'normal',fog:true,size:'small'},loop=null,cmdQ=[],stepN=0,lastT=0,acc=0;
 const clients=new Map();
 const send=(c,o)=>{try{c.send(typeof o==='string'?o:JSON.stringify(o));}catch(e){}};
 const lobbyMsg=()=>({t:'lobby',host,inGame,diff:cfg.diff,fog:cfg.fog,size:cfg.size,p2p:!!opt.p2p,code:opt.code||null,clients:[...clients.entries()].map(([cid,c])=>({cid,name:c.name,slot:c.slot}))});
 const broadcastLobby=()=>{const m=JSON.stringify(lobbyMsg());for(const c of clients.values())send(c,m);};
 const cleanName=(n,cid)=>{n=String(n||'').replace(/[^\w \-.']/g,'').trim().slice(0,16);return n||('Player '+cid);};
 function startGame(){
  const slots=[0,1,2,3].map(i=>{const c=[...clients.values()].find(c=>c.slot===i);return c?{human:true,name:c.name}:{human:false};});
  if(!slots.some(s=>s.human))return;
  const seed=Math.floor(Math.random()*1e9);API.setupGame(seed,slots,cfg.diff,cfg.fog,cfg.size);
  const md=API.mapData(),meta=API.playersMeta();inGame=true;cmdQ=[];stepN=0;acc=0;lastT=Date.now();
  for(const c of clients.values()){c.pid=c.slot;if(c.slot>=0)send(c,{t:'init',seed,...md,players:meta,you:c.slot,diff:cfg.diff,fog:cfg.fog});}
  broadcastLobby();if(opt.timer)loop=opt.timer(tick,1000/60);else{const h=setInterval(tick,1000/60);loop=()=>clearInterval(h);}
  log(`Game started: ${slots.map((s,i)=>s.human?s.name:'AI').join(' | ')} (difficulty ${cfg.diff}, fog ${cfg.fog?'on':'off'}, map ${cfg.size})`);}
 function tick(){const now=Date.now();acc+=Math.min(250,now-lastT);lastT=now;const stepMs=API.STEP*1000;
  while(acc>=stepMs){acc-=stepMs;
   for(const q of cmdQ.splice(0)){try{API.applyCmd(q.pid,q.c);}catch(e){log('bad command '+e.message);}}
   try{API.sim(API.STEP);}catch(e){log('sim error '+(e&&e.stack||e));}
   stepN++;if(stepN%2===0)broadcastSnap();}}
 function broadcastSnap(){const s=API.makeSnap();const M=s.M;delete s.M;const base=JSON.stringify(s);
  for(const c of clients.values()){if(c.pid==null||c.pid<0)continue;const mine=M.filter(m=>m[2]===-1||m[2]===c.pid);send(c,'{"t":"snap","M":'+JSON.stringify(mine)+','+base.slice(1));}}
 function endGame(){if(loop)loop();loop=null;inGame=false;for(const c of clients.values()){c.pid=null;send(c,{t:'tolobby'});}broadcastLobby();log('Returned to lobby.');}
 function onMsg(cid,c,m){if(!m||typeof m.t!=='string')return;
  switch(m.t){
  case 'hello':case 'name':c.name=cleanName(m.name,cid);broadcastLobby();break;
  case 'slot':if(inGame)break;{const s=m.slot|0;if(s<0)c.slot=-1;else if(s<4&&![...clients.values()].some(o=>o!==c&&o.slot===s))c.slot=s;broadcastLobby();}break;
  case 'cfg':if(cid!==host||inGame)break;if(['easy','normal','hard'].includes(m.diff))cfg.diff=m.diff;cfg.fog=!!m.fog;if(['small','medium','large'].includes(m.size))cfg.size=m.size;broadcastLobby();break;
  case 'start':if(cid===host&&!inGame)startGame();break;
  case 'cmd':if(inGame&&c.pid!=null&&c.pid>=0&&m.c&&typeof m.c==='object'&&cmdQ.length<5000)cmdQ.push({pid:c.pid,c:m.c});break;
  case 'surrender':if(inGame&&c.pid>=0){const p=API.get().players[c.pid];if(p&&!p.surrendered)API.surrender(p,p.lastAttackedBy>=0?p.lastAttackedBy:-1,'yield');}break;
  case 'tolobby':if(cid===host&&inGame)endGame();break;}}
 function leave(cid){const c=clients.get(cid);if(!c)return;clients.delete(cid);log(`Client ${cid} (${c.name}) left`);
  // the AI takes over a kingdom whose player disconnected
  if(inGame&&c.pid!=null&&c.pid>=0){try{API.makeAI(c.pid);}catch(e){log(String(e));}}
  if(host===cid)host=clients.size?[...clients.keys()][0]:null;
  if(inGame&&![...clients.values()].some(o=>o.pid!=null&&o.pid>=0))endGame();
  broadcastLobby();}
 return{join(sendStr,info){const cid=nextCid++;const c={send:sendStr,name:'Player '+cid,slot:-1,pid:null};clients.set(cid,c);if(host==null)host=cid;
   log(`Client ${cid} connected${info?' from '+info:''}`);send(c,{t:'welcome',cid});broadcastLobby();
   return{cid,msg:m=>onMsg(cid,c,m),leave:()=>leave(cid)};},
  get inGame(){return inGame;},clients,lobby:lobbyMsg,broadcastLobby,
  close(){if(loop)loop();loop=null;inGame=false;clients.clear();}};}
