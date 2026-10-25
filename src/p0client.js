// ===== client: canvas =====
const cv=document.getElementById('c');const ctx=cv.getContext('2d');
let W=800,H=600;
function resize(){W=cv.width=window.innerWidth;H=cv.height=window.innerHeight;}
window.addEventListener('resize',resize);resize();
let endInfo=null,mode='local',endShown=false,lastClick={t:0,type:null};

// ===== client: build hotkeys (B, then a letter), garrison & bell helpers =====
let buildMenuOpen=false,placeSticky=false,mapSize=(()=>{try{const v=localStorage.getItem('kom_map');return MAPSIZES[v]?v:'small';}catch(e){return 'small';}})();
const BUILD_KEYS={house:'H',farm:'F',lumber:'L',quarry:'Q',mine:'G',market:'M',barracks:'B',stable:'S',workshop:'W',wall:'A',gate:'E',tower:'T',fortress:'O',university:'U',lab:'R'};
const BUILD_KEY_OF={};for(const t in BUILD_KEYS)BUILD_KEY_OF[BUILD_KEYS[t].toLowerCase()]=t;
function startPlacing(ty,sticky){if(BLD[ty].reqAge&&(players[me].age||0)<BLD[ty].reqAge){msg(`The ${BLD[ty].name} requires the ${AGES[BLD[ty].reqAge]} — build a University first.`,'#ff9a8a',me);AU.play('err');return;}nukeMode=false;placing=ty;placeSticky=!!sticky;wallStart=null;amoveMode=false;AU.ui('click');if(!afford(players[me],BLD[ty].cost))msg('Not enough resources for '+BLD[ty].name+'.','#ff9a8a',me);}
function repairSel(){const b=sel[0];if(b&&b.kind==='bld'&&b.owner===me){if(b.built&&b.hp>=b.maxhp-.5){msg('That building is not damaged.','#cdbb90',me);AU.play('err');return;}issue({t:'repairauto',bid:b.id});AU.play('ord_gather');}}
function bellCmd(){issue({t:'bell'});}
function garrisonSel(){const own=sel.filter(u=>u.kind==='unit'&&u.owner===me&&!u.dead);if(!own.length)return;const el=own.filter(canGar);
 if(!el.length){msg('Only peasants, spearmen and archers can garrison.','#ff9a8a',me);AU.play('err');return;}issue({t:'garrison',ids:el.map(u=>u.id)});AU.play('ord_move');}
