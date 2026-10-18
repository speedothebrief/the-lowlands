// Rules test of the shared simulation (headless, no browser): gather claim slots, Keep/Fortress fire rate,
// peasant construction/repair, territory, garrisons + Town Bell, AI garrisoning, map sizes, doubled resource nodes.
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('/*SIM-BEGIN*/'),html.indexOf('/*SIM-END*/'));
const c=vm.createContext({console});
vm.runInContext(src+';globalThis.API={setupGame,sim,applyCmd,nearestRes,spawnUnit,spawnBld,killEnt,makeSnap,canPlace,repairCost,BLD,UNITS,STEP,RES_AMT,get:()=>({units,blds,players,claim,resT,resA,projs,MAP,STARTS,time})};',c);
const A=c.API;let fails=0;const ok=(v,m)=>{console.log((v?'PASS ':'FAIL ')+m);if(!v)fails++;};
const run=sec=>{for(let s=0;s<Math.round(sec*30);s++)A.sim(A.STEP);};
const my=(pid,ty)=>A.get().units.filter(u=>u.owner===pid&&(!ty||u.type===ty));

console.log('--- gather claim slots');
A.setupGame(4242,[{human:true}],'normal',true);
let g=A.get();const k=g.players[0].keep;const tree=A.nearestRes(1,k.x,k.y,20);
const peas=my(0,'peasant');
A.applyCmd(0,{t:'gather',ids:peas.map(u=>u.id),tx:tree[0],ty:tree[1],x:tree[0],y:tree[1]});
const tiles=peas.map(u=>u.job&&u.job.ty*g.MAP+u.job.tx);
ok(new Set(tiles).size===5&&tiles.includes(tree[1]*g.MAP+tree[0]),'5 peasants sent to one tree -> 1 takes it, 4 reassigned to distinct nearby trees');
ok(tiles.every((t,i)=>g.claim[t]===peas[i].id),'each peasant holds the claim on its node');
let maxShare=0;
for(let s=0;s<30*180;s++){A.sim(A.STEP);if(s%15===0){const m={};for(const u of A.get().units)if(u.state==='gather'&&u.job&&u.job.rt){const t=u.job.ty*A.get().MAP+u.job.tx;m[t]=(m[t]||0)+1;}for(const v of Object.values(m))maxShare=Math.max(maxShare,v);}}
ok(maxShare===1,'over 3 game-minutes (all 4 kingdoms), no two gatherers ever share a tree/rock/gold node');
g=A.get();ok(g.players[0].res.wood>400,'player peasants gathered wood with claims ('+Math.floor(g.players[0].res.wood)+')');
{const u0=g.units.find(u=>u.owner===0&&u.job&&u.job.rt);const t0=u0.job.ty*g.MAP+u0.job.tx;A.killEnt(u0,1);ok(g.claim[t0]===0,'claim released when the gatherer dies');}
{const u1=g.units.find(u=>u.owner===0&&u.job&&u.job.rt);const t1=u1.job.ty*g.MAP+u1.job.tx;A.applyCmd(0,{t:'move',ids:[u1.id],x:k.x,y:k.y+3});ok(g.claim[t1]===0,'claim released when the gatherer is reassigned');}

console.log('--- doubled resource nodes');
{let mx={1:0,2:0,3:0};for(let i=0;i<g.resT.length;i++){const t=g.resT[i];if(t)mx[t]=Math.max(mx[t],g.resA[i]);}
 A.setupGame(99,[{human:true}],'normal',false);g=A.get();mx={1:0,2:0,3:0};for(let i=0;i<g.resT.length;i++){const t=g.resT[i];if(t)mx[t]=Math.max(mx[t],g.resA[i]);}
 ok(mx[1]===160&&mx[2]===720&&mx[3]===640,`fresh nodes hold 2x: tree ${mx[1]} (was 80), rock ${mx[2]} (was 360), gold ${mx[3]} (was 320)`);}

console.log('--- Keep / Fortress fire rate');
A.setupGame(777,[{human:true}],'normal',false);g=A.get();const kp=g.players[0].keep;
const countArrows=(sec)=>{let n=0;const seen=new Set();for(let s=0;s<30*sec;s++){A.sim(A.STEP);for(const p of A.get().projs)if(p.k==='arrow'&&!seen.has(p)){seen.add(p);n++;}}return n;};
{const foe=A.spawnUnit('knight',kp.x+3,kp.y+3,1);foe.hp=foe.maxhp=1e9;foe.state='hold';
 const a=countArrows(10);ok(a>=24&&a<=27,`Keep fires ~2.5 arrows/s at a single target (${a} in 10 s; old rate was 0.625/s)`);
 const fx=A.spawnBld('fortress',kp.tx+6,kp.ty-1,0,true);kp.cd=1e9;const f=countArrows(10);ok(f>=48&&f<=53,`Fortress fires ~5 arrows/s, double the Keep (${f} in 10 s)`);
 // garrisoned archers add arrows
 const ar=[0,1,2,3].map(i=>A.spawnUnit('archer',fx.x+(i%2),fx.y+2.6,0));A.applyCmd(0,{t:'garrison',ids:ar.map(u=>u.id),bid:fx.id});run(6);
 ok(fx.gar.length===4,`4 archers garrisoned in the Fortress (${fx.gar.length}/30)`);const f2=countArrows(10);ok(f2>=f+40,`garrisoned archers add one arrow each per volley (${f2} vs ${f} in 10 s)`);
 foe.dead=true;run(.1);}

