// ===== AI =====
function initAI(p){const P=PERS[p.pers],Df=DIFF[difficulty];
 p.inc={food:0,wood:0,stone:0,gold:0};p.ai={bank:null,tick:Math.random(),nextWave:P.firstAttack*Df.tm,waveSize:Math.max(3,Math.round(P.wave*Df.wm)),ring:null,ringSet:null,ringIdx:0,saveFor:null,lastWarn:-99};
 if(P.walls){const k=p.keep;const cx=Math.floor(k.x),cy=Math.floor(k.y),R=MAP>100?15:12;const ring=[];const set=new Set();   // v1.4.4: a roomier ring (was 10) with a gate every 6 tiles, so the town can grow inside and spill out through many gates
  const add=(x,y,g)=>{if(!inb(x,y))return;const i=y*MAP+x;if(set.has(i))return;set.add(i);ring.push({x,y,g});};
  for(let x=cx-R;x<=cx+R;x++){add(x,cy-R,(x-cx)%6===0);add(x,cy+R,(x-cx)%6===0);}
  for(let y=cy-R+1;y<cy+R;y++){add(cx-R,y,(y-cy)%6===0);add(cx+R,y,(y-cy)%6===0);}
  ring.sort((a,b)=>(b.g?1:0)-(a.g?1:0));p.ai.ring=ring;p.ai.ringSet=set;}}
// the AI's own spending check: an optional reserve (80% of a cost it is saving for) plus its age-building savings (p.ai.bank) stay untouched
function affordRes(p,c,reserve){const bk=p.ai&&p.ai.bank;for(const r of RES){const need=(c[r]||0)+(reserve?(reserve[r]||0)*.8:0)+(bk?bk[r]||0:0);if(p.res[r]<need)return false;}return true;}
// placement is no longer limited by territory: the AI keeps its own buildings away from enemy bases
// ===== expansion (v1.4.4): the AI's reach grows with game time, population and exhausted resources; drop-offs become outposts
// at fresh resource patches further out, houses/farms/towers spread around the outposts and Fortresses, and big buildings move
// out once the core is full. Everything stays well away from enemy bases.
const EXP_D={easy:.7,normal:1,hard:1.25},EXP_P={aggressive:.9,builder:1.25,defensive:.85};
const expF=p=>(EXP_D[difficulty]||1)*(EXP_P[p.pers]||1);
function aiReach(p){return clamp(14+(time/60)*.8*expF(p)+p.pop*.06*expF(p)+(p.ai.dry||0)*3,14,Math.max(20,MAP*(MAP<120?.25:.33)));}
const DROP_OF={wood:'lumber',stone:'quarry',gold:'mine'};
// enemy bases: never within 14 of an enemy building, and always clearly closer to our own Keep than to any enemy Keep
function aiSafeCtx(p){const eb=[],ek=[];for(const b of blds){if(b.dead||!isEnemy(p.id,b.owner)||BLD[b.type].wall)continue;eb.push(b);if(b.type==='keep')ek.push(b);}return{eb,ek,k:p.keep};}
function aiSafe2(S,x,y){for(const b of S.eb)if(Math.abs(b.x-x)<14&&Math.abs(b.y-y)<14&&dist(x,y,b.x,b.y)<14)return false;const dk=dist(x,y,S.k.x,S.k.y);for(const e of S.ek){const de=dist(x,y,e.x,e.y);if(de<24||de<dk+(MAP<120?9:6))return false;}return true;}
function aiSafe(p,x,y){return aiSafe2(aiSafeCtx(p),x,y);}
// resource tiles of type rt within R of (x,y)
function resNear(rt,x,y,R){const c=RT[rt];let n=0;x=Math.floor(x);y=Math.floor(y);for(let yy=Math.max(0,y-R);yy<=Math.min(MAP-1,y+R);yy++)for(let xx=Math.max(0,x-R);xx<=Math.min(MAP-1,x+R);xx++)if(resT[yy*MAP+xx]===c)n++;return n;}
// drop-offs accepting rt, each with the resource still around it (cached for 8 s)
function aiDrops(p,rt){const A=p.ai;if(!A.cov||time-A.cov.t>8)A.cov={t:time,m:new Map()};const out=[];
 for(const b of blds){if(b.dead||b.owner!==p.id||!b.built)continue;const D=BLD[b.type];if(!D.drop||!D.drop.includes(rt))continue;const key=b.id+rt;let n=A.cov.m.get(key);if(n==null){n=resNear(rt,b.x,b.y,7);A.cov.m.set(key,n);}out.push([b,n]);}
 return out;}
const COV_MIN={wood:14,stone:4,gold:4};
const covered=(p,rt)=>aiDrops(p,rt).some(([b,n])=>n>=COV_MIN[rt]);
// where a gatherer of rt should go: the drop-off with the most resource left per worker already there (outposts get staffed)
function aiGatherSpot(p,rt,u){const ds=aiDrops(p,rt);let best=null,bs=-1e9;
 for(const [b,n] of ds){if(n<1)continue;let w=0;for(const v of units)if(!v.dead&&v.owner===p.id&&v.job&&v.job.rt===rt&&Math.abs(v.job.tx-b.x)<9&&Math.abs(v.job.ty-b.y)<9)w++;
  const s=Math.min(n,rt==='wood'?24:8)/(w+1)-dist(u.x,u.y,b.x,b.y)/40;if(s>bs){bs=s;best=b;}}
 const R=30*mapF()|0;return (best&&nearestRes(RT[rt],best.x,best.y,10,true,u))||nearestRes(RT[rt],u.x,u.y,R,true,u)||nearestRes(RT[rt],p.keep.x,p.keep.y,R,true,u);}
// a site for a new drop-off: the richest uncovered patch of rt within reach, preferring nearer ones
function aiOutpostSpot(p,type,S){const rt=BLD[type].drop[0],c=RT[rt],k=p.keep,R=Math.floor(aiReach(p)),D=BLD[type];
 const mine=blds.filter(b=>!b.dead&&b.owner===p.id&&BLD[b.type].drop&&BLD[b.type].drop.includes(rt));const cands=[];
 const kx=Math.floor(k.x),ky=Math.floor(k.y);
 for(let y=Math.max(1,ky-R);y<=Math.min(MAP-2,ky+R);y+=2)for(let x=Math.max(1,kx-R);x<=Math.min(MAP-2,kx+R);x+=2){if(resT[y*MAP+x]!==c)continue;const dk=dist(x,y,k.x,k.y);if(dk>R)continue;
  if(mine.some(b=>Math.abs(b.x-x)<8&&Math.abs(b.y-y)<8))continue;const rich=resNear(rt,x,y,4);if(rich<(rt==='wood'?8:3))continue;if(!aiSafe2(S,x,y))continue;
  cands.push([dk-Math.min(rich,rt==='wood'?30:12)*.5,x,y]);}
 cands.sort((a,b)=>a[0]-b[0]);
 for(const [,x,y] of cands.slice(0,6))for(let r=1;r<=4;r++){const ring=[];for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++)if(Math.max(Math.abs(xx),Math.abs(yy))===r)ring.push([Math.round(x+.5+xx-D.w/2),Math.round(y+.5+yy-D.h/2)]);
  ring.sort(()=>Math.random()-.5);for(const q of ring)if(!canPlace(type,q[0],q[1],p.id,p.ai)&&aiSafe2(S,q[0]+D.w/2,q[1]+D.h/2))return q;}
 return null;}
