// ===== spatial hash =====
const HC=4;let HN=Math.ceil(MAP/HC);let hash=[];
function rebuildHash(){hash=new Array(HN*HN);for(const u of units){if(u.dead||u.inG)continue;const k=clamp(u.x/HC|0,0,HN-1)+clamp(u.y/HC|0,0,HN-1)*HN;(hash[k]||(hash[k]=[])).push(u);}}
function queryUnits(x,y,r,fn){const x0=clamp((x-r)/HC|0,0,HN-1),x1=clamp((x+r)/HC|0,0,HN-1),y0=clamp((y-r)/HC|0,0,HN-1),y1=clamp((y+r)/HC|0,0,HN-1);
 for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++){const a=hash[cx+cy*HN];if(a)for(const v of a)fn(v);}}
function distTo(u,t){if(t.kind==='unit')return dist(u.x,u.y,t.x,t.y);const px=clamp(u.x,t.tx,t.tx+t.w),py=clamp(u.y,t.ty,t.ty+t.h);return dist(u.x,u.y,px,py);}
function targetPoint(u,t){if(t.kind==='unit')return{x:t.x,y:t.y};return{x:clamp(u.x,t.tx-.45,t.tx+t.w+.45),y:clamp(u.y,t.ty-.45,t.ty+t.h+.45)};}
function findEnemy(u,r,unitsOnly){
 let best=null,bd=1e9;const cat=u.type==='catapult';
 queryUnits(u.x,u.y,r,v=>{if(v.dead||!isEnemy(u.owner,v.owner))return;const d=dist(u.x,u.y,v.x,v.y);if(d>r)return;const s=d+(v.type==='peasant'?2:0)+(cat?3:0);if(s<bd){bd=s;best=v;}});
 if(unitsOnly)return best;
 if(best&&!cat)return best;
 for(const b of blds){if(b.dead||!isEnemy(u.owner,b.owner))continue;if(Math.abs(b.x-u.x)>r+3||Math.abs(b.y-u.y)>r+3)continue;const d=distTo(u,b);if(d>r)continue;const s=d+(BLD[b.type].wall?2.5:0);if(s<bd){bd=s;best=b;}}
 return best;}
function militaryValue(pid){let s=0;for(const u of units)if(u.owner===pid&&!u.dead&&u.type!=='peasant')s+=UNITS[u.type].val;return s;}

// ===== messages =====
function msg(t,c,to){msgs.push({t,c:c||'#fff',to:to==null?-1:to,time:Date.now()});if(msgs.length>40)msgs.shift();}
function rgb(c,f=1,a=1){return `rgba(${clamp(c[0]*f|0,0,255)},${clamp(c[1]*f|0,0,255)},${clamp(c[2]*f|0,0,255)},${a})`;}

// ===== combat =====
function dealDamage(att,t,amount,atype,owner){
 if(t.dead||t.inG)return;const cls=t.kind==='bld'?'bld':UNITS[t.type].cls;const m=(BONUS[atype]&&BONUS[atype][cls])||1;let a=amount*m;
 if(t.kind==='bld'&&!t.built)a*=1.5;
 t.hp-=a;t.lastHit=time;const P=players[t.owner];P.lastAttackedBy=owner;P.lastAttackedT=time;
 if(P.isHuman&&owner>=0&&isEnemy(owner,t.owner)&&time-(P.atkT||-9)>0.25){P.atkT=time;sfx('atk',t.x,t.y,t.owner);}
 if(t.kind==='bld'&&time-(t.hT||-9)>0.35){t.hT=time;sfx('bhit',t.x,t.y,t.owner);}
 if(P.isHuman&&time-(P.alertT||-99)>15){P.alertT=time;msg(t.kind==='bld'?`Your ${BLD[t.type].name} is under attack! (Space to view)`:'Your forces are under attack! (Space to view)','#ff8a6a',t.owner);pings.push({x:t.x,y:t.y,t:time,o:t.owner});sfx('alert',t.x,t.y,t.owner);}
 if(t.kind==='unit'){for(let i=0;i<2;i++)parts.push({x:t.x,y:t.y,z:10,vx:rr(-1,1),vy:rr(-1,1),vz:rr(10,30),life:.5,max:.5,c:'#a01818',s:1.6});
  if(att&&!att.dead&&t.type!=='peasant'&&t.state==='idle'){t.target=att;t.state='attack';t.leash=true;t.guard=t.guard||{x:t.x,y:t.y};}
 }
 if(t.hp<=0)killEnt(t,owner);}
function killEnt(e,by){
 if(e.dead)return;e.dead=true;
 if(e.kind==='unit'){releaseClaim(e);sfx('die',e.x,e.y,e.owner,e.type==='knight'?1:e.type==='catapult'?2:0);players[e.owner].stats.lost++;if(by>=0&&players[by])players[by].stats.killed++;
  decals.push({k:'corpse',x:e.x,y:e.y,t:time,c:players[e.owner].color});
  for(let i=0;i<6;i++)parts.push({x:e.x,y:e.y,z:6,vx:rr(-1.5,1.5),vy:rr(-1.5,1.5),vz:rr(10,40),life:.7,max:.7,c:'#8a1010',s:2});
 }else{
  for(let y=e.ty;y<e.ty+e.h;y++)for(let x=e.tx;x<e.tx+e.w;x++)if(bgrid[y*MAP+x]===e)bgrid[y*MAP+x]=null;
  decals.push({k:'rubble',x:e.tx,y:e.ty,w:e.w,h:e.h,t:time});sfx('fall',e.x,e.y,e.owner,e.w);
  if(e.gar&&e.gar.length){const n=ejectAll(e,true);if(n&&players[e.owner].isHuman)msg(`${n} units fled the burning ${BLD[e.type].name}!`,'#ff8a6a',e.owner);}
  for(let i=0;i<14*e.w;i++)parts.push({x:e.x+rr(-e.w/2,e.w/2),y:e.y+rr(-e.h/2,e.h/2),z:rr(0,30),vx:rr(-1,1),vy:rr(-1,1),vz:rr(5,40),life:1.2,max:1.2,c:rnd()<.5?'#777':'#5a4a3a',s:3});
  if(!e.built&&!e.cancelled){const c=BLD[e.type].cost,P=players[e.owner];for(const r in c)P.res[r]+=Math.floor(c[r]*.5);}
  mmDirty=true;
  if(e.type==='keep')surrender(players[e.owner],by,'keep');
  else if(players[e.owner].isHuman)msg(`Your ${BLD[e.type].name} was destroyed.`,'#ff8a6a',e.owner);
 }}
