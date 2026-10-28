// Rules test of the shared simulation (headless, no browser): gather claim slots, Keep/Fortress fire rate,
// peasant construction/repair, free placement (no territory), builder auto-start (farm/lumber/quarry/mine),
// stuck-peasant watchdog + soak, garrisons + Town Bell, AI garrisoning, map sizes, doubled resource nodes.
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('/*SIM-BEGIN*/'),html.indexOf('/*SIM-END*/'));
const c=vm.createContext({console});
vm.runInContext(src+';globalThis.API={passable,stepOK,POP_MAX,fortBldTarget,updateVisFor,setupGame,sim,applyCmd,nearestRes,spawnUnit,spawnBld,killEnt,makeSnap,canPlace,repairCost,RT,BLD,UNITS,STEP,RES_AMT,US,AGES,NUKE,SAT,AGE_UNITS,get:()=>({units,blds,players,claim,resT,resA,projs,MAP,STARTS,time,nukeFx})};',c);
const A=c.API;const close2=(a,b)=>Math.abs(a-b)<1e-9;let fails=0;const ok=(v,m)=>{console.log((v?'PASS ':'FAIL ')+m);if(!v)fails++;};
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
const countArrows=(sec,stat)=>{let n=0,maxP=0,dmg=0;const seen=new Set();for(let s=0;s<30*sec;s++){A.sim(A.STEP);const pj=A.get().projs;maxP=Math.max(maxP,pj.length);for(const p of pj)if(p.k==='arrow'&&!seen.has(p)){seen.add(p);n+=p.n||1;dmg+=p.dmg;}}if(stat){stat.maxP=maxP;stat.dmg=dmg;}return n;};
{const foe=A.spawnUnit('knight',kp.x+3,kp.y+3,1);foe.hp=foe.maxhp=1e9;foe.state='hold';
 const a=countArrows(10);ok(a>=48&&a<=53,`Keep fires 4 arrows per 0.8 s volley = 5/s (${a} in 10 s)`);
 const fx=A.spawnBld('fortress',kp.tx+6,kp.ty-1,0,true);kp.cd=1e9;const f=countArrows(10);ok(f>=94&&f<=104,`Fortress fires 8 arrows per volley = 10/s, double the Keep (${f} in 10 s)`);
 ok(A.BLD.fortress.shoot.range===A.UNITS.catapult.range+3,`Fortress range = catapult range + 3 (${A.BLD.fortress.shoot.range} tiles)`);
 // range: a target 10.5 tiles away is shot by the Fortress, not by the Keep (range 7)
 {foe.x=fx.x+10.5;foe.y=fx.y;kp.cd=0;const n=countArrows(4);kp.cd=1e9;ok(n>=16&&Math.hypot(foe.x-kp.x,foe.y-kp.y)>7,`Fortress hits a target 10.5 tiles away (${n} arrows in 4 s)`);foe.x=kp.x+3;foe.y=kp.y+3;run(.5);}
 // garrisoned archers add 2 arrows each, other garrisoned units 1
 const ar=[0,1,2,3].map(i=>A.spawnUnit('archer',fx.x+(i%2),fx.y+2.6,0));A.applyCmd(0,{t:'garrison',ids:ar.map(u=>u.id),bid:fx.id});run(6);
 ok(fx.gar.length===4,`4 archers garrisoned in the Fortress (${fx.gar.length}/30)`);const f2=countArrows(10);ok(f2>=f+95&&f2<=f+105,`garrisoned archers add 2 arrows each per volley (${f2} vs ${f} in 10 s)`);
 const pz=[0,1,2,3].map(i=>A.spawnUnit('peasant',fx.x+(i%2),fx.y+2.6,0)).concat([0,1].map(i=>A.spawnUnit('spearman',fx.x+i,fx.y+2.6,0)));A.applyCmd(0,{t:'garrison',ids:pz.map(u=>u.id),bid:fx.id});run(6);
 ok(fx.gar.length===10,`+4 peasants +2 spearmen garrisoned (${fx.gar.length})`);const f3=countArrows(10);ok(f3>=f2+72&&f3<=f2+78,`every garrisoned peasant/spearman adds 1 arrow per volley (${f3} vs ${f2} in 10 s)`);
 // batching: a packed Keep (40) firing at one target merges extra arrows (damage kept), few projectile objects
 fx.dead=true;run(.1);kp.cd=0;const many=[];for(let i=0;i<40;i++)many.push(A.spawnUnit(i%3?'peasant':'archer',kp.x+(i%5)*.3,kp.y+2.6+Math.floor(i/5)*.2,0));
 A.applyCmd(0,{t:'garrison',ids:many.map(u=>u.id),bid:kp.id});run(8);const ga=kp.gar.filter(u=>u.type==='archer').length,go=kp.gar.length-ga;
 const st={};const nk=countArrows(8,st);const per=4+2*ga+go;const expD=10*(4*10+2*ga*7+go*3);
 ok(kp.gar.length===40&&Math.abs(nk-per*10)<=per,`full Keep: ${per} arrows per volley (4 + 2×${ga} archers + ${go} others) → ${nk} in 8 s`);
 ok(st.maxP<=40,`…but merged into ≤16 projectiles per volley (max ${st.maxP} in flight)`);
 ok(Math.abs(st.dmg-expD)<=expD*.12,`merged arrows keep the full damage (${st.dmg|0} vs ~${expD})`);
 A.applyCmd(0,{t:'unload',bid:kp.id});run(.5);
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
 // placement: no territory limit, only terrain/occupancy
 {const fo=vm.runInContext('fogOn',c);vm.runInContext('fogOn=false',c);
  let far=null;for(let d=0;d<40&&!far;d++){const tx=K.tx+30+d,ty=K.ty-30;if(!A.canPlace('tower',tx,ty,0,null))far=[tx,ty];}
  ok(!!far,'can place a building far from your own buildings (no territory limit)');
  const E=g.players[1].keep;let nearE=null;for(let r=3;r<8&&!nearE;r++)for(let a=0;a<16&&!nearE;a++){const tx=Math.round(E.x+Math.cos(a/16*6.28)*r),ty=Math.round(E.y+Math.sin(a/16*6.28)*r);if(!A.canPlace('tower',tx,ty,0,null))nearE=[tx,ty];}
  ok(!!nearE,'can place a building close to an enemy Keep');
  ok(/building/i.test(A.canPlace('tower',K.tx,K.ty,0,null)||''),'cannot overlap a building');
  let rt=-1;const gg=A.get();for(let i=0;i<gg.resT.length;i++)if(gg.resT[i]){rt=i;break;}
  ok(/resource/i.test(A.canPlace('tower',rt%gg.MAP,Math.floor(rt/gg.MAP),0,null)||''),'cannot overlap a resource node');
  if(far){A.applyCmd(0,{t:'build',type:'tower',spots:[far],ids:[]});const st=A.get().blds.find(b=>b.type==='tower'&&!b.dead&&!b.built&&b.owner===0);ok(!!st&&A.get().units.some(u=>u.bld===st),'a far site gets a peasant walking to build it');if(st)A.applyCmd(0,{t:'cancelbld',bid:st.id});run(.1);}
  vm.runInContext('fogOn='+fo,c);}
 // repair: costs wood/stone proportional to damage, peasants + Repair button (repairauto)
 h.hp=h.maxhp*.5;const rc=A.repairCost(h,h.maxhp*.5);ok(Math.abs(rc.wood-12.5)<.01,`repair cost: 50% of build cost for a full repair, proportional (half HP of a House = ${rc.wood} wood)`);
 A.applyCmd(0,{t:'stop',ids:my(0,'peasant').map(u=>u.id)});const wr=P.res.wood;A.applyCmd(0,{t:'repairauto',bid:h.id});const rep=A.get().units.filter(u=>u.bld===h).length;
 ok(rep>=1&&rep<=3,`Repair (N) auto-assigns the nearest idle peasants (${rep})`);run(30);ok(h.hp>=h.maxhp-1,'house repaired to full');ok(Math.abs((wr-P.res.wood)-12.5)<1,`repair charged ~12.5 wood (${(wr-P.res.wood).toFixed(1)})`);
 const sn=A.makeSnap();ok(sn.U.length===A.get().units.length,'snapshot sane after construction');}

console.log('--- farm builders start farming');
A.setupGame(4711,[{human:true}],'normal',false);g=A.get();{const K=g.players[0].keep;const P=g.players[0];P.res.wood=5000;
 const pz=my(0,'peasant');let spot=null;for(let r=4;r<10&&!spot;r++)for(let a=0;a<16&&!spot;a++){const tx=Math.round(K.x+Math.cos(a/16*6.28)*r)-1,ty=Math.round(K.y+Math.sin(a/16*6.28)*r)-1;if(!A.canPlace('farm',tx,ty,0,null))spot=[tx,ty];}
 A.applyCmd(0,{t:'build',type:'farm',spots:[spot],ids:pz.slice(0,3).map(u=>u.id)});const f=A.get().blds.find(b=>b.type==='farm');
 for(let i=0;i<30*40&&!f.built;i++)A.sim(A.STEP);run(1);
 const farming=pz.slice(0,3).filter(u=>u.state==='farm'&&u.job&&u.job.farm===f);
 ok(f.built&&farming.length===2,`human: the 3 builders of a Farm → 2 start farming it on completion (${farming.length}), slots respected`);
 ok(pz.slice(0,3).some(u=>!(u.job&&u.job.farm===f)),'the 3rd builder does not overfill the farm');
 run(5);ok(P.res.food>300,'the new farmers produce food');}
