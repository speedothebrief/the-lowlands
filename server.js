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

// ===== optional signaling relay for browser peer-to-peer games (/sig) =====
// A browser host registers and gets a short room code; joiners send the code; the server only relays the
// WebRTC offer/answer between them (the game itself then runs peer-to-peer, hosted in the host's browser).
const sigs=new WebSocketServer({noServer:true});const sigRooms=new Map();let sigN=1;
server.on('upgrade',(req,sock,head)=>{const u=(req.url||'').split('?')[0];
 if(u==='/ws')wss.handleUpgrade(req,sock,head,ws=>wss.emit('connection',ws,req));
 else if(u==='/sig')sigs.handleUpgrade(req,sock,head,ws=>sigs.emit('connection',ws,req));
 else sock.destroy();});
function sigCode(){const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';for(;;){let c='';for(let i=0;i<4;i++)c+=A[Math.floor(Math.random()*A.length)];if(!sigRooms.has(c))return c;}}
sigs.on('connection',ws=>{const id=sigN++;let hostOf=null,joinedTo=null;const tx=(w,o)=>{if(w&&w.readyState===1)w.send(JSON.stringify(o));};
 ws.on('message',d=>{let m;try{m=JSON.parse(d);}catch(e){return;}if(!m)return;
  if(m.t==='host'&&!hostOf){hostOf=sigCode();sigRooms.set(hostOf,{ws,peers:new Map()});tx(ws,{t:'code',code:hostOf});console.log('P2P room '+hostOf+' opened');}
  else if(m.t==='join'){const r=sigRooms.get(String(m.code||'').toUpperCase().trim());if(!r){tx(ws,{t:'nocode'});return;}joinedTo=r;r.peers.set(id,ws);tx(r.ws,{t:'peer',id,name:String(m.name||'').slice(0,16)});}
  else if(m.t==='sig'){if(hostOf){const r=sigRooms.get(hostOf);tx(r&&r.peers.get(m.to),{t:'sig',data:m.data});}else if(joinedTo)tx(joinedTo.ws,{t:'sig',from:id,data:m.data});}});
 ws.on('close',()=>{if(hostOf){const r=sigRooms.get(hostOf);if(r)for(const p of r.peers.values())tx(p,{t:'hostgone'});sigRooms.delete(hostOf);}if(joinedTo)joinedTo.peers.delete(id);});});

server.listen(PORT,'0.0.0.0',()=>{
 const ips=[];for(const list of Object.values(os.networkInterfaces()))for(const n of list||[])if((n.family==='IPv4'||n.family===4)&&!n.internal)ips.push(n.address);
 console.log('The Lowlands LAN server running.');
 console.log(`  Local:  http://localhost:${PORT}/`);
 for(const ip of ips)console.log(`  LAN:    http://${ip}:${PORT}/   <- share this with other players`);
 if(!ips.length)console.log('  (no LAN IPv4 interface found)');});