function attack(u,t){const D=UNITS[u.type];const d=distTo(u,t);
 if(D.proj==='arrow'){sfx('bow',u.x,u.y,u.owner);}if(D.proj==='arrow')projs.push({k:'arrow',sx:u.x,sy:u.y,t,tx:t.x,ty:t.y,life:0,dur:Math.max(.15,d/13),dmg:D.atk,owner:u.owner,atype:u.type,att:u});
 else if(D.proj==='stone'){const tp=t.kind==='unit'?{x:t.x,y:t.y}:{x:t.x,y:t.y};projs.push({k:'stone',sx:u.x,sy:u.y,tx:tp.x+rr(-.3,.3),ty:tp.y+rr(-.3,.3),life:0,dur:Math.max(.5,d/7),dmg:D.atk,owner:u.owner,atype:u.type,att:u,splash:D.splash});u.fireT=time;sfx('launch',u.x,u.y,u.owner);}
 else{sfx('hit',t.x,t.y,u.owner,u.type==='knight'?1:u.type==='peasant'?2:0);dealDamage(u,t,D.atk,u.type,u.owner);u.swingT=time;}}
function updateProjs(dt){
 for(const p of projs){p.life+=dt;if(p.t&&!p.t.dead){p.tx=p.t.x;p.ty=p.t.y;}
  if(p.life>=p.dur){p.done=true;
   if(p.k==='arrow'){if(p.t&&!p.t.dead)sfx('thk',p.tx,p.ty,p.owner,p.t.kind==='bld'?1:0);if(p.t&&!p.t.dead)dealDamage(p.att&&!p.att.dead?p.att:null,p.t,p.dmg,p.atype,p.owner);}
   else{sfx('boom',p.tx,p.ty,p.owner);for(let i=0;i<10;i++)parts.push({x:p.tx,y:p.ty,z:2,vx:rr(-1.5,1.5),vy:rr(-1.5,1.5),vz:rr(10,35),life:.8,max:.8,c:'#8a7a60',s:2.5});
    const hit=[];queryUnits(p.tx,p.ty,p.splash+1,v=>{if(!v.dead&&isEnemy(p.owner,v.owner)&&dist(v.x,v.y,p.tx,p.ty)<=p.splash)hit.push(v);});
    const bx=Math.floor(p.tx),by=Math.floor(p.ty);const bs=new Set();for(let y=by-1;y<=by+1;y++)for(let x=bx-1;x<=bx+1;x++){if(!inb(x,y))continue;const b=bgrid[y*MAP+x];if(b&&isEnemy(p.owner,b.owner)&&distTo({x:p.tx,y:p.ty},b)<=p.splash*.6)bs.add(b);}
    for(const v of hit)dealDamage(null,v,p.dmg,p.atype,p.owner);for(const b of bs)dealDamage(null,b,p.dmg,p.atype,p.owner);}}}
 projs=projs.filter(p=>!p.done);}

// ===== unit logic =====
function resumeAfterFight(u){u.target=null;
 if(u.amove){u.state='move';goTo(u,u.amove.x,u.amove.y);return;}
 if(u.job&&u.type==='peasant'){u.state=u.job.farm?'farm':'gather';u.path=null;u.pend=null;return;}
 if(u.leash&&u.guard&&dist(u.x,u.y,u.guard.x,u.guard.y)>2){u.state='move';u.leash=false;goTo(u,u.guard.x,u.guard.y);return;}
 u.state='idle';u.leash=false;}