// rings r0..r1 around (cx,cy), random order within a ring; then up to n random spots out to the AI's reach (nearest to the centre wins)
function aiRingSpot(p,type,cx,cy,r0,r1,S){const D=BLD[type];
 for(let r=r0;r<=r1;r++){const cands=[];for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){if(Math.max(Math.abs(x),Math.abs(y))!==r)continue;cands.push([Math.round(cx+x-D.w/2),Math.round(cy+y-D.h/2)]);}
  cands.sort(()=>Math.random()-.5);for(const c of cands)if(!canPlace(type,c[0],c[1],p.id,p.ai)&&aiSafe2(S,c[0]+D.w/2,c[1]+D.h/2))return c;}
 return null;}
function aiFarSpot(p,type,S,n){const D=BLD[type],k=p.keep,R=aiReach(p);let best=null,bd=1e9;
 for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,rad=14+Math.random()*(R-14);const tx=Math.round(k.x+Math.cos(a)*rad-D.w/2),ty=Math.round(k.y+Math.sin(a)*rad-D.h/2);
  if(rad>=bd||canPlace(type,tx,ty,p.id,p.ai)||!aiSafe2(S,tx+D.w/2,ty+D.h/2))continue;bd=rad;best=[tx,ty];}
 return best;}
// outposts: own drop-offs (and Fortresses) more than 12 tiles from the Keep
const aiOutposts=p=>blds.filter(b=>!b.dead&&b.owner===p.id&&b.built&&(b.type==='fortress'||DROP_OF[BLD[b.type].drop&&BLD[b.type].drop[0]]===b.type)&&dist(b.x,b.y,p.keep.x,p.keep.y)>12);
function aiFindSpot(p,type){const D=BLD[type];const k=p.keep;const S=aiSafeCtx(p);
 if(D.drop&&type!=='fortress')return aiOutpostSpot(p,type,S)||(blds.some(b=>!b.dead&&b.owner===p.id&&b.type===type)?null:aiRingSpot(p,type,k.x,k.y,3,14,S));
 if(type==='tower'){const op=aiOutposts(p).filter(b=>b.type!=='fortress'&&!blds.some(t=>!t.dead&&t.owner===p.id&&t.type==='tower'&&dist(t.x,t.y,b.x,b.y)<8));
  if(op.length){op.sort((a,b)=>dist(b.x,b.y,k.x,k.y)-dist(a.x,a.y,k.x,k.y));const s=aiRingSpot(p,type,op[0].x,op[0].y,2,5,S);if(s)return s;}
  const a=Math.random()*Math.PI*2;const rad=p.ai.ring?(MAP>100?11:9):rr(5,9);return aiRingSpot(p,type,k.x+Math.cos(a)*rad,k.y+Math.sin(a)*rad,0,5,S);}
 if(type==='fortress'&&blds.some(b=>!b.dead&&b.owner===p.id&&b.type==='fortress')){   // a second Fortress anchors the farthest outpost
  const op=aiOutposts(p).filter(b=>b.type!=='fortress');op.sort((a,b)=>dist(b.x,b.y,k.x,k.y)-dist(a.x,a.y,k.x,k.y));
  for(const b of op.slice(0,3)){const s=aiRingSpot(p,type,b.x,b.y,3,7,S);if(s)return s;}return aiFarSpot(p,type,S,200);}
 if(type==='farm'||type==='house'){// around the Keep, Fortresses and (houses) outposts: the anchor with the fewest of that building nearby first
  const anc=[k,...blds.filter(b=>!b.dead&&b.owner===p.id&&b.built&&b.type==='fortress')];if(type==='house')anc.push(...aiOutposts(p).filter(b=>b.type!=='fortress'));
  const sc=a=>blds.filter(b=>!b.dead&&b.owner===p.id&&b.type===type&&dist(b.x,b.y,a.x,a.y)<9).length+(a===k?0:.5);anc.sort((a,b)=>sc(a)-sc(b));
  for(const a of anc){const s=type==='farm'?aiRingSpot(p,type,a.x,a.y,2,a===k?12:8,S):aiRingSpot(p,type,a.x,a.y,a===k?3:2,a===k?15:7,S);if(s)return s;}
  return aiFarSpot(p,type,S,120);}
 return aiRingSpot(p,type,k.x,k.y,3,15,S)||aiFarSpot(p,type,S,200);}
function attackMove(u,x,y){u.state='move';u.target=null;u.amove={x,y};u.leash=false;u.guard=null;goTo(u,x+rr(-1.5,1.5),y+rr(-1.5,1.5));u.amove={x:u.goal.x,y:u.goal.y};}
function nearestBldOf(pid,x,y){let best=null,bd=1e9;for(const b of blds){if(b.dead||b.owner!==pid)continue;const d=dist(x,y,b.x,b.y)+(BLD[b.type].wall?6:0);if(d<bd){bd=d;best=b;}}return best;}
// ---- AI and the ages
// which age building (or satellite) the AI is working towards: {type, cost, save (hold back spending), place (try to put the site down)}
function aiAgeGoal(p,myB,t){const Df=DIFF[difficulty],f=AGE_F[p.pers]||1,age=p.age||0;
 const has=ty=>myB.some(b=>b.type===ty);
 const go=(T,cost)=>t>T*f||(t>T*f*.4&&afford(p,cost));
 if(age<1&&Df.maxAge>=1){if(has('university'))return null;const c=BLD.university.cost;if(!go(Df.uniT,c))return null;return{type:'university',cost:c,save:true,place:afford(p,c)};}
 if(age<2&&Df.maxAge>=2){if(has('lab'))return null;const c=BLD.lab.cost;if(!go(Df.labT,c))return null;return{type:'lab',cost:c,save:true,place:afford(p,c)};}
 if(age>=2&&Df.sat&&!p.sat){const L=myB.find(b=>b.type==='lab'&&b.built);if(!L||L.satQ)return null;
  if(RES.every(r=>p.res[r]>=SAT.cost[r]+300)){applyCmd(p.id,{t:'buildsat',bid:L.id});p.ai.bank=null;return null;}
  return t>Df.labT*f+240?{type:'sat',cost:SAT.cost,save:true,place:false}:null;}
 return null;}
// gather weights: personality mix; while saving, half of it follows the shortfall of the age building's cost
// savings for the age building / satellite: a share of everything gathered (p.inc) goes into A.bank until the cost is covered.
// Normal spending (affordRes) only sees res - bank, so the army and economy keep going on the rest. Less is put aside while under attack.
// With a Market, surplus of a resource that is already fully saved is sold for gold when gold is what is missing.
function aiBank(p,A,save,t,myB){const inc=p.inc;
 if(!save){A.bank=null;for(const r of RES)inc[r]=0;return;}
 if(!A.bank||A.bankFor!==save){A.bankFor=save;A.bank={};for(const r of RES)A.bank[r]=Math.min(save[r]||0,p.res[r]*.6);}
 const raid=t-(A.raidT||-99)<30||myB.some(b=>t-b.lastHit<10);const fr=raid?.3:(p.age||0)>=1?.6:.75;
 for(const r of RES){const B=A.bank;B[r]=Math.min(save[r]||0,B[r]+inc[r]*fr,p.res[r]);inc[r]=0;}
 const mk=myB.find(b=>b.type==='market'&&b.built);const B=A.bank;
 if(mk&&B.gold<save.gold){for(const r of ['food','wood','stone']){if(B[r]<(save[r]||0))continue;const free=p.res[r]-B[r];const amt=Math.floor(Math.min(free-250,600)/100)*100;
   if(amt>=100){applyCmd(p.id,{t:'trade',bid:mk.id,res:r,dir:'sell',amt});B.gold=Math.min(save.gold,B.gold+amt/TRADE_RATE,p.res.gold);break;}}}}