function unloadSel(){const b=sel[0];if(b&&b.kind==='bld'&&b.owner===me&&BLD[b.type].gar){issue({t:'unload',bid:b.id});}}
const garN=b=>b.garN!=null?b.garN:(b.gar?b.gar.length:0);
const garInfo=b=>b.gar&&b.garN==null?{n:b.gar.length,a:b.gar.filter(u=>u.type==='archer').length,p:b.gar.filter(u=>u.type==='peasant').length}:{n:b.garN||0,a:b.garA||0,p:b.garP||0};
// ===== age-up flair (client only, cheap; reads players[].age so it works locally and over the network) =====
const ageFx={last:{},banner:null,small:[],fl:{},burst:null,
 reset(){this.last={};this.banner=null;this.small=[];this.fl={};this.burst=null;},
 tick(){for(const p of players){const a=p.age||0,prev=this.last[p.id];this.last[p.id]=a;if(prev==null||a<=prev)continue;const now=performance.now();this.fl[p.id]=now;
  if(p.id===me){this.banner={t:now,age:a};const b=blds.filter(o=>!o.dead&&o.owner===me&&o.built&&BLD[o.type].ageUp===a).pop();if(b)this.burst={x:b.x,y:b.y,t:now};}
  else this.small.push({t:now,txt:`${p.short||p.name} has entered the ${AGES[a]}`,c:p.color});}},
 // sparkle on units of a kingdom that just advanced (their sprites switch at the same moment)
 unitFlash(u){const t0=this.fl[u.owner];if(!t0)return;const k=(performance.now()-t0)/1600;if(k<0||k>1)return;
  ctx.save();ctx.globalAlpha=1-k;ctx.fillStyle='#fff6c0';ctx.beginPath();ctx.ellipse(0,-10,10+8*k,14+6*k,0,0,7);ctx.globalAlpha=(1-k)*.45;ctx.fill();ctx.globalAlpha=1-k;
  for(let i=0;i<6;i++){const an=i/6*6.283+k*4,r=8+k*14;ctx.fillRect(Math.cos(an)*r-1,-12+Math.sin(an)*r*.8-1,2.5,2.5);}ctx.restore();},
 drawWorld(){const B=this.burst;if(!B)return;const k=(performance.now()-B.t)/2500;if(k>1){this.burst=null;return;}const c=iso(B.x,B.y);
  ctx.save();ctx.globalCompositeOperation='lighter';const r=40+260*k;const g=ctx.createRadialGradient(c[0],c[1]-40,0,c[0],c[1]-40,r);g.addColorStop(0,`rgba(255,240,170,${.8*(1-k)})`);g.addColorStop(1,'rgba(255,200,80,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(c[0],c[1]-40,r,0,7);ctx.fill();
  ctx.strokeStyle=`rgba(255,235,160,${.7*(1-k)})`;ctx.lineWidth=3;for(let i=0;i<16;i++){const an=i/16*6.283+k;ctx.beginPath();ctx.moveTo(c[0]+Math.cos(an)*r*.3,c[1]-40+Math.sin(an)*r*.3);ctx.lineTo(c[0]+Math.cos(an)*r,c[1]-40+Math.sin(an)*r);ctx.stroke();}ctx.restore();},
 drawUI(){const now=performance.now();const B=this.banner;
  if(B){const t=(now-B.t)/1000;if(t>4.5)this.banner=null;else{const a=t<.6?t/.6:t>3.3?Math.max(0,(4.5-t)/1.2):1;const y=H*.28;ctx.save();ctx.globalAlpha=a;
   const g=ctx.createLinearGradient(0,y-50,0,y+40);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.5,'rgba(20,14,6,.75)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,y-60,W,110);
   ctx.textAlign='center';ctx.font='bold '+Math.round(46+6*Math.min(1,t))+'px Georgia, serif';ctx.fillStyle=B.age===2?'#bfe8ff':'#ffd36a';ctx.shadowColor=B.age===2?'#4ab0ff':'#ff9a2a';ctx.shadowBlur=24;
   ctx.fillText(B.age===2?'The Modern Age':'The Middle Ages',W/2,y);ctx.shadowBlur=0;ctx.font='16px Georgia, serif';ctx.fillStyle='#f3e6c4';
   ctx.fillText(B.age===2?'Machine Gunners, Tanks, Infantry and Howitzers — +20% speed, +25% health, +50% damage':'Trebuchets & Siege Rams unlocked — Archers +3 range, Spearmen & Knights +20% health',W/2,y+30);ctx.restore();ctx.textAlign='left';}}
  this.small=this.small.filter(s=>now-s.t<4000);this.small.forEach((s,i)=>{const t=(now-s.t)/1000;const a=t<.4?t/.4:t>3?4-t:1;ctx.save();ctx.globalAlpha=Math.max(0,a);ctx.textAlign='center';ctx.font='bold 15px Georgia, serif';
   const w=ctx.measureText(s.txt).width+24,y=58+i*26;ctx.fillStyle='rgba(20,14,8,.8)';ctx.fillRect(W/2-w/2,y-16,w,22);ctx.strokeStyle=rgb(s.c,1.2);ctx.strokeRect(W/2-w/2+.5,y-15.5,w-1,21);ctx.fillStyle='#ffe7a8';ctx.fillText(s.txt,W/2,y);ctx.restore();ctx.textAlign='left';});
  // nuclear flash: whole screen goes white for a moment when a bomb lands
  for(const f of nukeFx){if(f.sat||f.boomT<0)continue;const t=time-f.boomT;if(t>=0&&t<1.2){ctx.fillStyle=`rgba(255,250,235,${.85*(1-t/1.2)})`;ctx.fillRect(0,0,W,H);}}}};