function updateUnit(u,dt){
 const D=UNITS[u.type];u.cd-=dt;u.anim+=dt;u.moving=false;u.working=false;
 if(u.target&&u.target.inG)u.target=null;
 if(u.state==='garrison'){const b=u.garB;if(!garCap(b)||b.owner!==u.owner){u.garB=null;u.state='idle';resumeWork(u);return;}
  if(distTo(u,b)<=1.05){if(b.gar.length<garCap(b))enterGarrison(u,b);else{u.garB=null;u.state='idle';const alt=blds.find(o=>o!==b&&o.owner===u.owner&&garFree(o)>0&&distTo(u,o)<12);if(alt)sendGarrison(u,alt);else resumeWork(u);}return;}
  if(!hasPath(u)){const tp=approachPoint(u,b,u.gfail||0);goTo(u,tp.x,tp.y);}if(moveAlong(u,dt)){u.path=null;if(distTo(u,b)>1.05){u.gfail=(u.gfail||0)+1;if(u.gfail>3){u.gfail=0;u.garB=null;u.state='idle';}}}return;}
 {const ti=Math.floor(u.y)*MAP+Math.floor(u.x);if(ti!==u.lt){u.lt=ti;const gb=bgrid[ti];if(gb&&gb.type==='gate'&&time-(gb.gT||-9)>1.2){gb.gT=time;sfx('gate',gb.x,gb.y,gb.owner);}}}
 if(u.state==='move'){
  if(u.amove){u.scanT-=dt;if(u.scanT<=0){u.scanT=.35;const e=findEnemy(u,D.sight);if(e){u.target=e;u.state='attack';return;}}}
  if(moveAlong(u,dt)){u.state='idle';u.path=null;u.amove=null;u.guard={x:u.x,y:u.y};u.leash=false;}
 }else if(u.state==='attack'){
  const t=u.target;
  if(!t||t.dead||!isEnemy(u.owner,t.owner)){resumeAfterFight(u);return;}
  if(t.kind==='bld'&&u.type!=='catapult'&&(u.amove||u.leash||u.owner!==0)){u.scanT-=dt;if(u.scanT<=0){u.scanT=.6;const e=findEnemy(u,D.sight*.8,true);if(e)u.target=e;}}
  if(u.type==='catapult'&&t.kind==='unit'){u.scanT-=dt;if(u.scanT<=0){u.scanT=1;}}
  const d=distTo(u,t);const rng=D.range+(t.kind==='unit'?0.3:0.15);
  if(d<=rng&&!(D.minRange&&d<D.minRange)){u.path=null;u.pend=null;const sdx=(t.x-t.y)-(u.x-u.y);if(Math.abs(sdx)>.05)u.dir=sdx>0?1:-1;
   if(u.cd<=0){u.cd=D.cd*(0.9+Math.random()*.2);attack(u,t);}}
  else if(D.minRange&&d<D.minRange){
   if(u.amove||u.leash){const e=findEnemy(u,D.sight);if(e&&e!==t&&distTo(u,e)>=D.minRange){u.target=e;return;}}
   if(!hasPath(u)){const ax=u.x+(u.x-t.x)/(d||1)*2.5,ay=u.y+(u.y-t.y)/(d||1)*2.5;goTo(u,ax,ay);} if(moveAlong(u,dt))u.path=null;}
  else{
   if(u.leash&&u.guard&&dist(u.x,u.y,u.guard.x,u.guard.y)>11){u.target=null;u.leash=false;u.state='move';goTo(u,u.guard.x,u.guard.y);return;}
   if(!hasPath(u)||time-u.repathT>1.1){const tp=targetPoint(u,t);goTo(u,tp.x,tp.y);}
   moveAlong(u,dt);
   if(u.owner!==0||u.amove){u.chaseT=(u.chaseT||0)+dt;if(u.chaseT>4){u.chaseT=0;const e=findEnemy(u,D.sight);if(e&&e!==t&&distTo(u,e)<d-1)u.target=e;}}
  }
 }else if(u.state==='idle'){
  u.scanT-=dt;if(u.scanT<=0){u.scanT=.5+Math.random()*.2;if(u.type!=='peasant'){const e=findEnemy(u,D.sight);if(e){u.guard=u.guard||{x:u.x,y:u.y};u.target=e;u.state='attack';u.leash=true;}}}
 }else peasantUpdate(u,dt);
 // stuck detection
 if(u.moving){u.stuckT+=dt;if(u.stuckT>1.5){if(dist(u.x,u.y,u.lx,u.ly)<0.3&&u.goal){u.stuckN=(u.stuckN||0)+1;u.path=[];u.pend={x:u.goal.x,y:u.goal.y};}else u.stuckN=0;u.stuckT=0;u.lx=u.x;u.ly=u.y;}}
 if(u.type==='peasant')peasantWatchdog(u);
}
function nearestDrop(owner,rt,x,y,u){let best=null,bd=1e9;for(const b of blds){if(b.dead||b.owner!==owner||!b.built)continue;if(u&&u.badDrop===b.id&&time-u.badDropT<40)continue;const D=BLD[b.type];if(!D.drop||!D.drop.includes(rt))continue;const d=dist(x,y,b.x,b.y);if(d<bd){bd=d;best=b;}}return best;}
function startReturn(u){const b=nearestDrop(u.owner,u.carryT,u.x,u.y,u);if(!b){u.state='idle';return;}u.state='return';u.dropB=b;u.rfail=0;const tp=approachPoint(u,b,0);goTo(u,tp.x,tp.y);}
// a free tile around a building (8-neighbourhood ring) nearest to the unit; 'skip' cycles to the next candidate after failures
function approachPoint(u,b,skip){if(b.kind!=='bld')return targetPoint(u,b);
 if(BLD[b.type].walk){const c=[];for(let y=b.ty;y<b.ty+b.h;y++)for(let x=b.tx;x<b.tx+b.w;x++)c.push([x+.5,y+.5,dist(u.x,u.y,x+.5,y+.5)]);c.sort((a,o)=>a[2]-o[2]);const p=c[(skip||0)%c.length];return{x:p[0],y:p[1]};}const c=[];for(let y=b.ty-1;y<=b.ty+b.h;y++)for(let x=b.tx-1;x<=b.tx+b.w;x++){if(x>=b.tx&&x<b.tx+b.w&&y>=b.ty&&y<b.ty+b.h)continue;if(!passable(x,y,u.owner))continue;c.push([x+.5,y+.5,dist(u.x,u.y,x+.5,y+.5)]);}
 if(!c.length)return targetPoint(u,b);c.sort((a,o)=>a[2]-o[2]);const p=c[(skip||0)%c.length];return{x:p[0],y:p[1]};}
function assignGather(u,tx,ty){const t=resT[ty*MAP+tx];if(!t)return false;u.bld=null;
 if(!exposed(tx,ty)||!claimOK(ty*MAP+tx,u)){const n=nearestRes(t,tx,ty,10,true,u);if(!n)return false;tx=n[0];ty=n[1];}
 releaseClaim(u);if(claim)claim[ty*MAP+tx]=u.id;
 u.job={rt:RTN[t],tx,ty};u.state='gather';u.path=null;u.pend=null;u.target=null;u.amove=null;u.gfail=0;u.approach=null;return true;}
function farmFree(b){b.workers=b.workers.filter(w=>!w.dead&&w.job&&w.job.farm===b);return b.workers.length<2;}
function assignFarm(u,b){if(!b.built||!farmFree(b))return false;u.bld=null;releaseClaim(u);const used=b.workers.map(w=>w.job.slot);const slot=used.includes(0)?1:0;
 u.job={farm:b,slot,t:time};b.workers.push(u);u.state='farm';u.path=null;u.pend=null;u.target=null;u.amove=null;return true;}
