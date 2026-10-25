'use strict';
// ===== The Lowlands — single-file RTS =====
let MAP=96, MAPSZ='small';const STEP=1/30, CAP=10, PH=150, POP_MAX=200;   // population cap (Houses +8, Keep/Fortress +10)
const MAPSIZES={small:{f:1,label:'Small'},medium:{f:1.5,label:'Medium'},large:{f:2,label:'Large'}};

let seed=1;
function rnd(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}
const rr=(a,b)=>a+rnd()*(b-a), ri=(a,b)=>Math.floor(rr(a,b+1));
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
const RES=['food','wood','stone','gold'];
const RT={wood:1,stone:2,gold:3}, RTN=[null,'wood','stone','gold'];
// resource node capacity (doubled for a slower, longer game: tree 160, rock 720, gold 640)
const RES_AMT={wood:160,stone:720,gold:640};
const GRATE={wood:0.85,stone:0.7,gold:0.7}, FARM_RATE=0.6;

const UNITS={
 peasant:{name:'Peasant',hp:40,atk:3,range:0.6,cd:1.2,speed:1.75,sight:6,cost:{food:50},time:10,pop:1,cls:'inf',val:30,desc:'Gathers wood, stone, gold and farms food.'},
 spearman:{name:'Spearman',hp:95,atk:8,range:0.7,cd:1.1,speed:1.6,sight:7,cost:{food:50,wood:25},time:13,pop:1,cls:'inf',val:75,desc:'Sturdy infantry. x3 damage vs knights.'},
 archer:{name:'Archer',hp:60,atk:7,range:5.5,cd:1.5,speed:1.6,sight:8,cost:{food:30,wood:40,gold:15},time:14,pop:1,cls:'rng',val:85,proj:'arrow',desc:'Ranged. Good vs infantry, weak vs knights.'},
 knight:{name:'Knight',hp:170,atk:13,range:0.8,cd:1.3,speed:2.7,sight:8,cost:{food:80,gold:75},time:20,pop:2,cls:'cav',val:155,desc:'Fast heavy cavalry. Crushes archers & siege.'},
 catapult:{name:'Catapult',hp:130,atk:34,range:8.5,minRange:2.2,cd:4.5,speed:0.9,sight:12,cost:{wood:150,stone:60,gold:60},time:28,pop:3,cls:'siege',val:270,proj:'stone',splash:1.1,bldPref:true,desc:'Long-range siege (range 8.5, sees 12 tiles). Devastating vs buildings.'},
 trebuchet:{name:'Trebuchet',hp:220,atk:70,range:12,minRange:3.5,cd:7,speed:0.65,sight:13,cost:{wood:300,stone:150,gold:150},time:40,pop:4,cls:'siege',val:450,proj:'stone',splash:1.4,age:1,bldPref:true,desc:'Middle Ages heavy siege: range 12 (min 3.5), huge stones. Smashes buildings, slow to reload and move.'},
 ram:{name:'Siege Ram',hp:500,atk:40,range:0.9,cd:3,speed:1.1,sight:6,cost:{wood:250,gold:100},time:30,pop:3,cls:'siege',val:300,age:1,bldPref:true,desc:'Middle Ages armored ram: x5 damage vs buildings, very tough, nearly harmless to units.'},
};
const BONUS={trebuchet:{bld:4,inf:0.6,cav:0.5,rng:0.6,siege:1.5},ram:{bld:5,inf:0.15,cav:0.15,rng:0.15,siege:0.5},peasant:{bld:0.3},spearman:{cav:3,bld:0.5},archer:{inf:1.25,cav:0.7,bld:0.15,siege:0.6},knight:{rng:1.6,siege:1.5,bld:0.5},catapult:{bld:3.5,inf:0.8,cav:0.6,rng:0.8,siege:1.5},tower:{cav:0.9,siege:0.8},fortb:{bld:0.25}};
const ALLRES=['food','wood','stone','gold'];
const BLD={
 keep:{name:'Keep',w:3,h:3,hp:3000,cost:{},time:1,pop:10,drop:ALLRES,train:['peasant'],shoot:{range:7,atk:10,cd:0.8,n:4},gar:40,sight:10,val:600,desc:'Heart of your kingdom: fires 4 arrows every 0.8 s (+1 per garrisoned unit, +2 per archer). Lose it and you are defeated.'},
 house:{name:'House',w:2,h:2,hp:450,cost:{wood:50},time:14,pop:8,sight:4,val:50,desc:'+8 population.'},
 farm:{name:'Farm',w:2,h:2,hp:250,cost:{wood:60},time:10,sight:3,val:60,walk:true,desc:'2 peasants can farm food here. Right-click with peasants.'},
 lumber:{name:'Lumber Camp',w:2,h:2,hp:450,cost:{wood:80},time:14,drop:['wood'],sight:5,val:80,desc:'Wood drop-off. Build near forests.'},
 quarry:{name:'Quarry',w:2,h:2,hp:450,cost:{wood:80},time:14,drop:['stone'],sight:5,val:80,desc:'Stone drop-off. Build near rocks.'},
 mine:{name:'Gold Mine',w:2,h:2,hp:450,cost:{wood:80,stone:20},time:15,drop:['gold'],sight:5,val:100,desc:'Gold drop-off. Build near gold veins.'},
 market:{name:'Market',w:3,h:3,hp:800,cost:{wood:150,stone:50},time:30,income:0.5,sight:5,val:200,desc:'Trade income: +0.5 gold/sec.'},
 barracks:{name:'Barracks',w:3,h:3,hp:1200,cost:{wood:150},time:25,train:['spearman','archer'],sight:6,val:150,desc:'Trains spearmen and archers.'},
 stable:{name:'Stable',w:3,h:3,hp:1200,cost:{wood:150,gold:50},time:30,train:['knight'],sight:6,val:200,desc:'Trains knights.'},
 workshop:{name:'Siege Workshop',w:3,h:3,hp:1100,cost:{wood:200,stone:100,gold:50},time:35,train:['catapult','trebuchet','ram'],sight:6,val:350,desc:'Builds catapults; in the Middle Ages also trebuchets and siege rams.'},
 wall:{name:'Wall',w:1,h:1,hp:700,cost:{stone:6},time:4,wall:true,sight:2,val:6,desc:'Blocks movement. Click-drag to build a line.'},
 gate:{name:'Gate',w:1,h:1,hp:900,cost:{stone:20,wood:10},time:6,wall:true,gate:true,sight:3,val:30,desc:'Wall segment your own units can pass.'},
 tower:{name:'Tower',w:1,h:1,hp:900,cost:{stone:100,wood:40},time:22,shoot:{range:7,atk:9,cd:1.4,n:1},gar:6,sight:12,val:140,desc:'Shoots arrows at enemies in range (sees 12 tiles, beyond Fortress range). Garrisons 6 infantry/peasants; each adds an arrow (archers 2).'},
 fortress:{name:'Fortress',w:3,h:3,hp:3600,cost:{stone:400,wood:200,gold:150},time:55,pop:10,drop:ALLRES,shoot:{range:11.5,atk:8,cd:0.8,n:8,bld:true},gar:30,train:['spearman','archer','knight'],sight:12,val:750,desc:'Mighty stronghold: +10 pop, drop-off, trains troops, fires 8 arrows every 0.8 s (twice the Keep, +1 per garrisoned unit, +2 per archer) out to 11.5 tiles (catapult range + 3). Arrows deal 8 damage. With no enemy units in range it shoots enemy buildings, towers first (20 damage/s).'},
 university:{name:'University',w:3,h:3,hp:4500,cost:{food:5000,wood:5000,stone:5000,gold:5000},time:100,ageUp:1,sight:7,val:1500,desc:'Advances your kingdom to the Middle Ages when finished (kept even if it is later destroyed): trebuchets and siege rams, archers +3 range, spearmen and knights +20% health.'},
 lab:{name:'Research Lab',w:3,h:3,hp:6000,cost:{food:10000,wood:10000,stone:10000,gold:10000},time:140,ageUp:2,reqAge:1,nuke:true,sight:8,val:3000,desc:'Requires the Middle Ages. Advances your kingdom to the Modern Age when finished: Machine Gunners, Tanks, Infantry and Howitzers (+20% speed, +25% health, +50% damage). Builds nuclear bombs (10,000 of every resource each).'},
};
const GAR_T=['peasant','spearman','archer'];const canGar=u=>GAR_T.includes(u.type);
// ===== ages: 0 = start, 1 = Middle Ages (University), 2 = Modern Age (Research Lab). Per-owner stat modifiers on the same type keys.
const AGES=['Early Age','Middle Ages','Modern Age'];
const MODERN={
 archer:{name:'Machine Gunner',proj:'bullet',desc:'Modern ranged infantry: rapid bullets. Good vs infantry, weak vs tanks.'},
 knight:{name:'Tank',desc:'Modern armor: fast, heavily armored. Crushes gunners & artillery.'},
 spearman:{name:'Infantry',range:3,proj:'bullet',desc:'Modern riflemen: fire 3 tiles. x3 damage vs tanks.'},
 trebuchet:{name:'Howitzer',desc:'Modern artillery: range 12 (min 3.5), heavy shells. Smashes buildings.'},
};
const NUKE={cost:{food:10000,wood:10000,stone:10000,gold:10000},time:150,radius:30};
const SAT={cost:{food:3000,wood:3000,stone:3000,gold:3000},time:60,age:2};   // Modern Age satellite: permanent full-map vision
function ageStats(type,age){const B=UNITS[type],s=Object.assign({},B);
 if(age>=1){if(type==='archer')s.range=B.range+3;if(type==='spearman'||type==='knight')s.hp=Math.round(B.hp*1.2);}
 if(age>=2&&MODERN[type]){s.hp=Math.round(s.hp*1.25);s.atk=B.atk*1.5;s.speed=B.speed*1.2;Object.assign(s,MODERN[type]);s.modern=true;}
 const cm=Math.pow(2,Math.max(0,age-(B.age||0)));if(cm>1){s.cost={};for(const r in B.cost)s.cost[r]=B.cost[r]*cm;}   // unit costs double with each age after the unit first appears
 return s;}