// AI: every farm the AI finishes gets its builders as farmers
A.setupGame(8080,[{human:true}],'normal',true);{let watched=new Map(),checked=0,good=0;const bset=new Map();
 for(let s=0;s<30*360;s++){const before=new Map();for(const u of A.get().units)if(u.owner>0&&u.bld&&u.bld.type==='farm'&&!u.bld.built){before.set(u,u.bld);(bset.get(u.bld)||bset.set(u.bld,new Set()).get(u.bld)).add(u);}
  A.sim(A.STEP);for(const [u,f] of before)if(f.built&&!watched.has(f))watched.set(f,{u:[...bset.get(f)].filter(v=>v.bld===f||(v.job&&v.job.farm===f)),t:A.get().time});
  for(const [f,w] of watched){if(w.done||A.get().time-w.t<1)continue;w.done=true;checked++;const fs=w.u.filter(v=>!v.dead&&v.job&&v.job.farm===f);if(fs.length>=Math.min(2,w.u.filter(v=>!v.dead).length)||(fs.length>=1&&f.workers.length>=2))good++;else if(process.env.DBG)console.log('  miss',f.owner,w.u.map(v=>v.state+'/'+(v.job?(v.job.farm?'farm'+(v.job.farm===f):v.job.rt):'-')+'/'+(v.bld?v.bld.type:'')).join(' '),'workers',f.workers.length);}}
 ok(checked>=3&&good===checked,`AI: builders of every completed AI Farm immediately farm it (${good}/${checked} farms)`);}
console.log('--- builders auto-gather at a finished Lumber Camp / Quarry / Gold Mine');
for(const [ty,rt] of [['lumber','wood'],['quarry','stone'],['mine','gold']]){
 A.setupGame(606,[{human:true}],'normal',false);g=A.get();const K=g.players[0].keep,P=g.players[0];P.res.wood=P.res.stone=P.res.gold=5000;
 const n=A.nearestRes(A.RT[rt],K.x,K.y,40,false);let spot=null;
 for(let r=2;r<8&&!spot;r++)for(let a=0;a<24&&!spot;a++){const tx=Math.round(n[0]+Math.cos(a/24*6.28)*r)-1,ty2=Math.round(n[1]+Math.sin(a/24*6.28)*r)-1;if(!A.canPlace(ty,tx,ty2,0,null))spot=[tx,ty2];}
 const pz=my(0,'peasant').slice(0,2);A.applyCmd(0,{t:'build',type:ty,spots:[spot],ids:pz.map(u=>u.id)});const b=A.get().blds.find(o=>o.type===ty&&o.owner===0);
 for(let i=0;i<30*90&&!b.built;i++)A.sim(A.STEP);A.sim(A.STEP);A.sim(A.STEP);
 const gs=pz.filter(u=>u.state==='gather'&&u.job&&u.job.rt===rt);const cl=A.get().claim,M=A.get().MAP;
 const nodes=gs.map(u=>u.job.ty*M+u.job.tx);
 ok(b.built&&gs.length===2,`${ty}: both builders start gathering ${rt} on completion (${gs.length}/2)`);
 ok(new Set(nodes).size===nodes.length&&gs.every(u=>cl[u.job.ty*M+u.job.tx]===u.id),`${ty}: they hold distinct claim slots`);
 const nb=A.nearestRes(A.RT[rt],b.x,b.y,14,false);const dn=Math.hypot(nb[0]+.5-b.x,nb[1]+.5-b.y);
 ok(gs.every(u=>Math.hypot(u.job.tx+.5-b.x,u.job.ty+.5-b.y)<=dn+4),`${ty}: the ${rt} they gather is next to the new building`);
 if(ty==='lumber'){const w0=P.res.wood;run(25);ok(P.res.wood>w0,`lumber builders deliver wood (+${(P.res.wood-w0)|0})`);}}
// AI builders of drop sites
A.setupGame(9090,[{human:true}],'normal',true);{let checked=0,good=0;const seen=new Set();
 for(let s=0;s<30*300;s++){const before=[];for(const u of A.get().units)if(u.owner>0&&u.bld&&!u.bld.built&&['lumber','quarry','mine'].includes(u.bld.type))before.push([u,u.bld]);
  A.sim(A.STEP);for(const [u,b] of before)if(b.built&&!seen.has(u.id+':'+b.id)){seen.add(u.id+':'+b.id);checked++;const rt={lumber:'wood',quarry:'stone',mine:'gold'}[b.type];if(u.state==='gather'&&u.job&&u.job.rt===rt)good++;}}
 ok(checked>=2&&good>=checked*.8,`AI: builders of finished Lumber Camps/Quarries/Mines gather the matching resource (${good}/${checked})`);}
console.log('--- stuck peasants: watchdog + soak');
A.setupGame(1212,[{human:true}],'normal',false);g=A.get();{const K=g.players[0].keep,M=g.MAP;
 // box a peasant in with walls 3 tiles from a tree, then order it to gather there: it can never reach the tree
 const n=A.nearestRes(A.RT.wood,K.x,K.y,40,true);let box=null;
 for(let r=3;r<7&&!box;r++)for(let a=0;a<16&&!box;a++){const cx=Math.round(n[0]+Math.cos(a/16*6.28)*r),cy=Math.round(n[1]+Math.sin(a/16*6.28)*r);let okb=true;for(let y=cy-1;y<=cy+1;y++)for(let x=cx-1;x<=cx+1;x++)if(A.canPlace('wall',x,y,0,null))okb=false;if(okb)box=[cx,cy];}
 const u=my(0,'peasant')[0];for(let y=box[1]-1;y<=box[1]+1;y++)for(let x=box[0]-1;x<=box[0]+1;x++)if(x!==box[0]||y!==box[1])A.spawnBld('wall',x,y,0,true);
 u.x=box[0]+.5;u.y=box[1]+.5;u.path=null;A.applyCmd(0,{t:'gather',ids:[u.id],x:n[0],y:n[1]});const ti=n[1]*M+n[0];
 let held=0;for(let i=0;i<30*20;i++){A.sim(A.STEP);if(A.get().claim[ti]===u.id)held++;}
 ok((u.unstuck||0)>=1||u.state==='idle',`watchdog: a peasant that cannot progress at its job is unstuck (unstuck=${u.unstuck||0}, state=${u.state})`);
 ok(A.get().claim[ti]!==u.id,'watchdog: its claim on the unreachable node is released');}
// soak: all-AI game, no peasant may sit at a job without progress for >10 s
for(const [sz,seed,mins] of [['small',7,8],['medium',12,6]]){A.setupGame(seed,[{human:true}],'normal',true,sz);const last=new Map();let worst=0,bad=0;
 for(let s=0;s<30*60*mins;s++){A.sim(A.STEP);if(s%30)continue;const t=A.get().time;
  for(const v of A.get().units){if(v.dead||v.type!=='peasant'||v.owner===0||v.inG)continue;if(!['gather','return','farm','build'].includes(v.state)){last.delete(v.id);continue;}
   const key=[v.state,Math.round(v.x*4),Math.round(v.y*4),v.carry|0,v.bld?Math.round((v.bld.prog+v.bld.hp/v.bld.maxhp)*100):0,v.state==='farm'?Math.floor(t/3):0].join(',');
   const L=last.get(v.id);if(!L||L.k!==key||v.working&&v.state==='gather')last.set(v.id,{k:key,t});else if(t-L.t>10){bad++;worst=Math.max(worst,t-L.t);L.t=t;if(process.env.DBG)console.log('  stuck',sz,t.toFixed(0),v.id,v.owner,v.state,v.x.toFixed(2),v.y.toFixed(2),'carry',v.carry,'job',JSON.stringify(v.job&&{tx:v.job.tx,ty:v.job.ty,rt:v.job.rt,farm:!!v.job.farm}),'bld',v.bld&&v.bld.type,v.bld&&v.bld.built,v.bld&&v.bld.hp|0,'bc',v.bld&&v.bld.bc,'working',v.working,'moving',v.moving,'unstuck',v.unstuck,'drop',v.dropB&&v.dropB.type,'onPass',A.passable(Math.floor(v.x),Math.floor(v.y),v.owner),'path',JSON.stringify(v.path&&v.path.slice(0,3)),'pend',JSON.stringify(v.pend),'goal',JSON.stringify(v.goal),'blockT',v.blockT,'rawT',v.rawT,'stuckN',v.stuckN);}}}
 ok(bad===0,`soak ${sz} ${mins} min: no AI peasant stuck at its job for >10 s (${bad} events, worst ${worst.toFixed(0)} s)`);}
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

