// The Lowlands — LAN server (server-authoritative simulation)
// Usage: npm install && node server.js   (PORT env var optional, default 8080; if 8080 is taken and PORT isn't set,
// the next free port 8081…8099 is used — set PORT_STRICT=1 to fail instead)
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm');
const {WebSocketServer}=require('ws');
const PORT=+process.env.PORT||8080;
// version: build-info.json (written by host/build.js, may override for a tag) or package.json
const VERSION=(()=>{try{return require('./host/build-info.json').version;}catch(e){}try{return require('./package.json').version;}catch(e){}return '0.0.0';})();
const UPD=require('./host/updater.js');
const HTML_PATH=path.join(__dirname,'index.html');
const html=fs.readFileSync(HTML_PATH,'utf8');
const a=html.indexOf('/*SIM-BEGIN*/'),b=html.indexOf('/*SIM-END*/');
if(a<0||b<0)throw new Error('index.html is missing the SIM-BEGIN/SIM-END markers');
// Run the exact same simulation code the browser uses, inside an isolated VM context.
const sandbox=vm.createContext({console});
vm.runInContext(html.slice(a,b)+`
;globalThis.API={setupGame,sim,applyCmd,makeSnap,mapData,playersMeta,makeAI,makeHuman,surrender,STEP,KINGDOMS,
 get:()=>({players,time,gameOver,seed})};`,sandbox,{filename:'sim.js'});
const API=sandbox.API;

const server=http.createServer((req,res)=>{
 const u=(req.url||'/').split('?')[0];
 if(u==='/'||u==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(fs.readFileSync(HTML_PATH));}
 else if(u==='/favicon.ico'){res.writeHead(204);res.end();}
 else if(u==='/stats'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-cache'});res.end(JSON.stringify(statsMsg()));}
 else if(u==='/version'){res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Cache-Control':'no-cache'});res.end(JSON.stringify(verMsg()));}
 else{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}});
// permessage-deflate (level 1, with context takeover): snapshots are JSON number arrays and shrink ~4x for ~0.2 ms each
const wss=new WebSocketServer({noServer:true,maxPayload:256*1024,perMessageDeflate:{zlibDeflateOptions:{level:1,memLevel:8},threshold:512,concurrencyLimit:4}});

// lobby + authoritative game loop
const createRoom=require('./room.js');
const room=createRoom(API,{log:m=>console.log(m),
 speed:+process.env.LOWLANDS_TEST_SPEED||1,autoplay:process.env.LOWLANDS_TEST_AUTOPLAY==='1'});   // test-only hooks (soak tests)

wss.on('connection',(ws,req)=>{
 ws.send(JSON.stringify(verMsg()));   // browsers show it in the menu and reload when it changes after an update
 const h=room.join(s=>{if(ws.readyState===1)ws.send(s);},req.socket.remoteAddress,{buffered:()=>ws.bufferedAmount,close:()=>ws.terminate()});
 ws.__h=h;ws.__alive=true;ws.__miss=0;ws.on('pong',()=>{ws.__alive=true;});
 ws.on('message',data=>{ws.__alive=true;let m;try{m=JSON.parse(data);}catch(e){return;}h.msg(m);});
 ws.on('error',()=>{});
 ws.on('close',()=>h.leave());});
// heartbeat: a connection that answered no ping and sent nothing for ~20 s is half-open (short Wi-Fi stalls are fine); drop it so the
// player's kingdom goes to the AI and their page can rejoin (it reconnects by itself)
const hb=setInterval(()=>{for(const ws of wss.clients){if(ws.__alive){ws.__miss=0;}else if(++ws.__miss>=4){try{ws.terminate();}catch(e){}continue;}ws.__alive=false;try{ws.ping();}catch(e){}}},5000);hb.unref();
function statsMsg(){const r=room.stats;return{version:VERSION,inGame:room.inGame,tickMs:+r.tickMs.toFixed(2),tickMax:+r.tickMax.toFixed(1),stepMs:+r.stepMs.toFixed(2),droppedMs:Math.round(r.droppedMs),snaps:r.snaps,skipped:r.skipped,lastSnapBytes:r.lastSnapBytes,
 clients:[...wss.clients].map(ws=>({cid:ws.__h&&ws.__h.cid,buffered:ws.bufferedAmount,deflate:!!(ws.extensions&&String(ws.extensions).includes('deflate'))})),rssMB:Math.round(process.memoryUsage().rss/1048576)};}

server.on('upgrade',(req,sock,head)=>{const u=(req.url||'').split('?')[0];
 if(u==='/ws')wss.handleUpgrade(req,sock,head,ws=>wss.emit('connection',ws,req));
 else sock.destroy();});

// ===== updates: check GitHub releases; the packaged host app installs them itself when no game is running =====
const updater=UPD.createUpdater({version:VERSION,selfUpdate:!!process.pkg&&!!module.exports.restart,log:m=>console.log(m),
 isIdle:()=>!room.inGame,           // never interrupt a running game
 restart:u=>module.exports.restart(u)});
function verMsg(){return{t:'version',version:VERSION,latest:updater.latest,update:updater.status,text:updater.text(),selfUpdate:updater.selfUpdate};}
updater.on(()=>{const s=JSON.stringify(verMsg());for(const c of wss.clients)if(c.readyState===1)c.send(s);});
// close everything so a restarted copy can take over the port
function shutdown(cb){clearInterval(hb);for(const c of wss.clients){try{c.close(1012,'restarting');}catch(e){}}room.close();server.close(()=>cb&&cb());setTimeout(()=>cb&&cb(),3000).unref();for(const c of wss.clients)try{c.terminate();}catch(e){}}
// listen on PORT; when PORT wasn't chosen explicitly and it's busy (e.g. a second copy is running), try the next ports
function lanIPs(){const ips=[];for(const list of Object.values(os.networkInterfaces()))for(const n of list||[])if((n.family==='IPv4'||n.family===4)&&!n.internal)ips.push(n.address);return ips;}
const fallback=!process.env.PORT&&!process.env.PORT_STRICT;let port=PORT;
server.on('error',e=>{if(e.code==='EADDRINUSE'&&fallback&&port<PORT+19){console.log(`  port ${port} is in use, trying ${port+1}…`);port++;setTimeout(()=>server.listen(port,'0.0.0.0'),50);return;}
 if(e.code==='EADDRINUSE')console.error(`\nPort ${port} is already in use (is The Lowlands already running?). Close the other program or set PORT=<number>.`);
 else console.error('Server error: '+e.message);module.exports.onFatal(e);});
server.on('listening',()=>{const p=server.address().port,ips=lanIPs();module.exports.port=p;module.exports.fellBack=p!==PORT;
 if(module.exports.banner)return module.exports.banner(p,ips);
 console.log('The Lowlands LAN server running.');
 console.log(`  Local:  http://localhost:${p}/`);
 for(const ip of ips)console.log(`  LAN:    http://${ip}:${p}/   <- share this with other players`);
 if(!ips.length)console.log('  (no LAN IPv4 interface found)');});
Object.assign(module.exports,{server,lanIPs,port:null,banner:null,onFatal:()=>process.exit(1),VERSION,updater,shutdown,wsClients:()=>wss.clients.size});
// start on the next tick, so the launcher (host app) can install its banner/restart hooks right after require()
setImmediate(()=>{updater.selfUpdate=!!process.pkg&&!!module.exports.restart&&updater.status!=='disabled';module.exports.updateCheck=updater.start();server.listen(port,'0.0.0.0');});
