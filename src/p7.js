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
let ws=null,conn=null,netKind=null,srvCid=null,srvLobby=null,netAvailable=false,lobby=null,myCid=null,snapRecvT=0,snapT=0,SNAP_DT=1/15,cmap=new Map();
function myName(){try{return localStorage.getItem('kom_name')||'';}catch(e){return '';}}
// netKind: 'server' (LAN server lobby over /ws) or 'p2p' (browser-hosted game over WebRTC); conn is the active transport
function netSend(o){if(conn)conn.send(JSON.stringify(o));}
const wsConn={send:s=>{if(ws&&ws.readyState===1)ws.send(s);}};
function openServerLobby(){p2pLeave(true);netKind='server';conn=wsConn;myCid=srvCid;lobby=srvLobby;state='lobby';}
function netConnect(){if(!/^https?:$/.test(location.protocol))return;try{ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');}catch(e){ws=null;return;}
 ws.onopen=()=>{netAvailable=true;wsConn.send(JSON.stringify({t:'hello',name:myName()}));};
 ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch(e){return;}if(m.t==='welcome')srvCid=m.cid;if(m.t==='lobby')srvLobby=m;if(netKind==='server')handleNet(m);};
 ws.onclose=()=>{const srv=netKind==='server';const was=srv&&mode==='net';netAvailable=false;ws=null;srvLobby=null;if(srv){lobby=null;netKind=null;conn=null;}if(!srv){}else if(was){mode='local';state='menu';previewMap();msg('Disconnected from the LAN server.','#ff7a6a',me);}else if(state==='lobby'){state='menu';}setTimeout(netConnect,3000);};}
function handleNet(m){
 if(m.t==='welcome'){myCid=m.cid;}
 else if(m.t==='lobby'){lobby=m;}
 else if(m.t==='init')startNetGame(m);
 else if(m.t==='snap'){if(mode==='net')applySnap(m);}
 else if(m.t==='tolobby'){if(mode==='net'){mode='local';state='lobby';previewMap();}}
 else if(m.t==='err'){msg(m.msg,'#ff9a8a',me);}}
function startNetGame(m){mode='net';me=m.you;difficulty=m.diff;fogOn=m.fog;setMapSize(m.size||'small');genMap(m.seed);tiles.set(m.tiles);resT.set(m.resT);resA.set(m.resA);
 units=[];blds=[];projs=[];parts=[];decals=[];msgs=[];pings=[];visMap={};cmap=new Map();bgrid=new Array(MAP*MAP).fill(null);time=0;gameOver=false;
 players=m.players.map((q,i)=>({id:i,name:q.name,short:q.short,color:q.color,pers:q.pers,isHuman:q.isHuman,isAI:!q.isHuman,pname:q.pname,res:{food:0,wood:0,stone:0,gold:0},pop:0,popCap:10,surrendered:false,stats:{trained:0,killed:0,lost:0},keep:null}));
 startPlay();msg(`You rule the ${players[me].name}. Conquer every rival kingdom!`,rgb(players[me].color,1.3),me);}
function applySnap(s){const now=performance.now();snapRecvT=now;snapT=s.tm;time=s.tm;gameOver=!!s.go;
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
 AU.events(s.S);
 for(const a of s.M)msgs.push({t:a[0],c:a[1],to:a[2],rt:Date.now()});if(msgs.length>40)msgs.splice(0,msgs.length-40);
 if(sel.some(e=>e.dead))sel=sel.filter(e=>!e.dead);
 snapCount++;if(snapCount%3===0){vis=updateVisFor(me);}}
let snapCount=0;
function netFrame(dt){const now=performance.now();const a=clamp((now-snapRecvT)/(SNAP_DT*1000),0,1);time=snapT+Math.min((now-snapRecvT)/1000,.25);
 for(const u of units){u.x=u.ox+(u.nx-u.ox)*a;u.y=u.oy+(u.ny-u.oy)*a;u.anim+=dt;}
 for(const p of projs)p.life=Math.min(p.dur,p.life+dt);
 for(const q of parts){q.life-=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.z+=q.vz*dt;q.vz-=80*dt;if(q.z<0){q.z=0;q.vx*=.5;q.vy*=.5;}}parts=parts.filter(q=>q.life>0);
 decals=decals.filter(d=>time-d.t<(d.k==='corpse'?12:90));
 visT-=dt;if(visT<=0){visT=.2;updateVisFor(me);}}

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
 if(netAvailable)bigBtn(x+305,y+420,205,'⚔  LAN Lobby',()=>{openServerLobby();},true);
 else{ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(x+305,y+420,205,38);text('LAN: run node server.js',x+407,y+444,'#887','13px Georgia, serif','center');}
 text('H: help   B: build menu   P/Esc: pause   M: mute   WASD/arrows/edges/right-drag: pan   Wheel: zoom',W/2,y+540,'#998','12px Georgia, serif','center');
 bigBtn(x+90,y+466,205,'⇄  Host (peer-to-peer)',()=>{p2pHost();},false);bigBtn(x+305,y+466,205,'⇄  Join (peer-to-peer)',()=>{p2pJoinStart();},false);
 text(netAvailable?'Connected to LAN server — open the lobby, or host/join a browser peer-to-peer game.':'Multiplayer: Host/Join peer-to-peer in the browser (no server), or run node server.js.',W/2,y+516,'#aa9','12px Georgia, serif','center');}
