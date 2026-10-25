// ===== AI =====
function initAI(p){const P=PERS[p.pers],Df=DIFF[difficulty];
 p.ai={tick:Math.random(),nextWave:P.firstAttack*Df.tm,waveSize:Math.max(3,Math.round(P.wave*Df.wm)),ring:null,ringSet:null,ringIdx:0,saveFor:null,lastWarn:-99};
 if(P.walls){const k=p.keep;const cx=Math.floor(k.x),cy=Math.floor(k.y),R=10;const ring=[];const set=new Set();
  const add=(x,y,g)=>{if(!inb(x,y))return;const i=y*MAP+x;if(set.has(i))return;set.add(i);ring.push({x,y,g});};
  for(let x=cx-R;x<=cx+R;x++){add(x,cy-R,x===cx);add(x,cy+R,x===cx);}
  for(let y=cy-R+1;y<cy+R;y++){add(cx-R,y,y===cy);add(cx+R,y,y===cy);}
  ring.sort((a,b)=>(b.g?1:0)-(a.g?1:0));p.ai.ring=ring;p.ai.ringSet=set;}}
function affordRes(p,c,reserve){for(const r of RES){const need=(c[r]||0)+(reserve?(reserve[r]||0)*.8:0);if(p.res[r]<need)return false;}return true;}
// placement is no longer limited by territory: the AI keeps its own buildings away from enemy bases
function aiSafe(p,x,y){for(const b of blds)if(!b.dead&&isEnemy(p.id,b.owner)&&!BLD[b.type].wall&&dist(x,y,b.x,b.y)<14)return false;return true;}
function aiFindSpot(p,type){const D=BLD[type];const k=p.keep;let cx=k.x,cy=k.y,r0=3,r1=15;
 if(D.drop&&type!=='fortress'){const n=nearestRes(RT[D.drop[0]],k.x,k.y,20,false);if(n){cx=n[0]+.5;cy=n[1]+.5;r0=1;r1=7;}}
 else if(type==='tower'){const a=Math.random()*Math.PI*2;const rad=p.ai.ring?8:rr(5,9);cx=k.x+Math.cos(a)*rad;cy=k.y+Math.sin(a)*rad;r0=0;r1=5;}
 else if(type==='farm'){r0=2;r1=12;}
 for(let r=r0;r<=r1;r++){const cands=[];for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){if(Math.max(Math.abs(x),Math.abs(y))!==r)continue;cands.push([Math.round(cx+x-D.w/2),Math.round(cy+y-D.h/2)]);}
  cands.sort(()=>Math.random()-.5);for(const c of cands)if(aiSafe(p,c[0]+D.w/2,c[1]+D.h/2)&&!canPlace(type,c[0],c[1],p.id,p.ai))return c;}
 if(D.drop&&type!=='fortress'){for(let r=3;r<=14;r++){for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){if(Math.max(Math.abs(x),Math.abs(y))!==r)continue;const tx=Math.round(k.x+x-1),ty=Math.round(k.y+y-1);if(aiSafe(p,tx+D.w/2,ty+D.h/2)&&!canPlace(type,tx,ty,p.id,p.ai))return [tx,ty];}}}
 return null;}
