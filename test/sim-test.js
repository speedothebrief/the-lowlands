// Headless soak test of the shared simulation (1 idle human + 3 AIs, or 4 AIs with "ai").
// usage: node test/sim-test.js [ai] [small|medium|large] [minutes]
'use strict';
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('/*SIM-BEGIN*/'),html.indexOf('/*SIM-END*/'));
const c=vm.createContext({console});
vm.runInContext(src+';globalThis.API={setupGame,sim,applyCmd,makeSnap,STEP,get:()=>({units,blds,players,time,gameOver,msgs,MAP})};',c);
const A=c.API;const args=process.argv.slice(2);const human=!args.includes('ai');
const size=args.find(a=>['small','medium','large'].includes(a))||'small';const mins=+(args.find(a=>/^\d+$/.test(a))||(size==='small'?25:30));
A.setupGame(12345,[{human,name:'T'}],'normal',true,size);
let fails=0;const ok=(v,m)=>{console.log((v?'PASS ':'FAIL ')+m);if(!v)fails++;};
console.log(`map ${size} ${A.get().MAP}x${A.get().MAP}, ${mins} game-minutes, ${human?'idle human + 3 AI':'4 AI'}`);
const t0=Date.now();let lastLog=0,worst=0,maxBuilt={},bellRung=new Set(),surr=[];
for(let s=0;s<30*60*mins;s++){const ts=Date.now();A.sim(A.STEP);worst=Math.max(worst,Date.now()-ts);const g=A.get();
 for(const p of g.players){if(p.bell)bellRung.add(p.id);if(p.surrendered&&!surr.includes(p.short))surr.push(p.short);}
 if(s%300===0)for(const p of g.players){const nb=g.blds.filter(b=>b.owner===p.id&&b.built&&b.type!=='wall').length;maxBuilt[p.id]=Math.max(maxBuilt[p.id]||0,nb);}
 if(g.time-lastLog>=120){lastLog=g.time;const sum=g.players.map(p=>{const us=g.units.filter(u=>u.owner===p.id);const bs=g.blds.filter(b=>b.owner===p.id);return `${p.short}${p.surrendered?'(X)':''}: peas ${us.filter(u=>u.type==='peasant').length} army ${us.filter(u=>u.type!=='peasant').length} blds ${bs.length} (${bs.filter(b=>!b.built).length} sites) inside ${us.filter(u=>u.inG).length} trained ${p.stats.trained} res ${Object.values(p.res).map(v=>v|0).join('/')}`;});
  console.log('t='+(g.time|0),'\n  '+sum.join('\n  '));}
 if(g.gameOver){console.log('GAME OVER at',g.time|0);break;}}
const g=A.get();const wall=Date.now()-t0,steps=Math.round(g.time*30);
console.log(g.msgs.slice(-10).map(m=>m.t).join('\n'));
const snap=JSON.stringify(A.makeSnap());
ok(true,`no exceptions; ${steps} steps in ${wall} ms (avg ${(wall/steps).toFixed(2)} ms/step, worst ${worst} ms; budget 33 ms)`);
ok(wall/steps<8,'average step cost is well inside the 30 Hz budget');
for(const p of g.players)if(p.isAI)ok(p.stats.trained>=12||p.surrendered,`${p.short} (AI) trained units (${p.stats.trained}) and peasants built ${maxBuilt[p.id]} buildings`);
ok(g.players.filter(p=>p.isAI).every(p=>maxBuilt[p.id]>=6),'every AI got peasants to construct at least 6 non-wall buildings');
if(human)ok(surr.length>0,`the war progresses: surrenders = ${surr.join(', ')||'none'}`);
console.log('AIs that rang the Town Bell:',[...bellRung].map(i=>g.players[i].short).join(', ')||'none','| snapshot bytes',snap.length);
console.log(fails?fails+' FAILURES':'SIM SOAK PASSED');process.exit(fails?1:0);
