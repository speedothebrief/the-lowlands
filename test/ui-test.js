// Headless Chrome UI test: build hotkeys (B + letter), context keys, garrison/bell/repair UI, map-size menu + LAN lobby.
//   npm i --no-save puppeteer-core && CHROME=/usr/bin/google-chrome node test/ui-test.js
'use strict';
const puppeteer=require('puppeteer-core');const path=require('path');const {spawn}=require('child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const FILE='file://'+path.join(__dirname,'..','index.html');
const SHOTS=path.join(require('os').tmpdir(),'kom-shots');require('fs').mkdirSync(SHOTS,{recursive:true});

// zoomed-out rendering regression (v1.2.1): record where drawUnit actually draws a unit, frame by frame
async function trackDrawn(pg,ms,order){return pg.evaluate(async(ms,order)=>{const u=units.find(v=>v.owner===me&&v.type==='peasant'&&!v.inG);if(!u)return null;
  if(order){const k=players[me].keep;issue({t:'move',ids:[u.id],x:clamp(k.x+order[0],1,MAP-2),y:clamp(k.y+order[1],1,MAP-2)});}
  const orig=drawUnit,seen=[];window.drawUnit=function(v,icon){if(v===u&&!icon){const t=ctx.getTransform(),q=iso(v.x,v.y),d=window.devicePixelRatio||1;seen.push([(t.a*q[0]+t.c*q[1]+t.e)/d,(t.b*q[0]+t.d*q[1]+t.f)/d]);}return orig.apply(this,arguments);};
  const w0=worldToScreen(u.x,u.y);let n=0,rt=0;const t0=performance.now();const R=renderWorld;window.renderWorld=function(m){const a=performance.now();R(m);rt+=performance.now()-a;};
  await new Promise(res=>{const f=()=>{n++;if(performance.now()-t0<ms)requestAnimationFrame(f);else res();};requestAnimationFrame(f);});
  window.drawUnit=orig;window.renderWorld=R;const w1=worldToScreen(u.x,u.y);const last=seen[seen.length-1]||[NaN,NaN];
  const distinct=new Set(seen.map(p=>Math.round(p[0])+','+Math.round(p[1]))).size;
  return{z:cam.z,frames:n,drawn:seen.length,distinct,movedPx:Math.hypot(w1[0]-w0[0],w1[1]-w0[1]),lastErr:Math.hypot(last[0]-w1[0],last[1]-w1[1]),renderMs:rt/n};},ms,order);}
(async()=>{
 const br=await puppeteer.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']});
 const errs=[];const page=async tag=>{const p=await br.newPage();await p.setViewport({width:1280,height:800});p.on('pageerror',e=>errs.push(tag+': '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(tag+': '+m.text());});return p;};
 const p=await page('solo');await p.goto(FILE);await sleep(500);await p.evaluate(()=>localStorage.removeItem('kom_map'));
 // ---- menu: Solo / Join LAN / Help only (no peer-to-peer); Join LAN from file:// explains that a server URL is needed
 ok(await p.evaluate(()=>typeof p2pHost==='undefined'&&typeof RTCPeerConnection!=='undefined'&&!document.querySelector('script').textContent.includes('RTCPeerConnection')),'no peer-to-peer / WebRTC code left in the page');
 await p.mouse.click(340+305+100,120+420+19);await sleep(200);
 ok(await p.evaluate(()=>state==='menu'&&menuNote==='file'),'file://: Join LAN stays in the menu and shows that the host app / server URL is required');
 await p.screenshot({path:path.join(SHOTS,'ui-menu-file.png')});
 await p.mouse.click(340+197+100,120+466+19);await sleep(200);ok(await p.evaluate(()=>state==='menu'&&showHelp),'menu Help button opens the help');
 await p.evaluate(()=>{showHelp=false;});await sleep(300);
 // ---- menu: map size buttons (panel 600x560 centred at 1280x800 -> x0=340,y0=120; size buttons at x0+250+i*88, y0+350)
 await p.mouse.click(340+250+88+40,120+350+19);await sleep(200);
 ok(await p.evaluate(()=>mapSize==='medium'&&MAP===144&&localStorage.getItem('kom_map')==='medium'),'menu: Medium map button selects 144x144 (preview regenerated, choice persisted)');
 await p.mouse.click(340+250+176+40,120+350+19);await sleep(200);
 ok(await p.evaluate(()=>mapSize==='large'&&MAP===192),'menu: Large map button selects 192x192');
 await p.mouse.click(340+90+100,120+420+19);await sleep(400);
 const g1=await p.evaluate(()=>({st:state,MAP,mm:mmCan.width,keep:[players[me].keep.x,players[me].keep.y],camOK:Math.abs(cam.x)<=MAP*32}));
 ok(g1.st==='play'&&g1.MAP===192&&g1.mm===192&&g1.keep[1]>150,'solo game starts on the Large map; minimap + start positions scale '+JSON.stringify(g1));
 await p.evaluate(()=>{centerOn(MAP,MAP);clampCam();});const cb=await p.evaluate(()=>cam.y<=MAP*32);ok(cb,'camera bounds follow the map size');
 await p.keyboard.press('Escape');await p.evaluate(()=>{showHelp=false;state='play';});
 // ---- build hotkeys
 const press=async(k,mods=[])=>{for(const m of mods)await p.keyboard.down(m);await p.keyboard.press(k);for(const m of mods)await p.keyboard.up(m);await sleep(60);};
 const keymap=await p.evaluate(()=>{const used=Object.values(BUILD_KEYS);return{n:BUILD_MENU.every(t=>BUILD_KEYS[t]),uniq:new Set(used).size===used.length,map:BUILD_KEYS};});
 ok(keymap.n&&keymap.uniq,'every BUILD menu entry has a unique letter: '+Object.entries(keymap.map).map(([t,k])=>k+'='+t).join(' '));
 await press('b');ok(await p.evaluate(()=>buildMenuOpen),'B opens the build menu');
 await press('h');ok(await p.evaluate(()=>placing==='house'&&!buildMenuOpen&&!placeSticky),'B, H → placing a House');
 await press('Escape');ok(await p.evaluate(()=>placing===null),'Esc cancels placement');
 const all=[];for(const [t,k] of Object.entries(keymap.map)){await press('b');await press(k.toLowerCase());all.push(await p.evaluate(t=>placing===t,t));await press('Escape');}
 ok(all.every(Boolean),'B + each letter selects the right building (all 13)');
 const cam0=await p.evaluate(()=>[cam.x,cam.y]);await press('b');await press('w');await sleep(200);const cam1=await p.evaluate(()=>[cam.x,cam.y,placing]);
 ok(cam1[2]==='workshop'&&Math.abs(cam1[1]-cam0[1])<1,'B, W picks the Workshop without panning the camera');await press('Escape');
 await press('b');await press('M');const mu=await p.evaluate(()=>[placing,AU.S.muted]);ok(mu[0]==='market'&&!mu[1],'B, M picks the Market and does not toggle mute');await press('Escape');
 await press('b');await p.keyboard.down('Shift');await press('F');await p.keyboard.up('Shift');
 ok(await p.evaluate(()=>placing==='farm'&&placeSticky),'B, Shift+F → sticky placement (place several)');
 const placed=await p.evaluate(()=>{const k=players[me].keep;players[me].res.wood=5000;const spots=[];for(let r=4;r<10&&spots.length<3;r++)for(let a=0;a<24&&spots.length<3;a++){const tx=Math.round(k.x+Math.cos(a/24*6.28)*r)-1,ty=Math.round(k.y+Math.sin(a/24*6.28)*r)-1;if(!canPlace('farm',tx,ty,me,null)&&!spots.some(s=>Math.abs(s[0]-tx)<3&&Math.abs(s[1]-ty)<3))spots.push([tx,ty]);}
  for(const s of spots){const sc=worldToScreen(s[0]+1,s[1]+1);centerOn(s[0]+1,s[1]+1);}return spots;});
 for(const s of placed){await p.evaluate(s=>centerOn(s[0]+1,s[1]+1),s);await sleep(50);await p.mouse.move(640,(800-150)/2+8);await p.mouse.click(640,(800-150)/2+8);await sleep(80);}
 const fr=await p.evaluate(()=>({n:blds.filter(b=>b.type==='farm'&&b.owner===me).length,placing,builders:units.filter(u=>u.state==='build').length}));
 ok(fr.n>=2&&fr.placing==='farm','Shift-placed several Farms in a row, still placing ('+JSON.stringify(fr)+')');
 ok(fr.builders>=1,'the nearest idle peasant walks over to build');await press('Escape');
 // red ghost: invalid placement (on top of a building) is rejected with a reason; far-away placement is allowed (no territory limit)
 const why=await p.evaluate(()=>{const k=players[me].keep;return canPlace('tower',Math.floor(k.x)-1,Math.floor(k.y)-1,me,null);});ok(!!why&&/building/i.test(why),'placement over a building is rejected (ghost turns red): '+why);
 const farOK=await p.evaluate(()=>{const k=players[me].keep;const f0=fogOn;fogOn=false;let r=false;for(let d=0;d<30&&!r;d++){if(!canPlace('tower',Math.floor(k.x)+25+d,Math.floor(k.y)-25,me,null))r=true;}fogOn=f0;return r;});ok(farOK,'placement far from own buildings is allowed (no territory limit)');
 // ---- context: training keys vs build keys
 const ctxk=await p.evaluate(()=>{const k=players[me].keep;players[me].res.food=5000;players[me].res.gold=5000;players[me].res.stone=5000;
  const b=spawnBld('barracks',k.tx+5,k.ty-6,me,true);sel=[b];return b.id;});
 await press('q');const tq=await p.evaluate(id=>{const b=blds.find(x=>x.id===id);return[b.queue.slice(),placing];},ctxk);ok(tq[0][0]==='spearman'&&!tq[1],'with Barracks selected, Q trains a Spearman (no Quarry placement)');
 await press('b');await press('q');const tq2=await p.evaluate(id=>[blds.find(x=>x.id===id).queue.length,placing],ctxk);ok(tq2[0]===1&&tq2[1]==='quarry','with the build menu open, Q means Quarry (no training)');await press('Escape');
 // ---- bell, garrison, unload, repair via keys
 await p.evaluate(()=>{sel=[players[me].keep];});await press('b');
 ok(await p.evaluate(()=>players[me].bell&&!buildMenuOpen&&units.some(u=>u.owner===me&&u.state==='garrison')),'B with the Keep selected rings the Town Bell (peasants run inside)');
 await p.evaluate(()=>{for(let i=0;i<30*12;i++)sim(STEP);});const gin=await p.evaluate(()=>players[me].keep.gar.length);ok(gin>=5,`peasants garrisoned in the Keep (${gin}) and hidden from selection`);
 await p.screenshot({path:path.join(SHOTS,'ui-garrison.png')});
 await p.evaluate(()=>{sel=[];});await press('B',['Shift']);ok(await p.evaluate(()=>!players[me].bell&&players[me].keep.gar.length===0),'Shift+B (anywhere) rings the all-clear and releases them');
 await p.evaluate(()=>{const k=players[me].keep;window.__sp=[0,1,2].map(i=>spawnUnit('spearman',k.x+3+i*.5,k.y+3,me));sel=window.__sp.slice();});await press('g');
 await p.evaluate(()=>{for(let i=0;i<30*8;i++)sim(STEP);});ok(await p.evaluate(()=>window.__sp.every(u=>u.inG)),'G sends selected spearmen into the nearest garrison');
 await p.evaluate(()=>{sel=[players[me].keep];});await press('u');ok(await p.evaluate(()=>window.__sp.every(u=>!u.inG)),'U unloads the selected Keep');
 // right-click own Keep with spearmen → garrison
 await p.evaluate(()=>{const k=players[me].keep;centerOn(k.x,k.y);sel=window.__sp.slice();});await sleep(50);
 const ks=await p.evaluate(()=>{const k=players[me].keep;const s=worldToScreen(k.x,k.y);return[s[0],s[1]-30];});await p.mouse.click(ks[0],ks[1],{button:'right'});
 await p.evaluate(()=>{for(let i=0;i<30*6;i++)sim(STEP);});ok(await p.evaluate(()=>window.__sp.every(u=>u.inG)),'right-clicking your Keep with infantry garrisons them');
 // repair: damage a house, press N with it selected; right-click with peasants too
 const rep=await p.evaluate(()=>{const k=players[me].keep;applyCmd(me,{t:'unload',bid:k.id});const h=spawnBld('house',k.tx-5,k.ty+5,me,true);h.hp=h.maxhp*.4;for(const u of units)if(u.owner===me&&u.type==='peasant'){u.state='idle';u.job=null;u.path=null;}sel=[h];window.__h=h;return h.id;});
 await press('n');const rb=await p.evaluate(()=>units.filter(u=>u.bld===window.__h).length);ok(rb>=1,`N (Repair) auto-assigns ${rb} idle peasants`);
 await p.evaluate(()=>{for(let i=0;i<30*4;i++)sim(STEP);centerOn(window.__h.x,window.__h.y);});await sleep(80);
 await p.screenshot({path:path.join(SHOTS,'ui-repair.png')});
 const hp=await p.evaluate(()=>{for(let i=0;i<30*40;i++)sim(STEP);return window.__h.hp/window.__h.maxhp;});ok(hp>.99,'house repaired');
 await p.evaluate(()=>{const h=window.__h;h.hp=h.maxhp*.5;const pz=units.filter(u=>u.owner===me&&u.type==='peasant'&&!u.inG);sel=[pz[0]];centerOn(h.x,h.y);});await sleep(60);
 const hs=await p.evaluate(()=>{const s=worldToScreen(window.__h.x,window.__h.y);return[s[0],s[1]-12];});await p.mouse.click(hs[0],hs[1],{button:'right'});
 ok(await p.evaluate(()=>sel[0].state==='build'&&sel[0].bld===window.__h),'right-clicking a damaged building with a peasant orders a repair');
 // help overlay lists the keys
 // ---- zoomed OUT: units must keep moving on screen (bug: they looked frozen until zooming back in)
 {await p.evaluate(()=>{showHelp=false;state='play';fogOn=true;const k=players[me].keep;centerOn(k.x,k.y);cam.z=1;clampCam();});await sleep(300);
  const near=await trackDrawn(p,1500,null);
  await p.evaluate(()=>{cam.z=0.45;clampCam();});await sleep(300);   // minimum zoom
  const far=await trackDrawn(p,3000,[7,6]);
  ok(far&&far.drawn>=far.frames*0.9&&far.distinct>20&&far.movedPx>10&&far.lastErr<1.5,'zoomed out (0.45×): a walking unit is redrawn every frame at its current position '+JSON.stringify(far));
  ok(far&&near&&far.renderMs<Math.max(4,near.renderMs*4),`zoomed-out frames stay cheap on the Large map (render ${far&&far.renderMs.toFixed(1)} ms vs ${near&&near.renderMs.toFixed(1)} ms at 1×; was ~11× before)`);
  const fg=await p.evaluate(()=>{fogLayer();const d=fogCtx.getImageData(0,0,MAP+2,MAP+2).data;let bad=0;for(let i=0;i<MAP*MAP;i++){const x=i%MAP,y=(i/MAP)|0,a=d[((y+1)*(MAP+2)+x+1)*4+3];if(a!==(vis[i]===0?255:vis[i]===1?128:0))bad++;}return bad;});
  ok(fg===0,'fog layer matches the visibility map tile for tile');
  await p.screenshot({path:path.join(SHOTS,'ui-zoomed-out.png')});await p.evaluate(()=>{cam.z=1;clampCam();});}
 await p.evaluate(()=>{showHelp=true;});await sleep(150);await p.screenshot({path:path.join(SHOTS,'ui-help.png')});await p.evaluate(()=>{showHelp=false;});
 // ---- map-edge rendering: buildings on every map edge are fully drawn (the fog border used to hide the upper-right/left band)
 {const r=await p.evaluate(()=>{mapSize='small';fogOn=true;newGame();showHelp=false;for(const u of units)u.dead=true;const M=MAP,h=M>>1;
   const spots=[['y=0 edge (upper right)',h,0],['x=MAP-1 edge (lower right)',M-1,h],['y=MAP-1 edge (lower left)',h,M-1],['x=0 edge (upper left)',0,h],['corner 0,0',0,0],['corner MAP-1,0',M-1,0],['corner 0,MAP-1',0,M-1],['corner MAP-1,MAP-1',M-1,M-1],['y=1 row',h+4,1],['x=1 column',1,h+4]];
   const res=[];for(const [n,x,y] of spots){for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++)if(xx>=0&&yy>=0&&xx<M&&yy<M){tiles[yy*M+xx]=0;resT[yy*M+xx]=0;}
    const b=spawnBld('tower',x,y,me,true);centerOn(b.x,b.y);cam.z=1;vis=updateVisFor(me);const s=worldToScreen(b.x,b.y);const bx=Math.round(s[0]-20),by=Math.round(s[1]-84),bw=40,bh=90;
    renderWorld();const A=ctx.getImageData(bx,by,bw,bh).data;fogOn=false;renderWorld();const B=ctx.getImageData(bx,by,bw,bh).data;fogOn=true;
    let diff=0,ink=0;for(let i=0;i<A.length;i+=4){if(Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2])>30)diff++;if(Math.abs(B[i]-11)+Math.abs(B[i+1]-13)+Math.abs(B[i+2]-16)>40)ink++;}
    res.push({n,diff,ink});}
   // fog border still covers an UNEXPLORED edge, and follows the edge tile tile-for-tile
   vis.fill(0);fogLayer();const d=fogCtx.getImageData(0,0,MAP+2,MAP+2).data;let opaque=0;for(let i=0;i<MAP+2;i++)if(d[i*4+3]===255&&d[((MAP+1)*(MAP+2)+i)*4+3]===255)opaque++;
   vis=updateVisFor(me);return{res,opaque};});
  const bad=r.res.filter(x=>x.diff>0||x.ink<300);
  ok(bad.length===0,'buildings on every map edge and corner are drawn completely in a fully visible area (fog on = fog off) '+JSON.stringify(bad.length?bad:r.res.map(x=>x.n+':'+x.diff)));
  ok(r.opaque===await p.evaluate(()=>MAP+2),'the fog border still covers unexplored map edges');}
  {const sr=await p.evaluate(()=>{newGame();showHelp=false;state='paused';const labs=[];const ob=bigBtn;bigBtn=function(x,y,w,label,on){labs.push([label,on]);return ob.apply(this,arguments);};try{drawPause();}finally{bigBtn=ob;}
    const s=labs.find(l=>l[0]==='Surrender');if(!s)return {labs:labs.map(l=>l[0])};const oc=window.confirm;window.confirm=()=>true;s[1]();window.confirm=oc;checkOutcome();return {labs:labs.map(l=>l[0]),sur:players[me].surrendered,st:state};});
  ok(sr.sur&&sr.st==='lost','solo: the pause menu has a Surrender button and it ends the game as a defeat '+JSON.stringify(sr));}
 // ---- page served by a plain static web server (like a Synology web folder): multiplayer explained, no endless "connecting"
 {const http=require('http'),fs=require('fs');const st=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(fs.readFileSync(path.join(__dirname,'..','index.html')));}).listen(8134);
  const q=await page('static');q.on('console',()=>{});await q.goto('http://127.0.0.1:8134/');
  ok(await (async()=>{for(let i=0;i<60;i++){if(await q.evaluate(()=>wsFails>=2&&!netAvailable))return true;await sleep(200);}return false;})(),'static web folder: the page notices that no game server answers');
  await q.screenshot({path:path.join(SHOTS,'ui-menu-static.png')});await q.close();st.close();
  for(let i=errs.length-1;i>=0;i--)if(errs[i].startsWith('static:'))errs.splice(i,1);}   // expected websocket errors
 // ---- LAN lobby: host picks Large, both clients get the same 192x192 world
 const srv=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:{...process.env,PORT:'8133',LOWLANDS_NO_UPDATE:'1'}});await sleep(900);
 const a=await page('A'),b=await page('B');await a.goto('http://127.0.0.1:8133/');await b.goto('http://127.0.0.1:8133/');await sleep(900);
 await a.bringToFront();await sleep(100);await a.mouse.click(340+305+100,120+420+19);await sleep(300);
 ok(await a.evaluate(()=>state==='lobby'&&netKind==='server'&&lobby&&lobby.clients.length===2),'served page: Join LAN opens the server lobby');
 await a.evaluate(()=>{netSend({t:'slot',slot:0});});await b.evaluate(()=>{openServerLobby();netSend({t:'slot',slot:2});});await sleep(400);
 await a.bringToFront();await sleep(100);
 // host clicks "Large" in the lobby (panel 640x560 -> x0=320,y0=120; buttons at x0+150+i*90, y0+404)
 await a.mouse.click(320+150+180+40,120+404+12);await sleep(800);
 ok(await b.evaluate(()=>lobby&&lobby.size==='large'),'LAN lobby: host picks Large and every client sees it');
 await a.evaluate(()=>netSend({t:'start'}));await sleep(2500);
 const sa=await a.evaluate(()=>({mode,MAP,n:resT.length,keep:players[me].keep&&[players[me].keep.x,players[me].keep.y]}));const sb=await b.evaluate(()=>({mode,MAP,n:resT.length}));
 ok(sa.mode==='net'&&sa.MAP===192&&sb.MAP===192&&sa.n===192*192&&sb.n===192*192,'LAN: both clients run the 192x192 map '+JSON.stringify([sa,sb]));
 // Bob places a house via hotkeys; server-side peasant builds it
 await b.bringToFront();await b.evaluate(()=>{showHelp=false;const k=players[me].keep;centerOn(k.x,k.y);});await sleep(300);
 await b.keyboard.press('b');await b.keyboard.press('h');const tgt=await b.evaluate(()=>{const k=players[me].keep;for(let r=4;r<9;r++)for(let a=0;a<16;a++){const tx=Math.round(k.x+Math.cos(a/16*6.28)*r)-1,ty=Math.round(k.y+Math.sin(a/16*6.28)*r)-1;if(!canPlace('house',tx,ty,me,null)){const s=worldToScreen(tx+1,ty+1);return s;}}return null;});
 await b.mouse.move(tgt[0],tgt[1]);await sleep(80);await b.mouse.click(tgt[0],tgt[1]);let seen=false;
 for(let i=0;i<40&&!seen;i++){await sleep(500);seen=await a.evaluate(()=>blds.some(x=>x.type==='house'&&x.owner===2&&x.bc>0));}
 {await b.evaluate(()=>{showHelp=false;cam.z=0.45;clampCam();});await sleep(300);const nb=await trackDrawn(b,3000,[-6,7]);
  ok(nb&&nb.distinct>15&&nb.movedPx>8&&nb.lastErr<1.5,'LAN client zoomed out: units from server snapshots move on screen every frame '+JSON.stringify(nb));await b.evaluate(()=>{cam.z=1;clampCam();});}
 ok(seen,"LAN: Bob's B,H placement creates a site that his peasant builds (builder count visible in Alice's stream)");
 await b.evaluate(()=>issue({t:'bell'}));let gb=false;for(let i=0;i<30&&!gb;i++){await sleep(500);gb=await a.evaluate(()=>players[2].bell&&blds.some(x=>x.owner===2&&x.type==='keep'&&x.garN>0));}
 ok(gb,"LAN: Bob's Town Bell garrisons his peasants (server-authoritative, seen by Alice)");
 // ---- chat: Enter opens, game hotkeys are off while typing, Enter sends, the message renders for the other player, Esc closes
 {await b.bringToFront();await b.evaluate(()=>{sel=[];buildMenuOpen=false;placing=null;});await sleep(100);const mute0=await b.evaluate(()=>AU.S.muted);
  await b.keyboard.press('Enter');await sleep(100);const op=await b.evaluate(()=>chatOpen&&document.activeElement===chatEl);
  await b.keyboard.type('bhmp hello <b>lords</b>',{delay:15});await sleep(100);
  const hk=await b.evaluate(()=>({bm:buildMenuOpen,placing,muted:AU.S.muted,state,showHelp,val:chatEl.value}));
  ok(op&&!hk.bm&&!hk.placing&&hk.muted===mute0&&hk.state==='play'&&!hk.showHelp&&hk.val==='bhmp hello <b>lords</b>','chat: Enter opens the chat box; typing B/H/M/P does not trigger build menu, help, mute or pause '+JSON.stringify(hk));
  await b.keyboard.press('Enter');let got=null;for(let i=0;i<20&&!got;i++){await sleep(150);got=await a.evaluate(()=>chatLog.find(m=>!m.sys&&m.text==='bhmp hello <b>lords</b>'));}
  const da=await a.evaluate(()=>{const out=[];const o=ctx.fillText;ctx.fillText=function(t){out.push(String(t));return o.apply(this,arguments);};try{drawChat();}finally{ctx.fillText=o;}return out.join('|');});
  ok(got&&got.slot===2&&/lords/.test(da)&&await b.evaluate(()=>!chatOpen),'chat: Enter sends; Alice gets the message with sender + kingdom color and the overlay renders it as text '+JSON.stringify(got&&{name:got.name,slot:got.slot}));
  await b.keyboard.press('Enter');await b.keyboard.type('draft');await b.keyboard.press('Escape');await sleep(100);
  const cl=await b.evaluate(()=>({open:chatOpen,state,focus:document.activeElement===chatEl}));
  ok(!cl.open&&cl.state==='play'&&!cl.focus,'chat: Esc closes the chat box without pausing the game');
  const n0=await a.evaluate(()=>chatLog.length);await sleep(300);ok(await a.evaluate(n0=>chatLog.length===n0,n0),'chat: Esc does not send the draft');
  await b.keyboard.press('b');await sleep(80);ok(await b.evaluate(()=>buildMenuOpen),'hotkeys work again after closing chat');
  // one click on an own building selects only that building (it used to count as a double-click and grab every one of that type on screen)
  const cs=await a.evaluate(()=>{const e=blds.find(x=>x.owner===me&&!x.dead);const op=pickAt;pickAt=()=>e;lastClick={t:0,type:null};clickSelect(0,0,false);const one=sel.slice();clickSelect(0,0,false);const two=sel.slice();pickAt=op;sel=[];return {one:one.length,oneIs:one[0]===e,two:two.length};});
  ok(cs.one===1&&cs.oneIs&&cs.two>=1,'single click on your building selects just that building; double-click still selects the type '+JSON.stringify(cs));
  // Delete: never while typing in chat; outside chat it kills the selected own units (server-authoritative)
  await b.keyboard.press('Escape');await b.evaluate(()=>{buildMenuOpen=false;});const vid=await b.evaluate(()=>{const u=units.find(v=>v.owner===me&&v.type==='peasant'&&!v.dead&&!v.inG);sel=[u];return u.id;});
  await b.evaluate(()=>{window.__cmds=[];const o=netSend;window.__ns=o;netSend=m=>{if(m&&m.t==='cmd')__cmds.push(m.c.t);return o(m);};});
  await b.keyboard.press('Enter');await b.keyboard.type('oops');await b.keyboard.press('Backspace');await b.keyboard.press('Delete');await sleep(300);
  const dk=await b.evaluate(id=>{const r={cmds:__cmds.slice(),sel:sel.length,val:chatEl.value,open:chatOpen};netSend=window.__ns;return r;},vid);
  ok(dk.cmds.length===0&&dk.sel===1&&dk.val==='oop'&&dk.open,'Del/Backspace while typing in chat edit the text and kill nothing '+JSON.stringify(dk));
  await b.keyboard.press('Escape');await b.evaluate(id=>{sel=units.filter(u=>u.id===id&&!u.dead);},vid);await b.keyboard.press('Delete');let gone=false;
  for(let i=0;i<20&&!gone;i++){await sleep(150);gone=await a.evaluate(id=>!units.some(u=>u.id===id&&!u.dead),vid);}ok(gone,'Del kills the selected own peasant (seen in the other player\'s stream)');await b.keyboard.press('Escape');await b.evaluate(()=>{buildMenuOpen=false;});}
 // ---- net robustness (v1.2.2): a busy page applies only the newest snapshot, F3 overlay, lag banner, reconnect + resync
 await b.bringToFront();await sleep(200);
 {const before=await b.evaluate(()=>({r:NS.recv}));await b.evaluate(()=>{const t=performance.now();while(performance.now()-t<1500){}});await sleep(400);
  const after=await b.evaluate(()=>({r:NS.recv,tm:snapT}));const ta=await a.evaluate(()=>snapT);
  ok(after.r-before.r<=10&&Math.abs(ta-after.tm)<0.6,`busy page (1.5 s blocked): the server held back snapshots it couldn't take (${after.r-before.r} arrived instead of ~28) and its game time is current right after (${after.tm.toFixed(2)} vs ${ta.toFixed(2)})`);}
 {const n0=await b.evaluate(()=>{window.__raf=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;return NS.applied;});await sleep(2200);   // frames stop (throttled/occluded display)
  const r=await b.evaluate(()=>({n:NS.applied,tm:snapT}));const ta=await a.evaluate(()=>snapT);await b.evaluate(()=>{window.requestAnimationFrame=window.__raf;requestAnimationFrame(frame);});
  ok(r.n-n0>=15&&Math.abs(ta-r.tm)<0.6,`no animation frames for 2 s: updates are still applied on arrival (${r.n-n0} applied, game time ${r.tm.toFixed(2)} vs ${ta.toFixed(2)})`);}
 const drawn=async(fn)=>b.evaluate(fn=>{const out=[];const o=ctx.fillText;ctx.fillText=function(t){out.push(String(t));return o.apply(this,arguments);};try{(0,eval)(fn)();}finally{ctx.fillText=o;}return out;},fn.toString());
 await b.keyboard.press('F3');let tx=await drawn(()=>drawNetStatus());
 ok(await b.evaluate(()=>showNet)&&tx.some(t=>t.includes('Network (F3)'))&&tx.some(t=>/^ping \d+ ms/.test(t))&&tx.some(t=>t.startsWith('server tick #')),'F3 shows the network overlay (ping, last update, server tick…)');
 await b.keyboard.press('F3');
 tx=await drawn(()=>{NS.lastSnapT=performance.now()-3000;drawNetStatus();});ok(tx.some(t=>t.startsWith('Connection lagging')),'a "Connection lagging" banner appears when no update came for >1.5 s');
 await b.evaluate(()=>ws.close());await sleep(300);tx=await drawn(()=>drawNetStatus());const lostShown=tx.some(t=>t.startsWith('Connection lost'));
 let back=null;for(let i=0;i<20&&!back;i++){await sleep(500);back=await b.evaluate(()=>mode==='net'&&me===2&&NS.reconnects>=1&&!NS.lostT&&units.length>0?{rc:NS.reconnects}:null);}
 const human=await a.evaluate(()=>players[2].isHuman);
 ok(lostShown&&back&&human,'dropped connection: banner, automatic reconnect, same kingdom back under human control (resync) '+JSON.stringify(back));
 await b.screenshot({path:path.join(SHOTS,'ui-lan-large.png')});
 srv.kill();
 ok(errs.length===0,'no page errors'+(errs.length?':\n'+errs.join('\n'):''));
 await br.close();console.log(fails?fails+' FAILURES':'ALL UI TESTS PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