const AGE_UNITS=[0,1,2].map(a=>{const o={};for(const k in UNITS)o[k]=ageStats(k,a);return o;});
const ageOf=o=>{const p=players[o];return (p&&p.age)||0;};
const US=(type,owner)=>AGE_UNITS[ageOf(owner)][type];   // effective stats of a unit type for this owner
const uD=u=>AGE_UNITS[ageOf(u.owner)][u.type];
const bigU=t=>t==='knight'||t==='catapult'||t==='trebuchet'||t==='ram';
const BUILD_MENU=['house','farm','lumber','quarry','mine','market','barracks','stable','workshop','wall','gate','tower','fortress','university','lab'];
const KINGDOMS=[
 {name:'Kingdom of Avalon',short:'Avalon',color:[58,120,220],pers:'builder'},
 {name:'Duchy of Ravenmoor',short:'Ravenmoor',color:[214,60,52],pers:'aggressive'},
 {name:'Realm of Eldmark',short:'Eldmark',color:[230,180,40],pers:'builder'},
 {name:'Stonehold Dominion',short:'Stonehold',color:[155,85,215],pers:'defensive'},
];
let STARTS=[[13,83],[83,13],[83,83],[13,13]];
// Map size: Small 96x96 (1x), Medium 144x144 (1.5x), Large 192x192 (2x). Re-sizes every MAP-sized buffer.
function setMapSize(sz){if(!MAPSIZES[sz])sz='small';MAPSZ=sz;const f=MAPSIZES[sz].f;MAP=Math.round(96*f);const e=Math.round(13+(f-1)*8),o=MAP-1-e;
 STARTS=[[e,o],[o,e],[o,o],[e,e]];HN=Math.ceil(MAP/HC);NN=MAP*MAP;
 if(gS.length!==NN){gS=new Float32Array(NN);from=new Int32Array(NN);stO=new Uint32Array(NN);stC=new Uint32Array(NN);HI=new Int32Array(NN*8);HF=new Float32Array(NN*8);stamp=0;}}