function attackMove(u,x,y){u.state='move';u.target=null;u.amove={x,y};u.leash=false;u.guard=null;goTo(u,x+rr(-1.5,1.5),y+rr(-1.5,1.5));u.amove={x:u.goal.x,y:u.goal.y};}
function nearestBldOf(pid,x,y){let best=null,bd=1e9;for(const b of blds){if(b.dead||b.owner!==pid)continue;const d=dist(x,y,b.x,b.y)+(BLD[b.type].wall?6:0);if(d<bd){bd=d;best=b;}}return best;}
function aiThink(p){
 const A=p.ai,P=PERS[p.pers],k=p.keep,Df=DIFF[difficulty],TM=Df.tm;if(p.surrendered||!k||k.dead)return;
 const t=time;const all=units.filter(u=>u.owner===p.id&&!u.dead);const mine=all.filter(u=>!u.inG&&u.state!=='garrison');const nPeas=all.filter(u=>u.type==='peasant').length;const peas=mine.filter(u=>u.type==='peasant');const army=mine.filter(u=>u.type!=='peasant');
 const myB=blds.filter(b=>b.owner===p.id&&!b.dead);const count=ty=>myB.filter(b=>b.type===ty).length;
 // --- peasants
 const peasTarget=Math.min(P.peas,6+Math.floor(t/11));const qp=myB.reduce((s,b)=>s+b.queue.filter(q=>q==='peasant').length,0);
 if(nPeas+qp<peasTarget&&k.queue.length<2&&affordRes(p,US('peasant',p.id).cost,null))enqueue(k,'peasant');
 // --- gather assignment
 const cnt={food:0,wood:0,stone:0,gold:0};for(const u of peas){if(u.job)cnt[u.job.farm?'food':u.job.rt]++;}
 for(const u of peas){if(u.state!=='idle')continue;if(u.job){if(u.job.farm||u.job.rt){u.bld=null;if(resumeWork(u))continue;}u.job=null;}
  const w={};for(const r of RES){w[r]=P.gather[r];if(p.res[r]>900)w[r]*=.25;if(t<100&&(r==='stone'||r==='gold'))w[r]*=.3;}
  let br='wood',bs=-1e9;for(const r of RES){const s=w[r]*peas.length-cnt[r];if(s>bs){bs=s;br=r;}}
  if(br==='food'){const f=findFarm(p.id,u.x,u.y);if(f&&assignFarm(u,f)){cnt.food++;continue;}A.needFarm=true;br='wood';}
  const drop=nearestDrop(p.id,br,k.x,k.y)||k;const n=nearestRes(RT[br],drop.x,drop.y,30*mapF()|0,true,u)||nearestRes(RT.wood,k.x,k.y,30*mapF()|0,true,u);
  if(n&&assignGather(u,n[0],n[1]))cnt[br]++;}
 // rebalance: move workers from a hoarded resource to a starved one
 if(Math.floor(t)%4===0){const need=RES.filter(r=>p.res[r]<150&&P.gather[r]>0.05).sort((a,b)=>p.res[a]-p.res[b]);const rich=RES.filter(r=>p.res[r]>400&&cnt[r]>1).sort((a,b)=>p.res[b]-p.res[a]);
  if(need.length&&rich.length){const nr=need[0],rr2=rich[0];const g=peas.find(u=>u.state!=='build'&&u.job&&(u.job.farm?'food':u.job.rt)===rr2);
   if(g){if(nr==='food'){const f=findFarm(p.id,k.x,k.y);if(f){g.job=null;assignFarm(g,f);}else A.needFarm=true;}else{const drop=nearestDrop(p.id,nr,k.x,k.y)||k;const n=nearestRes(RT[nr],drop.x,drop.y,30*mapF()|0,true,g);if(n){assignGather(g,n[0],n[1]);}}}}}
 // rebalance: shift one wood gatherer to food if starving
 if(t%10<1&&p.res.food<60&&cnt.food<peas.length*.25){const f=findFarm(p.id,k.x,k.y);const g=peas.find(u=>u.state!=='build'&&u.job&&u.job.rt==='wood');if(f&&g)assignFarm(g,f);}
 // --- buildings
 let under=myB.filter(b=>!b.built&&!BLD[b.type].wall).length;const want=[];
 if(p.popCap<POP_MAX&&p.pop>=p.popCap-4&&!myB.some(b=>b.type==='house'&&!b.built))want.push('house');
 const farms=count('farm');if((A.needFarm||farms*2<Math.ceil(peas.length*P.gather.food))&&farms<14)want.push('farm');
 if(count('lumber')<1&&t>12)want.push('lumber');
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
 A.saveFor=null;A.needFarm=false;
 for(const ty of want){if(under>=2&&ty!=='house')break;
  if(afford(p,BLD[ty].cost)){const s=aiFindSpot(p,ty);if(s&&placeBuilding(ty,s[0],s[1],p.id))under++;}
  else{A.saveFor=BLD[ty].cost;break;}}
 if(A.ring&&t>150&&p.res.stone>60&&myB.filter(b=>!b.built&&BLD[b.type].wall).length<6){let placed=0;for(let tries=0;tries<A.ring.length&&placed<4;tries++){const c=A.ring[A.ringIdx%A.ring.length];A.ringIdx++;const i=c.y*MAP+c.x;if(bgrid[i]||tiles[i]||resT[i])continue;const ty=c.g?'gate':'wall';if(!afford(p,BLD[ty].cost))break;if(placeBuilding(ty,c.x,c.y,p.id))placed++;}}
 // --- builders: every construction site / damaged building gets peasants (walls 1, others up to 2-3)
 {// sites builders repeatedly failed to reach (no passable approach tile) are cancelled and refunded
  for(const b of myB)if(!b.built&&!b.dead&&(b.unreach||0)>=3&&b.prog<0.05){refund(p,BLD[b.type].cost);b.cancelled=true;killEnt(b,-1);}
  const sites=myB.filter(b=>!b.dead&&(!b.built||(b.hp<b.maxhp*.7&&t-b.lastHit>6&&!BLD[b.type].wall&&t-(b.noFundsT||-99)>15)));if(sites.length){const busy=peas.filter(u=>u.state==='build').length;let cap=Math.max(2,Math.ceil(peas.length*.2))-busy;let wallB=peas.filter(u=>u.state==='build'&&u.bld&&BLD[u.bld.type].wall).length;
  const free=peas.filter(u=>u.state!=='build'&&(u.state==='idle'||u.carry===0)&&!(u.state==='farm'&&u.job&&time-(u.job.t||0)<20));// fresh farmers (e.g. a farm's own builders) stay on their farmsites.sort((a,b)=>(BLD[a.type].wall?1:0)-(BLD[b.type].wall?1:0)||(b.type==='house'?1:0)-(a.type==='house'?1:0));
  for(const s of sites){if(cap<=0||!free.length)break;const want=BLD[s.type].wall?1:s.built?2:(BLD[s.type].time>30?3:2);let have=buildersOf(s);
   if(BLD[s.type].wall&&wallB>=2)continue;
   while(have<want&&cap>0&&free.length){let bi=0,bs=1e9;free.forEach((u,i)=>{const sc=dist(u.x,u.y,s.x,s.y)-(u.state==='idle'?15:0)+(u.badBld===s&&t-u.badBldT<30?1e6:0);if(sc<bs){bs=sc;bi=i;}});if(bs>=5e5)break;const u=free.splice(bi,1)[0];if(assignBuild(u,s)){have++;cap--;if(BLD[s.type].wall)wallB++;}}}}}
 // --- military
 const maxArmy=Math.round(P.maxArmy*(0.8+0.2*Df.mult));
 if(army.length<maxArmy){const tc={};for(const u of army)tc[u.type]=(tc[u.type]||0)+1;for(const b of myB)for(const q of b.queue)tc[q]=(tc[q]||0)+1;
  const tot=army.length+1;
  for(const b of myB){const D=BLD[b.type];if(!b.built||!D.train||b.type==='keep'||b.queue.length>=2)continue;
   let best=null,bs=-1e9;for(const ut of D.train){if(ut==='peasant')continue;let w=P.comp[ut]||0;if(ut==='catapult')w=t>P.siegeT*TM?P.siegeW+.05:0;if(w<=0)continue;const s=w*tot-(tc[ut]||0);if(s>bs){bs=s;best=ut;}}
   if(best&&affordRes(p,US(best,p.id).cost,A.saveFor)){enqueue(b,best);tc[best]=(tc[best]||0)+1;}}}
 // --- defense
 let threat=null;for(const b of myB)if(t-b.lastHit<4){threat={x:b.x,y:b.y};break;}
 if(!threat)queryUnits(k.x,k.y,15,v=>{if(!threat&&!v.dead&&isEnemy(p.id,v.owner)&&v.type!=='peasant'&&dist(v.x,v.y,k.x,k.y)<15)threat={x:v.x,y:v.y};});
 // town bell: hide peasants while a real raiding force is next to the Keep; release when it has gone (or after 45 s, then 30 s cooldown)
 {let ev=0;queryUnits(k.x,k.y,14,v=>{if(!v.dead&&isEnemy(p.id,v.owner)&&v.type!=='peasant'&&dist(v.x,v.y,k.x,k.y)<14)ev+=UNITS[v.type].val;});
  if(ev>=60)A.raidT=t;const hv=army.filter(u=>u.aiMission==null).reduce((s,u)=>s+UNITS[u.type].val,0);
  if(!p.bell){if(ev>=150&&ev>hv*.6&&t>(A.bellCD||0)){ringBell(p.id,true,true);A.bellOnT=t;}}
  else if(t-(A.raidT||0)>8||t-(A.bellOnT||0)>45){ringBell(p.id,false);A.bellCD=t+30;}}
 if(threat){for(const u of army){if(u.state==='attack')continue;if(u.aiMission!=null&&dist(u.x,u.y,k.x,k.y)>22)continue;if(u.amove&&dist(u.amove.x,u.amove.y,threat.x,threat.y)<5)continue;u.aiMission=null;attackMove(u,threat.x,threat.y);}}
 // --- attack waves
 const home=army.filter(u=>u.aiMission==null);
 if(!threat&&t>=A.nextWave&&home.length>=A.waveSize){
  let tgt=null,ts=-1;for(const q of players){if(q===p||q.surrendered||!q.keep||q.keep.dead)continue;const s=(q.isHuman?P.hatePlayer:1)/dist(k.x,k.y,q.keep.x,q.keep.y)*(0.75+Math.random()*.5);if(s>ts){ts=s;tgt=q;}}
  if(tgt){const n=Math.max(1,Math.floor(home.length*(1-P.guard)));const go=home.slice(0,n);
   for(const u of go){u.aiMission=tgt.id;attackMove(u,tgt.keep.x,tgt.keep.y);}
   A.waveSize=Math.min(A.waveSize+P.waveGrow,Math.round(maxArmy*.8));A.nextWave=t+P.waveInt*TM;
   if(tgt.isHuman){msg(`⚔ ${p.name} sends an army of ${go.length} against you!`,rgb(p.color,1.3),tgt.id);sfx('horn',null,null,tgt.id);}}}
 for(const u of army){if(u.aiMission==null)continue;const q=players[u.aiMission];
  if(!q||q.surrendered){u.aiMission=null;attackMove(u,k.x+rr(-3,3),k.y+rr(-3,3));continue;}
  if(u.state==='idle'){const b=nearestBldOf(q.id,u.x,u.y);if(b)attackMove(u,b.x,b.y);else{u.aiMission=null;attackMove(u,k.x,k.y);}}}
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