console.log('--- construction by peasants');
A.setupGame(31337,[{human:true}],'normal',false);g=A.get();{const K=g.players[0].keep;const P=g.players[0];P.res.wood=5000;P.res.stone=5000;P.res.gold=5000;
 const pz=my(0,'peasant');A.applyCmd(0,{t:'stop',ids:pz.map(u=>u.id)});
 let spot=null;for(let r=4;r<9&&!spot;r++)for(let a=0;a<16&&!spot;a++){const tx=Math.round(K.x+Math.cos(a/16*6.28)*r)-1,ty=Math.round(K.y+Math.sin(a/16*6.28)*r)-1;if(!A.canPlace('house',tx,ty,0,null))spot=[tx,ty];}
 const w0=P.res.wood;A.applyCmd(0,{t:'build',type:'house',spots:[spot],ids:[]});const h=A.get().blds.find(b=>b.type==='house');
 ok(h&&!h.built&&P.res.wood===w0-50,'placing a House makes a construction site and spends 50 wood up-front');
 const builder=A.get().units.find(u=>u.bld===h);ok(!!builder,'with no peasant selected the nearest idle peasant is sent to build');
 A.applyCmd(0,{t:'stop',ids:my(0,'peasant').map(u=>u.id)});const p0=h.prog;run(5);ok(h.prog===p0,'no builder present → construction paused');
 A.applyCmd(0,{t:'repair',ids:[pz[0].id],bid:h.id});run(6);const r1=h.prog;run(4);const d1=(h.prog-r1)/4;
 h.prog=.02;A.applyCmd(0,{t:'repair',ids:pz.slice(1,4).map(u=>u.id),bid:h.id});run(3.5);const r4=h.prog;run(2);const d4=(h.prog-r4)/2;
 ok(d1>0&&d4>d1*1.8&&d4<d1*4,`more builders = faster with diminishing returns (1 builder ${(d1*100).toFixed(1)}%/s, 4 builders ${(d4*100).toFixed(1)}%/s)`);
 run(15);ok(h.built,'house completes when peasants finish it');
 ok(pz.slice(0,4).every(u=>u.state!=='build'),'builders leave the finished site');
 // cancel → full refund; destroyed early → 50%
 const w1=P.res.wood;let spot2=null;for(let r=5;r<11&&!spot2;r++)for(let a=0;a<16&&!spot2;a++){const tx=Math.round(K.x+Math.cos(a/16*6.28)*r)-1,ty=Math.round(K.y+Math.sin(a/16*6.28)*r)-1;if(!A.canPlace('barracks',tx,ty,0,null))spot2=[tx,ty];}
 A.applyCmd(0,{t:'build',type:'barracks',spots:[spot2],ids:[]});const bk=A.get().blds.find(b=>b.type==='barracks');A.applyCmd(0,{t:'cancelbld',bid:bk.id});run(.1);
 ok(bk.dead&&P.res.wood===w1,'cancelling a construction site refunds the full cost');
 A.applyCmd(0,{t:'build',type:'barracks',spots:[spot2],ids:[]});const bk2=A.get().blds.find(b=>b.type==='barracks'&&!b.dead);A.killEnt(bk2,1);ok(P.res.wood===w1-75,'a site destroyed before completion refunds 50%');
 // territory
 ok(!!A.canPlace('tower',K.tx+40,K.ty-40,0,null),'cannot place far outside your territory');
 const E=g.players[1].keep;ok(!!A.canPlace('tower',Math.floor(E.x)+3,Math.floor(E.y),0,null),'cannot place next to an enemy Keep');
 const tw=A.spawnBld('tower',Math.floor(K.x)+10,Math.floor(K.y),0,true);ok(!!A.canPlace('tower',Math.floor(K.x)+18,Math.floor(K.y),0,null),'towers do not extend territory (no tower chains)');tw.dead=true;run(.1);
 // repair: costs wood/stone proportional to damage, peasants + Repair button (repairauto)
 h.hp=h.maxhp*.5;const rc=A.repairCost(h,h.maxhp*.5);ok(Math.abs(rc.wood-12.5)<.01,`repair cost: 50% of build cost for a full repair, proportional (half HP of a House = ${rc.wood} wood)`);
 A.applyCmd(0,{t:'stop',ids:my(0,'peasant').map(u=>u.id)});const wr=P.res.wood;A.applyCmd(0,{t:'repairauto',bid:h.id});const rep=A.get().units.filter(u=>u.bld===h).length;
 ok(rep>=1&&rep<=3,`Repair (N) auto-assigns the nearest idle peasants (${rep})`);run(30);ok(h.hp>=h.maxhp-1,'house repaired to full');ok(Math.abs((wr-P.res.wood)-12.5)<1,`repair charged ~12.5 wood (${(wr-P.res.wood).toFixed(1)})`);
 const sn=A.makeSnap();ok(sn.U.length===A.get().units.length,'snapshot sane after construction');}