const mapF=()=>MAP/96;
const PERS={
 aggressive:{label:'Aggressive',peas:20,gather:{food:.45,wood:.3,stone:.05,gold:.2},comp:{spearman:.35,archer:.25,knight:.4,catapult:0},siegeT:480,siegeW:.12,firstAttack:210,wave:5,waveGrow:2,waveInt:75,guard:0,towers:1,walls:false,markets:0,fortressT:99999,barracksT:45,barracks2T:300,stableT:170,workshopT:460,maxArmy:45,hatePlayer:1.6},
 builder:{label:'Builder',peas:30,gather:{food:.38,wood:.3,stone:.12,gold:.2},comp:{spearman:.3,archer:.35,knight:.2,catapult:0},siegeT:380,siegeW:.15,firstAttack:400,wave:10,waveGrow:4,waveInt:120,guard:.15,towers:2,walls:false,markets:2,fortressT:560,barracksT:110,barracks2T:520,stableT:260,workshopT:380,maxArmy:55,hatePlayer:1.1},
 defensive:{label:'Defensive',peas:24,gather:{food:.36,wood:.26,stone:.24,gold:.14},comp:{spearman:.4,archer:.45,knight:.15,catapult:0},siegeT:450,siegeW:.15,firstAttack:480,wave:10,waveGrow:3,waveInt:150,guard:.45,towers:5,walls:true,markets:1,fortressT:500,barracksT:90,barracks2T:99999,stableT:400,workshopT:450,maxArmy:50,hatePlayer:1.0},
};
const DIFF={easy:{mult:.75,tm:1.4,wm:.75,bonus:0,label:'Easy'},normal:{mult:1,tm:1,wm:1,bonus:0,label:'Normal'},hard:{mult:1.3,tm:.8,wm:1.25,bonus:150,label:'Hard'}};