function aiGatherW(p,P,t,def,defSum){const w={};
 for(const r of RES){w[r]=P.gather[r];if(p.res[r]>900&&!(def&&def[r]>0))w[r]*=.25;if(t<100&&(r==='stone'||r==='gold'))w[r]*=.3;}
 if(defSum>0){for(const r of RES)w[r]=w[r]*.45+.55*def[r]/defSum+(r==='food'?.08:0);}
 return w;}
const unitAgeLocked=(ut,p)=>(UNITS[ut].age||0)>(p.age||0);
// army share of a unit type; trebuchets and rams join once the Middle Ages allow them; shares shrink with the unit's age price growth
function aiCompW(p,P,ut,t,TM){let w=P.comp[ut]||0;const age=p.age||0,sT=t>P.siegeT*TM||age>=1;
 if(ut==='catapult')w=sT?(age>=1?P.siegeW*.3+.01:P.siegeW+.05):0;
 else if(ut==='trebuchet')w=sT?P.siegeW*.4+.03:0;
 else if(ut==='ram')w=sT?P.siegeW*.35+.03:0;
 if(w<=0)return 0;const sum=c=>RES.reduce((s,r)=>s+(c[r]||0),0);return w*Math.sqrt(sum(UNITS[ut].cost)/sum(US(ut,p.id).cost));}
// siege on an attack: rams go for walls/gates/towers/fortresses with an escort, trebuchets and catapults hang back behind the front line
const SIEGE_PRI={tower:4,fortress:4,keep:3,gate:3,wall:2.5,barracks:1.5,stable:1.5,workshop:1.5,lab:2,university:1.5};
function siegeTarget(u,qid,R){let best=null,bs=-1e9;for(const b of blds){if(b.dead||b.owner!==qid)continue;const d=distTo(u,b);if(d>R)continue;
  const pri=SIEGE_PRI[b.type]||1;if(BLD[b.type].wall&&d>10)continue;const s=pri*8-d;if(s>bs){bs=s;best=b;}}return best;}
function aiSiege(p,army,k){const by={};for(const u of army)if(u.aiMission!=null)(by[u.aiMission]=by[u.aiMission]||[]).push(u);
 for(const qid in by){const q=players[qid];if(!q||q.surrendered)continue;const grp=by[qid];const siege=grp.filter(u=>UNITS[u.type].cls==='siege'),inf=grp.filter(u=>UNITS[u.type].cls!=='siege');
  if(!siege.length){for(const u of inf)u.escort=null;continue;}
  const cx=inf.length?inf.reduce((s,u)=>s+u.x,0)/inf.length:k.x,cy=inf.length?inf.reduce((s,u)=>s+u.y,0)/inf.length:k.y;
  // escorts: two per ram (nearest free fighters) stay with it until it is at work
  const taken=new Set();for(const u of inf){if(u.escort!=null){const r=units.find(v=>v.id===u.escort);if(!r||r.dead||r.aiMission==null)u.escort=null;else taken.add(u);}}
  for(const r of siege){if(r.type!=='ram')continue;let have=inf.filter(u=>u.escort===r.id).length;
   while(have<2){let bi=null,bd=1e9;for(const u of inf){if(taken.has(u))continue;const d=dist(u.x,u.y,r.x,r.y);if(d<bd){bd=d;bi=u;}}if(!bi)break;bi.escort=r.id;taken.add(bi);have++;}}
  for(const u of inf){if(u.escort==null)continue;const r=units.find(v=>v.id===u.escort);if(!r)continue;
   if(u.state==='attack'&&u.target&&!u.target.dead&&u.target.kind==='unit')continue;  // already fighting something near the ram
   if(dist(u.x,u.y,r.x,r.y)>3.5||u.state==='idle'){const hx=r.x+(r.target?(r.target.x-r.x):(q.keep.x-r.x))*.08,hy=r.y+(r.target?(r.target.y-r.y):(q.keep.y-r.y))*.08;attackMove(u,hx,hy);}}
  const front=(b)=>inf.reduce((m,u)=>Math.min(m,distTo(u,b)),1e9);
  for(const u of siege){const D=uD(u);
   // too close to enemy fighters: trebuchets/catapults back off towards home (rams just keep going)
   if(u.type!=='ram'){let thr=null;queryUnits(u.x,u.y,4,v=>{if(!thr&&!v.dead&&isEnemy(u.owner,v.owner)&&v.type!=='peasant'&&UNITS[v.type].cls!=='siege'&&dist(u.x,u.y,v.x,v.y)<3.5)thr=v;});
    if(thr){const dx=u.x-thr.x,dy=u.y-thr.y,d=Math.hypot(dx,dy)||1;u.state='move';u.target=null;u.amove=null;goTo(u,clamp(u.x+dx/d*4,1,MAP-2),clamp(u.y+dy/d*4,1,MAP-2));continue;}}
   let b=u.target&&!u.target.dead&&u.target.kind==='bld'&&u.target.owner==qid?u.target:null;
   if(!b)b=siegeTarget(u,+qid,u.type==='ram'?14:D.range+8);
   if(u.type==='ram'){const esc=inf.filter(v=>v.escort===u.id&&dist(v.x,v.y,u.x,u.y)<7).length;
    if(b&&(esc>=1||distTo(u,b)<6||!inf.length)){if(u.target!==b){u.target=b;u.state='attack';u.amove=null;u.path=null;}continue;}
    if(inf.length&&(u.state==='idle'||dist(u.x,u.y,cx,cy)>8)){u.target=null;u.state='move';u.amove=null;goTo(u,cx,cy);}else if(!inf.length&&u.state==='idle')attackMove(u,q.keep.x,q.keep.y);continue;}
   if(b){const d=distTo(u,b);
    // hold at range until the fighters are at least as far forward, so siege never leads the attack
    if(d<=D.range+.1||!inf.length||front(b)<=d+1){if(u.target!==b){u.target=b;u.state='attack';u.amove=null;u.path=null;}}
    else if(u.state!=='idle'){u.state='idle';u.target=null;u.path=null;u.amove=null;}
    continue;}
   if(u.state==='attack'&&u.target&&!u.target.dead)continue;
   // nothing to shoot yet: trail the army, a few tiles behind its centre
   if(inf.length){const bx=q.keep.x-cx,by2=q.keep.y-cy,bl=Math.hypot(bx,by2)||1;const gx=clamp(cx-bx/bl*4,1,MAP-2),gy=clamp(cy-by2/bl*4,1,MAP-2);
    if(dist(u.x,u.y,gx,gy)>4&&(u.state==='idle'||!u.goal||dist(u.goal.x,u.goal.y,gx,gy)>4)){u.state='move';u.target=null;u.amove=null;goTo(u,gx,gy);}}
   else if(u.state==='idle')attackMove(u,q.keep.x,q.keep.y);}}}