console.log('--- market trading (gold only, 4:1)');
{A.setupGame(321,[{human:true}],'normal',false);g=A.get();const P=g.players[0],K=P.keep;
 const spotFor=(ty,r0=4)=>{for(let r=r0;r<30;r++)for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){if(Math.max(Math.abs(x),Math.abs(y))!==r)continue;const tx=Math.floor(K.x)+x,ty2=Math.floor(K.y)+y;if(!A.canPlace(ty,tx,ty2,0,null))return [tx,ty2];}};
 const ms=spotFor('market',5);const site=A.spawnBld('market',ms[0],ms[1],0,false);
 P.res.wood=1000;A.applyCmd(0,{t:'trade',bid:site.id,res:'wood',dir:'sell',amt:100});ok(P.res.wood===1000,'unfinished Market cannot trade');
 const M=A.spawnBld('market',ms[0]+4,ms[1],0,true);
 P.res.gold=0;P.res.wood=1000;A.applyCmd(0,{t:'trade',bid:M.id,res:'wood',dir:'sell',amt:1000});ok(P.res.wood===0&&P.res.gold===250,`sell 1000 wood -> 250 gold (wood ${P.res.wood}, gold ${P.res.gold})`);
 P.res.gold=4000;P.res.wood=0;A.applyCmd(0,{t:'trade',bid:M.id,res:'wood',dir:'buy',amt:1000});ok(P.res.wood===1000&&P.res.gold===0,`buy 1000 wood for 4000 gold (wood ${P.res.wood}, gold ${P.res.gold})`);
 P.res.gold=399;A.applyCmd(0,{t:'trade',bid:M.id,res:'stone',dir:'buy',amt:100});ok(P.res.gold===399,'buy refused with too little gold');
 P.res.food=99;A.applyCmd(0,{t:'trade',bid:M.id,res:'food',dir:'sell',amt:100});ok(P.res.food===99,'sell refused with too little food');
 P.res.gold=1e4;const before=JSON.stringify(P.res);
 for(const bad of [{res:'gold',dir:'buy',amt:100},{res:'wood',dir:'buy',amt:-100},{res:'wood',dir:'sell',amt:101},{res:'wood',dir:'buy',amt:'1e9'},{res:'wood',dir:'steal',amt:100},{res:'__proto__',dir:'buy',amt:100}])A.applyCmd(0,Object.assign({t:'trade',bid:M.id},bad));
 ok(JSON.stringify(P.res)===before,'invalid trades (gold for gold, negative, not a multiple of 4, huge, bad direction/resource) do nothing');
 const em=A.spawnBld('market',ms[0],ms[1]+4,1,true);g.players[1].res.wood=500;P.res.wood=500;A.applyCmd(0,{t:'trade',bid:em.id,res:'wood',dir:'sell',amt:100});ok(P.res.wood===500,'cannot trade at an enemy Market');

 console.log('--- demolish');
 const H=A.spawnBld('house',spotFor('house')[0],spotFor('house')[1],0,true);const w1=A.spawnBld('wall',K.tx-3,K.ty-3,0,true),w2=A.spawnBld('wall',K.tx-2,K.ty-3,0,true);
 const eh=A.spawnBld('house',...spotFor('house'),1,true);const res0=JSON.stringify(P.res);
 A.applyCmd(1,{t:'demolish',bids:[H.id]});ok(!H.dead,'cannot demolish another kingdom\'s building');
 A.applyCmd(0,{t:'demolish',bids:[H.id,w1.id,w2.id,eh.id]});ok(H.dead&&w1.dead&&w2.dead&&!eh.dead,'demolish removes several own finished buildings/walls at once (not the enemy house in the list)');
 ok(JSON.stringify(P.res)===res0,'no refund for demolished buildings');
 ok(A.canPlace('wall',K.tx-3,K.ty-3,0,null)===null,'demolished wall tile is free again');
 const site2=A.spawnBld('tower',...spotFor('tower'),0,false);const st0=P.res.stone,wd0=P.res.wood;A.applyCmd(0,{t:'demolish',bids:[site2.id]});
 ok(site2.dead&&P.res.stone===st0+A.BLD.tower.cost.stone&&P.res.wood===wd0+(A.BLD.tower.cost.wood||0),'demolishing an unfinished site cancels it with the full refund');
 A.applyCmd(0,{t:'demolish',bids:[K.id]});run(.5);ok(!K.dead&&!P.surrendered,'the Keep cannot be demolished');
 A.applyCmd(0,{t:'demolish',bid:M.id});ok(M.dead,'single bid form works too');

 console.log('--- gates over own walls');
 const gx=K.tx+6,gy=K.ty-4;const walls=[0,1,2].map(i=>A.spawnBld('wall',gx+i,gy,0,true));
 ok(A.canPlace('gate',gx+1,gy,0,null)===null,'Gate over own wall: valid (green preview)');
 ok(A.canPlace('wall',gx+1,gy,0,null)!==null&&A.canPlace('tower',gx,gy,0,null)!==null&&A.canPlace('house',gx,gy,0,null)!==null,'walls/other buildings over a wall are still invalid');
 ok(A.canPlace('gate',gx+1,gy,1,null)!==null,'another kingdom cannot place a Gate over my wall');
 ok(A.canPlace('gate',K.tx,K.ty,0,null)!==null,'Gate over a non-wall building is invalid');
 P.res.stone=500;P.res.wood=500;const s0=P.res.stone;A.applyCmd(0,{t:'build',type:'gate',spots:[[gx+1,gy]],ids:[]});
 const gt=A.get().blds.find(b=>b.type==='gate'&&!b.dead&&b.tx===gx+1&&b.ty===gy);
 ok(gt&&walls[1].dead&&!walls[0].dead&&!walls[2].dead&&P.res.stone===s0-A.BLD.gate.cost.stone,'build command replaces the wall segment with a Gate site (wall not refunded, gate paid)');
 const ws=A.spawnBld('wall',gx+5,gy,0,false);P.res.stone=100;A.applyCmd(0,{t:'build',type:'gate',spots:[[gx+5,gy]],ids:[]});ok(ws.dead&&P.res.stone===100-A.BLD.gate.cost.stone+A.BLD.wall.cost.stone,'Gate over an unfinished wall site: the site is cancelled with its refund');
 gt.built=true;gt.prog=1;gt.hp=gt.maxhp;const pz=A.spawnUnit('peasant',gx+1.5,gy-2.5,0);A.applyCmd(0,{t:'move',ids:[pz.id],x:gx+1.5,y:gy+2.5});run(8);
 ok(pz.y>gy+1.5,`own peasant walks through the new Gate (y ${pz.y.toFixed(1)})`);
 const ew=A.spawnBld('wall',gx+8,gy,1,true);P.res.stone=500;A.applyCmd(0,{t:'build',type:'gate',spots:[[gx+8,gy]],ids:[]});ok(!ew.dead&&!A.get().blds.some(b=>b.type==='gate'&&!b.dead&&b.tx===gx+8),'cannot place a Gate over an enemy wall');}

console.log('--- population cap 200, catapult sight');
{A.setupGame(8642,[{human:true}],'normal',false);g=A.get();const P=g.players[0],K=P.keep;let n=0;
 for(let r=4;r<30&&n<30;r+=2)for(let a=0;a<24&&n<30;a++){const tx=Math.round(K.x+Math.cos(a/24*6.283)*r)-1,ty=Math.round(K.y+Math.sin(a/24*6.283)*r)-1;if(!A.canPlace('house',tx,ty,0,null)){A.spawnBld('house',tx,ty,0,true);n++;}}
 run(.1);ok(A.POP_MAX===200&&P.popCap===200,`population cap is 200 (Keep + ${n} Houses -> ${P.popCap})`);
 ok(10+24*A.BLD.house.pop>=200,'Keep + 24 Houses reach the cap');
 ok(A.UNITS.catapult.sight===12&&A.UNITS.catapult.range===8.5,'catapult sight 12, range still 8.5');}

console.log('--- Fortress shoots enemy buildings');
{A.setupGame(1357,[{human:true}],'normal',true);g=A.get();const K=g.players[0].keep;
 const F=A.spawnBld('fortress',K.tx+8,K.ty,0,true);const fx=F.tx,fy=F.ty;run(.3);
 const W=A.spawnBld('wall',fx+8,fy+1,1,true),T=A.spawnBld('tower',fx+10,fy+3,1,true),S=A.spawnBld('house',fx-6,fy+5,1,false);T.cd=1e9;
 for(const b of [W,T,S]){b.hp=b.maxhp=1e6;}A.updateVisFor(0);
 ok(A.fortBldTarget(F,A.BLD.fortress.shoot.range)===T,'Fortress picks the enemy tower (shoots back) before the nearer wall');
 const h0={W:W.hp,T:T.hp};run(8);const dT=h0.T-T.hp;ok(dT>85&&dT<160,`no enemy units in range: Fortress damages the tower (${dT.toFixed(0)} in 8 s, ~15/s)`);
 T.dead=true;const s0=S.hp,w0=W.hp;run(6);
 ok(s0-S.hp>95&&W.hp===w0,`then the nearest building: an unfinished site, at 1.5x (${(s0-S.hp).toFixed(0)} in 6 s; farther wall untouched)`);
 S.dead=true;const w1=W.hp;run(6);ok(w1-W.hp>60,`walls are shot too (${(w1-W.hp).toFixed(0)} in 6 s)`);
 const S2=A.spawnBld('house',fx-6,fy+5,1,false);S2.hp=S2.maxhp=1e6;
 const kn=A.spawnUnit('knight',fx+5,fy+1,1);kn.hp=kn.maxhp=1e6;kn.state='hold';const s2=S2.hp,k2=kn.hp;run(4);
 ok(S2.hp===s2&&kn.hp<k2,'an enemy unit in range takes priority over buildings');kn.dead=true;
 const V=A.updateVisFor(0);for(const e of A.get().blds)if(e.owner!==0)for(let y=e.ty;y<e.ty+e.h;y++)for(let x=e.tx;x<e.tx+e.w;x++)V[y*g.MAP+x]=1;
ok(A.fortBldTarget(F,A.BLD.fortress.shoot.range)===null,'buildings the owner cannot currently see are not targeted (fog)');
 // Keep and Tower behaviour unchanged: they ignore buildings
 const eb=A.spawnBld('house',K.tx-4,K.ty,1,true);eb.hp=eb.maxhp=1e6;const tw=A.spawnBld('tower',K.tx-2,K.ty+4,0,true);F.dead=true;const e0=eb.hp;run(6);
 ok(eb.hp===e0,'Keep and Tower still never shoot buildings');}

