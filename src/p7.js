// ===== client: commands =====
function issue(c){if(mode==='net')netSend({t:'cmd',c});else applyCmd(me,c);}
function marker(x,y,c){markers.push({x,y,c,t:time});}
const BH={keep:95,tower:78,fortress:80,wall:24,gate:28,farm:4,house:30,market:24};
function entVisible(e){if(e.inG)return false;if(!fogOn||e.owner===me)return true;if(e.kind==='unit')return visAt(e.x,e.y)===2;return visAt(e.x,e.y)>0;}
function pickAt(sx,sy){let best=null,bd=1e9;
 for(const u of units){if(u.dead||!entVisible(u))continue;const s=worldToScreen(u.x,u.y);const big=u.type==='knight'||u.type==='catapult';const dx=sx-s[0],dy=sy-(s[1]-11*cam.z);
  if(Math.abs(dx)<(big?14:9)*cam.z&&Math.abs(dy)<(big?14:13)*cam.z){const d=dx*dx+dy*dy;if(d<bd){bd=d;best=u;}}}
 if(best)return best;const w=screenToWorld(sx,sy);const tx=Math.floor(w.x),ty=Math.floor(w.y);
 if(inb(tx,ty)){const b=bgrid[ty*MAP+tx];if(b&&!b.dead&&entVisible(b))return b;}
 const px=(sx-W/2)/cam.z+cam.x,py=(sy-H/2)/cam.z+cam.y;let bb=null,bdd=-1e9;
 for(const b of blds){if(b.dead||!entVisible(b))continue;const l=iso(b.tx,b.ty+b.h)[0],r=iso(b.tx+b.w,b.ty)[0],bot=iso(b.tx+b.w,b.ty+b.h)[1],top=iso(b.tx,b.ty)[1]-(BH[b.type]||45);
  if(px>l+6&&px<r-6&&py>top&&py<bot-8){const d=b.x+b.y;if(d>bdd){bdd=d;bb=b;}}}
 return bb;}
function resAtScreen(sx,sy){const w=screenToWorld(sx,sy);const tx=Math.floor(w.x),ty=Math.floor(w.y);
 for(const [dx,dy] of [[0,0],[1,1],[1,0],[0,1],[2,2]]){const x=tx+dx,y=ty+dy;if(inb(x,y)&&resT[y*MAP+x]&&(!fogOn||vis[y*MAP+x]>0))return[x,y];}return null;}
function cmdRight(sx,sy,viaMM){const own=sel.filter(e=>e.owner===me&&!e.dead);if(!own.length)return;
 const w=viaMM?mmToWorld(sx,sy):screenToWorld(sx,sy);if(!inb(Math.floor(w.x),Math.floor(w.y)))return;
 if(own[0].kind==='bld'){if(BLD[own[0].type].train){issue({t:'rally',bid:own[0].id,x:w.x,y:w.y});marker(w.x,w.y,'#fff');AU.play('ord_move');}return;}
 const ids=own.map(u=>u.id);const t=viaMM?null:pickAt(sx,sy);
 if(t&&isEnemy(me,t.owner)){issue({t:'attack',ids,tid:t.id,x:w.x,y:w.y});marker(t.x,t.y,'#ff5040');AU.play('ord_atk');return;}
 if(own.some(u=>u.type==='peasant')&&!viaMM){const r=resAtScreen(sx,sy);
  if(r&&!(t&&t.owner===me&&t.kind==='bld')){issue({t:'gather',ids,tx:r[0],ty:r[1],x:w.x,y:w.y});marker(r[0]+.5,r[1]+.5,'#ffd040');AU.play('ord_gather');return;}
  if(t&&t.owner===me&&t.kind==='bld'){
   const carrying=own.some(u=>u.type==='peasant'&&u.carry>0&&BLD[t.type].drop&&BLD[t.type].drop.includes(u.carryT));
   if(!t.built||(t.hp<t.maxhp-.5&&!carrying)){issue({t:'repair',ids,bid:t.id,x:w.x,y:w.y});marker(t.x,t.y,'#80d0ff');AU.play('ord_gather');return;}
   if(t.type==='farm'){issue({t:'farm',ids,bid:t.id,x:w.x,y:w.y});marker(t.x,t.y,'#ffd040');AU.play('ord_gather');return;}
   if(BLD[t.type].drop&&(carrying||!BLD[t.type].gar)){issue({t:'drop',ids,bid:t.id,x:w.x,y:w.y});marker(t.x,t.y,'#ffd040');AU.play('ord_gather');return;}}}
 if(t&&t.owner===me&&t.kind==='bld'&&t.built&&BLD[t.type].gar&&own.some(canGar)){issue({t:'garrison',ids,bid:t.id});marker(t.x,t.y,'#c0a0ff');AU.play('ord_move');return;}
 issue({t:'move',ids,x:w.x,y:w.y,am:false});marker(w.x,w.y,'#80ff80');AU.play('ord_move');}
function boxSelect(x0,y0,x1,y1,add){const a=Math.min(x0,x1),b=Math.max(x0,x1),c=Math.min(y0,y1),d=Math.max(y0,y1);
 let picked=units.filter(u=>{if(u.owner!==me||u.dead||u.inG)return false;const s=worldToScreen(u.x,u.y);return s[0]>=a&&s[0]<=b&&s[1]-8*cam.z>=c&&s[1]-8*cam.z<=d;});
 if(picked.some(u=>u.type!=='peasant'))picked=picked.filter(u=>u.type!=='peasant');
 if(add){for(const u of picked)if(!sel.includes(u))sel.push(u);sel=sel.filter(e=>e.kind==='unit');}else sel=picked;selSound();}