function aiThink(p){
 const A=p.ai,P=PERS[p.pers],k=p.keep,Df=DIFF[difficulty],TM=Df.tm;if(p.surrendered||!k||k.dead)return;
 const t=time;const all=units.filter(u=>u.owner===p.id&&!u.dead);const mine=all.filter(u=>!u.inG&&u.state!=='garrison');const nPeas=all.filter(u=>u.type==='peasant').length;const peas=mine.filter(u=>u.type==='peasant');const army=mine.filter(u=>u.type!=='peasant');
 const myB=blds.filter(b=>b.owner===p.id&&!b.dead);const count=ty=>myB.filter(b=>b.type===ty).length;
 // --- peasants
 // --- ages: save up for the University, then the Research Lab (then a satellite); see aiAgeGoal
 const goal=aiAgeGoal(p,myB,t);A.goal=goal?goal.type:null;const save=goal&&goal.save?goal.cost:null;
 const def=save?RES.reduce((o,r)=>(o[r]=Math.max(0,(save[r]||0)-p.res[r]),o),{}):null;const defSum=def?RES.reduce((s,r)=>s+def[r],0):0;
 aiBank(p,A,save,t,myB);
 const peasTarget=Math.min(P.peas+((p.age||0)>=1||save?18:0),6+Math.floor(t/11));const qp=myB.reduce((s,b)=>s+b.queue.filter(q=>q==='peasant').length,0);
 if(nPeas+qp<peasTarget&&k.queue.length<2&&affordRes(p,US('peasant',p.id).cost,null))enqueue(k,'peasant');
 // --- gather assignment
 const cnt={food:0,wood:0,stone:0,gold:0};for(const u of peas){if(u.job)cnt[u.job.farm?'food':u.job.rt]++;}
 for(const u of peas){if(u.state!=='idle')continue;if(u.job){if(u.job.farm||u.job.rt){u.bld=null;if(resumeWork(u))continue;}u.job=null;}
  const w=aiGatherW(p,P,t,def,defSum);
  let br='wood',bs=-1e9;for(const r of RES){const s=w[r]*peas.length-cnt[r];if(s>bs){bs=s;br=r;}}
  if(br==='food'){const f=findFarm(p.id,u.x,u.y);if(f&&assignFarm(u,f)){cnt.food++;continue;}A.needFarm=true;br='wood';}
  const n=aiGatherSpot(p,br,u)||nearestRes(RT.wood,k.x,k.y,30*mapF()|0,true,u);
  if(n&&assignGather(u,n[0],n[1]))cnt[br]++;}
 // rebalance: move workers from a hoarded resource to a starved one
 if(Math.floor(t)%4===0){const need=RES.filter(r=>p.res[r]<150&&P.gather[r]>0.05).sort((a,b)=>p.res[a]-p.res[b]);const rich=RES.filter(r=>p.res[r]>400&&cnt[r]>1).sort((a,b)=>p.res[b]-p.res[a]);
  if(need.length&&rich.length){const nr=need[0],rr2=rich[0];const g=peas.find(u=>u.state!=='build'&&u.job&&(u.job.farm?'food':u.job.rt)===rr2);
   if(g){if(nr==='food'){const f=findFarm(p.id,k.x,k.y);if(f){g.job=null;assignFarm(g,f);}else A.needFarm=true;}else{const n=aiGatherSpot(p,nr,g);if(n){assignGather(g,n[0],n[1]);}}}}}
 // saving for an age building: every 3 s move one worker from a resource that is already covered (or least short) to the most-needed one
 if(defSum>0&&Math.floor(t)%3===0){const tot=Math.max(1,peas.length);let nr=null,ns=-1e9;for(const r of RES){if(def[r]<=0)continue;const s=def[r]/defSum-cnt[r]/tot;if(s>ns){ns=s;nr=r;}}
  let rr2=null,rs=-1e9;for(const r of RES){if(r===nr||cnt[r]<2)continue;const s=cnt[r]/tot-def[r]/defSum-(r==='food'&&p.res.food<300?1:0);if(s>rs){rs=s;rr2=r;}}
  if(nr&&rr2&&ns>.05&&rs>0){const g=peas.find(u=>u.state!=='build'&&u.job&&(u.job.farm?'food':u.job.rt)===rr2);
   if(g){if(nr==='food'){const f=findFarm(p.id,k.x,k.y);if(f){g.job=null;assignFarm(g,f);}else A.needFarm=true;}else{const n=aiGatherSpot(p,nr,g);if(n)assignGather(g,n[0],n[1]);}}}}
 // rebalance: shift one wood gatherer to food if starving
 if(t%10<1&&p.res.food<60&&cnt.food<peas.length*.25){const f=findFarm(p.id,k.x,k.y);const g=peas.find(u=>u.state!=='build'&&u.job&&u.job.rt==='wood');if(f&&g)assignFarm(g,f);}
 // --- buildings
 let under=myB.filter(b=>!b.built&&!BLD[b.type].wall).length;const want=[];
 if(p.popCap<POP_MAX&&p.pop>=p.popCap-4&&!myB.some(b=>b.type==='house'&&!b.built))want.push('house');
 const farms=count('farm');if((A.needFarm||farms*2<Math.ceil(peas.length*P.gather.food))&&farms<14+6*count('fortress'))want.push('farm');
 if(count('lumber')<1&&t>12)want.push('lumber');
 // expansion (v1.4.4; cheap, so ahead of the big buildings): a new drop-off outpost when the patches around the existing ones run thin, plus steady growth over time
 if(t-(A.covT||-99)>10){A.covT=t;A.need={};let dry=0;for(const r of ['wood','stone','gold']){A.need[r]=!covered(p,r);for(const [b,n] of aiDrops(p,r))if(b.type===DROP_OF[r]&&n<COV_MIN[r])dry++;}A.dry=Math.min(6,dry);
  A.opN=aiOutposts(p).length;A.opBare=aiOutposts(p).filter(b=>b.type!=='fortress'&&!myB.some(q=>q.type==='tower'&&dist(q.x,q.y,b.x,b.y)<8)).length;}
 const ef=expF(p),NE=A.need||{};
 if(count('lumber')<Math.min(8,1+Math.floor((t+190)*ef/450))||(NE.wood&&t>120&&count('lumber')<10))want.push('lumber');
 if(t>420&&(count('mine')<Math.min(6,2+Math.floor((t-420)*ef/540))||(NE.gold&&count('mine')<8)))want.push('mine');
 if(t>300&&(count('quarry')<Math.min(5,1+Math.floor(t*ef/660))||(NE.stone&&count('quarry')<6)))want.push('quarry');

 if(count('mine')<1&&t>70)want.push('mine');
 if(count('quarry')<1&&t>(P.walls?60:130))want.push('quarry');
 if(count('barracks')<1&&t>P.barracksT*TM)want.push('barracks');
 if(count('barracks')<2&&t>P.barracks2T*TM)want.push('barracks');
 if(count('stable')<1&&t>P.stableT*TM)want.push('stable');
 if(count('workshop')<1&&t>P.workshopT*TM)want.push('workshop');
 if(count('market')<P.markets&&t>200+count('market')*220)want.push('market');
 if(count('tower')<P.towers&&t>170+count('tower')*55)want.push('tower');
 if(count('fortress')<1&&t>P.fortressT*TM)want.push('fortress');
 if(count('lumber')<2&&t>260)want.push('lumber');
 if(count('mine')<2&&t>420)want.push('mine');
 if(t>480&&A.opBare>0&&count('tower')<P.towers+4)want.push('tower');
 if(count('fortress')===1&&P.fortressT<9999&&t>Math.max(1200,P.fortressT*TM+600)&&(A.opN||0)>=2)want.push('fortress');
 if((p.age||0)>=1&&count('workshop')<1)want.push('workshop');
 if(save){if(count('market')<1)want.push('market');if(count('mine')<3&&def.gold>0)want.push('mine');if(count('quarry')<2&&def.stone>0)want.push('quarry');}
 if(goal&&goal.place&&!myB.some(b=>b.type===goal.type))want.unshift(goal.type);
 A.saveFor=null;A.needFarm=false;
 for(const ty of [...new Set(want)]){if(under>=2&&ty!=='house'&&!BLD[ty].ageUp)break;
  if(BLD[ty].ageUp?afford(p,BLD[ty].cost):affordRes(p,BLD[ty].cost,null)){const s=aiFindSpot(p,ty);if(s&&placeBuilding(ty,s[0],s[1],p.id)){under++;if(BLD[ty].ageUp)A.bank=null;}}
  else{A.saveFor=BLD[ty].cost;break;}}
 if(A.ring&&t>150&&p.res.stone>60&&!(def&&def.stone>0)&&myB.filter(b=>!b.built&&BLD[b.type].wall).length<6){let placed=0;for(let tries=0;tries<A.ring.length&&placed<4;tries++){const c=A.ring[A.ringIdx%A.ring.length];A.ringIdx++;const i=c.y*MAP+c.x;if(bgrid[i]||tiles[i]||resT[i])continue;const ty=c.g?'gate':'wall';if(!affordRes(p,BLD[ty].cost,null))break;if(placeBuilding(ty,c.x,c.y,p.id))placed++;}}
 // --- builders: every construction site / damaged building gets peasants (walls 1, others up to 2-3)
 {// sites builders repeatedly failed to reach (no passable approach tile) are cancelled and refunded
  for(const b of myB)if(!b.built&&!b.dead&&(b.unreach||0)>=3&&b.prog<0.05){refund(p,BLD[b.type].cost);b.cancelled=true;killEnt(b,-1);}
  const sites=myB.filter(b=>!b.dead&&(!b.built||(b.hp<b.maxhp*.7&&t-b.lastHit>6&&!BLD[b.type].wall&&t-(b.noFundsT||-99)>15)));if(sites.length){const busy=peas.filter(u=>u.state==='build').length;let cap=Math.max(2,Math.ceil(peas.length*.2))-busy;let wallB=peas.filter(u=>u.state==='build'&&u.bld&&BLD[u.bld.type].wall).length;
  const free=peas.filter(u=>u.state!=='build'&&(u.state==='idle'||u.carry===0)&&!(u.state==='farm'&&u.job&&time-(u.job.t||0)<20));// fresh farmers (e.g. a farm's own builders) stay on their farmsites.sort((a,b)=>(BLD[a.type].wall?1:0)-(BLD[b.type].wall?1:0)||(b.type==='house'?1:0)-(a.type==='house'?1:0));
  for(const s of sites){if(cap<=0||!free.length)break;const want=BLD[s.type].wall?1:s.built?2:BLD[s.type].ageUp?5:(BLD[s.type].time>30?3:2);let have=buildersOf(s);
   if(BLD[s.type].wall&&wallB>=2)continue;
   while(have<want&&cap>0&&free.length){let bi=0,bs=1e9;free.forEach((u,i)=>{const sc=dist(u.x,u.y,s.x,s.y)-(u.state==='idle'?15:0)+(u.badBld===s&&t-u.badBldT<30?1e6:0);if(sc<bs){bs=sc;bi=i;}});if(bs>=5e5)break;const u=free.splice(bi,1)[0];if(assignBuild(u,s)){have++;cap--;if(BLD[s.type].wall)wallB++;}}}}}
 // --- military
 const maxArmy=Math.round(P.maxArmy*(0.8+0.2*Df.mult));
 // while saving for an age building the army is capped at ~70% (90% when attacked); the savings themselves are in A.bank
 const recentRaid=t-(A.raidT||-99)<30||myB.some(b=>t-b.lastHit<10);const saveArmy=Math.round(maxArmy*(recentRaid?.9:.7));
 const armyCap=save?Math.min(maxArmy,saveArmy):maxArmy;
 if(army.length<armyCap){const tc={};for(const u of army)tc[u.type]=(tc[u.type]||0)+1;for(const b of myB)for(const q of b.queue)tc[q]=(tc[q]||0)+1;
  const tot=army.length+1;let reserve=save?null:A.saveFor;
  // from the Middle Ages on, a few trebuchets/rams come first: the Workshop picks before the other buildings, and if it cannot pay yet
  // the others leave that much untouched for it
  const nSiege=['trebuchet','ram'].reduce((s,ut)=>s+(tc[ut]||0),0),wantSiege=(p.age||0)>=1&&nSiege<2+(p.age||0);
  const order=myB.filter(b=>b.built&&BLD[b.type].train&&b.type!=='keep').sort((a,b)=>(b.type==='workshop'&&wantSiege?1:0)-(a.type==='workshop'&&wantSiege?1:0));
  for(const b of order){const D=BLD[b.type];if(b.queue.length>=2)continue;
   // candidates by how far each type is below its share; each share is scaled by how much the type's price has grown with the ages
   // (base cost / current cost, square root), and the best one we can actually pay for right now is trained
   const cands=[];for(const ut of D.train){if(ut==='peasant'||unitAgeLocked(ut,p))continue;const w=aiCompW(p,P,ut,t,TM);if(w<=0)continue;cands.push([w*tot-(tc[ut]||0),ut]);}
   cands.sort((a,b)=>b[0]-a[0]);
   if(b.type==='workshop'&&wantSiege){const ut=(tc.ram||0)<(tc.trebuchet||0)?'ram':'trebuchet';const c=US(ut,p.id).cost;
    if(affordRes(p,c,reserve)){enqueue(b,ut);tc[ut]=(tc[ut]||0)+1;}else if(!reserve)reserve=c;continue;}
   for(const [s,ut] of cands){if(s<cands[0][0]-2)break;if(affordRes(p,US(ut,p.id).cost,reserve)){enqueue(b,ut);tc[ut]=(tc[ut]||0)+1;break;}}}}
 // --- defense
 let threat=null;for(const b of myB)if(t-b.lastHit<4){threat={x:b.x,y:b.y};break;}
 if(!threat)queryUnits(k.x,k.y,15,v=>{if(!threat&&!v.dead&&isEnemy(p.id,v.owner)&&v.type!=='peasant'&&dist(v.x,v.y,k.x,k.y)<15)threat={x:v.x,y:v.y};});
 // town bell: hide peasants while a real raiding force is next to the Keep; release when it has gone (or after 45 s, then 30 s cooldown)
 {let ev=0;queryUnits(k.x,k.y,14,v=>{if(!v.dead&&isEnemy(p.id,v.owner)&&v.type!=='peasant'&&dist(v.x,v.y,k.x,k.y)<14)ev+=UNITS[v.type].val;});
  if(ev>=60)A.raidT=t;const hv=army.filter(u=>u.aiMission==null).reduce((s,u)=>s+UNITS[u.type].val,0);
  if(!p.bell){if(ev>=150&&ev>hv*.6&&t>(A.bellCD||0)){ringBell(p.id,true,true);A.bellOnT=t;}}
  else if(t-(A.raidT||0)>8||t-(A.bellOnT||0)>45){ringBell(p.id,false);A.bellCD=t+30;}}
 if(threat){for(const u of army){if(u.state==='attack'||u.type==='ram')continue;if(u.aiMission!=null&&dist(u.x,u.y,k.x,k.y)>22)continue;if(u.amove&&dist(u.amove.x,u.amove.y,threat.x,threat.y)<5)continue;u.aiMission=null;attackMove(u,threat.x,threat.y);}}
 // --- attack waves
 const home=army.filter(u=>u.aiMission==null);
 if(!threat&&t>=A.nextWave&&home.length>=Math.min(A.waveSize,Math.max(3,Math.round(armyCap*.8)))){
  let tgt=null,ts=-1;for(const q of players){if(q===p||q.surrendered||!q.keep||q.keep.dead)continue;const s=(q.isHuman?P.hatePlayer:1)/dist(k.x,k.y,q.keep.x,q.keep.y)*(0.75+Math.random()*.5);if(s>ts){ts=s;tgt=q;}}
  if(tgt){const n=Math.max(1,Math.floor(home.length*(1-P.guard)));const go=home.slice(0,n);
   for(const u of go){u.aiMission=tgt.id;attackMove(u,tgt.keep.x,tgt.keep.y);}
   A.waveSize=Math.min(A.waveSize+P.waveGrow,Math.round(maxArmy*.8));A.nextWave=t+P.waveInt*TM;
   if(tgt.isHuman){msg(`⚔ ${p.name} sends an army of ${go.length} against you!`,rgb(p.color,1.3),tgt.id);sfx('horn',null,null,tgt.id);}}}
 for(const u of army){if(u.aiMission==null)continue;const q=players[u.aiMission];
  if(!q||q.surrendered){u.aiMission=null;u.escort=null;attackMove(u,k.x+rr(-3,3),k.y+rr(-3,3));continue;}
  if(UNITS[u.type].cls==='siege'||u.escort!=null)continue;
  if(u.state==='idle'){const b=nearestBldOf(q.id,u.x,u.y);if(b)attackMove(u,b.x,b.y);else{u.aiMission=null;attackMove(u,k.x,k.y);}}}
 aiSiege(p,army,k);
 // idle home army: rally near keep
 for(const u of home){if(u.state==='idle'&&dist(u.x,u.y,k.x,k.y)>14&&!threat){u.state='move';goTo(u,k.x+rr(-5,5),k.y+rr(-5,5));}}
 // --- surrender check
 const att=players[p.lastAttackedBy];
 if(att&&att!==p&&!att.surrendered&&t-p.lastAttackedT<30){const myMil=army.reduce((s,u)=>s+UNITS[u.type].val,0);const am=militaryValue(att.id);
  if(army.length<=2&&am>450&&myMil<am*.12&&(nPeas<6||myB.length<5||k.hp<k.maxhp*.35))surrender(p,att.id,'crushed');}
}

