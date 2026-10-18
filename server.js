// The Lowlands — LAN server (server-authoritative simulation)
// Usage: npm install && node server.js   (PORT env var optional, default 8080)
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm');
const {WebSocketServer}=require('ws');
const PORT=+process.env.PORT||8080;
const HTML_PATH=path.join(__dirname,'index.html');
const html=fs.readFileSync(HTML_PATH,'utf8');
const a=html.indexOf('/*SIM-BEGIN*/'),b=html.indexOf('/*SIM-END*/');
if(a<0||b<0)throw new Error('index.html is missing the SIM-BEGIN/SIM-END markers');
// Run the exact same simulation code the browser uses, inside an isolated VM context.
const sandbox=vm.createContext({console});
vm.runInContext(html.slice(a,b)+`
;globalThis.API={setupGame,sim,applyCmd,makeSnap,mapData,playersMeta,makeAI,surrender,STEP,KINGDOMS,
 get:()=>({players,time,gameOver,seed})};`,sandbox,{filename:'sim.js'});
const API=sandbox.API;

const server=http.createServer((req,res)=>{
 const u=(req.url||'/').split('?')[0];
 if(u==='/'||u==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(fs.readFileSync(HTML_PATH));}
 else if(u==='/favicon.ico'){res.writeHead(204);res.end();}
 else{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}});
const wss=new WebSocketServer({server,path:'/ws'});

let nextCid=1,host=null,inGame=false,cfg={diff:'normal',fog:true,size:'small'},loop=null,cmdQ=[],stepN=0,lastT=0,acc=0;
const clients=new Map(); // cid -> {ws,name,slot,pid}
function send(c,o){if(c.ws.readyState===1)c.ws.send(typeof o==='string'?o:JSON.stringify(o));}
function lobbyMsg(){return{t:'lobby',host,inGame,diff:cfg.diff,fog:cfg.fog,size:cfg.size,clients:[...clients.entries()].map(([cid,c])=>({cid,name:c.name,slot:c.slot}))};}
function broadcastLobby(){const m=JSON.stringify(lobbyMsg());for(const c of clients.values())send(c,m);}
function cleanName(n,cid){n=String(n||'').replace(/[^\w \-.']/g,'').trim().slice(0,16);return n||('Player '+cid);}

function startGame(){
 const slots=[0,1,2,3].map(i=>{const c=[...clients.values()].find(c=>c.slot===i);return c?{human:true,name:c.name}:{human:false};});
 if(!slots.some(s=>s.human))return;
 const seed=Math.floor(Math.random()*1e9);
 API.setupGame(seed,slots,cfg.diff,cfg.fog,cfg.size);
 const md=API.mapData(),meta=API.playersMeta();
 inGame=true;cmdQ=[];stepN=0;acc=0;lastT=Date.now();
 for(const c of clients.values()){c.pid=c.slot;if(c.slot>=0)send(c,{t:'init',seed,...md,players:meta,you:c.slot,diff:cfg.diff,fog:cfg.fog});}
 broadcastLobby();
 loop=setInterval(tick,1000/60);
 console.log(`Game started: ${slots.map((s,i)=>s.human?s.name:'AI').join(' | ')} (difficulty ${cfg.diff}, fog ${cfg.fog?'on':'off'}, map ${cfg.size})`);}
function tick(){const now=Date.now();acc+=Math.min(250,now-lastT);lastT=now;const stepMs=API.STEP*1000;
 while(acc>=stepMs){acc-=stepMs;
  for(const q of cmdQ.splice(0)){try{API.applyCmd(q.pid,q.c);}catch(e){console.error('bad command',e.message);}}
  try{API.sim(API.STEP);}catch(e){console.error('sim error',e);}
  stepN++;if(stepN%2===0)broadcastSnap();}}
function broadcastSnap(){const s=API.makeSnap();const M=s.M;delete s.M;const base=JSON.stringify(s);
 for(const c of clients.values()){if(c.pid==null||c.pid<0)continue;const mine=M.filter(m=>m[2]===-1||m[2]===c.pid);send(c,'{"t":"snap","M":'+JSON.stringify(mine)+','+base.slice(1));}}
function endGame(){if(loop)clearInterval(loop);loop=null;inGame=false;for(const c of clients.values()){c.pid=null;send(c,{t:'tolobby'});}broadcastLobby();console.log('Returned to lobby.');}

wss.on('connection',(ws,req)=>{const cid=nextCid++;const c={ws,name:'Player '+cid,slot:-1,pid:null};clients.set(cid,c);if(host==null)host=cid;
 console.log(`Client ${cid} connected from ${req.socket.remoteAddress}`);
 send(c,{t:'welcome',cid});broadcastLobby();
 ws.on('message',data=>{let m;try{m=JSON.parse(data);}catch(e){return;}if(!m||typeof m.t!=='string')return;
  switch(m.t){
  case 'hello':case 'name':c.name=cleanName(m.name,cid);broadcastLobby();break;
  case 'slot':if(inGame)break;{const s=m.slot|0;if(s<0)c.slot=-1;else if(s<4&&![...clients.values()].some(o=>o!==c&&o.slot===s))c.slot=s;broadcastLobby();}break;
  case 'cfg':if(cid!==host||inGame)break;if(['easy','normal','hard'].includes(m.diff))cfg.diff=m.diff;cfg.fog=!!m.fog;if(['small','medium','large'].includes(m.size))cfg.size=m.size;broadcastLobby();break;
  case 'start':if(cid===host&&!inGame)startGame();break;
  case 'cmd':if(inGame&&c.pid!=null&&c.pid>=0&&m.c&&typeof m.c==='object'&&cmdQ.length<5000)cmdQ.push({pid:c.pid,c:m.c});break;
  case 'surrender':if(inGame&&c.pid>=0){const p=API.get().players[c.pid];if(p&&!p.surrendered)API.surrender(p,p.lastAttackedBy>=0?p.lastAttackedBy:-1,'yield');}break;
  case 'tolobby':if(cid===host&&inGame)endGame();break;
  }});
 ws.on('close',()=>{clients.delete(cid);console.log(`Client ${cid} (${c.name}) left`);
  if(inGame&&c.pid!=null&&c.pid>=0){try{API.makeAI(c.pid);}catch(e){console.error(e);}}
  if(host===cid)host=clients.size?[...clients.keys()][0]:null;
  if(inGame&&![...clients.values()].some(o=>o.pid!=null&&o.pid>=0))endGame();
  broadcastLobby();});});

server.listen(PORT,'0.0.0.0',()=>{
 const ips=[];for(const list of Object.values(os.networkInterfaces()))for(const n of list||[])if((n.family==='IPv4'||n.family===4)&&!n.internal)ips.push(n.address);
 console.log('The Lowlands LAN server running.');
 console.log(`  Local:  http://localhost:${PORT}/`);
 for(const ip of ips)console.log(`  LAN:    http://${ip}:${PORT}/   <- share this with other players`);
 if(!ips.length)console.log('  (no LAN IPv4 interface found)');});