function selSound(){const e=sel[0];if(!e)return;if(e.kind==='bld')AU.play('sel_bld');else if(sel.some(u=>u.type!=='peasant'))AU.play('sel_mil');else AU.play('sel_peas');}
function clickSelect(sx,sy,add){const e=pickAt(sx,sy);const now=performance.now();
 if(!e){if(!add)sel=[];return;}const prevSel=sel.slice();setTimeout(()=>{if(sel.length&&(sel.length!==prevSel.length||sel.some((x,i)=>x!==prevSel[i])))selSound();},0);
 if(e.kind==='unit'&&e.owner===me&&now-lastClick.t<350&&lastClick.type===e.type){sel=units.filter(u=>u.owner===me&&!u.inG&&u.type===e.type&&onScreen(u.x,u.y,0));lastClick.t=0;return;}
 lastClick={t:now,type:e.kind==='unit'?e.type:null};
 if(add&&e.kind==='unit'&&e.owner===me){sel=sel.filter(x=>x.kind==='unit');const i=sel.indexOf(e);if(i>=0)sel.splice(i,1);else sel.push(e);}else sel=[e];}
function tryPlace(spots){const D=BLD[placing];const ok=[];let why=null;for(const s of spots){const w=canPlace(placing,s[0],s[1],me,null);if(w){why=w;continue;}ok.push(s);}
 if(!ok.length){msg('Cannot build here: '+(why||'invalid'),'#ff9a8a',me);AU.play('err');return false;}
 if(!afford(players[me],D.cost)){msg('Not enough resources for '+D.name+'.','#ff9a8a',me);AU.play('err');return false;}
 const ids=sel.filter(u=>u.kind==='unit'&&u.owner===me&&u.type==='peasant'&&!u.dead).map(u=>u.id);issue({t:'build',type:placing,spots:ok,ids});return true;}

// ===== client: input =====
const keys=new Set();
function inRect(x,y,r){return x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h;}
function hitBtn(){for(let i=uiBtns.length-1;i>=0;i--){const b=uiBtns[i];if(mouse.x>=b.x&&mouse.x<b.x+b.w&&mouse.y>=b.y&&mouse.y<b.y+b.h)return b;}return null;}
const inGame=()=>state==='play'||state==='paused'||state==='won'||state==='lost';
const overlayUp=()=>state==='menu'||state==='lobby'||showHelp||state==='paused'||((state==='won'||state==='lost')&&!endShown);
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('mouseleave',()=>{mouse.inside=false;});
cv.addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;mouse.inside=true;if(activeSlider){activeSlider.on();return;}
 if(mouse.ldown&&!placing&&Math.hypot(mouse.x-mouse.sx,mouse.y-mouse.sy)>6)mouse.dragging=true;
 if(mouse.mmDrag){const w=mmToWorld(mouse.x,mouse.y);centerOn(clamp(w.x,0,MAP),clamp(w.y,0,MAP));}
 if(mouse.rdown||mouse.mdown){if(Math.hypot(mouse.x-mouse.rsx,mouse.y-mouse.rsy)>6)mouse.rdrag=true;if(mouse.rdrag){cam.x=mouse.camSX-(mouse.x-mouse.rsx)/cam.z;cam.y=mouse.camSY-(mouse.y-mouse.rsy)/cam.z;clampCam();}}});
cv.addEventListener('mousedown',e=>{mouse.x=e.clientX;mouse.y=e.clientY;mouse.inside=true;
 if(e.button===0){const b=hitBtn();if(b){if(b.slider)activeSlider=b;else AU.ui('click');b.on();return;}if(overlayUp())return;if(!inGame())return;
  if(inRect(mouse.x,mouse.y,mmRect())){mouse.mmDrag=true;const w=mmToWorld(mouse.x,mouse.y);centerOn(clamp(w.x,0,MAP),clamp(w.y,0,MAP));return;}
  if(mouseOverUI())return;
  if(placing){const D=BLD[placing];if(D.wall){const w=screenToWorld(mouse.x,mouse.y);wallStart=[Math.floor(w.x),Math.floor(w.y)];}else{if(tryPlace([placeSpot()])&&!e.shiftKey&&!placeSticky)placing=null;}return;}
  if(amoveMode){const w=screenToWorld(mouse.x,mouse.y);const ids=sel.filter(u=>u.kind==='unit'&&u.owner===me).map(u=>u.id);if(ids.length){issue({t:'move',ids,x:w.x,y:w.y,am:true});marker(w.x,w.y,'#ff8040');AU.play('ord_atk');}if(!e.shiftKey)amoveMode=false;return;}
  mouse.ldown=true;mouse.sx=mouse.x;mouse.sy=mouse.y;mouse.dragging=false;}
 else if(e.button===2||e.button===1){if(e.button===2&&(placing||amoveMode)){placing=null;wallStart=null;amoveMode=false;return;}
  if(overlayUp()||!inGame())return;
  if(e.button===2&&inRect(mouse.x,mouse.y,mmRect())){cmdRight(mouse.x,mouse.y,true);return;}
  if(e.button===2)mouse.rdown=true;else mouse.mdown=true;mouse.rsx=mouse.x;mouse.rsy=mouse.y;mouse.rdrag=false;mouse.camSX=cam.x;mouse.camSY=cam.y;e.preventDefault();}});
window.addEventListener('mouseup',e=>{
 if(e.button===0){mouse.mmDrag=false;if(activeSlider){activeSlider=null;return;}
  if(wallStart&&placing){const w=screenToWorld(mouse.x,mouse.y);const line=wallLine(wallStart,[Math.floor(w.x),Math.floor(w.y)]);tryPlace(line);wallStart=null;if(!e.shiftKey&&!placeSticky)placing=null;}
  if(mouse.ldown){mouse.ldown=false;if(mouse.dragging)boxSelect(mouse.sx,mouse.sy,mouse.x,mouse.y,e.shiftKey);else clickSelect(mouse.x,mouse.y,e.shiftKey);mouse.dragging=false;}}
 else if(e.button===2){if(mouse.rdown&&!mouse.rdrag&&inGame()&&!overlayUp()&&!mouseOverUI())cmdRight(mouse.x,mouse.y,false);mouse.rdown=false;mouse.rdrag=false;}
 else if(e.button===1){mouse.mdown=false;mouse.rdrag=false;}});