function peasantUpdate(u,dt){
 if(u.state==='build'){buildUpdate(u,dt);return;}
 const P=players[u.owner];const mult=P.isAI?DIFF[difficulty].mult:1;
 if(u.state==='gather'){const j=u.job;if(!j||!j.rt){u.state='idle';return;}
  if(u.carry>=CAP||(u.carry>0&&u.carryT!==j.rt)){startReturn(u);return;}
  let i=j.ty*MAP+j.tx;
  if(resT[i]===RT[j.rt]&&!claimOK(i,u)){const n=nearestRes(RT[j.rt],j.tx,j.ty,12,true,u);if(!n){u.job=null;if(u.carry>0)startReturn(u);else u.state='idle';return;}j.tx=n[0];j.ty=n[1];i=j.ty*MAP+j.tx;u.path=null;u.pend=null;}
  if(claim&&resT[i]===RT[j.rt])claim[i]=u.id;
  if(resT[i]!==RT[j.rt]){if(claim&&claim[i]===u.id)claim[i]=0;const n=nearestRes(RT[j.rt],j.tx,j.ty,12,true,u);if(!n){u.job=null;if(u.carry>0)startReturn(u);else u.state='idle';return;}j.tx=n[0];j.ty=n[1];i=j.ty*MAP+j.tx;if(claim)claim[i]=u.id;u.path=null;u.pend=null;u.approach=null;}
  const cx=j.tx+.5,cy=j.ty+.5;const d=Math.max(Math.abs(u.x-cx),Math.abs(u.y-cy));
  if(d<=1.3&&!u.pend){u.path=null;u.working=true;u.gfail=0;const sdx=(cx-cy)-(u.x-u.y);if(Math.abs(sdx)>.05)u.dir=sdx>0?1:-1;
   u.gt+=dt*GRATE[j.rt]*mult;while(u.gt>=1){u.gt-=1;resA[i]-=1;u.carry++;u.carryT=j.rt;if(u.carry%3===0)sfx(j.rt==='wood'?'chop':'mine',cx,cy,u.owner,RT[j.rt]);if(resA[i]<=0){resT[i]=0;if(claim)claim[i]=0;resEvents.push(i);mmDirty=true;if(j.rt==='wood')parts.push({x:cx,y:cy,z:10,vx:0,vy:0,vz:20,life:.6,max:.6,c:'#3d6b2a',s:5});break;}if(u.carry>=CAP)break;}}
  else if(!hasPath(u)){u.gfail++;if(u.gfail>4){if(claim&&claim[i]===u.id)claim[i]=0;avoidNode(u,i);const n=nearestRes(RT[j.rt],u.x,u.y,6,true,u);if(n&&u.gfail<8){j.tx=n[0];j.ty=n[1];claim&&(claim[j.ty*MAP+j.tx]=u.id);}else{u.job=null;u.state='idle';return;}}
   const a=nearestFree(j.tx,j.ty,u.x,u.y,u.owner,1);if(!a){u.gfail+=2;return;}
   goTo(u,a[0]+.5,a[1]+.5);}
  else moveAlong(u,dt);
 }else if(u.state==='return'){const b=u.dropB;
  if(!b||b.dead){startReturn(u);return;}
  if(distTo(u,b)<=0.95){if(u.carry>0)sfx('drop',u.x,u.y,u.owner,RT[u.carryT]||0);P.res[u.carryT]+=u.carry;u.carry=0;if(u.job&&u.job.rt){u.state='gather';u.path=null;u.pend=null;}else u.state='idle';return;}
  if(!hasPath(u)){u.rfail++;if(u.rfail>6){u.badDrop=b.id;u.badDropT=time;const nb=nearestDrop(u.owner,u.carryT,u.x,u.y,u);if(nb){startReturn(u);}else u.state='idle';return;}const tp=approachPoint(u,b,u.rfail-1);goTo(u,tp.x,tp.y);}else moveAlong(u,dt);
 }else if(u.state==='farm'){const j=u.job;const b=j&&j.farm;
  if(!b||b.dead){u.job=null;const f=findFarm(u.owner,u.x,u.y);if(f)assignFarm(u,f);else u.state='idle';return;}
  const fx=b.tx+(j.slot?1.45:0.55)+Math.sin(u.anim*.3+j.slot)*0.25,fy=b.ty+(j.slot?0.6:1.4);
  const d=dist(u.x,u.y,fx,fy);
  if(d<0.5&&b.built){u.working=true;P.res.food+=FARM_RATE*dt*mult;if(Math.abs(fx-u.x)>.02)u.x+=Math.sign(fx-u.x)*Math.min(Math.abs(fx-u.x),dt*.3);}
  else if(d>=0.5){if(!hasPath(u)||(u.goal&&dist(u.goal.x,u.goal.y,fx,fy)>1))goTo(u,fx,fy);moveAlong(u,dt);}
 }}
function findFarm(owner,x,y){let best=null,bd=1e9;for(const b of blds){if(b.dead||b.owner!==owner||b.type!=='farm'||!b.built||!farmFree(b))continue;if(time-(b.doneT||-99)<1.5&&buildersOf(b)>0)continue;// a just-finished farm is reserved for its builders
const d=dist(x,y,b.x,b.y);if(d<bd){bd=d;best=b;}}return best;}
function separation(){
 for(const u of units){if(u.dead||u.inG)continue;
  queryUnits(u.x,u.y,0.8,v=>{if(v.id<=u.id||v.dead)return;const dx=v.x-u.x,dy=v.y-u.y,d2=dx*dx+dy*dy;
   const mn=(u.type==='knight'||u.type==='catapult'||v.type==='knight'||v.type==='catapult')?0.6:0.42;
   if(d2>=mn*mn)return;if(d2<1e-6){tryMove(u,rr(-.05,.05),rr(-.05,.05));return;}
   const d=Math.sqrt(d2),push=(mn-d)*0.35,nx=dx/d*push,ny=dy/d*push;
   const wu=u.working?0.2:1,wv=v.working?0.2:1;let sx=0,sy=0;
   // two units walking into each other (head-on in a corridor) would push each other straight back forever: add a sideways slide
   // (also when walking into a standing unit, e.g. soldiers parked in a gap: the walker slides around it, the idle one yields more)
   if(u.moving||v.moving){const s=(u.id&1)?1:-1;sx=-ny*s*1.2;sy=nx*s*1.2;}
   const yu=(!u.moving&&v.moving&&!u.working)?1.6:1,yv=(!v.moving&&u.moving&&!v.working)?1.6:1;
   tryMove(u,-nx*wu*yu-(u.moving?sx:0),-ny*wu*yu-(u.moving?sy:0));tryMove(v,nx*wv*yv+(v.moving?sx:0),ny*wv*yv+(v.moving?sy:0));});}}
