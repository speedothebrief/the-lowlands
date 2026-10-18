// Headless Chrome UI test: build hotkeys (B + letter), context keys, garrison/bell/repair UI, map-size menu + LAN lobby.
//   npm i --no-save puppeteer-core && CHROME=/usr/bin/google-chrome node test/ui-test.js
'use strict';
const puppeteer=require('puppeteer-core');const path=require('path');const {spawn}=require('child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const FILE='file://'+path.join(__dirname,'..','index.html');
const SHOTS=path.join(require('os').tmpdir(),'kom-shots');require('fs').mkdirSync(SHOTS,{recursive:true});
(async()=>{
 const br=await puppeteer.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']});
 const errs=[];const page=async tag=>{const p=await br.newPage();await p.setViewport({width:1280,height:800});p.on('pageerror',e=>errs.push(tag+': '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(tag+': '+m.text());});return p;};
 const p=await page('solo');await p.goto(FILE);await sleep(500);await p.evaluate(()=>localStorage.removeItem('kom_map'));
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
 // red ghost / territory
 const why=await p.evaluate(()=>{const k=players[me].keep;const f0=fogOn;fogOn=false;let r=null;for(let d=0;d<30&&!r;d++){const w=canPlace('tower',Math.floor(k.x)+25+d,Math.floor(k.y)-25,me,null);if(w&&/territory/.test(w))r=w;}fogOn=f0;return r;});ok(!!why,'placement outside territory is rejected (ghost turns red): '+why);
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
 await p.evaluate(()=>{showHelp=true;});await sleep(150);await p.screenshot({path:path.join(SHOTS,'ui-help.png')});await p.evaluate(()=>{showHelp=false;});
 // ---- LAN lobby: host picks Large, both clients get the same 192x192 world
 const srv=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:{...process.env,PORT:'8133'}});await sleep(900);
 const a=await page('A'),b=await page('B');await a.goto('http://127.0.0.1:8133/');await b.goto('http://127.0.0.1:8133/');await sleep(900);
 await a.evaluate(()=>{state='lobby';netSend({t:'slot',slot:0});});await b.evaluate(()=>{state='lobby';netSend({t:'slot',slot:2});});await sleep(400);
 await a.bringToFront();await sleep(100);
 // host clicks "Large" in the lobby (panel 640x560 -> x0=320,y0=120; buttons at x0+150+i*90, y0+404)
 await a.mouse.click(320+150+180+40,120+404+12);await sleep(300);
 ok(await b.evaluate(()=>lobby&&lobby.size==='large'),'LAN lobby: host picks Large and every client sees it');
 await a.evaluate(()=>netSend({t:'start'}));await sleep(2500);
 const sa=await a.evaluate(()=>({mode,MAP,n:resT.length,keep:players[me].keep&&[players[me].keep.x,players[me].keep.y]}));const sb=await b.evaluate(()=>({mode,MAP,n:resT.length}));
 ok(sa.mode==='net'&&sa.MAP===192&&sb.MAP===192&&sa.n===192*192&&sb.n===192*192,'LAN: both clients run the 192x192 map '+JSON.stringify([sa,sb]));
 // Bob places a house via hotkeys; server-side peasant builds it
 await b.bringToFront();await b.evaluate(()=>{showHelp=false;const k=players[me].keep;centerOn(k.x,k.y);});await sleep(300);
 await b.keyboard.press('b');await b.keyboard.press('h');const tgt=await b.evaluate(()=>{const k=players[me].keep;for(let r=4;r<9;r++)for(let a=0;a<16;a++){const tx=Math.round(k.x+Math.cos(a/16*6.28)*r)-1,ty=Math.round(k.y+Math.sin(a/16*6.28)*r)-1;if(!canPlace('house',tx,ty,me,null)){const s=worldToScreen(tx+1,ty+1);return s;}}return null;});
 await b.mouse.move(tgt[0],tgt[1]);await sleep(80);await b.mouse.click(tgt[0],tgt[1]);let seen=false;
 for(let i=0;i<40&&!seen;i++){await sleep(500);seen=await a.evaluate(()=>blds.some(x=>x.type==='house'&&x.owner===2&&x.bc>0));}
 ok(seen,"LAN: Bob's B,H placement creates a site that his peasant builds (builder count visible in Alice's stream)");
 await b.evaluate(()=>issue({t:'bell'}));let gb=false;for(let i=0;i<30&&!gb;i++){await sleep(500);gb=await a.evaluate(()=>players[2].bell&&blds.some(x=>x.owner===2&&x.type==='keep'&&x.garN>0));}
 ok(gb,"LAN: Bob's Town Bell garrisons his peasants (server-authoritative, seen by Alice)");
 await b.screenshot({path:path.join(SHOTS,'ui-lan-large.png')});
 srv.kill();
 ok(errs.length===0,'no page errors'+(errs.length?':\n'+errs.join('\n'):''));
 await br.close();console.log(fails?fails+' FAILURES':'ALL UI TESTS PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