// ===== state =====
let tiles,resT,resA,treeV,gcls,bgrid,vis,visMap={},resEvents=[];
let units=[],blds=[],projs=[],parts=[],decals=[],players=[],msgs=[],pings=[],nukeFx=[];
let time=0,nextId=1,state='menu',difficulty='normal',fogOn=true,showHelp=false,pathBudget=10,pathExp=60000,pathEmerg=4,me=0,gameOver=false;
let sel=[],groups={},placing=null,wallStart=null,amoveMode=false,lastAlert=null,lastAlertT=-99;
let cam={x:0,y:0,z:1};
let mmDirty=true;
// resource claim slots: one gatherer per tree/rock/gold tile (claim[i] = unit id, 0 = free); farms keep their own 2 slots
let claim=null;const unitById=new Map();
function claimOK(i,u){if(!claim)return true;const c=claim[i];if(!c||c===u.id)return true;const o=unitById.get(c);
 if(!o||o.dead||!o.job||o.job.farm||o.job.ty*MAP+o.job.tx!==i||(o.state!=='gather'&&o.state!=='return')){claim[i]=0;return true;}return false;}
function releaseClaim(u){if(claim&&u.job&&!u.job.farm&&u.job.tx>=0){const i=u.job.ty*MAP+u.job.tx;if(claim[i]===u.id)claim[i]=0;}}
// sound events produced by the simulation: [kind,x,y,owner,extra] (drained by the client locally, or sent in LAN snapshots)
let sfxEv=[];
function sfx(k,x,y,o,e){if(sfxEv.length<400)sfxEv.push([k,x==null?-1:Math.round(x*10)/10,y==null?-1:Math.round(y*10)/10,o==null?-1:o,e==null?0:e]);}

// ===== map gen =====
function valueNoise(scale){const g=[],n=Math.ceil(MAP/scale)+2;for(let i=0;i<n*n;i++)g.push(rnd());
 return (x,y)=>{x/=scale;y/=scale;const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi;const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
 const a=g[yi*n+xi],b=g[yi*n+xi+1],c=g[(yi+1)*n+xi],d=g[(yi+1)*n+xi+1];return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;};}