console.log('--- delete own units');
{A.setupGame(2468,[{human:true}],'normal',false);g=A.get();const P=g.players[0],K=P.keep;
 const tree=A.nearestRes(1,K.x,K.y,20);const ps=my(0,'peasant');A.applyCmd(0,{t:'gather',ids:[ps[0].id],tx:tree[0],ty:tree[1],x:tree[0],y:tree[1]});
 const j=ps[0].job,ti=j.ty*g.MAP+j.tx;ok(g.claim[ti]===ps[0].id,'gatherer holds a claim');run(.2);const pop0=P.pop,res0=JSON.stringify(P.res),lost0=P.stats.lost;
 A.applyCmd(1,{t:'kill',ids:[ps[0].id]});ok(!ps[0].dead,'another kingdom cannot delete my unit');
 A.applyCmd(0,{t:'kill',ids:[ps[0].id,ps[1].id]});run(.2);
 ok(ps[0].dead&&ps[1].dead&&g.claim[ti]===0,'kill: both selected peasants die and the resource claim is released');
 ok(P.pop===pop0-2&&JSON.stringify(P.res)===res0&&P.stats.lost===lost0+2,`no refund, population ${pop0} -> ${P.pop}, counted as losses`);
 const sp=A.spawnUnit('spearman',K.x+3,K.y+3,0),ar=A.spawnUnit('archer',K.x+3.5,K.y+3,0);A.applyCmd(0,{t:'garrison',ids:[sp.id,ar.id],bid:K.id});run(4);
 ok(sp.inG===K&&K.gar.length>=2,'two units garrisoned');const g0=K.gar.length;A.applyCmd(0,{t:'kill',ids:[sp.id]});
 ok(sp.dead&&!K.gar.includes(sp)&&K.gar.length===g0-1,'killing a garrisoned unit frees its garrison slot');
 const kn=A.spawnUnit('knight',K.x+5,K.y+5,0),cat=A.spawnUnit('catapult',K.x+6,K.y+5,0),en=A.spawnUnit('knight',K.x+7,K.y+5,1);
 A.applyCmd(0,{t:'kill',ids:[kn.id,cat.id,en.id,K.id]});ok(kn.dead&&cat.dead&&!en.dead&&!K.dead,'any own unit type can be deleted; enemy units and buildings in the list are ignored');}

console.log('--- unfinished sites give no vision');
{A.setupGame(4321,[{human:true}],'normal',true);g=A.get();const K=g.players[0].keep,M=g.MAP;
 // a site far from every own unit/building (towards the map centre)
 const tx=Math.floor(M/2),ty=Math.floor(M/2);const near=g.units.concat(g.blds).filter(e=>e.owner===0&&Math.hypot(e.x-tx,e.y-ty)<20);
 const T=A.spawnBld('tower',tx,ty,0,false);let V=A.updateVisFor(0);const at=(x,y)=>V[y*M+x];
 const ring=[[tx+3,ty],[tx-3,ty],[tx,ty+3],[tx,ty-3],[tx+5,ty+2]];
 ok(near.length===0&&at(tx,ty)===2&&ring.every(([x,y])=>at(x,y)===0),'unfinished site far away: only its own tile is visible to the owner, nothing beyond');
 const F=A.spawnBld('fortress',tx+10,ty,0,false);V=A.updateVisFor(0);ok(at(tx+11,ty+1)===2&&at(tx+15,ty+1)===0&&at(tx+10,ty+5)===0,'unfinished 3x3 site: footprint visible, surroundings stay fogged');
 T.built=true;T.prog=1;V=A.updateVisFor(0);ok(ring.every(([x,y])=>at(x,y)===2),'once built, the tower reveals its sight radius immediately');
 ok(A.BLD.tower.sight>A.BLD.fortress.shoot.range&&at(tx-12,ty)===2&&at(tx-14,ty)===0,'tower sees 12 tiles, further than the Fortress shoots (11.5)');
 T.dead=true;F.dead=true;V=A.updateVisFor(0);ok(at(tx+3,ty)===1,'after it is gone the area is remembered (explored), not live');
 const S=A.spawnBld('house',tx-20,ty+4,0,false);const pz=A.spawnUnit('peasant',tx-21,ty+4.5,0);V=A.updateVisFor(0);
 ok(at(tx-26,ty+4)===2&&at(tx-21+7,ty+4)===0,'a peasant building a site still sees with its own sight (6), the site adds nothing');}

console.log('--- map sizes');
for(const [sz,M] of [['small',96],['medium',144],['large',192]]){A.setupGame(77,[{human:true}],'normal',true,sz);g=A.get();
 let trees=0,gold=0;for(let i=0;i<g.resT.length;i++){if(g.resT[i]===1)trees++;if(g.resT[i]===3)gold++;}
 const ks=g.players.map(p=>p.keep);const spread=Math.hypot(ks[0].x-ks[1].x,ks[0].y-ks[1].y);
 ok(g.MAP===M&&g.resT.length===M*M,`${sz}: ${M}x${M} map, keeps ${spread.toFixed(0)} tiles apart, ${trees} trees, ${gold} gold tiles`);
 run(20);ok(A.get().players.every(p=>!p.surrendered),`${sz}: sim runs`);}

console.log('--- Fortress arrows 6 damage (Keep and Tower unchanged)');
ok(A.BLD.fortress.shoot.atk===6&&A.BLD.keep.shoot.atk===10&&A.BLD.tower.shoot.atk===9,'Fortress arrows 6 damage (v1.4.1; 15 damage/s vs buildings); Keep 10, Tower 9 unchanged');
ok(A.BLD.fortress.shoot.n*A.BLD.fortress.shoot.atk*0.25/A.BLD.fortress.shoot.cd===15,'Fortress building damage = 8 x 6 x 0.25 / 0.8 s = 15/s');