console.log('--- garrison & Town Bell');
A.setupGame(2024,[{human:true}],'normal',false);g=A.get();{const K=g.players[0].keep;const P=g.players[0];
 const pz=my(0,'peasant');const sp=[0,1,2].map(i=>A.spawnUnit('spearman',K.x+3+i*.4,K.y+3,0));const kn=A.spawnUnit('knight',K.x+3,K.y+4,0);
 A.applyCmd(0,{t:'gather',ids:pz.map(u=>u.id),tx:A.nearestRes(1,K.x,K.y,20)[0],ty:A.nearestRes(1,K.x,K.y,20)[1],x:0,y:0});run(20);
 A.applyCmd(0,{t:'bell'});ok(P.bell===true,'Town Bell rung');const called=A.get().units.filter(u=>u.state==='garrison');
 ok(called.some(u=>u.type==='peasant')&&!called.includes(kn),'bell calls peasants and infantry, never cavalry');run(15);
 ok(K.gar.length===8&&pz.every(u=>u.inG===K),`all 5 peasants + 3 spearmen are inside the Keep (${K.gar.length}/40)`);
 const s=A.makeSnap();ok(!s.U.some(a=>pz.some(u=>u.id===a[0])),'garrisoned units are hidden from snapshots/map');ok(s.B.find(b=>b[0]===K.id)[13][0]===8,'snapshot reports the garrison count');
 const hp=pz[0].hp;const foe=A.spawnUnit('catapult',K.x+5,K.y,1);foe.hp=1e9;for(const u of pz)c.API.get();A.get().projs.length=0;
 // direct damage to a garrisoned unit is ignored
 vm.runInContext('dealDamage(null,units.find(u=>u.inG),50,"knight",1)',c);ok(pz.every(u=>u.hp===hp||u.hp===u.maxhp),'units inside are invulnerable');foe.dead=true;run(.1);
 A.applyCmd(0,{t:'bell'});ok(P.bell===false&&K.gar.length===0,'second ring releases everyone');run(1);
 ok(pz.every(u=>u.state==='gather'||u.state==='return'),'peasants resume gathering after the all-clear');
 // tower capacity 6, eject on destruction
 const T=A.spawnBld('tower',Math.floor(K.x)+5,Math.floor(K.y)-4,0,true);const many=[...pz,...sp];A.applyCmd(0,{t:'garrison',ids:many.map(u=>u.id),bid:T.id});run(15);
 ok(T.gar.length===6,`Tower holds 6 (${T.gar.length}); the rest went to the Keep (${K.gar.length})`);
 A.killEnt(T,1);ok(T.gar.length===0&&many.every(u=>!u.inG||u.inG===K)&&many.filter(u=>!u.dead).length===8,'units are ejected alive when their tower is destroyed');
 A.applyCmd(0,{t:'unload',bid:K.id});ok(K.gar.length===0,'Unload empties the Keep');
 A.applyCmd(0,{t:'garrison',ids:[kn.id],bid:K.id});ok(kn.state!=='garrison','knights cannot garrison');}

console.log('--- AI uses the Town Bell when raided');
A.setupGame(555,[{human:true}],'normal',false);run(150);g=A.get();{const ai=g.players[1];const K=ai.keep;
 for(let i=0;i<10;i++){const u=A.spawnUnit('knight',K.x+4+(i%3),K.y+4+(i/3|0),0);u.hp=u.maxhp=5000;}run(5);
 const inside=A.get().units.filter(u=>u.owner===1&&u.inG).length;ok(ai.bell&&inside>0,`raided AI rang its bell and hid ${inside} peasants`);
 for(const u of A.get().units)if(u.owner===0&&u.type==='knight')u.dead=true;run(25);ok(!ai.bell&&A.get().units.filter(u=>u.owner===1&&u.inG).length===0,'AI releases peasants once the raiders are gone');}

console.log('--- map sizes');
for(const [sz,M] of [['small',96],['medium',144],['large',192]]){A.setupGame(77,[{human:true}],'normal',true,sz);g=A.get();
 let trees=0,gold=0;for(let i=0;i<g.resT.length;i++){if(g.resT[i]===1)trees++;if(g.resT[i]===3)gold++;}
 const ks=g.players.map(p=>p.keep);const spread=Math.hypot(ks[0].x-ks[1].x,ks[0].y-ks[1].y);
 ok(g.MAP===M&&g.resT.length===M*M,`${sz}: ${M}x${M} map, keeps ${spread.toFixed(0)} tiles apart, ${trees} trees, ${gold} gold tiles`);
 run(20);ok(A.get().players.every(p=>!p.surrendered),`${sz}: sim runs`);}
console.log(fails?fails+' FAILURES':'ALL RULES TESTS PASSED');process.exit(fails?1:0);