function drawLobby(){uiBtns=[];tip=null;const [x,y]=overlayPanel(640,560);const pp=netKind==='p2p';
 text(pp?'Peer-to-peer Lobby':'LAN Lobby',W/2,y+48,'#ffe7a8','bold 30px Georgia, serif','center');
 if(!lobby||(!pp&&!netAvailable)){text('Connecting…',W/2,y+120,'#ddd','16px Georgia, serif','center');bigBtn(x+220,y+500,200,'Back',()=>{p2pLeave(true);state='menu';});return;}
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
 if(pp&&p2p&&p2p.role==='host'){text(`Hosted in this browser${p2p.code?` — room code ${p2p.code}`:''}. Empty slots are played by the AI; the AI takes over anyone who disconnects.`,W/2,y+472,'#998','12px Georgia, serif','center');
  smallBtn(x+30,y+510,200,26,'➕ Invite player (link / QR)',()=>{p2pInvite();},{t:'Create an invite code for one more player'});}
 else text(pp?'Connected peer-to-peer to the host. Empty slots are played by the AI.':'Others join by opening this same URL on their computer. Empty slots are played by the AI.',W/2,y+480,'#998','12px Georgia, serif','center');
 smallBtn(x+270,y+510,100,26,'Back',()=>{if(pp)p2pLeave(true);state='menu';},{t:pp&&p2p&&p2p.role==='host'?'Close the room':'Return to main menu'});}
function drawPause(){uiBtns=[];tip=null;const net=mode==='net';const host=net&&lobby&&lobby.host===myCid;const [x,y]=overlayPanel(360,300);
 text(net?'Game Menu':'Paused',W/2,y+44,'#ffe7a8','bold 28px Georgia, serif','center');if(net)text('(multiplayer keeps running)',W/2,y+66,'#aa9','12px Georgia, serif','center');
 bigBtn(x+60,y+80,240,'Resume',()=>{state='play';},true);bigBtn(x+60,y+128,240,'Help',()=>{state='play';showHelp=true;});
 if(!net){bigBtn(x+60,y+176,240,'Restart',()=>{newGame();});bigBtn(x+60,y+224,240,'Main Menu',()=>{state='menu';previewMap();});}
 else if(host)bigBtn(x+60,y+176,240,'End game → lobby (all)',()=>netSend({t:'tolobby'}));
 else bigBtn(x+60,y+176,240,'Surrender',()=>{if(confirm('Surrender your kingdom?'))netSend({t:'surrender'});});
 if(net&&netKind==='p2p')bigBtn(x+60,y+224,240,host?'Close room (ends game)':'Leave game',()=>{p2pLeave(true);mode='local';state='menu';previewMap();});
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
function frame(now){const dt=Math.min(.1,(now-last)/1000);last=now;
 try{
 if(mode==='local'&&(state==='play'||state==='won'||state==='lost')&&!showHelp){simAcc+=dt;let n=0;while(simAcc>=STEP&&n<5){sim(STEP);simAcc-=STEP;n++;}if(n>=5)simAcc=0;}
 if(mode==='local'){if(sfxEv.length)AU.events(sfxEv.splice(0));}
 if(mode==='net'&&inGame())netFrame(dt);
 if(inGame()){vis=visMap[me]||vis;checkOutcome();pings=pings.filter(p=>time-p.t<20);if(endShown&&(state==='won'||state==='lost')){}}
 updateCamera(dt);
 if(state==='menu'||state==='lobby'){cam.x+=Math.sin(now/9000)*0.3;renderWorld(true);if(state==='menu')drawMenu();else drawLobby();AU.panel(16,H-144);drawTip();}
 else{renderWorld(false);drawUI();if(showHelp)drawHelp();else if(state==='paused')drawPause();else if((state==='won'||state==='lost')&&!endShown)drawEnd();}
 }catch(err){console.error(err);window.__lastError=String(err&&err.stack||err);}
 requestAnimationFrame(frame);}
previewMap();netConnect();p2pBoot();requestAnimationFrame(frame);