console.log('--- ages: University -> Middle Ages, Research Lab -> Modern Age');
const RICH=v=>({food:v,wood:v,stone:v,gold:v});const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const finish=b=>{b.prog=1;run(.1);};
{A.setupGame(9090,[{human:true}],'normal',false);g=A.get();const P=g.players[0],K=P.keep;
 ok(P.age===0&&g.players.every(p=>p.age===0),'everyone starts in age 0 (Early Age)');
 ok(same(A.BLD.university.cost,RICH(5000))&&same(A.BLD.lab.cost,RICH(10000))&&A.BLD.lab.reqAge===1,'University costs 5000 of each, Research Lab 10000 of each and needs the Middle Ages');
 P.res=RICH(30000);
 const spot=(ty,dx,dy)=>{for(let r=6;r<30;r++)for(let a=0;a<16;a++){const tx=Math.round(K.x+Math.cos(a/16*6.283)*r)+dx,tyy=Math.round(K.y+Math.sin(a/16*6.283)*r)+dy;if(!A.canPlace(ty,tx,tyy,0,null))return[tx,tyy];}};
 const ls=spot('lab',0,0);A.applyCmd(0,{t:'build',type:'lab',spots:[ls],ids:[]});
 ok(!A.get().blds.some(b=>b.type==='lab')&&same(P.res,RICH(30000)),'Research Lab cannot be built in the Early Age (nothing placed, nothing paid)');
 const sp=A.spawnUnit('spearman',K.x+4,K.y+4,0),kn=A.spawnUnit('knight',K.x+5,K.y+4,0),ar=A.spawnUnit('archer',K.x+4,K.y+5,0),tb0=A.spawnUnit('peasant',K.x+5,K.y+5,0);
 sp.hp=sp.maxhp/2;ok(sp.maxhp===95&&kn.maxhp===170,'Early Age spearman 95 hp, knight 170 hp');
 const ws=A.spawnBld('workshop',...spot('workshop',0,0),0,true);
 // costs double with each age: peasant at the Keep
 let r0=JSON.stringify(P.res);A.applyCmd(0,{t:'train',bid:K.id,ut:'peasant'});ok(P.res.food===30000-50,'Early Age peasant costs 50 food');
 A.applyCmd(0,{t:'train',bid:ws.id,ut:'trebuchet'});A.applyCmd(0,{t:'train',bid:ws.id,ut:'ram'});ok(ws.queue.length===0&&P.res.wood===30000,'trebuchet and ram cannot be trained in the Early Age');
 const us=spot('university',0,0);A.applyCmd(0,{t:'build',type:'university',spots:[us],ids:[]});const U=A.get().blds.find(b=>b.type==='university');
 ok(U&&!U.built&&P.res.stone===30000-5000&&P.res.gold===30000-5000,'University site placed, 5000 of each paid');
 ok(P.age===0,'no age-up while the University is still a site');finish(U);
 ok(U.built&&P.age===1,'University completes -> Middle Ages (age 1)');
 ok(sp.maxhp===114&&Math.abs(sp.hp-57)<.01&&kn.maxhp===204&&kn.hp===204,`existing spearman/knight get +20% max hp, hp scaled proportionally (spearman ${sp.hp}/${sp.maxhp}, knight ${kn.hp}/${kn.maxhp})`);
 ok(A.US('archer',0).range===8.5&&A.US('archer',1).range===5.5,'Middle Ages archers range 5.5 + 3 = 8.5 (other kingdoms unchanged)');
 ok(A.US('spearman',0).hp===114&&A.US('knight',0).hp===204&&A.US('archer',0).hp===60,'Middle Ages: spearman 114 hp, knight 204 hp (x1.2), archer unchanged');
 const sp2=A.spawnUnit('spearman',K.x+3,K.y+6,0);ok(sp2.maxhp===114&&sp2.hp===114,'new spearmen spawn with the boosted hp');
 const pr=P.res.food;A.applyCmd(0,{t:'train',bid:K.id,ut:'peasant'});ok(pr-P.res.food===100,'Middle Ages peasant costs 2x (100 food)');
 const w0=P.res.wood,s0=P.res.stone,g0=P.res.gold;A.applyCmd(0,{t:'train',bid:ws.id,ut:'trebuchet'});
 ok(ws.queue[0]==='trebuchet'&&w0-P.res.wood===300&&s0-P.res.stone===150&&g0-P.res.gold===150,'trebuchet trainable in the Middle Ages at its base cost (300 wood, 150 stone, 150 gold)');
 const w1=P.res.wood;A.applyCmd(0,{t:'train',bid:ws.id,ut:'ram'});ok(ws.queue[1]==='ram'&&w1-P.res.wood===250,'siege ram trainable in the Middle Ages (250 wood, 100 gold)');
 const w2=P.res.wood;A.applyCmd(0,{t:'train',bid:ws.id,ut:'catapult'});ok(w2-P.res.wood===300,'catapult costs 2x in the Middle Ages (300 wood)');
 ok(A.US('spearman',0).cost.food===100&&A.US('knight',0).cost.gold===150,'Middle Ages: spearman 100 food, knight 150 gold (2x)');
 const tr=A.spawnUnit('trebuchet',K.x+6,K.y+7,0),rm=A.spawnUnit('ram',K.x+7,K.y+7,0);
 ok(A.UNITS.trebuchet.range>A.UNITS.catapult.range&&A.UNITS.trebuchet.minRange>0&&A.UNITS.trebuchet.speed<A.UNITS.catapult.speed&&A.UNITS.trebuchet.atk>A.UNITS.catapult.atk,'trebuchet: longer range, min range, slower, heavier than the catapult');
 // ram: very strong vs buildings, weak vs units
 const eh=A.spawnBld('house',K.tx+12,K.ty+12,1,true);eh.hp=eh.maxhp=1e5;const ek=A.spawnUnit('knight',K.x+12,K.y+9,1);ek.hp=ek.maxhp=1e5;ek.state='hold';
 rm.x=eh.x-1.6;rm.y=eh.y;A.applyCmd(0,{t:'attack',ids:[rm.id],tid:eh.id});const h0=eh.hp;run(9);const rb=h0-eh.hp;
 rm.x=ek.x-1;rm.y=ek.y;A.applyCmd(0,{t:'attack',ids:[rm.id],tid:ek.id});const k0=ek.hp;run(9);const ru=k0-ek.hp;
 ok(rb>400&&ru<rb/4,`ram: ${rb.toFixed(0)} damage to a building vs ${ru.toFixed(0)} to a knight in 9 s`);eh.dead=true;ek.dead=true;run(.1);
 // queue cancelled after an age-up refunds what was paid
 const lsC=spot('lab',0,0);A.applyCmd(0,{t:'build',type:'lab',spots:[lsC],ids:[]});const L=A.get().blds.find(b=>b.type==='lab');
 ok(L&&!L.built,'Research Lab can be placed in the Middle Ages');
 const bar=A.spawnBld('barracks',...spot('barracks',0,0),0,true);const f0=P.res.food;A.applyCmd(0,{t:'train',bid:bar.id,ut:'spearman'});ok(f0-P.res.food===100,'Middle Ages spearman paid 100 food');
 finish(L);ok(L.built&&P.age===2,'Research Lab completes -> Modern Age (age 2)');
 const f1=P.res.food;A.applyCmd(0,{t:'cancel',bid:bar.id,k:0});ok(P.res.food-f1===100,'cancelling it after the next age-up refunds the 100 paid, not the new price');
 ok(A.US('spearman',0).cost.food===200&&A.US('peasant',0).cost.food===200&&A.US('trebuchet',0).cost.wood===600&&A.US('ram',0).cost.wood===500&&A.US('catapult',0).cost.wood===600,'Modern Age costs: spearman/peasant 4x base, trebuchet/ram 2x their Middle Ages base, catapult 4x');
 const close=(a,b)=>Math.abs(a-b)<1e-9;const M=t=>A.US(t,0);
 ok(M('archer').name==='Machine Gunner'&&M('knight').name==='Tank'&&M('spearman').name==='Infantry'&&M('trebuchet').name==='Howitzer'&&A.US('archer',1).name==='Archer','Modern names: Machine Gunner, Tank, Infantry, Howitzer (rivals keep theirs)');
 ok(close(M('archer').speed,1.6*1.2)&&M('archer').hp===75&&close(M('archer').atk,10.5)&&M('archer').range===8.5,'Machine Gunner: speed x1.2, hp 60x1.25=75, atk 7x1.5=10.5, range 8.5 (Middle Ages +3 kept)');
 ok(close(M('knight').speed,2.7*1.2)&&M('knight').hp===255&&close(M('knight').atk,19.5),'Tank: speed x1.2, hp 170x1.2x1.25=255, atk 13x1.5=19.5');
 ok(close(M('spearman').speed,1.6*1.2)&&M('spearman').hp===Math.round(114*1.25)&&close(M('spearman').atk,12)&&M('spearman').range===3,'Infantry: speed x1.2, hp 95x1.2x1.25=143, atk 8x1.5=12, range 3');
 ok(close(M('trebuchet').speed,.65*1.2)&&M('trebuchet').hp===275&&close(M('trebuchet').atk,105)&&M('trebuchet').range===12,'Howitzer: speed x1.2, hp 220x1.25=275, atk 70x1.5=105, range 12');
 ok(M('peasant').hp===40&&M('catapult').atk===34&&M('ram').hp===500,'peasants, catapults and rams keep their stats');
 ok(kn.maxhp===255&&kn.hp===255&&tr.maxhp===275&&tr.hp===275&&ar.maxhp===75,`existing units convert too (knight ${kn.maxhp}, trebuchet ${tr.maxhp}, archer ${ar.maxhp})`);
 ok(Math.abs(sp.hp/sp.maxhp-.5)<.001,'damaged spearman keeps its health fraction through both age-ups');
 const sn=A.makeSnap();ok(sn.P[0][12]===2&&sn.P[1][12]===0,'snapshot carries each kingdom\'s age');
 // satellite
 ok(same(A.SAT.cost,RICH(3000)),'satellite costs 3000 of each');
 P.res=RICH(20000);A.applyCmd(0,{t:'buildsat',bid:L.id});ok(L.satQ&&P.res.food===17000,'buildsat at the Lab charges 3000 of each');
 {const r=P.res.gold;A.applyCmd(0,{t:'buildsat',bid:L.id});ok(r-P.res.gold<3000,'only one satellite at a time');}
 let V=A.updateVisFor(0);const M0=g.MAP;ok(V[(M0-3)*M0+(M0-3)]!==2||!A.get().players[0].sat,'before launch the far corner is not live-visible');
 L.satT=A.SAT.time-.05;run(.2);V=A.updateVisFor(0);let all=true;for(let i=0;i<V.length;i++)if(V[i]!==2){all=false;break;}
 ok(P.sat===1&&all,'satellite in orbit: every tile visible to its owner');ok(A.makeSnap().P[0][14]===1,'snapshot carries the satellite flag (client fog lifts in multiplayer)');
 {const r=P.res.gold;A.applyCmd(0,{t:'buildsat',bid:L.id});ok(!L.satQ&&r-P.res.gold<3000,'cannot build a second satellite');}
 L.dead=true;run(.1);V=A.updateVisFor(0);ok(V.every(v=>v===2),'vision stays even if the Lab is destroyed');}
{A.setupGame(9191,[{human:true}],'normal',true);g=A.get();const P=g.players[0];P.age=1;const L=A.spawnBld('lab',P.keep.tx+8,P.keep.ty,0,true);P.res=RICH(5000);A.applyCmd(0,{t:'buildsat',bid:L.id});ok(!L.satQ&&P.res.food===5000,'satellite needs the Modern Age');}

{const sp=(age)=>{A.setupGame(7171,[{human:true}],'normal',false);const P=A.get().players[0];P.age=age;const u=A.spawnUnit('knight',P.keep.x+3,P.keep.y+9,0);const x0=u.x;A.applyCmd(0,{t:'move',ids:[u.id],x:u.x+(u.x<70?14:-14),y:u.y});run(3);return Math.abs(u.x-x0);};
 const d0=sp(0),d2=sp(2);ok(d2>d0*1.12,`Tank moves ~20% faster than an Early Age knight (${d2.toFixed(2)} vs ${d0.toFixed(2)} tiles in 3 s)`);}
{A.setupGame(7272,[{human:true}],'normal',false);const g2=A.get(),P=g2.players[0];P.age=2;const c=g2.MAP/2;
 const inf=A.spawnUnit('spearman',c,c,0),foe=A.spawnUnit('spearman',c+2.6,c,1);foe.hp=foe.maxhp=1e5;foe.state='hold';inf.state='hold';
 A.applyCmd(0,{t:'attack',ids:[inf.id],tid:foe.id});const fh=foe.hp,x0=inf.x;let shot=false;for(let s=0;s<90;s++){A.sim(A.STEP);if(g2.projs.some(p=>p.k==='bullet'&&p.owner===0))shot=true;}
 ok(shot&&foe.hp<fh&&Math.abs(inf.x-x0)<.3,`Infantry shoots bullets at a target 2.6 tiles away without closing in (${(fh-foe.hp).toFixed(0)} damage in 3 s)`);}