// ===== visibility =====
function markVis(V,cx,cy,r){const x0=Math.max(0,Math.floor(cx-r)),x1=Math.min(MAP-1,Math.floor(cx+r)),y0=Math.max(0,Math.floor(cy-r)),y1=Math.min(MAP-1,Math.floor(cy+r));const r2=r*r;
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const dx=x+.5-cx,dy=y+.5-cy;if(dx*dx+dy*dy<=r2)V[y*MAP+x]=2;}}
function updateVisFor(pid){let V=visMap[pid];if(!V)V=visMap[pid]=new Uint8Array(MAP*MAP);
 const P=players[pid];if(!fogOn||(P&&(P.surrendered||P.sat))){V.fill(2);return V;}
 for(let i=0;i<V.length;i++)if(V[i]===2)V[i]=1;
 for(const u of units)if(u.owner===pid&&!u.dead&&!u.inG)markVis(V,u.x,u.y,uD(u).sight);
 // finished buildings give sight; an unfinished site (b.built false) reveals only its own footprint, so a far-away
 // foundation can't be used to scout. Builders still see with their own unit sight. Vision turns on once it is built.
 for(const b of blds){if(b.owner!==pid||b.dead)continue;if(b.built)markVis(V,b.x,b.y,(BLD[b.type].sight||4)+b.w/2);
  else for(let y=b.ty;y<b.ty+b.h;y++)for(let x=b.tx;x<b.tx+b.w;x++)if(x>=0&&y>=0&&x<MAP&&y<MAP)V[y*MAP+x]=2;}
 return V;}
