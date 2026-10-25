// ===== network snapshot (server side) =====
const UT=Object.keys(UNITS),BT=Object.keys(BLD),STN=['idle','move','attack','gather','return','farm','garrison','inside','build'];
const r2=v=>Math.round(v*100)/100;
function makeSnap(){
 const F=parts.splice(0).slice(-120).map(q=>[r2(q.x),r2(q.y),r2(q.z),r2(q.vx),r2(q.vy),r2(q.vz),r2(q.life),q.c,q.s,q.smoke?1:0]);
 const D=decals.filter(d=>!d.sent).map(d=>{d.sent=true;return d.k==='rubble'?[0,d.x,d.y,d.w,d.h,r2(d.t)]:[1,r2(d.x),r2(d.y),d.c,r2(d.t)];});
 return{tm:r2(time),go:gameOver?1:0,
  P:players.map(p=>[Math.floor(p.res.food),Math.floor(p.res.wood),Math.floor(p.res.stone),Math.floor(p.res.gold),p.pop,p.popCap,p.surrendered?1:0,p.stats.trained,p.stats.killed,p.stats.lost,p.isHuman?1:0,p.bell?1:0,p.age||0,p.nukes||0,p.sat?1:0]),
  U:units.filter(u=>!u.dead&&!u.inG).map(u=>[u.id,UT.indexOf(u.type),u.owner,r2(u.x),r2(u.y),Math.ceil(u.hp),STN.indexOf(u.state),u.dir,(u.moving?1:0)|(u.working?2:0)|(u.amove?4:0),u.carry,u.carryT?RT[u.carryT]:0,u.swingT&&time-u.swingT<3?r2(u.swingT):0,u.fireT&&time-u.fireT<3?r2(u.fireT):0,(u.type==='catapult'||u.type==='trebuchet')?Math.round(u.cd*10)/10:0,u.job?(u.job.farm?4:RT[u.job.rt]):0]),
  B:blds.filter(b=>!b.dead).map(b=>[b.id,BT.indexOf(b.type),b.owner,b.tx,b.ty,Math.ceil(b.hp),b.built?1:0,r2(b.prog),b.queue.map(q=>UT.indexOf(q)),r2(b.trainT),b.blocked?1:0,b.rally?[r2(b.rally.x),r2(b.rally.y)]:0,b.type==='farm'?(farmFree(b),b.workers.length):0,b.gar&&b.gar.length?[b.gar.length,garArchers(b),b.gar.filter(u=>u.type==='peasant').length]:0,b.bc||0,b.repT&&time-b.repT<.5?1:0,b.nukeQ?r2(b.nukeT):-1,b.satQ?r2(b.satT):-1]),
  J:projs.map(p=>[p.k==='arrow'?0:p.k==='bullet'?2:p.shell?3:1,r2(p.sx),r2(p.sy),r2(p.tx),r2(p.ty),r2(p.life),r2(p.dur),p.sz||0]),
  R:resEvents.splice(0),F,D,K:pings.splice(0).map(p=>[r2(p.x),r2(p.y),r2(p.t),p.o]),M:msgs.splice(0).map(m=>[m.t,m.c,m.to]),S:sfxEv.splice(0),N:nukeFx.map(f=>[r2(f.sx),r2(f.sy),r2(f.tx),r2(f.ty),r2(f.t0),r2(f.dur),f.owner,r2(f.boomT),f.sat?1:0])};}
function mapData(){return{size:MAPSZ,tiles:Array.from(tiles),resT:Array.from(resT),resA:Array.from(resA,v=>Math.round(v))};}
function playersMeta(){return players.map(p=>({name:p.name,short:p.short,color:p.color,pers:p.pers,isHuman:p.isHuman,pname:p.pname}));}