console.log('--- walls stop every unit: knights, tanks, fast units, attack-move, own and enemy walls (v1.4.5)');
{// a full-height wall line at x=cx (no way round); the unit starts 4.5 tiles west and is ordered 6.5 tiles east
 const wallRun=(ut,age,wo,am,{late=false,speed=0,gate=false,farm=false}={})=>{A.setupGame(4242,[{human:true}],'normal',false,'medium');const G=A.get(),M=G.MAP,cx=M/2|0;
  G.players[0].age=age;G.players[1].age=age;const g=A.get;
  for(let y=0;y<M;y++)for(let x=cx-10;x<=cx+10;x++){const i=y*M+x;G.resT[i]=0;}
  const tilesA=()=>A.get();const T=vm.runInContext('tiles',c),BG=()=>vm.runInContext('bgrid',c);for(let y=0;y<M;y++)for(let x=cx-10;x<=cx+10;x++)T[y*M+x]=0;
  const ws=[];const wall=()=>{for(let y=0;y<M;y++){if(BG()[y*M+cx])continue;const ty=(gate&&y===cx)?'gate':(farm&&y>=cx-1&&y<=cx)?null:'wall';if(!ty)continue;const b=A.spawnBld(ty,cx,y,wo,true);b.hp=b.maxhp=1e7;ws.push(b);}
   if(farm){const f=A.spawnBld('farm',cx-1,cx-1,wo,true);f.hp=f.maxhp=1e7;}};
  if(!late)wall();const u=A.spawnUnit(ut,cx-4.5,cx+.5,0);u.state='idle';const st=A.US(ut,0),sp0=st.speed;if(speed)st.speed=speed;
  A.applyCmd(0,{t:'move',am,ids:[u.id],x:cx+6.5,y:cx+.5});if(late){for(let i=0,n=speed?Math.floor(60/speed):15;i<n;i++)A.sim(A.STEP);wall();}   // the wall goes up once the unit is on its way, still short of the line
  let enter=0,crossed=false,prev=null;for(let s2=0;s2<30*20;s2++){A.sim(A.STEP);const tx=Math.floor(u.x),ty=Math.floor(u.y),k=ty*M+tx;
   if(prev!=null&&k!==prev&&!A.passable(tx,ty,0)&&A.passable(prev%M,(prev/M)|0,0))enter++;prev=k;if(u.x>cx+1)crossed=true;}
  st.speed=sp0;return{enter,crossed,u};};
 const kinds=[['knight',0,'knight'],['knight',2,'Tank'],['spearman',0,'spearman'],['spearman',2,'Infantry'],['archer',0,'archer'],['peasant',0,'peasant'],['catapult',0,'catapult'],['ram',1,'ram']];
 let bad=[];for(const [ut,age,nm] of kinds)for(const wo of [0,1])for(const am of [false,true]){const r=wallRun(ut,age,wo,am);if(r.enter||r.crossed)bad.push(`${nm}/${wo?'enemy':'own'}/${am?'amove':'move'}`);}
 ok(!bad.length,`no unit type walks into or across a closed wall line, own or enemy, move or attack-move (${kinds.length*4} runs${bad.length?'; FAILED: '+bad.join(', '):''})`);
 bad=[];for(const [ut,age,nm] of [['knight',0,'knight'],['knight',2,'Tank'],['peasant',0,'peasant']])for(const wo of [0,1])for(const am of [false,true]){const r=wallRun(ut,age,wo,am,{late:true});if(r.enter||r.crossed)bad.push(`${nm}/${wo?'enemy':'own'}/${am?'amove':'move'}`);}
 ok(!bad.length,`a wall built across a unit's planned route stops it (knight, Tank, peasant; was walked straight through)${bad.length?' FAILED: '+bad.join(', '):''}`);
 bad=[];for(const v of [6,12,20])for(const late of [false,true]){const r=wallRun('knight',0,1,true,{speed:v,late});if(r.enter||r.crossed)bad.push(`${v}${late?' late':''}`);}
 ok(!bad.length,`no tunnelling at high speed (knight at 6/12/20 tiles/s = up to 0.67 tiles per tick)${bad.length?' FAILED: '+bad.join(', '):''}`);
 const W=vm.runInContext('MAP',c);A.setupGame(4242,[{human:true}],'normal',false,'medium');const cx=vm.runInContext('MAP',c)/2|0;
 ok(!A.stepOK(cx-.5,cx+.5,cx+1.5,cx+.5,0)||A.passable(cx,cx,0),'stepOK samples the whole step, not just its end');
 const og=wallRun('knight',0,0,false,{gate:true}),eg=wallRun('knight',0,1,false,{gate:true});
 ok(og.crossed&&og.enter===0&&!eg.crossed&&eg.enter===0,`gates: the owner's knight goes through its own gate (${og.crossed}), an enemy knight does not (${eg.crossed})`);
 const fm=wallRun('knight',0,0,false,{farm:true});ok(fm.crossed&&fm.enter===0,`farms stay walkable: a knight crosses the wall line over a 2x2 farm gap (${fm.crossed})`);}
{// AI-style assault: 8 enemy knights + 4 Tanks attack-move onto a Keep ringed by unbreakable walls (no gates)
 A.setupGame(5151,[{human:true}],'hard',false,'medium');const G=A.get(),M=G.MAP,K=G.players[0].keep;G.players[1].age=2;const kx=Math.floor(K.x),ky=Math.floor(K.y),R=6;
 for(let y=ky-R;y<=ky+R;y++)for(let x=kx-R;x<=kx+R;x++){if(Math.max(Math.abs(x-kx),Math.abs(y-ky))!==R||x<0||y<0||x>=M||y>=M)continue;const i=y*M+x;if(vm.runInContext('bgrid',c)[i])continue;vm.runInContext('tiles',c)[i]=0;G.resT[i]=0;const b=A.spawnBld('wall',x,y,0,true);b.hp=b.maxhp=1e7;}
 for(const u of G.units)if(u.owner===0&&Math.max(Math.abs(u.x-kx),Math.abs(u.y-ky))>R-1)u.dead=true;
 const foes=[];for(let i=0;i<12;i++){G.players[1].age=i<8?0:2;foes.push(A.spawnUnit('knight',kx+R+4+(i%4)*.7,ky-2+(i/4|0)*.9,1));}G.players[1].age=2;
 A.applyCmd(1,{t:'move',am:true,ids:foes.map(u=>u.id),x:K.x,y:K.y});const prev=new Map();let enter=0,inside=0;
 for(let s2=0;s2<30*40;s2++){A.sim(A.STEP);for(const u of foes){if(u.dead)continue;const tx=Math.floor(u.x),ty=Math.floor(u.y),k=ty*M+tx,p=prev.get(u.id);
   if(p!=null&&p!==k&&!A.passable(tx,ty,1)&&A.passable(p%M,(p/M)|0,1))enter++;prev.set(u.id,k);if(Math.max(Math.abs(tx-kx),Math.abs(ty-ky))<R)inside++;}}
 ok(enter===0&&inside===0,`12 enemy knights/Tanks attack-moving on a walled Keep never enter or cross the wall ring (entries ${enter}, ticks inside ${inside})`);
 const onWall=foes.filter(u=>!u.dead&&u.target&&u.target.type==='wall').length;ok(onWall>=6,`... and instead of milling about they attack the wall in their way (${onWall}/12 targeting a wall)`);}
{// a peasant sealed into a 1-tile pocket by trees and its own building squeezes out (soft blockers only), but never through walls
 A.setupGame(4242,[{human:true}],'normal',false,'medium');const G=A.get(),M=G.MAP,cx=M/2|0;const T=vm.runInContext('tiles',c);
 for(let y=cx-6;y<=cx+6;y++)for(let x=cx-6;x<=cx+12;x++){T[y*M+x]=0;G.resT[y*M+x]=0;}
 for(let y=cx-1;y<=cx+1;y++)for(let x=cx-1;x<=cx+1;x++)if((x!==cx||y!==cx)&&!(x===cx+1&&y>=cx)){G.resT[y*M+x]=A.RT.wood;G.resA[y*M+x]=100;}
 const h=A.spawnBld('house',cx+1,cx,0,true);vm.runInContext('passGen++',c);
 const u=A.spawnUnit('peasant',cx+.5,cx+.5,0);u.state='idle';A.applyCmd(0,{t:'move',ids:[u.id],x:cx-5.5,y:cx+.5});run(6);
 ok(u.x<cx-1,`a peasant boxed in by trees and its own new house walks out (x ${(u.x-cx).toFixed(1)} rel.)`);
 const pocket2=()=>{A.setupGame(4242,[{human:true}],'normal',false,'medium');const G=A.get(),M=G.MAP,cx=M/2|0;const T=vm.runInContext('tiles',c);
  for(let y=cx-6;y<=cx+6;y++)for(let x=cx-6;x<=cx+6;x++){T[y*M+x]=0;G.resT[y*M+x]=0;}
  for(let y=cx-1;y<=cx+1;y++)for(let x=cx-1;x<=cx+1;x++)if(x!==cx||y!==cx)A.spawnBld('wall',x,y,1,true);
  const u=A.spawnUnit('knight',cx+.5,cx+.5,0);u.state='idle';A.applyCmd(0,{t:'move',ids:[u.id],x:cx-5.5,y:cx+.5});run(6);return Math.floor(u.x)===cx&&Math.floor(u.y)===cx;};
 ok(pocket2(),'a knight boxed in by enemy walls stays inside (no squeezing through walls)');}
