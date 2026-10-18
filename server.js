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
 // tiny CORS-enabled probe so pages from other origins (or file://) can check this signaling server
 else if(u==='/sig/info'){res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Cache-Control':'no-cache'});res.end(JSON.stringify({game:'the-lowlands',sig:true,rooms:sigRooms.size}));}
 else{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}});
const wss=new WebSocketServer({noServer:true});

// The lobby/game-loop code is shared with the browser peer-to-peer host (between ROOM markers in index.html).
const ra=html.indexOf('/*ROOM-BEGIN*/'),rb=html.indexOf('/*ROOM-END*/');
if(ra<0||rb<0)throw new Error('index.html is missing the ROOM-BEGIN/ROOM-END markers');
const createRoom=new Function(html.slice(ra,rb)+';return createRoom;')();
const room=createRoom(API,{log:m=>console.log(m)});

wss.on('connection',(ws,req)=>{
 const h=room.join(s=>{if(ws.readyState===1)ws.send(s);},req.socket.remoteAddress);
 ws.on('message',data=>{let m;try{m=JSON.parse(data);}catch(e){return;}h.msg(m);});
 ws.on('close',()=>h.leave());});

// ===== signaling relay for browser peer-to-peer games (/sig) =====
// A browser host registers and gets a short room code (4 easy letters); joiners send the code; the server only
// relays the WebRTC offer/answer between them — the game itself then runs peer-to-peer in the host's browser.
// Any page origin may connect (also file:// pages, which send Origin "null"), so a downloaded index.html can use
// this server just for signaling. Lightweight: small messages only, rooms expire, dead sockets are reaped.
const SIG_ALPHA='ACDEFHJKMNPRTUVWXY';          // no look-alikes (B/8, G/6, I/1/L, O/0/Q, S/5, Z/2)
const SIG_TTL=+process.env.SIG_ROOM_TTL_MS||6*3600e3;   // a room lives at most this long
const SIG_MAX_ROOMS=500;
const sigs=new WebSocketServer({noServer:true,maxPayload:64*1024});const sigRooms=new Map();let sigN=1;
server.on('upgrade',(req,sock,head)=>{const u=(req.url||'').split('?')[0];
 if(u==='/ws')wss.handleUpgrade(req,sock,head,ws=>wss.emit('connection',ws,req));
 else if(u==='/sig')sigs.handleUpgrade(req,sock,head,ws=>sigs.emit('connection',ws,req));
 else sock.destroy();});
function sigCode(){for(let n=0;;n++){const len=n<50?4:5;let c='';for(let i=0;i<len;i++)c+=SIG_ALPHA[Math.floor(Math.random()*SIG_ALPHA.length)];if(!sigRooms.has(c))return c;}}
function sigClose(code,why){const r=sigRooms.get(code);if(!r)return;sigRooms.delete(code);for(const p of r.peers.values())try{p.send(JSON.stringify({t:'hostgone'}));}catch(e){}
 if(why){try{r.ws.send(JSON.stringify({t:'expired'}));r.ws.close();}catch(e){}}console.log(`P2P room ${code} closed${why?' ('+why+')':''}`);}
sigs.on('connection',ws=>{const id=sigN++;let hostOf=null,joinedTo=null,misses=0;ws.alive=true;ws.on('pong',()=>{ws.alive=true;});
 const tx=(w,o)=>{if(w&&w.readyState===1)w.send(JSON.stringify(o));};
 ws.on('message',d=>{let m;try{m=JSON.parse(d);}catch(e){return;}if(!m)return;
  if(m.t==='host'&&!hostOf){if(sigRooms.size>=SIG_MAX_ROOMS){tx(ws,{t:'full'});return;}hostOf=sigCode();sigRooms.set(hostOf,{ws,peers:new Map(),t0:Date.now()});tx(ws,{t:'code',code:hostOf,ttl:SIG_TTL});console.log('P2P room '+hostOf+' opened');}
  else if(m.t==='join'){const code=String(m.code||'').toUpperCase().replace(/[^A-Z]/g,'');const r=sigRooms.get(code);
   if(!r){tx(ws,{t:'nocode'});if(++misses>=10)ws.close();return;}   // no brute-forcing codes over one socket
   if(joinedTo)joinedTo.peers.delete(id);joinedTo=r;r.peers.set(id,ws);tx(r.ws,{t:'peer',id,name:String(m.name||'').slice(0,16)});}
  else if(m.t==='sig'&&typeof m.data==='string'){if(hostOf){const r=sigRooms.get(hostOf);tx(r&&r.peers.get(m.to),{t:'sig',data:m.data});}else if(joinedTo)tx(joinedTo.ws,{t:'sig',from:id,data:m.data});}});
 ws.on('close',()=>{if(hostOf&&sigRooms.get(hostOf)&&sigRooms.get(hostOf).ws===ws)sigClose(hostOf);if(joinedTo)joinedTo.peers.delete(id);});});
// reap dead sockets and expired rooms
setInterval(()=>{for(const ws of sigs.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;try{ws.ping();}catch(e){}}
 const now=Date.now();for(const [c,r] of sigRooms)if(now-r.t0>SIG_TTL)sigClose(c,'expired');},Math.min(30000,Math.max(500,SIG_TTL/4))).unref();

server.listen(PORT,'0.0.0.0',()=>{
 const ips=[];for(const list of Object.values(os.networkInterfaces()))for(const n of list||[])if((n.family==='IPv4'||n.family===4)&&!n.internal)ips.push(n.address);
 console.log('The Lowlands LAN server running.');
 console.log(`  Local:  http://localhost:${PORT}/`);
 for(const ip of ips)console.log(`  LAN:    http://${ip}:${PORT}/   <- share this with other players`);
 if(!ips.length)console.log('  (no LAN IPv4 interface found)');});