cv.addEventListener('wheel',e=>{e.preventDefault();if(!inGame())return;zoomAt(mouse.x,mouse.y,e.deltaY<0?1.12:1/1.12);},{passive:false});
function zoomAt(sx,sy,f){const px=(sx-W/2)/cam.z+cam.x,py=(sy-H/2)/cam.z+cam.y;cam.z=clamp(cam.z*f,0.45,2.2);cam.x=px-(sx-W/2)/cam.z;cam.y=py-(sy-H/2)/cam.z;clampCam();}
function clampCam(){cam.x=clamp(cam.x,-MAP*32,MAP*32);cam.y=clamp(cam.y,0,MAP*32);}
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;
 if(k==='f3'){e.preventDefault();showNet=!showNet;return;}
 if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();
 keys.add(k);if(k==='m'&&!e.repeat&&!(buildMenuOpen&&inGame())){AU.init();AU.toggleMute();msg(AU.S.muted?'Sound muted (M)':'Sound on (M)','#cdbb90',me);}if(!inGame())return;
 if(buildMenuOpen&&state==='play'&&k.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){keys.delete(k);const ty=BUILD_KEY_OF[k];buildMenuOpen=false;
  if(ty){startPlacing(ty,e.shiftKey);}else if(k!=='b'){msg('No building on '+k.toUpperCase()+' (B then H/F/L/Q/G/M/B/S/W/A/E/T/O).','#cdbb90',me);AU.play('err');}return;}
 if(k==='escape'&&buildMenuOpen){buildMenuOpen=false;return;}
 if(k==='h'){showHelp=!showHelp;return;}
 if(k==='escape'){if(placing||amoveMode||wallStart){placing=null;amoveMode=false;wallStart=null;return;}if(showHelp){showHelp=false;return;}state=state==='paused'?'play':state==='play'?'paused':state;return;}
 if(k==='p'){if(state==='play')state='paused';else if(state==='paused')state='play';return;}
 if(state!=='play'&&state!=='won'&&state!=='lost')return;
 if(k==='f'&&mode==='local'){fogOn=!fogOn;updateVis();mmDirty=true;msg('Fog of war '+(fogOn?'on':'off'),'#cdbb90',me);}
 else if(k==='x'){if(sel.some(u=>u.kind==='unit'&&u.owner===me)){amoveMode=true;placing=null;}}
 else if(k==='c')stopSel();
 else if(k==='b'){const b=sel[0];if(e.shiftKey||(b&&sel.length===1&&b.kind==='bld'&&b.owner===me&&b.type==='keep'&&b.built))bellCmd();else{buildMenuOpen=true;placing=null;wallStart=null;amoveMode=false;}}
 else if(k==='g')garrisonSel();
 else if(k==='u')unloadSel();
 else if(k==='n')repairSel();
 else if(k==='delete'||k==='backspace'){const b=sel[0];if(b&&b.kind==='bld'&&b.owner===me&&!b.built)issue({t:'cancelbld',bid:b.id});}
 else if(k===' '){const P=players[me];const pg=pings.filter(p=>p.o===me).pop();if(pg&&time-pg.t<20)centerOn(pg.x,pg.y);else if(P.keep&&!P.keep.dead)centerOn(P.keep.x,P.keep.y);else{const k2=blds.find(b=>b.owner===me&&b.type==='keep');if(k2)centerOn(k2.x,k2.y);}}
 else if(k==='.')selectIdle();
 else if('qert'.includes(k)&&k.length===1){const b=sel[0];if(b&&b.kind==='bld'&&b.owner===me&&b.built&&BLD[b.type].train){const ut=BLD[b.type].train['qert'.indexOf(k)];if(ut)trainCmd(b,ut);}}
 else if(k==='+'||k==='=')zoomAt(W/2,H/2,1.15);else if(k==='-')zoomAt(W/2,H/2,1/1.15);
 else if(/^digit[1-9]$/.test(e.code.toLowerCase())){const n=e.code.slice(5);if(e.ctrlKey||e.shiftKey||e.metaKey){e.preventDefault();groups[n]=sel.filter(u=>u.kind==='unit'&&u.owner===me).map(u=>u.id);msg(`Group ${n} set (${groups[n].length} units)`,'#cdbb90',me);}
  else if(groups[n]){const g=units.filter(u=>!u.inG&&groups[n].includes(u.id));if(g.length){const now=performance.now();if(lastGroup.n===n&&now-lastGroup.t<400){const c=g[0];centerOn(c.x,c.y);}sel=g;lastGroup={n,t:now};}}}});
let lastGroup={n:null,t:0};
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>keys.clear());
function updateCamera(dt){if(!inGame()||overlayUp()&&state!=='lost'&&state!=='won')return;const sp=900*dt/cam.z;
 if(keys.has('w')||keys.has('arrowup'))cam.y-=sp;if(keys.has('s')||keys.has('arrowdown'))cam.y+=sp;if(keys.has('a')||keys.has('arrowleft'))cam.x-=sp;if(keys.has('d')||keys.has('arrowright'))cam.x+=sp;
 if(mouse.inside&&!mouse.ldown&&!mouse.rdown&&document.hasFocus()){const m=6;if(mouse.x<m)cam.x-=sp;if(mouse.x>W-m)cam.x+=sp;if(mouse.y<m)cam.y-=sp;if(mouse.y>H-m)cam.y+=sp;}clampCam();}

// ===== client: local game =====
function newGame(){mode='local';me=0;setupGame(Math.floor(Math.random()*1e9),[{human:true,name:'You'}],difficulty,fogOn,mapSize);startPlay();
 msg('Welcome, Sovereign of Avalon. Gather, build, and conquer the three rival kingdoms!','#ffe7a8',me);}
function startPlay(){AU.battle.reset();const st=STARTS[me];centerOn(st[0]+.5,st[1]+.5);cam.z=1;vis=visMap[me]||updateVisFor(me);mmDirty=true;state='play';showHelp=true;endShown=false;endInfo=null;placing=null;amoveMode=false;wallStart=null;sel=[];groups={};}
function previewMap(){setMapSize(mapSize);genMap(Math.floor(Math.random()*1e9));units=[];blds=[];projs=[];parts=[];decals=[];sel=[];bgrid=new Array(MAP*MAP).fill(null);vis=null;mmDirty=true;centerOn(MAP/2,MAP/2);cam.z=0.8;
 players=KINGDOMS.map((k,i)=>({id:i,name:k.name,short:k.short,color:k.color,pers:k.pers,isHuman:i===0,res:{food:0,wood:0,stone:0,gold:0},surrendered:false,stats:{trained:0,killed:0,lost:0}}));}