function updateVis(){for(const p of players)if(p.isHuman)updateVisFor(p.id);}
const visAt=(x,y)=>{const tx=Math.floor(x),ty=Math.floor(y);return inb(tx,ty)&&vis?vis[ty*MAP+tx]:0;};

// ===== commands (shared by local play and the LAN server) =====
function moveGroup(list,x,y,am){if(!list.length)return;const owner=list[0].owner;const slots=[];
 for(let r=0;slots.length<list.length&&r<12;r++){for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){if(Math.max(Math.abs(i),Math.abs(j))!==r)continue;const sx=x+i*.75,sy=y+j*.75;if(passable(Math.floor(sx),Math.floor(sy),owner))slots.push([sx,sy]);}}
 if(!slots.length)slots.push([x,y]);const rem=list.slice();
 for(let k=0;k<list.length;k++){const s=slots[Math.min(k,slots.length-1)];let bi=0,bd=1e9;rem.forEach((u,i)=>{const d=dist(u.x,u.y,s[0],s[1]);if(d<bd){bd=d;bi=i;}});const u=rem.splice(bi,1)[0];
  if(u.type==='peasant'){releaseClaim(u);u.bld=null;}u.state='move';u.target=null;u.job=u.type==='peasant'?null:u.job;u.leash=false;u.guard=null;goTo(u,s[0],s[1]);u.amove=am?{x:s[0],y:s[1]}:null;}}