function tryMove(u,dx,dy){const cur=passable(Math.floor(u.x),Math.floor(u.y),u.owner);
 const nx=u.x+dx;if(!cur||passable(Math.floor(nx),Math.floor(u.y),u.owner))u.x=clamp(nx,0.05,MAP-0.05);
 const ny=u.y+dy;if(!cur||passable(Math.floor(u.x),Math.floor(ny),u.owner))u.y=clamp(ny,0.05,MAP-0.05);}

// ===== buildings =====
function afford(p,c){for(const r in c)if(p.res[r]<c[r])return false;return true;}
function pay(p,c){for(const r in c)p.res[r]-=c[r];}
function refund(p,c){for(const r in c)p.res[r]+=c[r];}
function enqueue(b,ut){const p=players[b.owner];if(b.queue.length>=5||!afford(p,UNITS[ut].cost))return false;pay(p,UNITS[ut].cost);b.queue.push(ut);sfx('queued',b.x,b.y,b.owner);return true;}
function updateBld(b,dt){const D=BLD[b.type];const P=players[b.owner];
 const nB=b.bN||0;b.bN=0;b.bc=nB;
 if(!b.built){if(nB>0){const e=buildEff(nB);b.prog+=dt*e/D.time;b.hp=Math.min(b.maxhp,b.hp+D.hp*.9*dt*e/D.time);}if(b.prog>=1){b.built=true;b.prog=1;b.doneT=time;mmDirty=true;sfx('built',b.x,b.y,b.owner,D.wall?1:0);if(P.isHuman&&!D.wall)msg(`${D.name} completed.`,'#bfe6a0',b.owner);}return;}
 if(nB>0&&b.hp<b.maxhp){const gain=Math.min(b.maxhp-b.hp,b.maxhp*dt*buildEff(nB)/(Math.max(D.time,8)*2.5));const rc=repairCost(b,gain);
  if(afford(P,rc)){pay(P,rc);b.hp+=gain;b.repT=time;if(Math.random()<dt*6)parts.push({x:b.x+rr(-b.w/2,b.w/2),y:b.y+rr(-b.h/2,b.h/2),z:rr(8,30),vx:rr(-.3,.3),vy:rr(-.3,.3),vz:rr(15,30),life:.6,max:.6,c:'#9cf27a',s:2});}
  else{b.noFundsT=time;}if(!afford(P,rc)&&time-(b.rfT||-99)>8){b.rfT=time;if(P.isHuman){msg(`Not enough wood/stone to repair the ${D.name}.`,'#ff9a8a',b.owner);sfx('err',b.x,b.y,b.owner);}}}
 if(D.income)P.res.gold+=D.income*dt*(P.isAI?DIFF[difficulty].mult:1);
 if(D.shoot){b.cd-=dt;if(b.cd<=0){const S=D.shoot;const cands=[];queryUnits(b.x,b.y,S.range+1,v=>{if(!v.dead&&isEnemy(b.owner,v.owner)){const d=distTo(v,b);if(d<=S.range)cands.push([d,v]);}});
  if(cands.length){cands.sort((a,c)=>a[0]-c[0]);sfx('bow',b.x,b.y,b.owner);fireVolley(b,S,cands);b.cd=S.cd;}else b.cd=.3;}}
 if(b.queue.length){const ut=b.queue[0],UD=UNITS[ut];b.trainT+=dt*(P.isAI?Math.sqrt(DIFF[difficulty].mult):1);
  if(b.trainT>=UD.time){if(P.pop+UD.pop<=P.popCap){b.queue.shift();b.trainT=0;b.blocked=false;P.pop+=UD.pop;P.stats.trained++;spawnFrom(b,ut);sfx('trained',b.x,b.y,b.owner,ut==='peasant'?0:1);}
   else{b.trainT=UD.time;if(!b.blocked&&P.isHuman){msg('Population limit reached — build Houses!','#ffd27a',b.owner);sfx('err',b.x,b.y,b.owner);}b.blocked=true;}}}}
function spawnFrom(b,ut){const rp=b.rally||{x:b.x+1,y:b.y+3};const n=nearestFree(Math.floor(b.x),Math.floor(b.y),rp.x,rp.y,b.owner,6);if(!n)return;
 const u=spawnUnit(ut,n[0]+.5,n[1]+.5,b.owner);
 if(b.rally){if(ut==='peasant'&&b.rally.res){assignGather(u,b.rally.res[0],b.rally.res[1]);}
  else if(ut==='peasant'&&b.rally.farm&&!b.rally.farm.dead&&assignFarm(u,b.rally.farm)){}
  else{u.state='move';goTo(u,b.rally.x+rr(-.6,.6),b.rally.y+rr(-.6,.6));}}
 else if(ut==='peasant'&&players[b.owner].isHuman){const f=findFarm(b.owner,u.x,u.y);if(f)assignFarm(u,f);}
 u.guard={x:u.x,y:u.y};return u;}
function canPlace(type,tx,ty,owner,ai){const D=BLD[type];
 for(let y=ty;y<ty+D.h;y++)for(let x=tx;x<tx+D.w;x++){if(!inb(x,y))return 'Out of bounds';const i=y*MAP+x;if(tiles[i])return 'Blocked by water';if(resT[i])return 'Blocked by resources';if(bgrid[i])return 'Blocked by building';if(fogOn&&visMap[owner]&&visMap[owner][i]===0)return 'Unexplored';
  if(ai&&ai.ringSet&&!D.wall&&ai.ringSet.has(i))return 'reserved';}
 if(ai&&!D.wall){for(let y=ty-1;y<=ty+D.h;y++)for(let x=tx-1;x<=tx+D.w;x++){if(!inb(x,y))return 'edge';const b=bgrid[y*MAP+x];if(b&&!BLD[b.type].wall)return 'crowded';}}
 for(const u of units){if(u.dead||u.owner===owner)continue;if(u.x>=tx-.3&&u.x<=tx+D.w+.3&&u.y>=ty-.3&&u.y<=ty+D.h+.3)return 'Enemy units in the way';}
 return null;}
function placeBuilding(type,tx,ty,owner){const p=players[owner];const c=BLD[type].cost;if(!afford(p,c))return null;if(canPlace(type,tx,ty,owner,p.isAI?p.ai:null))return null;pay(p,c);sfx('place',tx+BLD[type].w/2,ty+BLD[type].h/2,owner,BLD[type].wall?1:0);return spawnBld(type,tx,ty,owner,false);}

