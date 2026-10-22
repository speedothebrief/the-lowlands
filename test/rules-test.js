// Rules test of the shared simulation (headless, no browser): gather claim slots, Keep/Fortress fire rate,
// peasant construction/repair, free placement (no territory), builder auto-start (farm/lumber/quarry/mine),
// stuck-peasant watchdog + soak, garrisons + Town Bell, AI garrisoning, map sizes, doubled resource nodes.
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('/*SIM-BEGIN*/'),html.indexOf('/*SIM-END*/'));
const c=vm.createContext({console});
vm.runInContext(src+';globalThis.API={POP_MAX,fortBldTarget,updateVisFor,setupGame,sim,applyCmd,nearestRes,spawnUnit,spawnBld,killEnt,makeSnap,canPlace,repairCost,RT,BLD,UNITS,STEP,RES_AMT,get:()=>({units,blds,players,claim,resT,resA,projs,MAP,STARTS,time})};',c);
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
   const L=last.get(v.id);if(!L||L.k!==key||v.working&&v.state==='gather')last.set(v.id,{k:key,t});else if(t-L.t>10){bad++;worst=Math.max(worst,t-L.t);L.t=t;if(process.env.DBG)console.log('  stuck',sz,t.toFixed(0),v.id,v.owner,v.state,v.x.toFixed(2),v.y.toFixed(2),'carry',v.carry,'job',JSON.stringify(v.job&&{tx:v.job.tx,ty:v.job.ty,rt:v.job.rt,farm:!!v.job.farm}),'bld',v.bld&&v.bld.type,v.bld&&v.bld.built,v.bld&&v.bld.hp|0,'bc',v.bld&&v.bld.bc,'working',v.working,'moving',v.moving,'unstuck',v.unstuck,'drop',v.dropB&&v.dropB.type);}}}
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
 const h0={W:W.hp,T:T.hp};run(8);const dT=h0.T-T.hp;ok(dT>150&&dT<260,`no enemy units in range: Fortress damages the tower (${dT.toFixed(0)} in 8 s, ~25/s)`);
 T.dead=true;const s0=S.hp,w0=W.hp;run(6);
 ok(s0-S.hp>150&&W.hp===w0,`then the nearest building: an unfinished site, at 1.5x (${(s0-S.hp).toFixed(0)} in 6 s; farther wall untouched)`);
 S.dead=true;const w1=W.hp;run(6);ok(w1-W.hp>80,`walls are shot too (${(w1-W.hp).toFixed(0)} in 6 s)`);
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
 T.dead=true;F.dead=true;V=A.updateVisFor(0);ok(at(tx+3,ty)===1,'after it is gone the area is remembered (explored), not live');
 const S=A.spawnBld('house',tx-20,ty+4,0,false);const pz=A.spawnUnit('peasant',tx-21,ty+4.5,0);V=A.updateVisFor(0);
 ok(at(tx-26,ty+4)===2&&at(tx-21+7,ty+4)===0,'a peasant building a site still sees with its own sight (6), the site adds nothing');}

console.log('--- map sizes');
for(const [sz,M] of [['small',96],['medium',144],['large',192]]){A.setupGame(77,[{human:true}],'normal',true,sz);g=A.get();
 let trees=0,gold=0;for(let i=0;i<g.resT.length;i++){if(g.resT[i]===1)trees++;if(g.resT[i]===3)gold++;}
 const ks=g.players.map(p=>p.keep);const spread=Math.hypot(ks[0].x-ks[1].x,ks[0].y-ks[1].y);
 ok(g.MAP===M&&g.resT.length===M*M,`${sz}: ${M}x${M} map, keeps ${spread.toFixed(0)} tiles apart, ${trees} trees, ${gold} gold tiles`);
 run(20);ok(A.get().players.every(p=>!p.surrendered),`${sz}: sim runs`);}
console.log(fails?fails+' FAILURES':'ALL RULES TESTS PASSED');process.exit(fails?1:0);