function errMsg(t,c,pid){msg(t,c,pid);sfx('err',null,null,pid);}
function applyCmd(pid,c){const P=players[pid];if(!P||P.surrendered||!c)return;
 const byId=new Map();for(const u of units)byId.set(u.id,u);for(const b of blds)byId.set(b.id,b);
 const mine=(c.ids||[]).map(i=>byId.get(i)).filter(u=>u&&!u.dead&&!u.inG&&u.kind==='unit'&&u.owner===pid);
 const bld=c.bid!=null?byId.get(c.bid):null;const myB=bld&&!bld.dead&&bld.kind==='bld'&&bld.owner===pid?bld:null;
 switch(c.t){
 case 'move':moveGroup(mine,+c.x,+c.y,!!c.am);break;
 case 'attack':{const t=byId.get(c.tid);if(!t||t.dead||!isEnemy(pid,t.owner)){moveGroup(mine,+c.x,+c.y,false);break;}for(const u of mine){u.target=t;u.state='attack';u.amove=null;u.leash=false;u.path=null;u.pend=null;if(u.type==='peasant'){u.job=null;u.bld=null;}}break;}
 case 'gather':{const peas=mine.filter(u=>u.type==='peasant');for(const u of peas)if(!assignGather(u,c.tx|0,c.ty|0))moveGroup([u],+c.x,+c.y,false);moveGroup(mine.filter(u=>u.type!=='peasant'),+c.x,+c.y,false);break;}
 case 'farm':{const b=byId.get(c.bid);const peas=mine.filter(u=>u.type==='peasant');const rest=mine.filter(u=>u.type!=='peasant');
  if(b&&!b.dead&&b.owner===pid&&b.type==='farm'){for(const u of peas){if(u.job&&u.job.farm===b)continue;if(!assignFarm(u,b)){const f=findFarm(pid,b.x,b.y);if(f)assignFarm(u,f);else rest.push(u);}}}else rest.push(...peas);
  moveGroup(rest,+c.x,+c.y,false);break;}
 case 'drop':{if(!myB||!BLD[myB.type].drop){moveGroup(mine,+c.x,+c.y,false);break;}for(const u of mine){if(u.type==='peasant'&&u.carry>0&&BLD[myB.type].drop.includes(u.carryT)){u.state='return';u.dropB=myB;u.rfail=0;const tp=targetPoint(u,myB);goTo(u,tp.x,tp.y);}else moveGroup([u],+c.x,+c.y,false);}break;}
 case 'garrison':{let b=c.bid!=null?myB:null;const left=[];const el=mine.filter(u=>canGar(u)&&!u.inG);if(b&&!garCap(b))b=null;
  for(const u of el){let tb=b;if(!tb||garFree(tb)<=0){tb=null;let bd=1e9;for(const o of blds){if(o.owner!==pid||garFree(o)<=0)continue;const d=distTo(u,o);if(d<bd){bd=d;tb=o;}}}if(!tb||!sendGarrison(u,tb))left.push(u);}
  if(!el.length||left.length===el.length&&el.length)errMsg(el.length?'No garrison space (Keep 40, Fortress 30, Tower 6).':'Only peasants, spearmen and archers can garrison.','#ff9a8a',pid);
  const rest=mine.filter(u=>!canGar(u));if(rest.length&&b)moveGroup(rest,b.x,b.y+b.h/2+2,false);break;}
 case 'unload':{if(myB){if(!ejectAll(myB,false))errMsg('Nobody is garrisoned here.','#ff9a8a',pid);}else for(const b of blds)if(b.owner===pid)ejectAll(b,false);break;}
 case 'bell':ringBell(pid,c.on);break;
 case 'stop':for(const u of mine){releaseClaim(u);u.bld=null;u.state='idle';u.path=null;u.pend=null;u.target=null;u.amove=null;u.job=null;u.guard={x:u.x,y:u.y};}break;
 case 'train':if(myB&&myB.built&&BLD[myB.type].train&&BLD[myB.type].train.includes(c.ut)){if(UNITS[c.ut].age&&(P.age||0)<UNITS[c.ut].age){errMsg(`${UNITS[c.ut].name} requires the ${AGES[UNITS[c.ut].age]} (build a University).`,'#ff9a8a',pid);break;}if(!enqueue(myB,c.ut))errMsg(myB.queue.length>=5?'Queue is full.':'Not enough resources.','#ff9a8a',pid);}break;
 case 'cancel':if(myB&&c.k>=0&&c.k<myB.queue.length){const aligned=myB.qc&&myB.qc.length===myB.queue.length;const ut=myB.queue.splice(c.k,1)[0];const pc=aligned?myB.qc.splice(c.k,1)[0]:US(ut,pid).cost;if(!aligned)myB.qc=null;refund(P,pc);if(c.k===0){myB.trainT=0;myB.blocked=false;}}break;
 case 'rally':if(myB){const tx=Math.floor(c.x),ty=Math.floor(c.y);const r={x:+c.x,y:+c.y};if(inb(tx,ty)){if(resT[ty*MAP+tx])r.res=[tx,ty];const fb=bgrid[ty*MAP+tx];if(fb&&fb.type==='farm'&&fb.owner===pid)r.farm=fb;}myB.rally=r;}break;
 case 'build':{if(!BUILD_MENU.includes(c.type)||!Array.isArray(c.spots))break;if(BLD[c.type].reqAge&&(P.age||0)<BLD[c.type].reqAge){errMsg(`The ${BLD[c.type].name} requires the ${AGES[BLD[c.type].reqAge]} (build a University first).`,'#ff9a8a',pid);break;}const sites=[];for(const s of c.spots.slice(0,120)){const b=placeBuilding(c.type,s[0]|0,s[1]|0,pid);if(b)sites.push(b);else if(!afford(P,BLD[c.type].cost)){errMsg('Not enough resources.','#ff9a8a',pid);break;}}
  if(!sites.length){if(c.spots.length===1)errMsg('Cannot build there.','#ff9a8a',pid);break;}
  if(!sendBuilders(pid,sites,mine.filter(u=>u.type==='peasant'))&&P.isHuman)msg('Construction site placed — no idle peasant: select peasants and right-click it to build.','#ffd27a',pid);break;}
 case 'repair':{const b=byId.get(c.bid);const peas=mine.filter(u=>u.type==='peasant');if(!b||b.owner!==pid||!needsWork(b)){moveGroup(mine,+c.x,+c.y,false);break;}for(const u of peas)assignBuild(u,b);moveGroup(mine.filter(u=>u.type!=='peasant'),b.x,b.y+b.h/2+2,false);break;}
 case 'repairauto':{const b=byId.get(c.bid);if(!b||b.owner!==pid)break;if(!needsWork(b)){errMsg('That building is not damaged.','#ff9a8a',pid);break;}if(!repairAuto(pid,b)&&!buildersOf(b))errMsg('No peasant available to repair.','#ff9a8a',pid);break;}
 case 'cancelbld':{if(myB&&!myB.built){refund(P,BLD[myB.type].cost);myB.cancelled=true;killEnt(myB,-1);}break;}
 case 'demolish':{const ids=Array.isArray(c.bids)?c.bids.slice(0,400):c.bid!=null?[c.bid]:[];let n=0,keep=false;
  for(const id of ids){const b=byId.get(id);if(!b||b.dead||b.kind!=='bld'||b.owner!==pid)continue;
   if(b.type==='keep'){keep=true;continue;}   // your only Keep: demolishing it would mean surrender, so it is not allowed
   if(!b.built){refund(P,BLD[b.type].cost);b.cancelled=true;}else b.demolished=true;killEnt(b,-1);n++;}
  if(keep)errMsg('The Keep cannot be demolished.','#ff9a8a',pid);break;}
 case 'kill':{// Del on own units: they die (normal death, no refund); claims, garrison reservations and population free up
  const ids=Array.isArray(c.ids)?c.ids.slice(0,400):[];for(const id of ids){const u=byId.get(id);if(!u||u.dead||u.kind!=='unit'||u.owner!==pid)continue;
   if(u.inG){const gb=u.inG,i=gb.gar.indexOf(u);if(i>=0)gb.gar.splice(i,1);u.inG=null;}u.garB=null;killEnt(u,-1);u.bld=null;}break;}
 case 'buildnuke':{if(!myB||!BLD[myB.type].nuke||!myB.built)break;if(myB.nukeQ){errMsg('A nuclear bomb is already being built here.','#ff9a8a',pid);break;}
  if(!afford(P,NUKE.cost)){errMsg('A nuclear bomb costs 10,000 of every resource.','#ff9a8a',pid);break;}pay(P,NUKE.cost);myB.nukeQ=1;myB.nukeT=0;sfx('queued',myB.x,myB.y,pid);break;}
 case 'buildsat':{if(!myB||!BLD[myB.type].nuke||!myB.built)break;if((P.age||0)<SAT.age){errMsg('The satellite needs the Modern Age.','#ff9a8a',pid);break;}
  if(P.sat||blds.some(b=>!b.dead&&b.owner===pid&&b.satQ)){errMsg(P.sat?'Your satellite is already in orbit.':'A satellite is already being built.','#ff9a8a',pid);break;}
  if(!afford(P,SAT.cost)){errMsg('A satellite costs 3,000 of every resource.','#ff9a8a',pid);break;}pay(P,SAT.cost);myB.satQ=1;myB.satT=0;sfx('queued',myB.x,myB.y,pid);break;}
 case 'cancelsat':{if(myB&&myB.satQ){myB.satQ=0;myB.satT=0;refund(P,SAT.cost);}break;}
 case 'cancelnuke':{if(myB&&myB.nukeQ){myB.nukeQ=0;myB.nukeT=0;refund(P,NUKE.cost);}break;}
 case 'nuke':{const x=+c.x,y=+c.y;if(!(x>=0&&y>=0&&x<MAP&&y<MAP))break;   // any point on the map, fog ignored
  const lab=myB&&BLD[myB.type].nuke&&myB.built?myB:blds.find(b=>!b.dead&&b.owner===pid&&b.built&&BLD[b.type].nuke);
  if(!lab){errMsg('Launching needs a finished Research Lab.','#ff9a8a',pid);break;}if(!((P.nukes||0)>0)){errMsg('No nuclear bomb ready.','#ff9a8a',pid);break;}
  launchNuke(P,lab,x,y);break;}
 case 'trade':{const r=c.res,amt=Math.floor(+c.amt);if(!TRADE_RES.includes(r)||!(amt>0)||amt>100000||amt%TRADE_RATE)break;
  if(!myB||myB.type!=='market'||!myB.built){errMsg('Trading needs a finished Market.','#ff9a8a',pid);break;}
  if(c.dir==='sell'){if(P.res[r]<amt){errMsg(`Not enough ${r} to sell.`,'#ff9a8a',pid);break;}P.res[r]-=amt;P.res.gold+=amt/TRADE_RATE;sfx('trade',myB.x,myB.y,pid);}
  else if(c.dir==='buy'){const g=amt*TRADE_RATE;if(P.res.gold<g){errMsg('Not enough gold.','#ff9a8a',pid);break;}P.res.gold-=g;P.res[r]+=amt;sfx('trade',myB.x,myB.y,pid);}
  break;}
 }}