// ===== surrender & end =====
function surrender(p,by,why){if(p.surrendered)return;p.surrendered=true;p.surT=time;const bp=players[by];
 const what=why==='keep'?'has lost its Keep and':'is crushed and';
 sfx('surr',null,null,p.id);
 if(bp&&!bp.surrendered&&bp!==p){const trib={};for(const r of RES){trib[r]=Math.floor(p.res[r]*.5);bp.res[r]+=trib[r];}sfx('trib',null,null,bp.id);
  for(const q of players){if(q===p)continue;if(q===bp)msg(`${p.name} ${what} surrenders to you! Tribute: ${trib.food}F ${trib.wood}W ${trib.stone}S ${trib.gold}G`,rgb(p.color,1.3),q.id);else msg(`${p.name} ${what} surrenders to ${bp.name}!`,rgb(p.color,1.3),q.id);}}
 else msg(`${p.name} has collapsed!`,rgb(p.color,1.3));
 if(p.isHuman)msg(why==='keep'?'Your Keep has fallen. Your kingdom is defeated.':'Your kingdom has surrendered.','#ff7a6a',p.id);
 for(const u of units)if(u.owner===p.id&&!u.dead){u.dead=true;for(let i=0;i<4;i++)parts.push({x:u.x,y:u.y,z:5,vx:rr(-.5,.5),vy:rr(-.5,.5),vz:rr(5,20),life:1,max:1,c:'#ddd',s:3});}
 for(const b of blds)if(b.owner===p.id&&!b.dead){b.dead=true;for(let y=b.ty;y<b.ty+b.h;y++)for(let x=b.tx;x<b.tx+b.w;x++)if(bgrid[y*MAP+x]===b)bgrid[y*MAP+x]=null;decals.push({k:'rubble',x:b.tx,y:b.ty,w:b.w,h:b.h,t:time});}
 mmDirty=true;sel=sel.filter(e=>!e.dead);checkEnd();}
function checkEnd(){const alive=players.filter(q=>!q.surrendered);if(alive.length<=1||!alive.some(q=>q.isHuman)){if(!gameOver){gameOver=true;gameOverT=time;}}}
let gameOverT=0;

// ===== garrison (Keep 40, Fortress 30, Tower 6; peasants + infantry only) =====
const garCap=b=>b&&!b.dead&&b.built?(BLD[b.type].gar||0):0;
function garFree(b){if(!garCap(b))return 0;let n=b.gar.length;for(const u of units)if(!u.dead&&u.garB===b&&!u.inG)n++;return garCap(b)-n;}
function garArchers(b){let n=0;for(const u of b.gar)if(u.type==='archer')n++;return n;}
function sendGarrison(u,b){if(!canGar(u)||u.inG||!garCap(b)||b.owner!==u.owner)return false;if(u.type==='peasant')releaseClaim(u);
 u.state='garrison';u.garB=b;u.target=null;u.amove=null;u.leash=false;u.guard=null;const tp=targetPoint(u,b);goTo(u,tp.x,tp.y);return true;}
function enterGarrison(u,b){if(!garCap(b)||b.gar.length>=garCap(b)){u.garB=null;u.state='idle';return false;}
 if(u.type==='peasant'){releaseClaim(u);if(u.carry>0&&BLD[b.type].drop&&BLD[b.type].drop.includes(u.carryT)){const P=players[u.owner];P.res[u.carryT]+=u.carry;u.carry=0;u.carryT=null;}}
 u.inG=b;u.garB=null;u.state='inside';u.path=null;u.pend=null;u.target=null;u.amove=null;u.x=b.x;u.y=b.y;b.gar.push(u);
 if(time-(b.gsT||-9)>.4){b.gsT=time;sfx('garr',b.x,b.y,b.owner,0);}return true;}
function resumeWork(u){if(u.bld&&needsWork(u.bld)&&u.type==='peasant'){u.state='build';u.path=null;u.pend=null;return true;}u.bld=null;
 if(!u.job&&u.prevFarm){const pf=u.prevFarm;u.prevFarm=null;if(!pf.dead&&assignFarm(u,pf))return true;const f=findFarm(u.owner,u.x,u.y);if(f&&assignFarm(u,f))return true;}
 if(u.type==='peasant'&&u.job&&u.job.rt){const j=u.job;let i=j.ty*MAP+j.tx;if(!(resT[i]===RT[j.rt]&&claimOK(i,u))){const n=nearestRes(RT[j.rt],j.tx,j.ty,12,true,u);if(!n){u.job=null;return false;}j.tx=n[0];j.ty=n[1];i=j.ty*MAP+j.tx;}if(claim)claim[i]=u.id;}
 if(u.type==='peasant'&&u.job){u.state=u.job.farm?(u.job.farm.dead?'idle':'farm'):'gather';if(u.state==='idle')u.job=null;u.path=null;u.pend=null;return true;}return false;}
function ejectAll(b,destroyed){if(!b.gar||!b.gar.length)return 0;const list=b.gar.splice(0);const rp=b.rally;let n=0;
 for(const u of list){if(u.dead)continue;const s=nearestFree(Math.floor(b.x),Math.floor(b.y),rp?rp.x:b.x+1,rp?rp.y:b.y+b.h,u.owner,8);
  u.inG=null;u.x=s?s[0]+.5+rr(-.2,.2):b.x;u.y=s?s[1]+.5+rr(-.2,.2):b.y+b.h/2+.6;u.state='idle';u.guard={x:u.x,y:u.y};u.lastHit=-99;n++;
  if(destroyed)continue;if(resumeWork(u))continue;
  if(rp&&!rp.res&&!rp.farm){u.state='move';goTo(u,rp.x+rr(-.8,.8),rp.y+rr(-.8,.8));}}
 if(n)sfx('garr',b.x,b.y,b.owner,1);return n;}