// ===== client: networking =====
let srvVer=null,srvVerFirst=null,srvUpd=null;   // server version (menu) / first one seen (reload after an update)
let ws=null,conn=null,netKind=null,srvCid=null,srvLobby=null,netAvailable=false,lobby=null,myCid=null,snapRecvT=0,snapT=0,SNAP_DT=1/15,cmap=new Map();
function myName(){try{return localStorage.getItem('kom_name')||'';}catch(e){return '';}}
// per-tab identity: after a dropped connection the page reconnects with it and gets its kingdom back
const myToken=(()=>{const mk=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');try{let t=sessionStorage.getItem('kom_tok');if(!t){t=mk();sessionStorage.setItem('kom_tok',t);}return t;}catch(e){return mk();}})();
// multiplayer = the Node server (host app or Docker): this page talks to it over the /ws websocket
let menuNote=null,wsFails=0;   // wsFails: websocket attempts that never opened (e.g. page from a static web server)
let menuNote2=null;   // message under the menu buttons (e.g. why Join LAN is unavailable)
// net status (F3 overlay, lag banner): ping, snapshot age/rate, server skips, client errors
const NS={rtt:0,lastMsgT:0,lastSnapT:0,snapIv:1000/15,applied:0,recv:0,coalesced:0,rxB:0,rxRate:0,rxT:performance.now(),rxN:0,snapRate:0,applyMs:0,srvSkipped:0,seq:0,err:null,errN:0,errSentT:0,lostT:0,reconnects:0};
let showNet=false,pendSnap=null,lastFrameT=performance.now(),flushTimer=0,lastApplyT=0;
function netSend(o){if(conn)conn.send(JSON.stringify(o));}
const wsConn={send:s=>{if(ws&&ws.readyState===1)ws.send(s);}};
function openServerLobby(){netKind='server';conn=wsConn;myCid=srvCid;lobby=srvLobby;state='lobby';}
function netErr(where,e){NS.errN++;NS.err=where+': '+(e&&e.message||e);console.error(e);const now=performance.now();if(now-NS.errSentT>10000){NS.errSentT=now;wsConn.send(JSON.stringify({t:'clienterr',msg:NS.err+' '+String(e&&e.stack||'').slice(0,200)}));}}
// snapshots are applied as they arrive, independent of requestAnimationFrame (which some setups run slowly or
// throttle, e.g. a window on an external display): at most one apply per 30 ms; if several arrive in between only the
// newest full state is applied and their one-shot events are merged, so a client can never fall behind its own queue
function queueSnap(m){NS.recv++;if(!flushTimer)flushTimer=setTimeout(()=>{flushTimer=0;flushSnap();},Math.max(0,30-(performance.now()-lastApplyT)));
 if(!pendSnap){pendSnap=m;return;}NS.coalesced++;const p=pendSnap;
 m.R=p.R.concat(m.R);m.D=p.D.concat(m.D);m.K=p.K.concat(m.K).slice(-20);m.M=p.M.concat(m.M).slice(-40);m.F=p.F.concat(m.F).slice(-250);
 m.S=performance.now()-p.__rt<300?p.S.concat(m.S).slice(-60):m.S;m.__rt=p.__rt;pendSnap=m;}
function flushSnap(){if(!pendSnap)return;const m=pendSnap;pendSnap=null;if(mode!=='net')return;const t=performance.now();lastApplyT=t;
 try{applySnap(m);}catch(e){netErr('snapshot',e);}NS.applyMs=NS.applyMs*.9+(performance.now()-t)*.1;NS.applied++;}
function netConnect(){if(!/^https?:$/.test(location.protocol))return;try{ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');}catch(e){ws=null;return;}
 ws.onopen=()=>{netAvailable=true;wsFails=0;ws.__open=true;NS.lastMsgT=performance.now();if(NS.lostT)NS.awaitT=NS.lastMsgT;wsConn.send(JSON.stringify({t:'hello',name:myName(),token:myToken,acks:true}));};
 ws.onmessage=ev=>{const now=performance.now();NS.lastMsgT=now;NS.rxB+=ev.data.length;let m;try{m=JSON.parse(ev.data);}catch(e){return;}
  if(m.t==='snap'){wsConn.send('{"t":"ack","n":'+(m.n|0)+'}');NS.seq=m.n|0;NS.srvSkipped=m.sk|0;if(NS.lastSnapT)NS.snapIv=NS.snapIv*.85+Math.min(1000,now-NS.lastSnapT)*.15;NS.lastSnapT=now;NS.rxN++;m.__rt=now;if(netKind==='server'&&mode==='net')queueSnap(m);return;}
  if(m.t==='pong'){NS.rtt=Math.round(now-m.c);return;}
  if(m.t==='version'){onSrvVersion(m);return;}if(m.t==='welcome')srvCid=m.cid;if(m.t==='lobby')srvLobby=m;
  if(netKind==='server'){try{handleNet(m);}catch(e){netErr(m.t,e);}}};
 ws.onclose=()=>{if(ws&&!ws.__open)wsFails++;const srv=netKind==='server';const was=srv&&mode==='net';netAvailable=false;ws=null;srvLobby=null;pendSnap=null;
  if(was){   // in a match: keep the game on screen and rejoin it (the server hands the kingdom back)
   if(!NS.lostT)NS.lostT=performance.now();NS.reconnects++;
   if(performance.now()-NS.lostT>120000){NS.lostT=0;lobby=null;netKind=null;conn=null;mode='local';state='menu';previewMap();msg('Disconnected from the LAN server.','#ff7a6a',me);setTimeout(netConnect,3000);return;}
   setTimeout(netConnect,1000);return;}
  if(srv){lobby=null;netKind=null;conn=null;}if(srv&&state==='lobby')state='menu';setTimeout(netConnect,3000);};}
// ping every 2 s (round-trip time for the overlay); a socket that delivered nothing for 12 s is half-open: reconnect
setInterval(()=>{if(!ws||ws.readyState!==1)return;const now=performance.now();
 if(NS.lostT&&NS.awaitT&&now-NS.awaitT>5000&&mode==='net'){NS.lostT=0;NS.awaitT=0;mode='local';state='lobby';previewMap();msg('Reconnected, but the game could not be rejoined (it ended, or the kingdom was taken).','#ffd27a',me);}if(now-NS.lastMsgT>12000){try{ws.close();}catch(e){}return;}wsConn.send(JSON.stringify({t:'ping',c:Math.round(now)}));
 const dt=(now-NS.rxT)/1000;if(dt>=2){NS.rxRate=NS.rxB/1024/dt;NS.snapRate=NS.rxN/dt;NS.rxB=0;NS.rxN=0;NS.rxT=now;}},2000);
// the server tells every page its version on connect (and when its update status changes). If the host app updated
// itself and restarted, the reconnecting page sees a new version: reload it unless a game is running here.
function onSrvVersion(m){srvVer=m.version;srvUpd=m;if(srvVerFirst==null){srvVerFirst=m.version;return;}if(m.version===srvVerFirst)return;
 const busy=mode==='net'||(state!=='menu'&&state!=='lobby');
 if(!busy){try{sessionStorage.setItem('kom_updated',m.version);}catch(e){}location.reload();}
 else{srvVerFirst=m.version;msg(`The game server was updated to v${m.version} — reload this page after your game.`,'#ffd27a',me);}}
function handleNet(m){
 if(m.t==='welcome'){myCid=m.cid;}
 else if(m.t==='lobby'){lobby=m;}
 else if(m.t==='init')startNetGame(m);
 else if(m.t==='tolobby'){if(mode==='net'){mode='local';state='lobby';previewMap();}}
 else if(m.t==='err'){msg(m.msg,'#ff9a8a',me);}}
function startNetGame(m){const resync=mode==='net'&&NS.lostT>0&&players[m.you]&&me===m.you;const keepCam=resync?{x:cam.x,y:cam.y,z:cam.z}:null;
 mode='net';me=m.you;difficulty=m.diff;fogOn=m.fog;setMapSize(m.size||'small');genMap(m.seed);tiles.set(m.tiles);resT.set(m.resT);resA.set(m.resA);
 units=[];blds=[];projs=[];parts=[];decals=[];msgs=[];pings=[];visMap={};cmap=new Map();bgrid=new Array(MAP*MAP).fill(null);time=0;gameOver=false;pendSnap=null;
 players=m.players.map((q,i)=>({id:i,name:q.name,short:q.short,color:q.color,pers:q.pers,isHuman:q.isHuman,isAI:!q.isHuman,pname:q.pname,res:{food:0,wood:0,stone:0,gold:0},pop:0,popCap:10,surrendered:false,stats:{trained:0,killed:0,lost:0},keep:null}));
 if(resync){sel=[];vis=visMap[me]=updateVisFor(me);mmDirty=true;Object.assign(cam,keepCam);state=state==='paused'?'paused':(state==='won'||state==='lost')?state:'play';NS.lostT=0;msg('Reconnected to the server. Your kingdom is back under your command.','#bfe6a0',me);return;}
 NS.lostT=0;startPlay();msg(`You rule the ${players[me].name}. Conquer every rival kingdom!`,rgb(players[me].color,1.3),me);}
function applySnap(s){const now=performance.now();SNAP_DT=clamp(NS.snapIv/1000,1/30,.5);snapRecvT=now;snapT=s.tm;time=s.tm;gameOver=!!s.go;
 s.P.forEach((a,i)=>{const p=players[i];if(!p)return;p.res.food=a[0];p.res.wood=a[1];p.res.stone=a[2];p.res.gold=a[3];p.pop=a[4];p.popCap=a[5];p.surrendered=!!a[6];p.stats.trained=a[7];p.stats.killed=a[8];p.stats.lost=a[9];p.isHuman=!!a[10];p.isAI=!a[10];p.bell=!!a[11];});
 const seen=new Set();
 for(const a of s.U){const id=a[0];let u=cmap.get(id);const type=UT[a[1]];
  if(!u){u={id,kind:'unit',type,owner:a[2],x:a[3],y:a[4],nx:a[3],ny:a[4],ox:a[3],oy:a[4],hp:a[5],maxhp:UNITS[type].hp,anim:Math.random()*10,path:null,lastHit:-99,dir:1};cmap.set(id,u);units.push(u);}
  u.ox=u.x;u.oy=u.y;u.nx=a[3];u.ny=a[4];if(a[5]<u.hp)u.lastHit=time;u.hp=a[5];u.state=STN[a[6]];u.dir=a[7];const f=a[8];u.moving=!!(f&1);u.working=!!(f&2);u.amove=(f&4)?{}:null;
  u.carry=a[9];u.carryT=RTN[a[10]];u.swingT=time-a[11];u.fireT=time-a[12];u.cd=a[13];u.job=a[14]?(a[14]===4?{farm:true}:{rt:RTN[a[14]]}):null;seen.add(id);}
 for(const a of s.B){const id=a[0];let b=cmap.get(id);const type=BT[a[1]];
  if(!b){const D=BLD[type];b={id,kind:'bld',type,owner:a[2],tx:a[3],ty:a[4],w:D.w,h:D.h,x:a[3]+D.w/2,y:a[4]+D.h/2,maxhp:D.hp,hp:a[5],workers:[],lastHit:-99};cmap.set(id,b);blds.push(b);mmDirty=true;}
  if(a[5]<b.hp)b.lastHit=time;b.hp=a[5];if(b.built!==!!a[6])mmDirty=true;b.built=!!a[6];b.prog=a[7];b.queue=a[8].map(q=>UT[q]);b.trainT=a[9];b.blocked=!!a[10];b.rally=a[11]?{x:a[11][0],y:a[11][1]}:null;b.wk=a[12];b.garN=a[13]?a[13][0]:0;b.garA=a[13]?a[13][1]:0;b.garP=a[13]?a[13][2]:0;b.bc=a[14]||0;b.repT=a[15]?time:-9;seen.add(id);
  if(type==='keep')players[b.owner].keep=b;}
 units=units.filter(u=>{if(seen.has(u.id))return true;u.dead=true;cmap.delete(u.id);return false;});
 blds=blds.filter(b=>{if(seen.has(b.id))return true;b.dead=true;cmap.delete(b.id);mmDirty=true;return false;});
 bgrid.fill(null);for(const b of blds)for(let y=b.ty;y<b.ty+b.h;y++)for(let x=b.tx;x<b.tx+b.w;x++)bgrid[y*MAP+x]=b;
 projs=s.J.map(a=>({k:a[0]?'stone':'arrow',sx:a[1],sy:a[2],tx:a[3],ty:a[4],life:a[5],dur:a[6],sz:a[7]||undefined}));
 for(const i of s.R){resT[i]=0;mmDirty=true;}
 for(const a of s.F)parts.push({x:a[0],y:a[1],z:a[2],vx:a[3],vy:a[4],vz:a[5],life:a[6],max:Math.max(a[6],.3),c:a[7],s:a[8],smoke:!!a[9]});
 for(const a of s.D)decals.push(a[0]===0?{k:'rubble',x:a[1],y:a[2],w:a[3],h:a[4],t:a[5]}:{k:'corpse',x:a[1],y:a[2],c:a[3],t:a[4]});
 for(const a of s.K)pings.push({x:a[0],y:a[1],t:a[2],o:a[3]});
 if(!s.__rt||now-s.__rt<400)AU.events(s.S);   // stale sounds are dropped
 for(const a of s.M)msgs.push({t:a[0],c:a[1],to:a[2],rt:Date.now()});if(msgs.length>40)msgs.splice(0,msgs.length-40);
 if(sel.some(e=>e.dead))sel=sel.filter(e=>!e.dead);
 snapCount++;if(snapCount%3===0){vis=updateVisFor(me);}}
let snapCount=0;
function netFrame(dt){const now=performance.now();const a=clamp((now-snapRecvT)/(SNAP_DT*1000),0,1);time=snapT+Math.min((now-snapRecvT)/1000,.25);
 for(const u of units){u.x=u.ox+(u.nx-u.ox)*a;u.y=u.oy+(u.ny-u.oy)*a;u.anim+=Math.min(dt,.1);}
 for(const p of projs)p.life=Math.min(p.dur,p.life+dt);
 // effects age by real time (dt is not capped here): with capped ageing, slow frames let particles pile up faster than they expire
 for(const q of parts){q.life-=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.z+=q.vz*dt;q.vz-=80*dt;if(q.z<0){q.z=0;q.vx*=.5;q.vy*=.5;}}parts=parts.filter(q=>q.life>0);if(parts.length>800)parts.splice(0,parts.length-800);
 decals=decals.filter(d=>time-d.t<(d.k==='corpse'?12:90));if(decals.length>600)decals.splice(0,decals.length-600);
 visT-=dt;if(visT<=0){visT=.2;updateVisFor(me);}}
// banner while the server is silent / the connection is being re-established; F3 overlay with the numbers
function drawNetStatus(){if(mode!=='net'||!inGame())return;const now=performance.now();let t=null;
 if(NS.lostT)t=`Connection lost — reconnecting… (${((now-NS.lostT)/1000)|0}s)`;
 else if(NS.lastSnapT&&now-NS.lastSnapT>1500)t=`Connection lagging — no update from the server for ${((now-NS.lastSnapT)/1000).toFixed(1)}s`;
 if(t){ctx.font='bold 14px Georgia, serif';const w=ctx.measureText(t).width+28;ctx.fillStyle='rgba(120,30,20,.9)';ctx.fillRect(W/2-w/2,44,w,26);text(t,W/2,62,'#fff0d0','bold 14px Georgia, serif','center');}
 if(!showNet)return;const L=[`ping ${NS.rtt} ms`,`last update ${NS.lastSnapT?((now-NS.lastSnapT)|0):'-'} ms ago`,`updates ${NS.snapRate.toFixed(1)}/s (every ${NS.snapIv|0} ms)`,
  `server tick #${NS.seq}  game time ${fmtTime(snapT)}`,`skipped by server (slow link) ${NS.srvSkipped}`,`merged here (slow frames) ${NS.coalesced}`,`download ${NS.rxRate.toFixed(0)} KB/s`,
  `apply ${NS.applyMs.toFixed(1)} ms  render ${renderMs.toFixed(1)} ms  ${fpsNow|0} fps`,`reconnects ${NS.reconnects}  errors ${NS.errN}`].concat(NS.err?['last error: '+NS.err.slice(0,60)]:[]);
 const x=12,y=44,w=300;ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(x,y,w,16*L.length+26);text('Network (F3)',x+8,y+16,'#e8c870','bold 12px monospace');L.forEach((l,i)=>text(l,x+8,y+34+i*16,'#dde','12px monospace'));}
let renderMs=0,fpsNow=60;
// ===== client: menus =====
function drawMenu(){uiBtns=[];tip=null;const [x,y]=overlayPanel(600,560);
 text('THE LOWLANDS',W/2,y+58,'#ffe7a8','bold 40px Georgia, serif','center');text('A real-time strategy of keeps, walls and war',W/2,y+86,'#cdbb90','italic 16px Georgia, serif','center');
 text('You rule the Kingdom of Avalon. Three rival realms contest the land:',W/2,y+124,'#ddd','14px Georgia, serif','center');
 KINGDOMS.slice(1).forEach((q,i)=>{const yy=y+152+i*26;ctx.fillStyle=rgb(q.color);ctx.fillRect(x+150,yy-12,14,14);text(`${q.name} — ${PERS[q.pers].label}`,x+174,yy,'#eee','15px Georgia, serif');});
 text('Win when every rival has surrendered. Lose if your Keep falls.',W/2,y+246,'#cdbb90','14px Georgia, serif','center');
 text('Difficulty',W/2,y+284,'#ffe7a8','bold 14px Georgia, serif','center');
 ['easy','normal','hard'].forEach((d,i)=>bigBtn(x+90+i*145,y+296,130,DIFF[d].label,()=>{difficulty=d;},difficulty===d));
 bigBtn(x+90,y+350,150,'Fog: '+(fogOn?'ON':'OFF'),()=>{fogOn=!fogOn;},false);
 Object.keys(MAPSIZES).forEach((s,i)=>bigBtn(x+250+i*88,y+350,84,MAPSIZES[s].label,()=>{if(mapSize!==s){mapSize=s;try{localStorage.setItem('kom_map',s);}catch(e){}previewMap();}},mapSize===s));
 text('Map size: Small 96², Medium 144², Large 192² tiles',x+382,y+400,'#998','11px Georgia, serif','center');
 bigBtn(x+90,y+420,205,'▶  Solo Campaign',()=>{newGame();},true);
 const served=/^https?:$/.test(location.protocol);
 bigBtn(x+305,y+420,205,'⚔  Join LAN',()=>{if(!served){menuNote='file';return;}menuNote=null;openServerLobby();},served);
 bigBtn(x+197,y+466,205,'?  Help',()=>{showHelp=true;},false);
 if(menuNote==='file'||!served){const a=menuNote==='file';
  text(a?'Multiplayer needs the game server. This page was opened as a file.':'Multiplayer: start the host app (or the Docker server), then everyone opens',W/2,y+514,a?'#ffb08a':'#aa9','11px Georgia, serif','center');
  text(a?'Start the host app (or Docker server) and open http://<server-ip>:8080 (Synology: :8090).':'http://<server-ip>:8080 (Synology Docker: :8090) and clicks Join LAN.',W/2,y+527,a?'#ffb08a':'#aa9','11px Georgia, serif','center');}
 else if(!netAvailable&&wsFails>=2){text('No game server answers at this address (a static web folder cannot run multiplayer).',W/2,y+514,'#ffb08a','11px Georgia, serif','center');
  text('Start the host app or the Docker server and open http://<server-ip>:8080 (Synology Docker: :8090) instead.',W/2,y+527,'#ffb08a','11px Georgia, serif','center');}
 else text(netAvailable?'Connected to the game server — click Join LAN to pick a kingdom.':'Connecting to the game server…',W/2,y+516,netAvailable?'#aa9':'#ffd27a','11px Georgia, serif','center');
 {const upd=srvUpd&&srvUpd.latest&&/available|downloaded|installing|failed/.test(srvUpd.update||'');
  text('v'+APP_VERSION+(srvVer?`  ·  server v${srvVer}`:''),x+590,y+16,'#887','11px Georgia, serif','right');
  if(upd)text(srvUpd.selfUpdate?`Server update v${srvUpd.latest}: ${srvUpd.update==='failed'?'failed — see host window':'installs when no game is running'}`:`Server update v${srvUpd.latest} available — rebuild/pull the server`,W/2,y+557,'#ffd27a','10px Georgia, serif','center');
  let u=null;try{u=sessionStorage.getItem('kom_updated');}catch(e){}if(u&&u===srvVer)text('✓ updated to v'+u,x+10,y+16,'#9d9','11px Georgia, serif');}
 text('H: help   B: build menu   P/Esc: pause   M: mute   WASD/arrows/edges/right-drag: pan   Wheel: zoom',W/2,y+545,'#998','11px Georgia, serif','center');
}
function drawLobby(){uiBtns=[];tip=null;const [x,y]=overlayPanel(640,560);
 text('LAN Lobby',W/2,y+48,'#ffe7a8','bold 30px Georgia, serif','center');
 if(!lobby||!netAvailable){text(wsFails>=2?'No game server answers at this address.':'Connecting to the game server…',W/2,y+120,'#ddd','16px Georgia, serif','center');if(wsFails>=2)text('Multiplayer needs the host app or the Docker server: open http://<server-ip>:8080.',W/2,y+150,'#ffb08a','13px Georgia, serif','center');bigBtn(x+220,y+500,200,'Back',()=>{state='menu';});return;}
 const host=lobby.host===myCid;const meC=lobby.clients.find(c=>c.cid===myCid)||{};
 text(`You are "${meC.name||'?'}"${host?' (host)':''}`,x+30,y+86,'#ddd','14px Georgia, serif');
 smallBtn(x+430,y+70,180,24,'Change name',()=>{const n=(prompt('Your name:',meC.name||'')||'').trim().slice(0,16);if(n){try{localStorage.setItem('kom_name',n);}catch(e){}netSend({t:'name',name:n});}},{t:'Set your display name'});
 KINGDOMS.forEach((k,i)=>{const yy=y+110+i*58;const occ=lobby.clients.find(c=>c.slot===i);ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(x+30,yy,580,50);ctx.fillStyle=rgb(k.color);ctx.fillRect(x+40,yy+10,30,30);
  text(k.name,x+84,yy+22,'#ffe7a8','bold 15px Georgia, serif');text(occ?`Human: ${occ.name}${occ.cid===lobby.host?' (host)':''}`:`AI — ${PERS[k.pers].label}`,x+84,yy+40,occ?'#bfe6a0':'#aa9','13px Georgia, serif');
  if(!lobby.inGame){if(occ&&occ.cid===myCid)smallBtn(x+500,yy+13,96,24,'Leave slot',()=>netSend({t:'slot',slot:-1}),{t:'Become unassigned'});
   else if(!occ)smallBtn(x+500,yy+13,96,24,'Take',()=>netSend({t:'slot',slot:i}),{t:'Rule this kingdom'});}});
 const others=lobby.clients.filter(c=>c.slot<0);text('Unassigned: '+(others.map(c=>c.name).join(', ')||'none'),x+30,y+352,'#aa9','12px Georgia, serif');
 if(lobby.inGame){text('A game is in progress. Wait for the host to return everyone to the lobby.',W/2,y+400,'#ffd27a','14px Georgia, serif','center');}
 else if(host){text('Difficulty (AI):',x+30,y+390,'#ffe7a8','bold 13px Georgia, serif');['easy','normal','hard'].forEach((d,i)=>smallBtn(x+150+i*90,y+374,84,24,DIFF[d].label,()=>netSend({t:'cfg',diff:d,fog:lobby.fog,size:lobby.size}),{t:'AI difficulty'},lobby.diff===d));
  smallBtn(x+430,y+374,180,24,'Fog of war: '+(lobby.fog?'ON':'OFF'),()=>netSend({t:'cfg',diff:lobby.diff,fog:!lobby.fog,size:lobby.size}),{t:'Toggle fog of war'});
  text('Map size:',x+30,y+420,'#ffe7a8','bold 13px Georgia, serif');Object.keys(MAPSIZES).forEach((s,i)=>smallBtn(x+150+i*90,y+404,84,24,MAPSIZES[s].label,()=>netSend({t:'cfg',diff:lobby.diff,fog:lobby.fog,size:s}),{t:'Map size',d:{small:'96×96 tiles (1×)',medium:'144×144 tiles (1.5×)',large:'192×192 tiles (2×)'}[s]},(lobby.size||'small')===s));
  const canStart=lobby.clients.some(c=>c.slot>=0);bigBtn(x+170,y+438,300,canStart?'▶  Start Game':'Take a slot to start',()=>{if(canStart)netSend({t:'start'});},canStart);}
 else text(`Waiting for the host to start…  (AI: ${DIFF[lobby.diff].label}, fog ${lobby.fog?'on':'off'}, map ${(MAPSIZES[lobby.size]||MAPSIZES.small).label})`,W/2,y+400,'#cdbb90','14px Georgia, serif','center');
 text('Others join by opening this same address ('+(location.host?location.protocol+'//'+location.host:'http://<server>:8080')+') and clicking Join LAN. Empty slots are played by the AI.',W/2,y+480,'#998','12px Georgia, serif','center');
 smallBtn(x+270,y+510,100,26,'Back',()=>{state='menu';},{t:'Return to main menu'});}
function drawPause(){uiBtns=[];tip=null;const net=mode==='net';const host=net&&lobby&&lobby.host===myCid;const [x,y]=overlayPanel(360,300);
 text(net?'Game Menu':'Paused',W/2,y+44,'#ffe7a8','bold 28px Georgia, serif','center');if(net)text('(multiplayer keeps running)',W/2,y+66,'#aa9','12px Georgia, serif','center');
 bigBtn(x+60,y+80,240,'Resume',()=>{state='play';},true);bigBtn(x+60,y+128,240,'Help',()=>{state='play';showHelp=true;});
 if(!net){bigBtn(x+60,y+176,240,'Restart',()=>{newGame();});bigBtn(x+60,y+224,240,'Main Menu',()=>{state='menu';previewMap();});}
 else if(host)bigBtn(x+60,y+176,240,'End game → lobby (all)',()=>netSend({t:'tolobby'}));
 else bigBtn(x+60,y+176,240,'Surrender',()=>{if(confirm('Surrender your kingdom?'))netSend({t:'surrender'});});
 AU.panel(W/2-130,Math.min(H-134,y+310));}
function drawEnd(){uiBtns=[];tip=null;const won=state==='won';const [x,y]=overlayPanel(500,330);
 text(won?'VICTORY':'DEFEAT',W/2,y+60,won?'#ffe070':'#ff7a6a','bold 44px Georgia, serif','center');
 text(won?`All rival kingdoms have bowed before ${players[me].short}!`:`Your kingdom has fallen. ${players[me].short} is no more.`,W/2,y+96,'#ddd','15px Georgia, serif','center');
 const e=endInfo||{time,trained:0,killed:0,lost:0};[`Time: ${fmtTime(e.time)}`,`Units trained: ${e.trained}`,`Enemies slain: ${e.killed}`,`Units lost: ${e.lost}`].forEach((l,i)=>text(l,W/2,y+132+i*22,'#cdbb90','14px Georgia, serif','center'));
 const bw=140;bigBtn(x+20,y+260,bw,won?'Keep playing':'Watch',()=>{endShown=true;},false);
 if(mode==='local'){bigBtn(x+180,y+260,bw,'Play Again',()=>{newGame();},true);bigBtn(x+340,y+260,bw,'Main Menu',()=>{state='menu';previewMap();});}
 else if(lobby&&lobby.host===myCid)bigBtn(x+180,y+260,300,'Return all to lobby',()=>netSend({t:'tolobby'}),true);
 else text('The host can return everyone to the lobby.',x+330,y+284,'#aa9','12px Georgia, serif','center');}

// ===== main loop =====
let last=performance.now();
function checkOutcome(){if(state!=='play'&&state!=='paused')return;const P=players[me];if(!P)return;
 const won=!P.surrendered&&players.every(q=>q===P||q.surrendered);
 if(P.surrendered||won){state=won?'won':'lost';AU.battle.reset();AU.play(won?'victory':'defeat');endShown=false;placing=null;endInfo={time,trained:P.stats.trained,killed:P.stats.killed,lost:P.stats.lost};}}
function frame(now){const rdt=Math.max(0,(now-last)/1000),dt=Math.min(.1,rdt);last=now;lastFrameT=performance.now();if(rdt>0)fpsNow=fpsNow*.95+(1/rdt)*.05;
 try{
 if(mode==='local'&&(state==='play'||state==='won'||state==='lost')&&!showHelp){simAcc+=Math.min(rdt,.25);let n=0;while(simAcc>=STEP&&n<8){sim(STEP);simAcc-=STEP;n++;}if(n>=8)simAcc=0;}
 if(mode==='local'){if(sfxEv.length)AU.events(sfxEv.splice(0));}
 if(mode==='net'){flushSnap();if(inGame())netFrame(Math.min(rdt,1));}
 if(inGame()){vis=visMap[me]||vis;checkOutcome();pings=pings.filter(p=>time-p.t<20);if(endShown&&(state==='won'||state==='lost')){}}
 updateCamera(dt);
 if(state==='menu'||state==='lobby'){cam.x+=Math.sin(now/9000)*0.3;renderWorld(true);if(state==='menu'){if(showHelp)drawHelp();else drawMenu();}else drawLobby();AU.panel(16,H-144);drawTip();}
 else{const r0=performance.now();renderWorld(false);renderMs=renderMs*.9+(performance.now()-r0)*.1;drawUI();drawNetStatus();if(showHelp)drawHelp();else if(state==='paused')drawPause();else if((state==='won'||state==='lost')&&!endShown)drawEnd();}
 }catch(err){console.error(err);window.__lastError=String(err&&err.stack||err);}
 requestAnimationFrame(frame);}
previewMap();netConnect();requestAnimationFrame(frame);