function nearStart(x,y,r){return STARTS.some(s=>dist(x,y,s[0],s[1])<r);}
function inb(x,y){return x>=0&&y>=0&&x<MAP&&y<MAP;}
function putRes(x,y,t,a){if(!inb(x,y))return;const i=y*MAP+x;if(tiles[i]||resT[i])return;resT[i]=t;resA[i]=a;treeV[i]=Math.floor(rnd()*4);}
function forest(cx,cy,n){let x=Math.round(cx),y=Math.round(cy);for(let k=0;k<n;k++){x=clamp(x+ri(-1,1),1,MAP-2);y=clamp(y+ri(-1,1),1,MAP-2);if(dist(x,y,cx,cy)>4.5){x=Math.round(cx);y=Math.round(cy);}putRes(x,y,1,RES_AMT.wood);if(rnd()<.5)putRes(x+ri(-1,1),y+ri(-1,1),1,RES_AMT.wood);}}
function deposit(cx,cy,t,n){cx=Math.round(clamp(cx,2,MAP-3));cy=Math.round(clamp(cy,2,MAP-3));putRes(cx,cy,t,t===3?RES_AMT.gold:RES_AMT.stone);let c=0,tries=0;while(c<n&&tries<60){tries++;const x=cx+ri(-1,1),y=cy+ri(-1,1);const i=y*MAP+x;if(inb(x,y)&&!resT[i]&&!tiles[i]){putRes(x,y,t,t===3?RES_AMT.gold:RES_AMT.stone);c++;}}}
function genMap(s){
 for(let attempt=0;attempt<30;attempt++){
  seed=s+attempt*7919;
  tiles=new Uint8Array(MAP*MAP);resT=new Uint8Array(MAP*MAP);resA=new Float32Array(MAP*MAP);treeV=new Uint8Array(MAP*MAP);gcls=new Uint8Array(MAP*MAP);
  const nz=valueNoise(7),nz2=valueNoise(3);
  const F=mapF(),A2=F*F,C=MAP/2;
  for(let k=0;k<Math.round(7*A2);k++){let cx,cy,t=0;do{cx=rr(6,MAP-6);cy=rr(6,MAP-6);t++;}while((nearStart(cx,cy,20)||dist(cx,cy,C,C)<8)&&t<60);if(t>=60)continue;const r=rr(2.2,4.5);
   for(let y=Math.floor(cy-r-2);y<=cy+r+2;y++)for(let x=Math.floor(cx-r-2);x<=cx+r+2;x++){if(!inb(x,y))continue;if(dist(x,y,cx,cy)<r+(nz2(x,y)-.5)*2.5)tiles[y*MAP+x]=1;}}
  for(const st of STARTS){const a0=rnd()*Math.PI*2;const toC=Math.atan2(C-st[1],C-st[0]);
   const ang=[toC+1.6,toC-1.6,toC+.6,toC-.7];const order=[0,1,2,3].sort(()=>rnd()-.5);
   forest(st[0]+Math.cos(ang[order[0]])*9,st[1]+Math.sin(ang[order[0]])*9,45);
   forest(st[0]+Math.cos(ang[order[1]]+.3)*11,st[1]+Math.sin(ang[order[1]]+.3)*11,40);
   deposit(st[0]+Math.cos(ang[order[2]])*9,st[1]+Math.sin(ang[order[2]])*9,2,6);
   deposit(st[0]+Math.cos(ang[order[3]])*10,st[1]+Math.sin(ang[order[3]])*10,3,5);
   void a0;}
  for(let k=0;k<Math.round(34*A2);k++){const x=rr(3,MAP-3),y=rr(3,MAP-3);if(nearStart(x,y,12))continue;forest(x,y,ri(15,50));}
  for(let k=0;k<Math.round(5*A2);k++){const x=C+rr(-18,18)*F,y=C+rr(-18,18)*F;deposit(x,y,3,ri(5,8));}
  for(let k=0;k<Math.round(5*A2);k++){const x=C+rr(-28,28)*F,y=C+rr(-28,28)*F;if(nearStart(x,y,14))continue;deposit(x,y,2,ri(5,8));}
  // bigger maps: a secondary expansion (forest + stone + gold) a little further out from every start
  if(F>1)for(const st of STARTS){const a=Math.atan2(C-st[1],C-st[0])+rr(-.5,.5),d=15+8*(F-1);const ex=st[0]+Math.cos(a)*d,ey=st[1]+Math.sin(a)*d;forest(ex+rr(-4,4),ey+rr(-4,4),40);deposit(ex+rr(-3,3),ey+rr(-3,3),2,6);deposit(ex+rr(-3,3),ey+rr(-3,3),3,6);}
  for(const st of STARTS)for(let y=st[1]-6;y<=st[1]+6;y++)for(let x=st[0]-6;x<=st[0]+6;x++)if(inb(x,y)&&dist(x,y,st[0],st[1])<6.5){tiles[y*MAP+x]=0;resT[y*MAP+x]=0;}
  // connectivity
  const seen=new Uint8Array(MAP*MAP);const q=[STARTS[0][1]*MAP+STARTS[0][0]];seen[q[0]]=1;
  while(q.length){const c=q.pop();const cx=c%MAP,cy=(c/MAP)|0;for(let d=0;d<4;d++){const nx=cx+DX[d],ny=cy+DY[d];if(!inb(nx,ny))continue;const ni=ny*MAP+nx;if(seen[ni]||tiles[ni]||resT[ni])continue;seen[ni]=1;q.push(ni);}}
  if(!STARTS.every(st=>seen[st[1]*MAP+st[0]]))continue;
  // remove isolated resources pockets? keep. ground classes
  for(let y=0;y<MAP;y++)for(let x=0;x<MAP;x++){const i=y*MAP+x;
   if(tiles[i]===1){gcls[i]=6+((nz2(x,y)*2)|0)%2;continue;}
   let nw=false;for(let d=0;d<8;d++){const nx=x+DX[d],ny=y+DY[d];if(inb(nx,ny)&&tiles[ny*MAP+nx]===1)nw=true;}
   gcls[i]=nw?5:clamp(Math.floor(nz(x,y)*3+nz2(x,y)*2.2),0,4);}
  return;
 }
}
const DX=[1,-1,0,0,1,1,-1,-1],DY=[0,0,1,-1,1,-1,1,-1];