// Town Bell: call nearest peasants first, then infantry, into the nearest Keep/Fortress/Tower with space; ring again to release.
function ringBell(pid,on,peasOnly){const P=players[pid];if(!P||P.surrendered)return;on=on==null?!P.bell:!!on;
 const myG=blds.filter(b=>b.owner===pid&&garCap(b));
 if(on){P.bell=true;P.bellT=time;const k=P.keep&&!P.keep.dead?P.keep:myG[0];sfx('tbell',k?k.x:null,k?k.y:null,pid,0);
  const free=new Map(myG.map(b=>[b,garFree(b)]));const R=26*Math.max(1,mapF()*.8);
  const cands=units.filter(u=>!u.dead&&u.owner===pid&&canGar(u)&&!u.inG&&u.state!=='garrison'&&(!peasOnly||u.type==='peasant')&&!(u.aiMission!=null&&u.type!=='peasant'));
  const near=u=>{let best=null,bd=1e9;for(const b of myG){if(free.get(b)<=0)continue;const d=distTo(u,b);if(d<bd){bd=d;best=b;}}return[best,bd];};
  const scored=cands.map(u=>{const [b,d]=near(u);return{u,d,pr:u.type==='peasant'?0:1};}).filter(o=>o.d<=R).sort((a,b)=>a.pr-b.pr||a.d-b.d);
  for(const o of scored){const [b]=near(o.u);if(!b)break;if(sendGarrison(o.u,b)){o.u.bellCall=true;free.set(b,free.get(b)-1);}}
  if(P.isHuman)msg('🔔 Town Bell! Peasants and infantry take shelter. Ring again (B on the Keep / Shift+B) to release.','#ffd27a',pid);}
 else{P.bell=false;const k=P.keep&&!P.keep.dead?P.keep:null;sfx('tbell',k?k.x:null,k?k.y:null,pid,1);
  for(const b of myG)ejectAll(b,false);
  for(const u of units)if(!u.dead&&u.owner===pid&&u.state==='garrison'){u.garB=null;u.state='idle';if(!resumeWork(u)){u.path=null;u.pend=null;}}
  if(P.isHuman)msg('All clear — garrisons released, peasants return to work.','#bfe6a0',pid);}}

// ===== construction & repair by peasants =====
const buildEff=n=>n>0?Math.pow(n,0.65):0; // diminishing returns: 1→1, 2→1.57, 4→2.46, 8→3.86
function buildersOf(b){let n=0;for(const u of units)if(!u.dead&&u.bld===b&&u.state==='build')n++;return n;}
function needsWork(b){return b&&!b.dead&&(!b.built||b.hp<b.maxhp-.5);}
function assignBuild(u,b){if(u.type!=='peasant'||u.inG||!needsWork(b)||b.owner!==u.owner)return false;releaseClaim(u);if(u.job&&u.job.farm){u.prevFarm=u.job.farm;u.job=null;}
 u.state='build';u.bld=b;u.bfail=0;u.target=null;u.amove=null;u.garB=null;u.wdT=time;const tp=approachPoint(u,b,0);goTo(u,tp.x,tp.y);return true;}
function finishBuild(u){const ob=u.bld;u.bld=null;
 // builders of a Farm that just got completed start farming it right away (2 slots); the rest move on
 if(ob&&!ob.dead&&ob.built&&ob.owner===u.owner&&time-(ob.doneT||-99)<3&&autoStart(u,ob))return;
 // chain to the next nearby own construction site (wall lines, several houses...)
 let best=null,bd=1e9;for(const b of blds){if(b===ob||b.dead||b.built||b.owner!==u.owner||(u.badBld===b&&time-u.badBldT<30))continue;const d=distTo(u,b);if(d>9||d>=bd)continue;if(buildersOf(b)>=(BLD[b.type].wall?1:3))continue;bd=d;best=b;}
 if(best&&assignBuild(u,best))return;
 u.state='idle';u.path=null;u.pend=null;if(!resumeWork(u))u.guard={x:u.x,y:u.y};}
function buildUpdate(u,dt){const b=u.bld;if(!needsWork(b)||b.owner!==u.owner){finishBuild(u);return;}
 const d=distTo(u,b);if(d<=1.0){u.path=null;u.pend=null;u.working=true;b.bN=(b.bN||0)+1;const sdx=(b.x-b.y)-(u.x-u.y);if(Math.abs(sdx)>.05)u.dir=sdx>0?1:-1;
  // AI repair crews that can't pay for the repair would stand there forever: release them (the site is avoided for 30 s)
  if(b.built&&players[u.owner].isAI&&time-(b.noFundsT||-99)<0.5&&time-(b.repT||-99)>3){u.badBld=b;u.badBldT=time;u.working=false;finishBuild(u);return;}
  if(time-(u.hT||-9)>.85){u.hT=time;u.swingT=time;if(Math.random()<.5)sfx('hammer',b.x,b.y,u.owner,b.built?1:0);}return;}
 if(!hasPath(u)||time-u.repathT>3){const tp=approachPoint(u,b,u.bfail);goTo(u,tp.x,tp.y);}
 if(moveAlong(u,dt)){u.path=null;if(distTo(u,b)>1.0){u.bfail++;if(u.bfail>4){if(!b.built)b.unreach=(b.unreach||0)+1;u.badBld=b;u.badBldT=time;finishBuild(u);}}}}
// send builders: the given peasants (round-robin over the sites), or the nearest idle peasant
function sendBuilders(pid,sites,peas){if(!sites.length)return 0;let n=0;
 if(peas&&peas.length){peas.forEach((u,i)=>{if(assignBuild(u,sites[i%sites.length]))n++;});return n;}
 const s=sites[0];let best=null,bd=1e9;for(const u of units){if(u.dead||u.inG||u.owner!==pid||u.type!=='peasant'||u.state!=='idle')continue;const d=dist(u.x,u.y,s.x,s.y);if(d<bd){bd=d;best=u;}}
 if(best&&assignBuild(best,s))return 1;return 0;}