console.log('--- AI expansion: kingdoms keep spreading outward (v1.4.4)');
{vm.runInContext('globalThis.__rnd=Math.random;{let s='+(+process.env.EXPSEED||1)+';Math.random=()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);}',c);   // seeded: reproducible AI choices
 A.setupGame(7919,[{human:false,name:'T'}],'normal',true,'medium');const g=A.get();const DROPS=['lumber','quarry','mine','fortress'];const rows={};
 for(const m of [10,20,30]){while(A.get().time<m*60)A.sim(A.STEP);const G=A.get();const alive=G.players.filter(p=>p.keep&&!p.keep.dead&&!p.surrendered);
  const st=alive.map(p=>{const k=p.keep,bs=G.blds.filter(b=>!b.dead&&b.owner===p.id&&!A.BLD[b.type].wall&&b.type!=='keep');const sites=[];
   for(const b of bs)if(DROPS.includes(b.type)&&!sites.some(q=>Math.hypot(q.x-b.x,q.y-b.y)<8))sites.push(b);
   return{max:Math.max(0,...bs.map(b=>Math.hypot(b.x-k.x,b.y-k.y))),sites:sites.length};});
  const avg=f=>st.reduce((a,x)=>a+x[f],0)/Math.max(1,st.length);rows[m]={max:avg('max'),best:Math.max(...st.map(x=>x.max)),sites:avg('sites'),n:st.length};
  console.log(`  t=${m} min: ${st.length} AIs, avg max building distance from Keep ${rows[m].max.toFixed(1)} (best ${rows[m].best.toFixed(1)}), avg distinct drop-off sites ${rows[m].sites.toFixed(1)}`);}
 vm.runInContext('Math.random=globalThis.__rnd;',c);
 // v1.4.3 on this setup: avg max distance ~12-13 tiles at 10, 20 and 30 min (never past 15), 2-3 drop-off sites
 ok(rows[10].max>=15,`10 min: AIs already build past the old 15-tile limit (avg max ${rows[10].max.toFixed(1)})`);
 ok(rows[20].max>=18&&rows[30].max>=20&&rows[30].best>=26,`20/30 min: expansion keeps growing (avg max ${rows[20].max.toFixed(1)} -> ${rows[30].max.toFixed(1)}, best ${rows[30].best.toFixed(1)})`);
 ok(rows[30].max>=rows[10].max+3,'reach at 30 min is clearly beyond reach at 10 min');
 ok(rows[20].sites>=4&&rows[30].sites>=4.5,`drop-off outposts at several distinct sites (avg ${rows[20].sites.toFixed(1)} at 20 min, ${rows[30].sites.toFixed(1)} at 30 min; was 2-3)`);}
console.log('--- Foot soldiers are weak vs buildings (v1.4.4)');
{const dps=(ut,age)=>{A.setupGame(7373,[{human:true}],'normal',false);const g2=A.get(),P=g2.players[0];P.age=age;const c=g2.MAP/2|0;let s=null;
  for(let r=0;r<20&&!s;r++)for(let dy=-r;dy<=r&&!s;dy++)for(let dx=-r;dx<=r&&!s;dx++)if(!A.canPlace('barracks',c+dx,c+dy,1))s=[c+dx,c+dy];
  const b=A.spawnBld('barracks',s[0],s[1],1,true);b.hp=b.maxhp=1e6;const R=A.US(ut,0).range;const u=A.spawnUnit(ut,b.x,b.y-1.5-Math.max(.4,R-.6),0);u.state='hold';
  A.applyCmd(0,{t:'attack',ids:[u.id],tid:b.id});for(let i=0;i<30*4;i++)A.sim(A.STEP);const h0=b.hp;for(let i=0;i<30*33;i++)A.sim(A.STEP);return (h0-b.hp)/33;};
 const sp=dps('spearman',0),inf=dps('spearman',2),ar=dps('archer',0),mg=dps('archer',2),kn=dps('knight',0);
 ok(sp>1&&sp<1.9,`Spearman vs a finished building ~1.3 dps measured (x0.25; v1.4.3 measured 2.8): ${sp.toFixed(2)}`);
 ok(inf>1.8&&inf<3,`Modern Infantry bullets vs a finished building ~2.4 dps measured (x0.25; v1.4.3 measured 4.7): ${inf.toFixed(2)}`);
 ok(ar>.35&&ar<.8&&mg>.75&&mg<1.3,`archer ~0.5 / Machine Gunner ~1.0 dps vs buildings unchanged: ${ar.toFixed(2)} / ${mg.toFixed(2)}`);
 ok(kn>sp*2&&inf<A.US('knight',0).atk*0.5/1.3,`foot soldiers do far less to buildings than knights (${kn.toFixed(2)} dps)`);}
console.log('--- Tanks fire shells from 8 tiles (v1.4.2)');
{const U=t=>A.AGE_UNITS[t];
 ok(U(2).knight.range===8&&U(2).knight.proj==='tshell'&&U(2).knight.sight>=9,`Modern Age Tank: range 8, shell projectile, sight ${U(2).knight.sight} (>=9)`);
 ok(U(0).knight.range<1&&U(1).knight.range<1&&!U(0).knight.proj&&!U(1).knight.proj&&U(0).knight.sight===8,'Early Age and Middle Ages knights stay melee (range 0.8, no projectile, sight 8)');
 ok(close2(U(2).knight.atk,19.5)&&U(2).knight.hp===255&&close2(U(2).knight.speed,2.7*1.2),'Tank keeps its other modern stats (atk 19.5, hp 255, speed x1.2)');}
const tankDuel=(age,cmd,D0=7)=>{A.setupGame(7373,[{human:true}],'normal',false);const g2=A.get(),P=g2.players[0];P.age=age;const c=g2.MAP/2;
 const tk=A.spawnUnit('knight',c,c,0),foe=A.spawnUnit('spearman',c+D0,c,1);foe.hp=foe.maxhp=1e5;foe.state='hold';
 if(cmd==='attack')A.applyCmd(0,{t:'attack',ids:[tk.id],tid:foe.id});else A.applyCmd(0,{t:'move',ids:[tk.id],x:c+D0+9,y:c,am:true});
 const fh=foe.hp,x0=tk.x;let shot=false,minD=1e9;for(let s=0;s<(D0>7?240:120);s++){A.sim(A.STEP);if(A.get().projs.some(p=>p.k==='tshell'&&p.owner===0))shot=true;minD=Math.min(minD,Math.hypot(tk.x-foe.x,tk.y-foe.y));}
 return{shot,dmg:fh-foe.hp,moved:Math.abs(tk.x-x0),minD,snap:A.makeSnap()};};
{const r=tankDuel(2,'attack');ok(r.shot&&r.dmg>0&&r.moved<.3,`Tank shells a target 7 tiles away without closing in (${r.dmg.toFixed(0)} damage in 4 s, moved ${r.moved.toFixed(2)})`);
 const r2=tankDuel(2,'amove',14);ok(r2.shot&&r2.dmg>0&&r2.minD>7,`attack-moving Tank from 14 tiles away stops and fires from range (closest ${r2.minD.toFixed(1)} tiles, ${r2.dmg.toFixed(0)} damage)`);
 const r1=tankDuel(1,'attack');ok(!r1.shot&&r1.minD<1.6&&r1.dmg>0,`Middle Ages knight still charges into melee (closest ${r1.minD.toFixed(1)} tiles, no shells)`);
 const r0=tankDuel(0,'attack');ok(!r0.shot&&r0.minD<1.6,'Early Age knight is melee too');}
{A.setupGame(7474,[{human:true}],'normal',false);const g2=A.get(),P=g2.players[0];P.age=2;const c=g2.MAP/2;const tk=A.spawnUnit('knight',c,c,0),foe=A.spawnUnit('spearman',c+5,c,1);foe.hp=foe.maxhp=1e5;foe.state='hold';
 A.applyCmd(0,{t:'attack',ids:[tk.id],tid:foe.id});let sn=null;for(let s=0;s<60&&!sn;s++){A.sim(A.STEP);if(A.get().projs.some(p=>p.k==="tshell"))sn=A.makeSnap();}
 ok(sn&&sn.J.some(j=>j[0]===4),'tank shells travel in the multiplayer snapshot (projectile kind 4)');}
{const dmgTo=(atk,def,age)=>{A.setupGame(7575,[{human:true}],'normal',false);const g2=A.get();g2.players[0].age=age;const c=g2.MAP/2;const tk=A.spawnUnit(atk,c,c,0),v=A.spawnUnit(def,c+(age===2?6:.9),c,1);v.hp=v.maxhp=1e5;v.state='hold';
  A.applyCmd(0,{t:'attack',ids:[tk.id],tid:v.id});for(let s=0;s<180;s++)A.sim(A.STEP);return 1e5-v.hp;};
 const vA=dmgTo('knight','archer',2),vS=dmgTo('knight','spearman',2),vC=dmgTo('knight','catapult',2);
 ok(vA>vS*1.4&&vC>vS*1.2,`Tank still crushes ranged units and siege (6 s: archer ${vA.toFixed(0)}, catapult ${vC.toFixed(0)}, spearman ${vS.toFixed(0)})`);}