// ===== entities =====
function players_isEnemy(a,b){return a!==b&&b>=0&&a>=0&&!players[b].surrendered&&!players[a].surrendered;}
const isEnemy=players_isEnemy;
function spawnUnit(type,x,y,owner){const D=US(type,owner);const u={id:nextId++,kind:'unit',type,owner,x,y,hp:D.hp,maxhp:D.hp,state:'idle',path:null,pend:null,target:null,cd:0,carry:0,carryT:null,job:null,dir:1,anim:Math.random()*10,scanT:Math.random()*.5,amove:null,guard:null,leash:false,lastHit:-99,gt:0,gfail:0,repathT:0,stuckT:0,lx:x,ly:y,aiMission:null};units.push(u);unitById.set(u.id,u);return u;}
function spawnBld(type,tx,ty,owner,complete){const D=BLD[type];
 const b={id:nextId++,kind:'bld',type,owner,tx,ty,w:D.w,h:D.h,x:tx+D.w/2,y:ty+D.h/2,hp:complete?D.hp:D.hp*.1,maxhp:D.hp,built:!!complete,prog:complete?1:0,queue:[],trainT:0,cd:0,rally:null,workers:[],gar:[],lastHit:-99,blocked:false};
 blds.push(b);
 for(let y=ty;y<ty+D.h;y++)for(let x=tx;x<tx+D.w;x++)bgrid[y*MAP+x]=b;passGen++;
 if(!D.walk)for(const u of units){if(u.x>=tx-.2&&u.x<=tx+D.w+.2&&u.y>=ty-.2&&u.y<=ty+D.h+.2){const n=nearestFree(Math.floor(u.x),Math.floor(u.y),u.x,u.y,u.owner,6);if(n){u.x=n[0]+.5;u.y=n[1]+.5;u.path=null;u.pend=null;}}}
 mmDirty=true;return b;}
function passable(x,y,owner){if(x<0||y<0||x>=MAP||y>=MAP)return false;const i=y*MAP+x;if(tiles[i]||resT[i])return false;const b=bgrid[i];if(b){if(b.type==='farm')return true;if(b.type==='gate'&&b.owner===owner)return true;return false;}return true;}
function nearestFree(gx,gy,fx,fy,owner,maxR){
 for(let r=0;r<=maxR;r++){let best=null,bd=1e9;
  for(let y=gy-r;y<=gy+r;y++)for(let x=gx-r;x<=gx+r;x++){if(Math.max(Math.abs(x-gx),Math.abs(y-gy))!==r)continue;if(!passable(x,y,owner))continue;const d=dist(x+.5,y+.5,fx,fy);if(d<bd){bd=d;best=[x,y];}}
  if(best)return best;}
 return null;}
function exposed(x,y){for(let d=0;d<4;d++){const nx=x+DX[d],ny=y+DY[d];if(inb(nx,ny)){const i=ny*MAP+nx;if(!tiles[i]&&!resT[i]&&(!bgrid[i]||bgrid[i].type==='farm'))return true;}}return false;}
function nearestRes(t,x,y,maxR,needExposed=true,forU=null){x=Math.floor(x);y=Math.floor(y);
 for(let r=0;r<=maxR;r++){let best=null,bd=1e9;
  for(let yy=y-r;yy<=y+r;yy++){if(yy<0||yy>=MAP)continue;const step=(yy===y-r||yy===y+r)?1:2*r||1;
   for(let xx=x-r;xx<=x+r;xx+=step){if(xx<0||xx>=MAP)continue;const i=yy*MAP+xx;if(resT[i]!==t)continue;if(needExposed&&!exposed(xx,yy))continue;if(forU&&(!claimOK(i,forU)||(forU.avoid&&forU.avoid.has(i)&&time-forU.avoid.get(i)<45)))continue;const d=dist(xx,yy,x,y);if(d<bd){bd=d;best=[xx,yy];}}}
  if(best)return best;}
 return null;}

// ===== A* =====
let NN=MAP*MAP;let gS=new Float32Array(NN),from=new Int32Array(NN),stO=new Uint32Array(NN),stC=new Uint32Array(NN);let stamp=0;
let HI=new Int32Array(NN*8),HF=new Float32Array(NN*8);
// connected regions per owner (flood fill, recomputed lazily after buildings/resources change): a goal in another
// region (walled in, across water...) can't be reached, so the search gets a small budget for a best-effort approach
// instead of exhausting the full expansion cap - those failed searches were the server's worst CPU spikes (~50 ms)
let passGen=1,regionQ=null;const regions={},passGrids={};
// per-owner passability grid (1 = walkable), rebuilt lazily when passGen changes; A* reads it instead of calling passable()
function passGrid(owner){let R=passGrids[owner];if(R&&R.gen===passGen&&R.g.length===MAP*MAP)return R.g;const g=(R&&R.g.length===MAP*MAP)?R.g:new Uint8Array(MAP*MAP);
 for(let y=0,i=0;y<MAP;y++)for(let x=0;x<MAP;x++,i++)g[i]=passable(x,y,owner)?1:0;passGrids[owner]={gen:passGen,g};return g;}