// repairing costs 50% of the build cost (wood/stone only) for a full 0→100% repair, proportional to HP restored
const REPAIR_BASE={keep:{wood:200,stone:300}};
function repairCost(b,hp){const c=REPAIR_BASE[b.type]||BLD[b.type].cost;const o={};for(const r of ['wood','stone'])if(c[r])o[r]=c[r]*.5*hp/b.maxhp;return o;}
function repairAuto(pid,b){if(!b||b.dead||b.owner!==pid||!needsWork(b))return 0;const have=buildersOf(b);const want=Math.max(0,(BLD[b.type].wall?1:3)-have);if(!want)return 0;
 const c=units.filter(u=>!u.dead&&!u.inG&&u.owner===pid&&u.type==='peasant'&&u.state!=='build'&&u.state!=='garrison');
 c.sort((a,o)=>(a.state==='idle'?0:30)+dist(a.x,a.y,b.x,b.y)-((o.state==='idle'?0:30)+dist(o.x,o.y,b.x,b.y)));let n=0;
 for(const u of c){if(n>=want)break;if(u.state!=='idle'&&dist(u.x,u.y,b.x,b.y)>25)continue;if(assignBuild(u,b))n++;}return n;}

// builders of a just-completed Farm start farming it (2 slots); of a Lumber Camp / Quarry / Gold Mine start gathering the
// matching resource nearest to it (claim slots respected). Market/others: back to previous work.
const AUTO_RES={lumber:'wood',quarry:'stone',mine:'gold'};
function autoStart(u,b){if(b.type==='farm'){if(assignFarm(u,b)){u.prevFarm=null;return true;}return false;}
 const rt=AUTO_RES[b.type];if(!rt)return false;const n=nearestRes(RT[rt],b.x,b.y,14,true,u);if(!n)return false;
 const pj=u.job;if(assignGather(u,n[0],n[1])){u.prevFarm=null;return true;}u.job=pj;return false;}
function avoidNode(u,i){(u.avoid||(u.avoid=new Map())).set(i,time);if(u.avoid.size>12){const k=u.avoid.keys().next().value;u.avoid.delete(k);}}
// watchdog: a working peasant (gather/return/farm/build/garrison) that makes no progress for 6 s
// (no movement, no carry change, not working) gets unstuck: new node / drop site / farm, or goes idle for re-assignment.
const WD_STATES={gather:1,return:1,farm:1,build:1,garrison:1};
function peasantWatchdog(u){if(!WD_STATES[u.state]){u.wdT=time;u.wdS=u.state;return;}
 if(u.wdS!==u.state||u.working||u.wdC!==u.carry||u.wdX==null||Math.abs(u.x-u.wdX)+Math.abs(u.y-u.wdY)>.4){u.wdT=time;u.wdS=u.state;u.wdC=u.carry;u.wdX=u.x;u.wdY=u.y;return;}
 if(time-u.wdT<6)return;u.wdT=time;u.wdX=null;u.unstuck=(u.unstuck||0)+1;unstickPeasant(u);}
function unstickPeasant(u){u.path=null;u.pend=null;u.stuckN=2;const j=u.job;
 if(u.state==='gather'&&j&&j.rt){const i=j.ty*MAP+j.tx;if(claim&&claim[i]===u.id)claim[i]=0;avoidNode(u,i);const n=nearestRes(RT[j.rt],u.x,u.y,14,true,u);
  if(n){j.tx=n[0];j.ty=n[1];if(claim)claim[n[1]*MAP+n[0]]=u.id;}else{u.job=null;u.state='idle';}return;}
 if(u.state==='return'){if(u.dropB){u.badDrop=u.dropB.id;u.badDropT=time;}const nb=nearestDrop(u.owner,u.carryT,u.x,u.y,u);if(nb)startReturn(u);else{u.state='idle';}return;}
 if(u.state==='farm'){const f=j&&j.farm;u.job=null;const nf=blds.find(b=>!b.dead&&b!==f&&b.owner===u.owner&&b.type==='farm'&&b.built&&farmFree(b)&&dist(b.x,b.y,u.x,u.y)<20);if(nf&&assignFarm(u,nf))return;u.state='idle';return;}
 if(u.state==='build'){if(u.bld&&!u.bld.built&&distTo(u,u.bld)>1.0)u.bld.unreach=(u.bld.unreach||0)+1;u.badBld=u.bld;u.badBldT=time;u.bld=null;u.state='idle';resumeWork(u);return;}
 if(u.state==='garrison'){u.garB=null;u.state='idle';resumeWork(u);return;}}

// ===== building volleys =====
// base arrows + 1 per garrisoned peasant/infantry (weaker shot) + 2 per garrisoned archer.
// Arrows beyond VOLLEY_VIS per volley (or when the world holds PROJ_CAP projectiles) are merged into an arrow already
// flying at the same target: damage is preserved, p.n counts how many arrows it stands for (fewer objects to sim/render/send).
const GAR_ARROW_DMG=3,VOLLEY_VIS=16,PROJ_CAP=700;
function garVolley(b){let a=0,o=0;if(b.gar)for(const u of b.gar){if(u.type==='archer')a++;else o++;}return{a,o};}
function fireVolley(b,S,cands){const g=garVolley(b);const specs=[];
 // your defences engaging counts as combat for your battle music (silent 'atk' marker, throttled like hits)
 {const P=players[b.owner];if(P&&P.isHuman&&time-(P.atkT||-9)>0.25){P.atkT=time;sfx('atk',b.x,b.y,b.owner);}}
 for(let k=0;k<S.n;k++)specs.push([S.atk,'tower']);
 for(let k=0;k<g.a*2;k++)specs.push([UNITS.archer.atk,'archer']);
 for(let k=0;k<g.o;k++)specs.push([GAR_ARROW_DMG,'archer']);
 const cap=projs.length>=PROJ_CAP?Math.min(4,cands.length):VOLLEY_VIS;const made=[],byKey=new Map();
 specs.forEach(([dmg,at],k)=>{const v=cands[k%cands.length][1];const key=v.id+at;
  if(made.length<cap){const p={k:'arrow',sx:b.x,sy:b.y,sz:b.type==='tower'?52:40,t:v,tx:v.x,ty:v.y,life:0,dur:Math.max(.15,dist(b.x,b.y,v.x,v.y)/13),dmg,owner:b.owner,atype:at,att:null,n:1};
   projs.push(p);made.push(p);if(!byKey.has(key))byKey.set(key,p);return;}
  const into=byKey.get(key)||made.find(p=>p.t===v)||made[k%made.length];into.dmg+=dmg;into.n++;});}