// Market: fixed gold-only rates. Sell 4 food/wood/stone -> 1 gold; buy 1 food/wood/stone for 4 gold.
const TRADE_RATE=4,TRADE_RES=['food','wood','stone'];
// ===== game setup / sim =====
let simAcc=0,visT=0,mmT=0,winT=0;
function setupGame(gseed,slots,diff,fog,size){
 difficulty=diff||'normal';fogOn=fog!==false;setMapSize(size);genMap(gseed);
 passGen++;units=[];blds=[];projs=[];parts=[];nukeFx=[];decals=[];sel=[];groups={};msgs=[];pings=[];resEvents=[];sfxEv=[];claim=new Int32Array(MAP*MAP);unitById.clear();visMap={};time=0;gameOver=false;nextId=1;
 bgrid=new Array(MAP*MAP).fill(null);
 players=KINGDOMS.map((k,i)=>{const sl=slots&&slots[i]||{human:i===0};return{id:i,name:k.name,short:k.short,color:k.color,pers:k.pers,isHuman:!!sl.human,isAI:!sl.human,pname:sl.name||'',res:{food:300,wood:250,stone:150,gold:100},pop:0,popCap:10,surrendered:false,bell:false,lastAttackedBy:-1,lastAttackedT:-99,stats:{trained:0,killed:0,lost:0},ai:null,keep:null,age:0,nukes:0,sat:0};});
 players.forEach((p,i)=>{const st=STARTS[i];p.keep=spawnBld('keep',st[0]-1,st[1]-1,i,true);
  const toC=Math.atan2(MAP/2-st[1],MAP/2-st[0]);
  for(let k=0;k<5;k++){const a=toC+(k-2)*.5;const u=spawnUnit('peasant',st[0]+.5+Math.cos(a)*2.8,st[1]+.5+Math.sin(a)*2.8,i);u.guard={x:u.x,y:u.y};}
  if(p.isAI){const b=DIFF[difficulty].bonus;for(const r of RES)p.res[r]+=b;initAI(p);}});
 updateVis();mmDirty=true;}
function makeAI(pid){const p=players[pid];if(!p||p.surrendered||p.isAI)return;p.isAI=true;p.isHuman=false;initAI(p);msg(`${p.pname||p.short} left — ${p.name} is now ruled by the AI.`,'#cdbb90');checkEnd();}
function makeHuman(pid,name){const p=players[pid];if(!p||p.surrendered||!p.isAI)return false;p.isAI=false;p.isHuman=true;if(name)p.pname=name;msg(`${p.pname||p.short} reconnected and rules ${p.name} again.`,'#cdbb90');return true;}
function sim(dt){
 time+=dt;if(gameOver&&!players.some(q=>q.isHuman&&!q.surrendered)&&time-gameOverT>3)return;pathBudget=12;pathExp=24000;pathEmerg=2;rebuildHash();
 for(const p of players){p.pop=0;p.popCap=0;}
 for(const u of units)if(!u.dead)players[u.owner].pop+=UNITS[u.type].pop;
 for(const b of blds)if(!b.dead&&b.built&&BLD[b.type].pop)players[b.owner].popCap+=BLD[b.type].pop;
 for(const p of players)p.popCap=Math.min(POP_MAX,p.popCap);
 for(const b of blds)if(!b.dead)updateBld(b,dt);
 for(const u of units)if(!u.dead&&!u.inG)updateUnit(u,dt);
 separation();updateProjs(dt);updateNukes();
 for(const q of parts){q.life-=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.z+=q.vz*dt;q.vz-=80*dt;if(q.z<0){q.z=0;q.vx*=.5;q.vy*=.5;}}
 parts=parts.filter(q=>q.life>0);if(parts.length>1500)parts.splice(0,parts.length-1500);
 decals=decals.filter(d=>time-d.t<(d.k==='corpse'?12:90));
 for(const u of units)if(u.dead)unitById.delete(u.id);units=units.filter(u=>!u.dead);blds=blds.filter(b=>!b.dead);if(sel.some(e=>e.dead))sel=sel.filter(e=>!e.dead);
 for(const p of players){if(!p.isAI||p.surrendered)continue;p.ai.tick-=dt;if(p.ai.tick<=0){p.ai.tick=1;aiThink(p);}}
 visT-=dt;if(visT<=0){visT=.2;updateVis();}
 if(gameOver)return;
 mmT-=dt;if(mmT<=0){mmT=.5;mmDirty=true;}
 
}