function regionOf(owner){let R=regions[owner];if(R&&R.gen===passGen&&R.lab.length===MAP*MAP)return R.lab;
 const lab=(R&&R.lab.length===MAP*MAP)?R.lab:new Int32Array(MAP*MAP);lab.fill(0);let n=0;if(!regionQ||regionQ.length!==MAP*MAP)regionQ=new Int32Array(MAP*MAP);const q=regionQ;
 const PG=passGrid(owner);
 for(let i0=0;i0<MAP*MAP;i0++){if(lab[i0]||!PG[i0])continue;n++;let h=0,t=0;q[t++]=i0;lab[i0]=n;
  while(h<t){const c=q[h++],cx=c%MAP,cy=(c/MAP)|0;for(let d=0;d<8;d++){const nx=cx+DX[d],ny=cy+DY[d];if(nx<0||ny<0||nx>=MAP||ny>=MAP)continue;const ni=ny*MAP+nx;if(lab[ni]||!PG[ni])continue;
   if(d>=4&&(!PG[cy*MAP+nx]||!PG[ny*MAP+cx]))continue;lab[ni]=n;q[t++]=ni;}}}
 regions[owner]={gen:passGen,lab};return lab;}
function findPath(sx,sy,gx,gy,owner){
 sx=clamp(sx|0,0,MAP-1);sy=clamp(sy|0,0,MAP-1);gx=clamp(gx|0,0,MAP-1);gy=clamp(gy|0,0,MAP-1);
 if(!passable(gx,gy,owner)){const n=nearestFree(gx,gy,sx+.5,sy+.5,owner,8);if(!n)return null;gx=n[0];gy=n[1];}
 if(sx===gx&&sy===gy)return [];
 stamp++;let hl=0;const RL=regionOf(owner),rs=RL[sy*MAP+sx],cut=rs&&RL[gy*MAP+gx]!==rs;const expCap=cut?1500:Math.min(9000*MAP*MAP/9216,Math.max(3000,pathExp));
 const push=(i,f)=>{let k=hl++;while(k>0){const p=(k-1)>>1;if(HF[p]<=f)break;HI[k]=HI[p];HF[k]=HF[p];k=p;}HI[k]=i;HF[k]=f;};
 const pop=()=>{const top=HI[0];hl--;if(hl>0){const li=HI[hl],lf=HF[hl];let k=0;for(;;){let c=2*k+1;if(c>=hl)break;if(c+1<hl&&HF[c+1]<HF[c])c++;if(HF[c]>=lf)break;HI[k]=HI[c];HF[k]=HF[c];k=c;}HI[k]=li;HF[k]=lf;}return top;};
 // weighted A* (w=1.35): near-optimal paths with far fewer expansions on the big maps
 const h=(x,y)=>{const dx=Math.abs(x-gx),dy=Math.abs(y-gy);return (dx+dy-0.5858*Math.min(dx,dy))*1.35;};
 const PG=passGrid(owner),M1=MAP-1;
 const si=sy*MAP+sx,gi=gy*MAP+gx;gS[si]=0;stO[si]=stamp;from[si]=-1;push(si,h(sx,sy));
 let best=si,bestH=h(sx,sy),exp=0;
 while(hl>0&&hl<HI.length-16){const cur=pop();if(stC[cur]===stamp)continue;stC[cur]=stamp;
  if(cur===gi){best=cur;break;}
  const cx=cur%MAP,cy=(cur/MAP)|0;const hc=h(cx,cy);if(hc<bestH){bestH=hc;best=cur;}
  if(++exp>expCap)break;
  for(let d=0;d<8;d++){const nx=cx+DX[d],ny=cy+DY[d];if(nx<0||ny<0||nx>M1||ny>M1)continue;const ni=ny*MAP+nx;if(!PG[ni])continue;
   if(d>=4&&(!PG[cy*MAP+nx]||!PG[ny*MAP+cx]))continue;if(stC[ni]===stamp)continue;const ng=gS[cur]+(d>=4?1.4142:1);
   if(stO[ni]!==stamp||ng<gS[ni]){stO[ni]=stamp;gS[ni]=ng;from[ni]=cur;push(ni,ng+h(nx,ny));}}}
 const pts=[];let c=best,g=0;while(c!==-1&&c!==si&&g++<NN){pts.push([c%MAP+.5,((c/MAP)|0)+.5]);c=from[c];}
 pathExp-=exp;pts.reverse();return pts;}
function lineClear(x0,y0,x1,y1,owner){const d=Math.hypot(x1-x0,y1-y0);if(d<0.01)return passable(Math.floor(x1),Math.floor(y1),owner);
 const n=Math.ceil(d/0.25);const px=-(y1-y0)/d*0.2,py=(x1-x0)/d*0.2,PG=passGrid(owner);   // same result as passable(), from the cached grid
 for(let k=1;k<=n;k++){const t=k/n;const x=x0+(x1-x0)*t,y=y0+(y1-y0)*t;
  const ax=Math.floor(x+px),ay=Math.floor(y+py),bx=Math.floor(x-px),by=Math.floor(y-py);
  if(ax<0||ay<0||ax>=MAP||ay>=MAP||!PG[ay*MAP+ax]||bx<0||by<0||bx>=MAP||by>=MAP||!PG[by*MAP+bx])return false;}
 return true;}
