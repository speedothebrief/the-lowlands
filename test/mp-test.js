// Two simulated LAN clients: lobby -> start -> commands -> sync check -> disconnect -> AI takeover.
'use strict';
const {spawn}=require('child_process');const path=require('path');const WebSocket=require('ws');
const PORT=8123;let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const srv=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:{...process.env,PORT,LOWLANDS_NO_UPDATE:'1'}});
let srvOut='';srv.stdout.on('data',d=>srvOut+=d);srv.stderr.on('data',d=>{srvOut+=d;process.stderr.write(d);});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function client(name){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/ws`);const c={ws,name,snaps:[],lobby:null,init:null,msgs:[],send:o=>ws.send(JSON.stringify(o))};
 ws.on('message',d=>{const m=JSON.parse(d);if(m.t==='welcome')c.cid=m.cid;if(m.t==='lobby')c.lobby=m;if(m.t==='init')c.init=m;if(m.t==='snap'){c.snaps.push(m);if(c.snaps.length>400)c.snaps.shift();c.msgs.push(...m.M);}});
 ws.on('open',()=>{c.send({t:'hello',name});res(c);});});}
(async()=>{
 for(let i=0;i<50&&!srvOut.includes('LAN server running');i++)await sleep(100);
 ok(srvOut.includes('http://localhost:'+PORT),'server prints URLs:\n'+srvOut.trim().split('\n').map(l=>'      '+l).join('\n'));
 const http=await fetch(`http://127.0.0.1:${PORT}/`);const body=await http.text();ok(http.status===200&&body.includes('/*SIM-BEGIN*/'),'server serves index.html');
 const A=await client('Alice'),B=await client('Bob');await sleep(300);
 ok(A.lobby&&A.lobby.host===A.cid,'first client is host');
 A.send({t:'slot',slot:0});B.send({t:'slot',slot:2});B.send({t:'slot',slot:0});await sleep(300);
 const sl=A.lobby.clients.map(c=>c.name+':'+c.slot).join(',');ok(sl.includes('Alice:0')&&sl.includes('Bob:2'),'slots claimed, no double-claim ('+sl+')');
 B.send({t:'start'});await sleep(300);ok(!A.init,'non-host cannot start');
 A.send({t:'cfg',diff:'hard',fog:true});A.send({t:'start'});await sleep(1500);
 ok(A.init&&B.init&&A.init.you===0&&B.init.you===2,'both received init with correct kingdoms');
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
 ok(A.msgs.some(m=>/now ruled by the AI/.test(m[0])),'Bob leaving hands Eldmark to the AI (message: '+(A.msgs.find(m=>/AI/.test(m[0]))||[''])[0]+')');
 ok(last(A).P[2][10]===0,'Eldmark flagged as AI in Alice\'s stream');
 const tA=last(A).tm;await sleep(1000);ok(last(A).tm>tA,'game keeps running for Alice');
 // Alice (host) returns to lobby
 let gotLobby=false;A.ws.on('message',d=>{if(JSON.parse(d).t==='tolobby')gotLobby=true;});A.send({t:'tolobby'});await sleep(500);ok(gotLobby&&!A.lobby.inGame,'host can return to lobby');
 const kb=Math.round(JSON.stringify(last(A)).length/1024);console.log(`(snapshot size ~${kb} KB at 15 Hz)`);
 A.ws.close();srv.kill();console.log(fails?`${fails} FAILURES`:'ALL MULTIPLAYER TESTS PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error(e);srv.kill();process.exit(1);});
