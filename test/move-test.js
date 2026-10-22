// Movement test (headless): crowds of units crossing / squeezing through gaps must not get stuck "dancing" around each other.
// Scenarios: two opposing columns through a 1-tile and a 2-tile gap in a wall, two groups crossing at right angles in the
// open, and two head-on groups in the open. Asserts every unit arrives within a time budget and nobody oscillates in place.
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('/*SIM-BEGIN*/'),html.indexOf('/*SIM-END*/'));
let fails=0;const ok=(v,m)=>{console.log((v?'PASS ':'FAIL ')+m);if(!v)fails++;};
function world(){const c=vm.createContext({console,Math});vm.runInContext(src+';globalThis.API={setupGame,sim,applyCmd,spawnUnit,spawnBld,STEP,get:()=>({units,blds,players,tiles,resT,MAP,bgrid}),bump:()=>{passGen++;}};',c);return c.API;}
function scenario(name,{gap=null,gate=false,park=0,a,b,typeA='spearman',typeB='spearman',n=10,budget=40}){
 const A=world();A.setupGame(9090,[{human:true},{human:true},{human:true},{human:true}],'normal',false,'medium');const g=A.get();const M=g.MAP,cx=M>>1,cy=M>>1;
 // clear a 40x40 field in the middle (no water / resources / buildings), remove every other unit
 for(let y=cy-20;y<cy+20;y++)for(let x=cx-20;x<cx+20;x++){const i=y*M+x;g.tiles[i]=0;g.resT[i]=0;}
 for(const u of g.units)u.dead=true;
 if(gap){for(let y=cy-12;y<=cy+12;y++){if(y>=cy&&y<cy+gap){if(gate)A.spawnBld('gate',cx,y,0,true);continue;}A.spawnBld('wall',cx,y,0,true);}}
 if(park){for(let k=0;k<park;k++){const u=A.spawnUnit('archer',cx+1.5+(k%2)*.6,cy+.3+((k/2)|0)*.6,0);u.guard={x:u.x,y:u.y};}}
 A.bump();
 const mk=(t,cnt,x0,y0,dx,dy,cols)=>{const out=[];for(let k=0;k<cnt;k++){const r=k%cols,q=(k/cols)|0;out.push(A.spawnUnit(t,x0+r*dx*.8+q*dy*.8,y0+r*dy*.8+q*dx*.8,0));}return out;};
 const G1=mk(typeA,n,cx+a[0],cy+a[1],a[2],a[3],a[4]),G2=mk(typeB,n,cx+b[0],cy+b[1],b[2],b[3],b[4]);
 A.applyCmd(0,{t:'move',ids:G1.map(u=>u.id),x:cx+a[5],y:cy+a[6]});A.applyCmd(0,{t:'move',ids:G2.map(u=>u.id),x:cx+a[7],y:cy+a[8]});
 const all=G1.concat(G2);const goal=u=>G1.includes(u)?[cx+a[5],cy+a[6]]:[cx+a[7],cy+a[8]];
 const arrived=u=>!(u.path&&u.path.length)&&!u.pend&&u.goal&&Math.hypot(u.x-u.goal.x,u.y-u.goal.y)<2.5;
 const hist=new Map(all.map(u=>[u,[]]));let t=0,done=-1,osc=0,stallWho=null;
 for(let s=0;s<budget*30;s++){A.sim(A.STEP);t+=A.STEP;
  if(s%15===0)for(const u of all){const h=hist.get(u);h.push([u.x,u.y,!!(u.path&&u.path.length)||!!u.pend]);
   // dancing: under way, > 2 tiles from its goal, walked > 2.5 tiles in the last 3 s but got < 0.4 tiles anywhere (back and forth)
   if(h.length>6){const w=h.slice(-7);let walked=0;for(let q=1;q<w.length;q++)walked+=Math.hypot(w[q][0]-w[q-1][0],w[q][1]-w[q-1][1]);const net=Math.hypot(w[6][0]-w[0][0],w[6][1]-w[0][1]);
    const gg=u.goal||{x:u.x,y:u.y};if(w[0][2]&&w[6][2]&&net<.4&&walked>2.5&&Math.hypot(u.x-gg.x,u.y-gg.y)>2){osc++;if(!stallWho)stallWho={id:u.id,x:u.x.toFixed(1),y:u.y.toFixed(1),t:t.toFixed(1),walked:walked.toFixed(1)};}}}
  if(done<0&&all.every(arrived)){done=t;break;}}
 const far=all.filter(u=>!arrived(u)).length;
 if(process.env.MV_DEBUG&&done<0)for(const u of all.filter(u=>!arrived(u)))console.log('  away',u.id,u.state,u.x.toFixed(2),u.y.toFixed(2),'goal',u.goal&&[u.goal.x.toFixed(2),u.goal.y.toFixed(2)],'path',u.path&&u.path.length,'pend',!!u.pend,'stuckN',u.stuckN);
 ok(done>0&&!stallWho,`${name}: all ${all.length} units arrive (${done>0?done.toFixed(1)+' s':'NOT within '+budget+' s, '+far+' still away'}), no back-and-forth dancing (${osc} oscillating samples)${stallWho?' first: '+JSON.stringify(stallWho):''}`);
 return done;}
const t0=Date.now();
scenario('two columns through a 1-tile wall gap',{gap:1,a:[-8,-1,1,0,2, 8,0, -8,0],b:[8,-1,-1,0,2],n:8,budget:60});
scenario('two columns through a 2-tile wall gap',{gap:2,a:[-8,-1,1,0,2, 8,1, -8,1],b:[8,-1,-1,0,2],n:10,budget:50});
scenario('two groups crossing at right angles (open field)',{a:[-10,-2,1,0,4, 10,0, 0,10],b:[-2,-10,0,1,4],n:12,budget:30});
scenario('two groups head-on (open field)',{a:[-10,-2,1,0,4, 10,0, -10,0],b:[8,-2,1,0,4],n:12,budget:30});
scenario('knights and spearmen head-on (open field)',{a:[-10,-2,1,0,4, 10,0, -10,0],b:[8,-2,1,0,4],typeA:'knight',n:10,budget:30});
scenario('16 vs 16 through a 1-tile gap',{gap:1,a:[-8,-2,1,0,4, 8,0, -8,0],b:[8,-2,-1,0,4],n:16,budget:90});
scenario('12 vs 12 through a Gate',{gap:1,gate:true,a:[-8,-2,1,0,3, 8,0, -8,0],b:[8,-2,-1,0,3],n:12,budget:80});
scenario('columns through a 2-tile gap with idle archers parked behind it',{gap:2,park:4,a:[-8,-1,1,0,2, 8,4, -8,1],b:[8,-1,-1,0,2],n:8,budget:60});
scenario('20 vs 20 crossing at right angles',{a:[-12,-2,1,0,5, 12,0, 0,12],b:[-2,-12,0,1,5],n:20,budget:40});
scenario('peasants head-on',{a:[-10,-2,1,0,4, 10,0, -10,0],b:[8,-2,1,0,4],typeA:'peasant',typeB:'peasant',n:12,budget:30});
console.log(`(${((Date.now()-t0)/1000).toFixed(1)} s)`);
console.log(fails?fails+' FAILURES':'ALL MOVEMENT TESTS PASSED');process.exit(fails?1:0);
