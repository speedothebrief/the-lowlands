// Two simulated LAN clients: lobby -> start -> commands -> sync check -> disconnect -> AI takeover.
'use strict';
const createRoomT=require('../room.js');
const {spawn}=require('child_process');const path=require('path');const WebSocket=require('ws');
const PORT=8123;let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const srv=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:{...process.env,PORT,LOWLANDS_NO_UPDATE:'1'}});
let srvOut='';srv.stdout.on('data',d=>srvOut+=d);srv.stderr.on('data',d=>{srvOut+=d;process.stderr.write(d);});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function client(name){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/ws`);const c={ws,name,snaps:[],lobby:null,init:null,msgs:[],chats:[],hist:null,send:o=>ws.send(JSON.stringify(o))};
 ws.on('message',d=>{const m=JSON.parse(d);if(m.t==='welcome')c.cid=m.cid;if(m.t==='lobby')c.lobby=m;if(m.t==='init')c.init=m;if(m.t==='chat')c.chats.push(m);if(m.t==='chathist')c.hist=m.items;if(m.t==='snap'){c.snaps.push(m);if(c.snaps.length>400)c.snaps.shift();c.msgs.push(...m.M);}});
 ws.on('open',()=>{c.send({t:'hello',name});res(c);});});}
(async()=>{
 for(let i=0;i<50&&!srvOut.includes('LAN server running');i++)await sleep(100);
 ok(srvOut.includes('http://localhost:'+PORT),'server prints URLs:\n'+srvOut.trim().split('\n').map(l=>'      '+l).join('\n'));
 const http=await fetch(`http://127.0.0.1:${PORT}/`);const body=await http.text();ok(http.status===200&&body.includes('/*SIM-BEGIN*/'),'server serves index.html');
 const A=await client('Alice'),B=await client('Bob');await sleep(300);
 ok(A.lobby&&A.lobby.host===A.cid,'first client is host');
 A.send({t:'slot',slot:0});B.send({t:'slot',slot:2});B.send({t:'slot',slot:0});await sleep(300);
 const sl=A.lobby.clients.map(c=>c.name+':'+c.slot).join(',');ok(sl.includes('Alice:0')&&sl.includes('Bob:2'),'slots claimed, no double-claim ('+sl+')');
 // ---- chat (v1.3.0)
 const said=(c,from)=>c.chats.filter(m=>!m.sys&&m.name===from);
 A.send({t:'chat',text:'  hello\u0000 <b>world</b>\u202E\n  '});await sleep(200);
 const h1=said(B,'Alice')[0];ok(h1&&h1.text==='hello <b>world</b>'&&h1.slot===0&&said(A,'Alice').length===1,'chat: relayed to everyone in the room with name + kingdom slot; control/bidi characters stripped, HTML kept as plain text '+JSON.stringify(h1&&h1.text));
 A.send({t:'chat',text:'x'.repeat(500)});A.send({t:'chat',text:{evil:1}});A.send({t:'chat',text:'   '});await sleep(200);
 ok(said(B,'Alice').length===2&&said(B,'Alice')[1].text.length===200,'chat: long messages cut to 200 characters; non-string / blank messages dropped');
 await sleep(5100);const n0=said(B,'Alice').length;for(let i=0;i<8;i++)A.send({t:'chat',text:'spam '+i});await sleep(300);
 ok(said(B,'Alice').length-n0===5&&A.chats.some(m=>m.sys&&/too fast/.test(m.text))&&!B.chats.some(m=>/too fast/.test(m.text)),`chat: rate limit 5 per 5 s per client (${said(B,'Alice').length-n0} of 8 relayed; only the sender is warned)`);
 const D=await client('Dave');await sleep(300);
 ok(D.hist&&D.hist.some(m=>m.text==='hello <b>world</b>')&&D.hist.some(m=>m.sys&&/Bob joined/.test(m.text))&&D.hist.length<=50,`chat: a new joiner gets the recent history (${D.hist&&D.hist.length} messages incl. system notices)`);
 ok(A.chats.some(m=>m.sys&&/Dave joined/.test(m.text)),'chat: system message when a player joins');
 {const createRoom=createRoomT;const stub={STEP:1/30,KINGDOMS:[]};const r1=createRoom(stub),r2=createRoom(stub);const got1=[],got2=[];
  const x=r1.join(s=>got1.push(JSON.parse(s))),y=r2.join(s=>got2.push(JSON.parse(s)));x.msg({t:'hello',name:'Xena'});y.msg({t:'hello',name:'Yuri'});x.msg({t:'chat',text:'room one only'});
  ok(got1.some(m=>m.t==='chat'&&m.text==='room one only')&&!got2.some(m=>m.t==='chat'&&/room one/.test(m.text)),'chat: messages stay inside their room');r1.close();r2.close();}
 {// market / demolish / gates through a real room (server-authoritative command validation), in-process
  const vm=require('vm'),fs=require('fs'),path=require('path');const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const sb=vm.createContext({console});vm.runInContext(html.slice(html.indexOf('/*SIM-BEGIN*/'),html.indexOf('/*SIM-END*/'))+';globalThis.API={setupGame,sim,applyCmd,makeSnap,mapData,playersMeta,makeAI,makeHuman,surrender,STEP,KINGDOMS,spawnBld,canPlace,get:()=>({players,time,gameOver,seed,blds,units})};',sb);
  const API=sb.API,r=createRoomT(API);const x=r.join(()=>{}),y=r.join(()=>{});x.msg({t:'hello',name:'Xena'});y.msg({t:'hello',name:'Yuri'});
  x.msg({t:'slot',slot:0});y.msg({t:'slot',slot:1});x.msg({t:'cfg',fog:false});x.msg({t:'start'});await sleep(100);
  const g=API.get(),P0=g.players[0],K=P0.keep;ok(r.inGame&&P0.isHuman&&g.players[1].isHuman,'in-process room game started with 2 humans');
  let spot=null;for(let d=5;d<20&&!spot;d++)for(const [dx,dy] of [[d,0],[-d,0],[0,d],[0,-d]])if(!spot&&!API.canPlace('market',K.tx+dx,K.ty+dy,0,null))spot=[K.tx+dx,K.ty+dy];
  const M=API.spawnBld('market',spot[0],spot[1],0,true);P0.res.wood=1000;P0.res.gold=0;
  y.msg({t:'cmd',c:{t:'trade',bid:M.id,res:'wood',dir:'sell',amt:1000}});y.msg({t:'cmd',c:{t:'demolish',bids:[M.id]}});await sleep(150);
  ok(P0.res.wood===1000&&g.players[1].res.gold<1000&&!M.dead,'server rejects trading at / demolishing another player\'s Market');
  x.msg({t:'cmd',c:{t:'trade',bid:M.id,res:'wood',dir:'sell',amt:1000}});await sleep(150);ok(P0.res.wood===0&&P0.res.gold>=250&&P0.res.gold<252,`server applies the owner's trade: sold 1000 wood for ${Math.floor(P0.res.gold)} gold (+ market income)`);const st0=P0.res.stone;
  x.msg({t:'cmd',c:{t:'trade',bid:M.id,res:'stone',dir:'buy',amt:100}});await sleep(150);ok(P0.res.gold>=250&&P0.res.stone===st0,'server refuses a buy the player cannot afford');
  x.msg({t:'cmd',c:{t:'demolish',bids:[K.id]}});x.msg({t:'cmd',c:{t:'demolish',bids:[M.id]}});await sleep(150);ok(!K.dead&&M.dead&&!P0.surrendered,'server: owner demolishes the Market; the Keep is protected');
  {const U=API.get().units,p0=U.find(u=>u.owner===0&&u.type==='peasant'&&!u.dead),p1=U.find(u=>u.owner===1&&u.type==='peasant'&&!u.dead);
   y.msg({t:'cmd',c:{t:'kill',ids:[p0.id]}});x.msg({t:'cmd',c:{t:'kill',ids:[p0.id,p1.id]}});await sleep(150);
   ok(p0.dead&&!p1.dead,'server: kill only works on your own units (other player\'s request ignored)');}
  r.close();}
 B.send({t:'start'});await sleep(300);ok(!A.init,'non-host cannot start');
 A.send({t:'cfg',diff:'hard',fog:true});A.send({t:'start'});await sleep(1500);
 ok(A.init&&B.init&&A.init.you===0&&B.init.you===2,'both received init with correct kingdoms');
 B.send({t:'chat',text:'gl hf'});await sleep(300);
 ok(D.chats.some(m=>m.sys&&/game has started/.test(m.text))&&said(D,'Bob').some(m=>m.text==='gl hf'&&m.slot===2),'chat during a match reaches unassigned spectators too (and the "game started" notice)');
 ok(A.init&&B.init&&A.init.seed===B.init.seed&&A.init.tiles.join()===B.init.tiles.join()&&A.init.resT.join()===B.init.resT.join(),'identical map data on both clients');
 ok(A.init.players.map(p=>p.isHuman).join()==='true,false,true,false','slots 1 and 3 are AI');
 ok(A.snaps.length>5&&B.snaps.length>5,`snapshots streaming (A ${A.snaps.length}, B ${B.snaps.length})`);
 // same tick => identical world state on both clients (server-authoritative)
 const strip=s=>JSON.stringify([s.tm,s.P,s.U,s.B,s.J]);let same=0,cmp=0;for(const sa of A.snaps){const sb=B.snaps.find(x=>x.tm===sa.tm);if(sb){cmp++;if(strip(sa)===strip(sb))same++;}}
 ok(cmp>3&&same===cmp,`world state identical for same tick on both clients (${same}/${cmp})`);
 // commands
 const last=c=>c.snaps[c.snaps.length-1];
 const aPeas=last(A).U.filter(u=>u[2]===0&&u[1]===0);const bKeep=last(B).B.find(b=>b[2]===2&&b[1]===0);
 const tx=aPeas[0][3]+4,ty=aPeas[0][4]-4;
 A.send({t:'cmd',c:{t:'move',ids:aPeas.map(u=>u[0]),x:tx,y:ty,am:false}});
 B.send({t:'cmd',c:{t:'train',bid:bKeep[0],ut:'peasant'}});B.send({t:'cmd',c:{t:'train',bid:bKeep[0],ut:'peasant'}});
 A.send({t:'cmd',c:{t:'move',ids:last(B).U.filter(u=>u[2]===2).map(u=>u[0]),x:10,y:10}}); // try to move Bob's units (must be rejected)
 const bBefore=last(B).U.filter(u=>u[2]===2).map(u=>u[3]+','+u[4]).join('|');
 await sleep(400);const q=last(B).B.find(b=>b[0]===bKeep[0]);ok(q[8].length===2,'Bob: training queue at keep = 2 (visible to Bob)');
 const qa=last(A).B.find(b=>b[0]===bKeep[0]);ok(qa&&qa[8].length===2,'…and the same queue is in Alice\'s stream');
 const foodB=last(B).P[2][0];ok(foodB===300-100,'Bob paid 100 food (food now '+foodB+')');
 await sleep(3500);
 const near=last(B).U.filter(u=>aPeas.some(p=>p[0]===u[0])).filter(u=>Math.hypot(u[3]-tx,u[4]-ty)<2).length;
 ok(near>=4,`Alice's peasants arrived at the move target, seen in Bob's stream (${near}/5)`);
 const bAfter=last(B).U.filter(u=>u[2]===2&&bBefore.includes(String(u[0]))||u[2]===2).length;
 const bMovedToTen=last(B).U.filter(u=>u[2]===2&&Math.hypot(u[3]-10,u[4]-10)<5).length;ok(bMovedToTen===0,'Alice cannot command Bob\'s units');void bAfter;
 await sleep(17000);const bp=last(B).U.filter(u=>u[2]===2&&u[1]===0).length;ok(bp>=6,`Bob's trained peasants appeared (${bp} peasants)`);
 // Bob disconnects -> his kingdom becomes AI
 B.ws.close();await sleep(1500);
 ok(A.chats.some(m=>m.sys&&/Bob disconnected/.test(m.text)),'chat: system message when a player disconnects mid-game');
 ok(A.msgs.some(m=>/now ruled by the AI/.test(m[0])),'Bob leaving hands Eldmark to the AI (message: '+(A.msgs.find(m=>/AI/.test(m[0]))||[''])[0]+')');
 ok(last(A).P[2][10]===0,'Eldmark flagged as AI in Alice\'s stream');
 const tA=last(A).tm;await sleep(1000);ok(last(A).tm>tA,'game keeps running for Alice');
 // Alice (host) returns to lobby
 let gotLobby=false;A.ws.on('message',d=>{if(JSON.parse(d).t==='tolobby')gotLobby=true;});A.send({t:'tolobby'});await sleep(500);ok(gotLobby&&!A.lobby.inGame,'host can return to lobby');
 const kb=Math.round(JSON.stringify(last(A)).length/1024);console.log(`(snapshot size ~${kb} KB at 15 Hz)`);
 A.ws.close();D.ws.close();srv.kill();console.log(fails?`${fails} FAILURES`:'ALL MULTIPLAYER TESTS PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error(e);srv.kill();process.exit(1);});