console.log('--- nuclear bomb');
{A.setupGame(5151,[{human:true}],'normal',true);g=A.get();const P=g.players[0],K=P.keep;P.age=2;
 const L=A.spawnBld('lab',K.tx+8,K.ty-2,0,true);P.res=RICH(9999);A.applyCmd(0,{t:'buildnuke',bid:L.id});ok(!L.nukeQ,'cannot build a nuke with 9999 of each');
 P.res=RICH(25000);A.applyCmd(0,{t:'buildnuke',bid:L.id});ok(L.nukeQ&&same(P.res,RICH(15000)),'building a nuke costs 10000 of each');ok(same(A.NUKE.cost,RICH(10000))&&A.NUKE.radius===30,'nuke: 10000 of each, 30-tile radius');
 A.applyCmd(0,{t:'nuke',bid:L.id,x:50,y:50});ok(A.get().nukeFx.length===0,'cannot launch before the bomb is finished');
 L.nukeT=A.NUKE.time-.05;run(.2);ok(P.nukes===1&&!L.nukeQ,'bomb finished: 1 in stock');ok(same(P.res,RICH(15000)),'launching costs nothing extra');
 const E=g.players[1].keep;const tx=E.x,ty=E.y;   // enemy Keep (hidden by fog) at ground zero
 const dir=(K.x<tx)?-1:1;const put=(t,d,o)=>A.spawnUnit(t,tx+dir*d,ty,o);
 const inside=[put('knight',29,1),put('archer',29.5,0),put('peasant',10,2),put('catapult',0.5,1)],outside=[put('knight',31,3),put('archer',30.6,0),put('spearman',33,2)];for(const u of inside.concat(outside)){u.hp=u.maxhp=1e6;u.state='hold';}
 const tIn=A.spawnBld('tower',Math.floor(tx+dir*28.4),Math.floor(ty),2,true),tOut=A.spawnBld('tower',Math.floor(tx+dir*31.6),Math.floor(ty)+1,0,true);
 const others=A.get().blds.filter(b=>b.owner===1&&!b.dead);const r0=JSON.stringify(P.res);
 A.applyCmd(0,{t:'nuke',bid:L.id,x:tx,y:ty});const F=A.get().nukeFx[0];ok(F&&P.nukes===0,'launch: bomb in flight, stock 0 (fog ignored: target is not visible)');
 ok(!E.dead&&inside.every(u=>!u.dead),'nothing is destroyed while it flies');run(F.dur+.3);
 ok(inside.every(u=>u.dead),'all units within 30 tiles are destroyed (enemy, own, every owner)');
 ok(outside.every(u=>!u.dead),'units beyond 30 tiles survive '+outside.map(u=>u.type+(u.dead?' dead ':' ok ')+Math.hypot(u.x-tx,u.y-ty).toFixed(1)).join(','));
 ok(tIn.dead&&!tOut.dead,'buildings within 30 tiles are destroyed, beyond 30 spared');
 ok(E.dead&&g.players[1].surrendered,'the enemy Keep at ground zero is destroyed -> that kingdom is defeated');
 const left=A.get().units.concat(A.get().blds).filter(e=>!e.dead&&Math.hypot(e.x-tx,e.y-ty)<29);ok(left.length===0,'nothing left standing inside the blast');
 A.applyCmd(0,{t:'nuke',bid:L.id,x:20,y:20});ok(A.get().nukeFx.filter(f=>f.boomT<0).length===0,'no second launch without another bomb');
 // own keep in range -> own defeat
 A.setupGame(5252,[{human:true}],'normal',false);g=A.get();const Q=g.players[0];Q.age=2;Q.nukes=1;const L2=A.spawnBld('lab',Q.keep.tx+8,Q.keep.ty,0,true);
 A.applyCmd(0,{t:'nuke',bid:L2.id,x:Q.keep.x+5,y:Q.keep.y});run(A.get().nukeFx[0].dur+.3);ok(Q.keep.dead&&L2.dead&&Q.surrendered,'nuking your own base destroys your Keep and Lab: normal defeat rules');
 // AI never launches
 A.setupGame(5353,[{human:true}],'normal',false);g=A.get();for(const p of g.players){p.age=2;p.nukes=3;A.spawnBld('lab',p.keep.tx+(p.keep.tx<40?6:-6),p.keep.ty,p.id,true);}run(30);
 ok(A.get().nukeFx.length===0&&g.players.slice(1).every(p=>p.nukes===3),'AI kingdoms never launch nukes');}

console.log('--- AI and the ages (hard, ample resources): Middle Ages, Modern Age, siege in attacks, satellites, never nukes');
{vm.runInContext('globalThis.__rnd=Math.random;{let s='+(+process.env.AISEED||3)+';Math.random=()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);}',c);   // AI choices use Math.random: seed it here so this scenario is reproducible
 A.setupGame(31337,[{human:true}],'hard',true,'small');const g=A.get();const AIs=g.players.filter(p=>p.isAI);for(const p of AIs)for(const r of ['food','wood','stone','gold'])p.res[r]+=60000;
 const ageAt={},seen={trebuchet:0,ram:0},siegeHit=new Set(),hitTypes=new Set(),behind=[0,0];let esc=0,nukeEver=false,maxMult=0,modernSeen=new Set();
 for(let s=0;s<30*60*13;s++){A.sim(A.STEP);if(s%15)continue;const G=A.get();
  for(const p of AIs){if(!ageAt[p.id+':'+p.age])ageAt[p.id+':'+p.age]=G.time|0;if(p.nukes>0)nukeEver=true;}
  if(G.nukeFx.some(f=>!f.sat)||G.blds.some(b=>b.nukeQ))nukeEver=true;
  for(const u of G.units){if(u.dead||!G.players[u.owner].isAI)continue;
   if(u.type==='trebuchet'||u.type==='ram'){seen[u.type]=Math.max(seen[u.type],1);
    if(u.aiMission!=null&&u.state==='attack'&&u.target&&u.target.kind==='bld'&&!u.target.dead){siegeHit.add(u.id);hitTypes.add(u.type+'>'+u.target.type);
     if(u.type==='trebuchet'){behind[1]++;const dT=Math.hypot(u.x-u.target.x,u.y-u.target.y);behind[2]=(behind[2]||0)+dT;   // fires from range, and not with enemy fighters on top of it
      if(G.units.some(v=>!v.dead&&v.owner!==u.owner&&v.type!=='peasant'&&A.UNITS[v.type].cls!=='siege'&&Math.hypot(v.x-u.x,v.y-u.y)<2.5))behind[0]++;}}}
   if(u.escort!=null)esc++;if(G.players[u.owner].age===2&&['archer','knight','spearman'].includes(u.type))modernSeen.add(A.US(u.type,u.owner).name);}}
 const ages=AIs.map(p=>`${p.short}: Middle ${ageAt[p.id+':1']??'-'} s, Modern ${ageAt[p.id+':2']??'-'} s`).join('; ');
 ok(AIs.every(p=>p.age>=1||p.surrendered)&&AIs.filter(p=>!p.surrendered).every(p=>ageAt[p.id+':1']<600),'every AI builds a University and reaches the Middle Ages ('+ages+')');
 ok(AIs.filter(p=>p.age===2).length>=2,`AIs build the Research Lab and reach the Modern Age (${AIs.filter(p=>p.age===2).length}/3)`);
 ok(AIs.every(p=>!(p.id+':1' in ageAt)||!(p.id+':2' in ageAt)||ageAt[p.id+':2']>ageAt[p.id+':1']),'Modern Age always after the Middle Ages');
 ok(seen.trebuchet&&seen.ram,'AIs train trebuchets and siege rams in the Middle Ages');
 ok(siegeHit.size>=2&&[...hitTypes].some(h=>h.startsWith('ram>'))&&[...hitTypes].some(h=>h.startsWith('trebuchet>')),'AI trebuchets and rams on attack missions batter enemy buildings: '+[...hitTypes].join(', '));
 ok(esc>0,'rams get escorts on the march');
 ok(behind[1]===0||(behind[2]/behind[1]>=6&&behind[0]/behind[1]<=.25),`trebuchets stay back: they fire from ${behind[1]?(behind[2]/behind[1]).toFixed(1):'-'} tiles on average and have enemy fighters within 2.5 tiles in ${behind[0]}/${behind[1]} samples`);
 ok(modernSeen.size>=1,'Modern Age AI armies field modern units: '+[...modernSeen].join(', '));
 ok(AIs.some(p=>p.sat===1),'a Modern Age AI with spare resources launches a satellite');
 ok(!nukeEver&&AIs.every(p=>!p.nukes),'AIs never build or launch a nuclear bomb');
 vm.runInContext('Math.random=globalThis.__rnd;',c);}
console.log(fails?fails+' FAILURES':'ALL RULES TESTS PASSED');process.exit(fails?1:0);
