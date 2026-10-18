// Headless Chrome audio test. Needs puppeteer-core + Chrome:
//   npm i --no-save puppeteer-core && CHROME=/usr/bin/google-chrome node test/audio-test.js
'use strict';
const puppeteer=require('puppeteer-core');const path=require('path');const {spawn}=require('child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const FILE='file://'+path.join(__dirname,'..','index.html');
const SHOTS=path.join(require('os').tmpdir(),'kom-shots');require('fs').mkdirSync(SHOTS,{recursive:true});
(async()=>{
 const br=await puppeteer.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--autoplay-policy=user-gesture-required']});
 const errs=[];const page=async tag=>{const p=await br.newPage();await p.setViewport({width:1280,height:800});p.on('pageerror',e=>errs.push(tag+': '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(tag+': '+m.text());});return p;};
 const p=await page('solo');await p.goto(FILE);await sleep(500);
 await p.evaluate(()=>localStorage.removeItem('kom_audio'));
 ok(await p.evaluate(()=>AU.ac===null),'no AudioContext before the first user gesture');
 // ---- unit test: BattleTimer
 const ut=await p.evaluate(()=>{const b=new BattleTimer(10);const r=[];r.push(b.active(0)===false);b.hit(100);r.push(b.active(100),b.active(109.9),!b.active(110.01));b.hit(105);r.push(b.active(114.9),!b.active(115.1));b.reset();r.push(!b.active(115.2));return r;});
 ok(ut.every(Boolean),'BattleTimer: inactive initially, active <10s after a hit, re-armed by new hits, off after 10s quiet ('+ut.join(',')+')');
 // ---- first gesture starts audio
 await p.mouse.click(640-300+90+100,400-280+410+19);await sleep(400);
 const st=await p.evaluate(()=>({ac:AU.ac&&AU.ac.state,state}));ok(st.ac==='running'&&st.state==='play','gesture (clicking Solo) creates + runs the AudioContext and starts the game ('+JSON.stringify(st)+')');
 await p.evaluate(()=>{showHelp=false;});
 // ---- every SFX kind renders without error
 const kinds=await p.evaluate(()=>{const out=[];for(const k of Object.keys(AU.FX)){AU.resetVoices();const before=AU.stats.played;const k0=players[me].keep;AU.play(k,{x:k0.x,y:k0.y,extra:1});out.push(k+':'+(AU.stats.played>before));}return out;});
 ok(kinds.every(s=>s.endsWith('true')),`all ${kinds.length} SFX kinds synthesize (${kinds.map(s=>s.split(':')[0]).join(' ')})`);
 // ---- throttling / pooling
 await sleep(700);
 const thr=await p.evaluate(()=>{const k=players[me].keep;const b=AU.stats.played;for(let i=0;i<200;i++)AU.play('hit',{x:k.x,y:k.y});return AU.stats.played-b;});
 ok(thr>=1&&thr<=6,`200 simultaneous melee hits -> only ${thr} voices (throttled)`);
 const far=await p.evaluate(()=>{const b=AU.stats.played;AU.play('boom',{x:90,y:5});return AU.stats.played-b;});
 ok(far===0,'far off-screen sound is culled by positional attenuation');
 const pan=await p.evaluate(()=>{const k=players[me].keep;const L=AU.posGain(k.x-6,k.y+6),R=AU.posGain(k.x+6,k.y-6),C=AU.posGain(k.x,k.y);return [L.pan,R.pan,C.g];});
 ok(pan[0]<-.2&&pan[1]>.2&&pan[2]>.9,`stereo pan follows camera (left ${pan[0].toFixed(2)}, right ${pan[1].toFixed(2)}, centre gain ${pan[2].toFixed(2)})`);
 // ---- under-attack music via real sim damage + fake clock
 await p.evaluate(()=>{window.__T=1000;AU.clock=()=>window.__T;AU.battle.reset();AU.tick();});
 const r1=await p.evaluate(()=>{const mine=units.find(u=>u.owner===me);const foe=units.find(u=>u.owner===1);dealDamage(foe,mine,1,'spearman',1);return sfxEv.some(e=>e[0]==='atk'&&e[3]===me);});
 await sleep(150);const b1=await p.evaluate(()=>{AU.tick();return AU.inBattle;});
 ok(r1&&b1,'enemy damaging my unit emits an attack event and switches battle layers on');
 const b2=await p.evaluate(()=>{__T+=9.5;AU.tick();return AU.inBattle;});ok(b2,'battle layers still on 9.5 s later');
 const b3=await p.evaluate(()=>{__T+=0.7;AU.tick();return AU.inBattle;});ok(!b3,'battle layers fade out after 10 s without attacks');
 const b4=await p.evaluate(()=>{const theirs=units.find(u=>u.owner===2);const mine=units.find(u=>u.owner===me);for(let i=0;i<3;i++)dealDamage(mine,theirs,1,'spearman',me);return new Promise(r=>setTimeout(()=>{AU.tick();r(AU.inBattle);},150));});
 ok(!b4,'damage to another kingdom does not trigger my battle music');
 // ---- sim events during real play: run 6 game-minutes and drain
 const ev=await p.evaluate(()=>{AU.clock=()=>performance.now()/1000;const seen={};const orig=AU.events;AU.events=l=>{for(const e of l)seen[e[0]]=(seen[e[0]]||0)+1;orig(l);};
  const k=players[me].keep;applyCmd(me,{t:'gather',ids:units.filter(u=>u.owner===me).map(u=>u.id),tx:nearestRes(1,k.x,k.y,20)[0],ty:nearestRes(1,k.x,k.y,20)[1],x:k.x,y:k.y});
  applyCmd(me,{t:'train',bid:k.id,ut:'peasant'});applyCmd(me,{t:'build',type:'house',spots:[[k.tx+4,k.ty]]});applyCmd(me,{t:'build',type:'fortress',spots:[[k.tx+4,k.ty+4]]});
  for(let i=0;i<30*360;i++){sim(STEP);if(sfxEv.length)AU.events(sfxEv.splice(0));}return seen;});
 const need=['chop','drop','queued','trained','place','built','hammer','err','die','hit','bow'];
 ok(need.every(k=>ev[k]),'sim produced sound events: '+Object.entries(ev).map(([k,v])=>k+'×'+v).join(' '));
 // ---- mute + persistence
 await p.keyboard.press('m');const m1=await p.evaluate(()=>[AU.S.muted,JSON.parse(localStorage.getItem('kom_audio')).muted]);
 await p.evaluate(()=>AU.set('music',0.33));await p.reload();await sleep(400);
 const m2=await p.evaluate(()=>[AU.S.muted,AU.S.music]);ok(m1[0]&&m1[1]&&m2[0]===true&&Math.abs(m2[1]-.33)<1e-6,'M toggles mute; mute + volumes persist across reload ('+JSON.stringify(m2)+')');
 // ---- slider drag in the menu audio panel
 await p.mouse.click(10,10);await sleep(200);
 await p.mouse.move(16+70+5,800-144+40);await p.mouse.down();await p.mouse.move(16+70+150,800-144+40,{steps:4});await p.mouse.up();
 ok(await p.evaluate(()=>AU.S.master>.97),'dragging the Master slider sets volume');
 await p.keyboard.press('m');
 await p.screenshot({path:path.join(SHOTS,'audio-menu.png')});
 // ---- LAN: local player's own kingdom drives battle music
 const srv=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:{...process.env,PORT:'8131'}});await sleep(900);
 const a=await page('A'),b=await page('B');await a.goto('http://127.0.0.1:8131/');await b.goto('http://127.0.0.1:8131/');await sleep(900);
 for(const q of [a,b]){await q.bringToFront();await q.mouse.click(5,5);}
 await a.evaluate(()=>{openServerLobby();netSend({t:'slot',slot:0});});await b.evaluate(()=>{openServerLobby();netSend({t:'slot',slot:3});});await sleep(400);
 await a.evaluate(()=>netSend({t:'cfg',diff:'normal',fog:false}));await sleep(200);await a.evaluate(()=>netSend({t:'start'}));await sleep(1500);
 // Alice sends her 5 peasants against Bob's keep (Stonehold, top corner); the keep shoots back
 for(let i=0;i<20&&!(await a.evaluate(()=>mode==='net'&&players[3]&&!!players[3].keep));i++)await sleep(250);
 console.log('  (LAN state)',await a.evaluate(()=>JSON.stringify({mode,state,MAP,np:players.length,lobby:lobby&&{size:lobby.size,inGame:lobby.inGame}})));
 await a.evaluate(()=>{showHelp=false;const k=players[3].keep;issue({t:'attack',ids:units.filter(u=>u.owner===me).map(u=>u.id),tid:k.id,x:k.x,y:k.y});});
 let bOn=false,aOn=false;for(let i=0;i<90&&!(bOn&&aOn);i++){await sleep(1000);bOn=bOn||await b.evaluate(()=>{AU.tick();return AU.inBattle;});aOn=aOn||await a.evaluate(()=>{AU.tick();return AU.inBattle;});}
 ok(bOn,"LAN: Bob's battle music starts when Alice's troops attack his keep (it shoots back)");
 ok(aOn,"LAN: Alice's battle music starts when Bob's keep shoots her units");
 ok(await a.evaluate(()=>mode==='net'&&AU.stats.played>0),'LAN client plays SFX from snapshot events');
 await b.screenshot({path:path.join(SHOTS,'audio-lan.png')});
 srv.kill();
 ok(errs.length===0,'no page errors'+(errs.length?':\n'+errs.join('\n'):''));
 await br.close();console.log(fails?fails+' FAILURES':'ALL AUDIO TESTS PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