function smooth(sx,sy,pts,owner){if(pts.length<2)return pts;const out=[];let cx=sx,cy=sy,i=0;
 while(i<pts.length){let j=Math.min(pts.length-1,i+14);while(j>i&&!lineClear(cx,cy,pts[j][0],pts[j][1],owner))j--;out.push(pts[j]);cx=pts[j][0];cy=pts[j][1];i=j+1;}
 return out;}
function goTo(u,x,y){u.repathT=time;u.goal={x,y};
 if(!(u.stuckN>=2)&&lineClear(u.x,u.y,x,y,u.owner)){u.path=[[x,y]];u.pend=null;return;}
 u.path=[];u.pend={x,y};}
// long paths are shared: a unit starting within 8 tiles of a recent long path's start and heading within 4 tiles of its goal
// (an army ordered across the map) reuses that raw A* path, joined at both ends by straight, clear lines. Entries die when
// passability changes or after 8 s.
const pathCache=new Map();let pathCacheGen=-1,pathHits=0;
function sharedPath(u,tx,ty,x,y){if(pathCacheGen!==passGen){pathCache.clear();pathCacheGen=passGen;}
 const E=pathCache.get(u.owner);if(!E)return null;let tries=0;
 for(let n=E.length-1;n>=0&&tries<3;n--){const e=E[n];if(time-e.t>8)break;
  if(Math.abs(e.gx-tx)>4||Math.abs(e.gy-ty)>4||Math.abs(e.sx-u.x)>8||Math.abs(e.sy-u.y)>8)continue;tries++;
  const P=e.p,L=P.length;let i0=-1,i1=-1;
  for(let i=Math.min(11,L-1);i>=0;i--)if(lineClear(u.x,u.y,P[i][0],P[i][1],u.owner)){i0=i;break;}if(i0<0)continue;
  if(!e.full||(e.gx===tx&&e.gy===ty)){pathHits++;return P.slice(i0);}   // same goal tile, or a capped (partial) search: share it as is (a partial one is re-planned at its end)
  for(let i=Math.max(i0,L-8);i<L;i++)if(lineClear(P[i][0],P[i][1],x,y,u.owner)){i1=i;break;}if(i1<0)continue;
  pathHits++;const out=P.slice(i0,i1+1);out.push([tx+.5,ty+.5]);return out;}
 return null;}
function computePath(u){const {x,y}=u.pend;u.pend=null;const tx=Math.floor(x),ty=Math.floor(y);
 const far=Math.abs(tx-u.x)+Math.abs(ty-u.y)>16,hit=far?sharedPath(u,tx,ty,x,y):null;
 const p=hit||findPath(Math.floor(u.x),Math.floor(u.y),tx,ty,u.owner);if(!p){u.path=[];return;}
 if(!hit&&far&&p.length>=12){const last=p[p.length-1];let E=pathCache.get(u.owner);if(!E)pathCache.set(u.owner,E=[]);
  E.push({sx:u.x,sy:u.y,gx:tx,gy:ty,p,t:time,full:Math.floor(last[0])===tx&&Math.floor(last[1])===ty});if(E.length>24)E.shift();}
 const sp=u.stuckN>=2?p.slice():smooth(u.x,u.y,p,u.owner);
 if(passable(tx,ty,u.owner)){if(sp.length&&Math.floor(sp[sp.length-1][0])===tx&&Math.floor(sp[sp.length-1][1])===ty)sp[sp.length-1]=[x,y];else if(!sp.length)sp.push([x,y]);}
 u.path=sp;}
const hasPath=u=>!!(u.pend||(u.path&&u.path.length));
function moveAlong(u,dt){
 if(u.pend){if(pathBudget>0&&pathExp>0){pathBudget--;u.pw=0;computePath(u);}else if((u.pw=(u.pw||0)+1)>18&&pathEmerg>0){pathEmerg--;u.pw=0;computePath(u);}return false;}
 if(!u.path||!u.path.length)return true;
 const p=u.path[0];const dx=p[0]-u.x,dy=p[1]-u.y,d=Math.hypot(dx,dy);const step=uD(u).speed*dt;
 if(d>1e-4){u.hx=dx/d;u.hy=dy/d;}
 if(u.yieldT>time&&!(u.ghostT>time)){u.moving=true;return false;}   // giving way to a unit coming the other way (see separation)
 if(Math.abs(dx-dy)>0.01)u.dir=(dx-dy)>0?1:-1;
 if(d<=step){u.x=p[0];u.y=p[1];u.path.shift();return !u.path.length;}
 u.x+=dx/d*step;u.y+=dy/d*step;u.moving=true;return false;}
