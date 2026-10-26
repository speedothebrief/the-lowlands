// ===== UI =====
let uiBtns=[],tip=null;const mouse={x:0,y:0,inside:false,ldown:false,rdown:false,mdown:false,sx:0,sy:0,dragging:false,rsx:0,rsy:0,rdrag:false,camSX:0,camSY:0,mmDrag:false};
function btn(x,y,w,h,on,opt={}){uiBtns.push({x,y,w,h,on,...opt});const hov=mouse.x>=x&&mouse.x<x+w&&mouse.y>=y&&mouse.y<y+h;if(hov&&opt.tip)tip=opt.tip;return hov;}
function mouseOverUI(){if(!inGame())return true;if(mouse.y<34||mouse.y>H-PH)return true;return false;}
function panelBg(x,y,w,h){const g=ctx.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#3a2c1c');g.addColorStop(1,'#20170e');ctx.fillStyle=g;ctx.fillRect(x,y,w,h);ctx.strokeStyle='#a08040';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,w-2,h-2);ctx.lineWidth=1;}
function resIcon(r,x,y,s=1){ctx.save();ctx.translate(x,y);ctx.scale(s,s);
 if(r==='food'){ctx.fillStyle='#e8c050';for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(-3+i*3,-2,1.8,5,(i-1)*.3,0,7);ctx.fill();}ctx.strokeStyle='#8a6a20';ctx.beginPath();ctx.moveTo(0,2);ctx.lineTo(0,7);ctx.stroke();}
 else if(r==='wood'){ctx.fillStyle='#8a5a30';ctx.fillRect(-7,-4,14,8);ctx.fillStyle='#d8a870';ctx.beginPath();ctx.ellipse(7,0,2.5,4,0,0,7);ctx.fill();}
 else if(r==='stone'){poly([-7,4,-5,-3,1,-6,7,-2,6,4],'#a0a0a0','#666');}
 else if(r==='gold'){ctx.fillStyle='#f0c838';ctx.beginPath();ctx.arc(0,0,6,0,7);ctx.fill();ctx.strokeStyle='#a07818';ctx.stroke();ctx.fillStyle='#a07818';ctx.font='bold 8px serif';ctx.textAlign='center';ctx.fillText('G',0,3);}
 else if(r==='pop'){ctx.fillStyle='#ddd';ctx.beginPath();ctx.arc(0,-4,3,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(0,4,5,4,0,Math.PI,0);ctx.fill();}
 ctx.restore();ctx.textAlign='left';}
function costStr(c){return RES.filter(r=>c[r]).map(r=>`${c[r]} ${r}`).join(', ')||'free';}
// one-line text that would run past maxW is cut with an ellipsis (long building descriptions in the info panel)
function fitText(t,maxW,font){ctx.font=font;if(ctx.measureText(t).width<=maxW)return t;let lo=0,hi=t.length;while(lo<hi){const m=(lo+hi+1)>>1;if(ctx.measureText(t.slice(0,m)+'…').width<=maxW)lo=m;else hi=m-1;}return t.slice(0,lo).trimEnd()+'…';}
function text(t,x,y,col='#f0e6d0',font='13px Georgia, serif',align='left'){ctx.font=font;ctx.textAlign=align;ctx.fillStyle=col;ctx.fillText(t,x,y);ctx.textAlign='left';}
function fmtTime(t){t=Math.floor(t);return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;}
function drawIconBld(type,x,y,s){const D=BLD[type];ctx.save();const sc=Math.min(.5,42/((D.w+D.h)*32));ctx.translate(x,y+8-((D.w+D.h)*8)*sc+ (D.w===1?6:0));ctx.scale(sc,sc);
 drawBld({type,tx:0,ty:0,w:D.w,h:D.h,x:D.w/2,y:D.h/2,owner:me,built:true,prog:1,hp:1,maxhp:1,id:0});ctx.restore();}
function drawIconUnit(type,x,y,s=1.4,owner=me){ctx.save();ctx.translate(x,y);ctx.scale(s,s);drawUnit({type,owner,x:0,y:0,dir:1,anim:0,path:null,carry:0},true);ctx.restore();}
// peasant work counts for the top bar (v1.4.3): own peasants gathering each resource (walking to/from the drop-off included),
// idle and building/repairing. Works from what clients get in snapshots (state, job, carry type); cached ~4x per second.
let wkCache=null,wkAt=-1;
function workerCounts(force){const now=performance.now();if(!force&&wkCache&&now-wkAt<250&&wkCache.me===me)return wkCache;
 const c={food:0,wood:0,stone:0,gold:0,idle:0,build:0,me};
 for(const u of units){if(u.dead||u.inG||u.owner!==me||u.type!=='peasant')continue;const s=u.state;
  if(s==='idle')c.idle++;else if(s==='build')c.build++;
  else if(s==='gather'||s==='return'||s==='farm'){const r=u.job?(u.job.farm?'food':u.job.rt):u.carryT;if(r&&c[r]!=null)c[r]++;}}
 wkCache=c;wkAt=now;return c;}
function peasIcon(x,y,col){ctx.save();ctx.translate(x,y);ctx.fillStyle=col;ctx.beginPath();ctx.arc(0,-3.5,2.6,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(0,4,4.2,4.2,0,Math.PI,0);ctx.fill();
 ctx.fillStyle='#8a6a3a';ctx.fillRect(-3.6,-6.6,7.2,1.6);ctx.fillRect(-2,-8.4,4,2);ctx.restore();}   // little peasant with a straw hat
function hammerIcon(x,y){ctx.save();ctx.translate(x,y);ctx.rotate(-.6);ctx.fillStyle='#9a7040';ctx.fillRect(-1,-3,2,10);ctx.fillStyle='#c8c8c8';ctx.fillRect(-4.5,-6,9,4);ctx.restore();}
function workChip(x,n,col,tipd,on){const s=String(n);ctx.font='bold 12px Georgia, serif';const w=16+ctx.measureText(s).width+4;
 const hov=btn(x-2,7,w,20,on||(()=>{}),{tip:tipd});if(hov){ctx.fillStyle='rgba(255,230,160,.12)';ctx.fillRect(x-2,7,w,20);}
 ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(x-2,8,w,18);return w;}
function drawUI(){uiBtns=[];tip=null;const P=players[me];
 // top bar
 ctx.fillStyle='rgba(28,20,12,.92)';ctx.fillRect(0,0,W,34);ctx.fillStyle='#a08040';ctx.fillRect(0,34,W,2);
 const WC=workerCounts();let x=14;for(const r of RES){resIcon(r,x+6,17);const amt=String(Math.floor(P.res[r]));text(amt,x+18,22,'#f6ecd2','bold 14px Georgia, serif');ctx.font='bold 14px Georgia, serif';
  const cx=x+18+Math.max(ctx.measureText('8888').width,ctx.measureText(amt).width)+6,n=WC[r];
  workChip(cx,n,null,{t:`${r[0].toUpperCase()+r.slice(1)}: ${n} peasant${n===1?'':'s'} working`,d:r==='food'?'Farming or gathering food, including peasants walking to and from the drop-off.':`Gathering ${r}, including peasants walking to and from the drop-off.`});
  peasIcon(cx+6,18,n?'#e6d6b0':'#8a7a60');text(String(n),cx+13,22,n?'#e6d6b0':'#8a7a60','bold 12px Georgia, serif');ctx.font='bold 12px Georgia, serif';const ce=cx+18+ctx.measureText(String(n)).width;
  ctx.fillStyle='rgba(160,128,64,.45)';ctx.fillRect(Math.max(ce+9,cx+30),9,1,16);x=Math.max(ce+9,cx+30)+9;}   // divider: each worker chip belongs to the resource on its left
 resIcon('pop',x+6,17);text(`${P.pop}/${P.popCap}`,x+18,22,P.pop>=P.popCap?'#ff8a6a':'#f6ecd2','bold 14px Georgia, serif');ctx.font='bold 14px Georgia, serif';x+=Math.max(70,18+ctx.measureText(`${P.pop}/${P.popCap}`).width+10);
 {const n=WC.idle;const w=workChip(x,n,null,{t:`Idle peasants: ${n}`,d:'Click (or press .) to select the next idle peasant.'},selectIdle);peasIcon(x+6,18,n?'#ffc860':'#8a7a60');ctx.fillStyle=n?'#ffc860':'#8a7a60';ctx.font='bold 8px Georgia, serif';ctx.fillText('z',x+9,11);
  text(String(n),x+13,22,n?'#ffc860':'#8a7a60','bold 12px Georgia, serif');x+=w+6;}
 {const n=WC.build;const w=workChip(x,n,null,{t:`Builders: ${n}`,d:'Peasants constructing or repairing buildings.'});hammerIcon(x+6,17);text(String(n),x+13,22,n?'#e6d6b0':'#8a7a60','bold 12px Georgia, serif');x+=w+14;}
 text(fmtTime(time),x,22,'#cdbb90','14px Georgia, serif');x+=60;
 {const ag=P.age||0;const lbl=AGES[ag]+(P.nukes?`  ☢×${P.nukes}`:'')+(P.sat?'  🛰':'');text(lbl,x,22,ag===2?'#9fd8ff':ag===1?'#ffd36a':'#cdbb90','bold 14px Georgia, serif');ctx.font='bold 14px Georgia, serif';
  btn(x,6,ctx.measureText(lbl).width,22,()=>{},{tip:{t:'Age: '+AGES[ag],d:ag===0?'Build a University (5,000 of every resource) to enter the Middle Ages.':ag===1?'Build a Research Lab (10,000 of every resource) to enter the Modern Age.':'Modern Age reached. The Research Lab builds nuclear bombs and a satellite.',s:'Unit costs double with each age.'}});x+=ctx.measureText(lbl).width+20;}
 let rx=W-14;
 const b1=btn(rx-60,6,60,22,()=>{state='paused';},{tip:{t:'Pause (P / Esc)'}});ctx.fillStyle=b1?'#6a5030':'#4a3820';ctx.fillRect(rx-60,6,60,22);text('Pause',rx-30,22,'#f0e0b0','13px Georgia, serif','center');rx-=68;
 const b2=btn(rx-56,6,56,22,()=>{showHelp=true;},{tip:{t:'Help (H)'}});ctx.fillStyle=b2?'#6a5030':'#4a3820';ctx.fillRect(rx-56,6,56,22);text('Help',rx-28,22,'#f0e0b0','13px Georgia, serif','center');rx-=66;
 const b3=btn(rx-62,6,62,22,()=>{audioPanelOpen=!audioPanelOpen;},{tip:{t:'Audio settings',d:'Volume sliders. M toggles mute.'}});ctx.fillStyle=audioPanelOpen?'#6a7a3a':b3?'#6a5030':'#4a3820';ctx.fillRect(rx-62,6,62,22);text(AU.S.muted?'Muted':'Sound',rx-31,22,AU.S.muted?'#ff9a8a':'#f0e0b0','13px Georgia, serif','center');const sndX=rx-62;rx-=72;
 const rivals=players.filter(q=>q.id!==me);const rivLab=(q,l)=>l===0?(q.isHuman?`${q.short} (${q.pname||'Human'})`:`${q.short} (AI ${PERS[q.pers].label})`):l===1?q.short:'';
 ctx.font='12px Georgia, serif';let lvl=0;while(lvl<2&&rx-rivals.reduce((a,q)=>a+ctx.measureText(rivLab(q,lvl)).width+30,0)<x+6)lvl++;   // narrow windows: rival names shorten, then colour squares only
 for(let ri2=rivals.length-1;ri2>=0;ri2--){const q=rivals[ri2];const label=rivLab(q,lvl);ctx.font='12px Georgia, serif';const w=ctx.measureText(label).width+30;rx-=w;
  ctx.fillStyle=rgb(q.color,q.surrendered?.4:1);ctx.fillRect(rx,10,10,14);text(label,rx+14,21,q.surrendered?'#777':'#eee','12px Georgia, serif');if(q.surrendered){ctx.strokeStyle='#bbb';ctx.beginPath();ctx.moveTo(rx,17);ctx.lineTo(rx+w-16,17);ctx.stroke();}
  btn(rx,6,w-14,22,()=>{if(!q.surrendered&&q.keep&&!q.keep.dead&&(!fogOn||vis[Math.floor(q.keep.y)*MAP+Math.floor(q.keep.x)]))centerOn(q.keep.x,q.keep.y);},{tip:{t:q.name,d:q.surrendered?'Surrendered.':`${q.isHuman?'Human-ruled':PERS[q.pers].label} kingdom. Destroy its Keep or crush its army and economy to force surrender.`}});}
 // messages
 const now=Date.now();let my=56;for(const m of msgs.filter(m=>m.to===-1||m.to===me).slice(-6)){const age=(now-(m.rt||m.time))/1000;if(age>7)continue;ctx.globalAlpha=clamp(7-age,0,1);ctx.font='14px Georgia, serif';const w=ctx.measureText(m.t).width;ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(W/2-w/2-8,my-15,w+16,21);text(m.t,W/2,my,m.c,'14px Georgia, serif','center');ctx.globalAlpha=1;my+=24;}
 // bottom panel
 const py=H-PH;panelBg(0,py,W,PH);
 text(buildMenuOpen?'BUILD — press a letter (Shift = several, Esc cancels)':'BUILD  (B + letter)',14,py+20,buildMenuOpen?'#ffe070':'#d8c080','bold 12px Georgia, serif');
 BUILD_MENU.forEach((t,k)=>{const bx=12+(k%8)*50,by=py+28+Math.floor(k/8)*54;const D=BLD[t];const can=afford(P,D.cost);const act=placing===t;const locked=bldLocked(t);
  const hov=btn(bx,by,46,50,()=>{buildMenuOpen=false;startPlacing(t,false);},{tip:{t:`${D.name}  [B, ${BUILD_KEYS[t]}]`+(locked?'  — LOCKED':''),c:D.cost,d:locked?`🔒 Requires the ${AGES[D.reqAge]}: build a University first.`:D.desc,s:locked?D.desc:`Hotkey: B then ${BUILD_KEYS[t]} (Shift+${BUILD_KEYS[t]} places several). Peasants must build it: ${D.time}s with 1 builder.`}});
  ctx.fillStyle=act?'#6a7a3a':hov?'#5a4630':'#2e2216';ctx.fillRect(bx,by,46,50);ctx.strokeStyle=act?'#cfe080':'#7a6040';ctx.strokeRect(bx+.5,by+.5,45,49);
  drawIconBld(t,bx+23,by+30);if(!can||locked){ctx.fillStyle=locked?'rgba(0,0,0,.72)':'rgba(0,0,0,.5)';ctx.fillRect(bx,by,46,50);}if(locked)lockIcon(bx+23,by+27);
  if(buildMenuOpen){ctx.strokeStyle='#ffe070';ctx.strokeRect(bx+1.5,by+1.5,43,47);}text(BUILD_KEYS[t],bx+4,by+12,buildMenuOpen?'#ffe070':'#cdbb90','bold 10px sans-serif');});
 // selection info
 const ix=12+8*50+14,iw=mmRect().x-ix-16;ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(ix,py+10,iw,PH-20);
 drawSelInfo(ix+10,py+14,iw-20);
 drawMinimap(false);
 // drag box
 if(mouse.dragging&&!placing){ctx.strokeStyle='#8f8';ctx.fillStyle='rgba(120,255,120,.1)';const x0=Math.min(mouse.sx,mouse.x),y0=Math.min(mouse.sy,mouse.y);ctx.fillRect(x0,y0,Math.abs(mouse.x-mouse.sx),Math.abs(mouse.y-mouse.sy));ctx.strokeRect(x0,y0,Math.abs(mouse.x-mouse.sx),Math.abs(mouse.y-mouse.sy));}
 if(placing&&!mouseOverUI()){const s=placeWhy||(BLD[placing].wall?'Click-drag to build a line. Right-click / Esc to cancel.':'Click to place. Shift+click to place several. Right-click / Esc to cancel.');text(s,mouse.x+16,mouse.y+28,placeWhy?'#ff9a8a':'#e0ffd0','12px Georgia, serif');}
 if(amoveMode&&!mouseOverUI())text('Attack-move: left-click target area',mouse.x+16,mouse.y+28,'#ffb0a0','12px Georgia, serif');
 if(nukeMode&&!mouseOverUI())text('☢ NUCLEAR STRIKE: click anywhere on the map or minimap (30-tile blast). Right-click / Esc cancels.',mouse.x+16,mouse.y+28,'#ff8a6a','bold 12px Georgia, serif');
 ageFx.tick();ageFx.drawUI();
 if(audioPanelOpen)AU.panel(Math.min(sndX,W-266),40);
 drawTip();}
function drawTip(){if(!tip)return;const lines=[];if(tip.c)lines.push('Cost: '+costStr(tip.c));if(tip.d)lines.push(tip.d);if(tip.s)lines.push(tip.s);
 ctx.font='12px Georgia, serif';let w=ctx.measureText(tip.t).width;for(const l of lines)w=Math.max(w,ctx.measureText(l).width);w+=16;const h=22+lines.length*16;
 let x=clamp(mouse.x+12,4,W-w-4),y=mouse.y-h-10;if(y<40)y=mouse.y+20;ctx.fillStyle='rgba(20,14,8,.95)';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#a08040';ctx.strokeRect(x+.5,y+.5,w,h);
 text(tip.t,x+8,y+16,'#ffe7a8','bold 12px Georgia, serif');lines.forEach((l,i)=>{let col='#ddd';if(i===0&&tip.c)col=affordN(tip.c,1)?'#cfe8b0':'#ff9a8a';text(l,x+8,y+32+i*16,col,'12px Georgia, serif');});}
function smallBtn(x,y,w,h,label,on,tipd,active){const hov=btn(x,y,w,h,on,{tip:tipd});ctx.fillStyle=active?'#6a7a3a':hov?'#5a4630':'#3a2c1c';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#7a6040';ctx.strokeRect(x+.5,y+.5,w-1,h-1);text(label,x+w/2,y+h/2+4,'#f0e0b0','12px Georgia, serif','center');}
function demolishBtn(x,y,w){smallBtn(x,y,w,22,'Demolish (Del)',()=>demolishSel(),{t:'Demolish [Del / Backspace]',d:'Tears down the selected finished building(s) or walls. No refund. The Keep cannot be demolished.'});}
// Market trade panel: sell 100 food/wood/stone for 25 gold, buy 100 for 400 gold (Shift+click = x10). Fixed rates.
function drawTrade(m,x,y){const P=players[me];text('Trade (Shift+click ×10):',x,y-3,'#e8c870','bold 11px Georgia, serif');const lots=keys.has('shift')?10:1,a=100*lots;
 TRADE_RES.forEach((r,i)=>{const bx=x+i*132;
  const cs=P.res[r]>=a,cb=P.res.gold>=a*TRADE_RATE;
  tradeBtn(bx,y+1,128,`Sell ${a} ${r} → ${a/TRADE_RATE}g`,cs,e=>tradeCmd(m,r,'sell',e&&e.shiftKey?10:1),{t:`Sell ${r}`,d:`${TRADE_RATE} ${r} = 1 gold. Sell 100 ${r} for 25 gold (Shift+click: 1000 for 250).`});
  tradeBtn(bx,y+26,128,`Buy ${a} ${r} (${a*TRADE_RATE}g)`,cb,e=>tradeCmd(m,r,'buy',e&&e.shiftKey?10:1),{t:`Buy ${r}`,d:`1 ${r} costs ${TRADE_RATE} gold. Buy 100 ${r} for 400 gold (Shift+click: 1000 for 4000).`});});}
function tradeBtn(x,y,w,label,can,on,tipd){const hov=btn(x,y,w,22,can?on:()=>{AU.play('err');},{tip:tipd});ctx.fillStyle=!can?'#241b12':hov?'#5a4630':'#3a2c1c';ctx.fillRect(x,y,w,22);ctx.strokeStyle=can?'#7a6040':'#4a3a28';ctx.strokeRect(x+.5,y+.5,w-1,21);text(label,x+w/2,y+15,can?'#f0e0b0':'#7a6a50','11px Georgia, serif','center');}
function drawSelInfo(x,y,w){const P=players[me];
 if(!sel.length){text('Nothing selected',x,y+16,'#cdbb90','bold 14px Georgia, serif');
  const lines=['Left-click / drag to select units. Right-click to command.','Peasants: right-click trees, rocks, gold or farms to work.','Build from the menu at left. H = help, P = pause.'];lines.forEach((l,i)=>text(l,x,y+40+i*18,'#bba','12px Georgia, serif'));
  const idle=workerCounts().idle;smallBtn(x,y+96,150,24,`Idle peasants: ${idle} (.)`,selectIdle,{t:'Select next idle peasant (.)'});return;}
 const e=sel[0];
 if(sel.length>1&&sel.every(b=>b.kind==='bld')){const n={};for(const b of sel)n[BLD[b.type].name]=(n[BLD[b.type].name]||0)+1;
  text(`${sel.length} buildings selected`,x,y+16,'#ffe7a8','bold 15px Georgia, serif');text(Object.keys(n).map(k=>n[k]+'× '+k).join(', ').slice(0,120),x,y+36,'#ddd','12px Georgia, serif');
  text('Shift+click adds/removes buildings; double-click selects all of that type on screen.',x,y+54,'#aa9','12px Georgia, serif');
  demolishBtn(x,y+70,190);return;}
 if(sel.length===1||e.kind==='bld'){
  if(e.kind==='unit'){const D=US(e.type,e.owner);ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(x,y,64,80);drawIconUnit(e.type,x+32,y+62,2.2,e.owner);
   text(D.name+(e.owner!==me?` — ${players[e.owner].short}`:''),x+76,y+16,'#ffe7a8','bold 15px Georgia, serif');
   text(`HP ${Math.ceil(e.hp)}/${e.maxhp}   Attack ${+D.atk.toFixed(1)}   Range ${D.range>1?D.range:'melee'}   Speed ${+D.speed.toFixed(2)}`,x+76,y+36,'#ddd','12px Georgia, serif');
   let st={idle:'Idle',move:e.amove?'Attack-moving':'Moving',attack:'Fighting',gather:'Gathering '+(e.job?e.job.rt:''),return:'Returning '+(e.carryT||''),farm:'Farming',build:e.bld&&e.bld.built?'Repairing':'Building',garrison:'Heading to garrison'}[e.state]||e.state;if(e.carry)st+=` (carrying ${e.carry} ${e.carryT})`;
   text(st,x+76,y+54,'#bfe6a0','12px Georgia, serif');text(D.desc,x+76,y+72,'#aa9','12px Georgia, serif');
   if(e.owner===me)unitCmdButtons(x+76,y+86);}
  else{const D=BLD[e.type];ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(x,y,64,80);drawIconBld(e.type,x+32,y+50);
   text(D.name+(e.owner!==me?` — ${players[e.owner].short}`:''),x+76,y+16,'#ffe7a8','bold 15px Georgia, serif');
   text(`HP ${Math.ceil(e.hp)}/${e.maxhp}`+(e.built?'':`   Under construction ${Math.floor(e.prog*100)}%`)+(D.type==='farm'?'':'')+(e.type==='farm'?`   Farmers ${farmCount(e)}/2`:''),x+76,y+36,'#ddd','12px Georgia, serif');
   text(fitText(D.desc,w-80,'12px Georgia, serif'),x+76,y+54,'#aa9','12px Georgia, serif');
   if(e.owner===me&&!e.built){text(`Builders: ${e.bc||0}${e.bc?'':' — construction paused! Right-click with peasants to build.'}`,x+76,y+76,e.bc?'#bfe6ff':'#ffb080','12px Georgia, serif');
    smallBtn(x+76,y+86,190,24,'Cancel construction (Del)',()=>issue({t:'cancelbld',bid:e.id}),{t:'Cancel construction',d:'Removes the site and refunds the full cost.'});return;}
   if(e.owner===me&&e.built&&e.type!=='keep')demolishBtn(x+w-120,y,120);
   if(e.owner===me&&e.built&&e.type==='market')drawTrade(e,x+76,y+72);
   if(e.owner===me&&e.built&&e.hp<e.maxhp-.5){const rc=repairCost(e,e.maxhp-e.hp);const cs=Object.keys(rc).map(r=>Math.ceil(rc[r])+' '+r).join(', ')||'free';
    text(e.bc?`✚ Repairing — ${e.bc} peasant${e.bc>1?'s':''}`:'Damaged — repair: right-click with peasants or N',x+76+ctx.measureText(`HP ${Math.ceil(e.hp)}/${e.maxhp}`).width+90,y+36,e.bc?'#9cf27a':'#ffb080','12px Georgia, serif');
    const gx0=x+76+(D.train?D.train.length*50+200:e.type==='market'?400:D.nuke?300:0);const rx2=D.gar?(e.type==='keep'?gx0:gx0+106):gx0,ry2=D.gar&&e.type==='keep'?y+114:y+86;
    smallBtn(rx2,ry2,110,22,'Repair (N)',()=>repairSel(),{t:'Repair [N]',d:`Sends the nearest idle peasants (up to 3) to repair. Full repair costs ${cs}.`});}
   if(e.owner===me&&D.gar&&e.built){const gi=garInfo(e);const gx=x+76+(D.train?D.train.length*50+200:0);
    text(`Garrison ${gi.n}/${D.gar}`+(gi.n?` (+${gi.n+gi.a} arrows/volley)`:''),gx,y+76,'#d8c8ff','12px Georgia, serif');
    smallBtn(gx,y+86,100,24,'Unload (U)',()=>unloadSel(),{t:'Unload [U]',d:'Release everyone inside (to the rally point; peasants resume work).'});
    if(e.type==='keep'){const on=players[me].bell;smallBtn(gx+106,y+86,124,24,on?'🔔 All clear (B)':'🔔 Town Bell (B)',()=>bellCmd(),{t:'Town Bell [B with Keep selected, or Shift+B anywhere]',d:on?'Release all garrisons; peasants return to work.':'Nearest peasants (first), then infantry run into the nearest Keep/Fortress/Tower with space.'},on);}}
   if(e.owner===me&&e.built&&D.nuke)labPanel(e,x+76,y+64);
   if(e.owner===me&&e.built&&D.train){D.train.forEach((ut,k)=>{const U=US(ut,me);const bx=x+76+k*50,by=y+64;const can=afford(P,U.cost);const locked=unitLocked(ut);
     const hov=btn(bx,by,46,50,()=>{trainCmd(e,ut);},{tip:{t:`${U.name} [${'QERT'[k]}]`+(locked?'  — LOCKED':''),c:U.cost,d:locked?`🔒 Requires the ${AGES[UNITS[ut].age]}: build a University.`:U.desc,s:`HP ${U.hp}, attack ${+U.atk.toFixed(1)}, range ${U.range>1?U.range:'melee'}, pop ${U.pop}, ${U.time}s`+((P.age||0)>(UNITS[ut].age||0)?' — cost doubles each age':'')}});
     ctx.fillStyle=hov?'#5a4630':'#2e2216';ctx.fillRect(bx,by,46,50);ctx.strokeStyle='#7a6040';ctx.strokeRect(bx+.5,by+.5,45,49);drawIconUnit(ut,bx+23,by+42,1.3);if(!can||locked){ctx.fillStyle=locked?'rgba(0,0,0,.72)':'rgba(0,0,0,.5)';ctx.fillRect(bx,by,46,50);}if(locked)lockIcon(bx+23,by+27);text('QERT'[k],bx+4,by+12,'#cdbb90','10px sans-serif');});
    const qx=x+76+D.train.length*50+14;if(e.queue.length){text('Queue (click to cancel):',qx,y+76,'#cdbb90','11px Georgia, serif');
     e.queue.forEach((ut,k)=>{const bx=qx+k*36,by=y+82;btn(bx,by,32,32,()=>{issue({t:'cancel',bid:e.id,k});},{tip:{t:'Cancel '+US(ut,me).name}});ctx.fillStyle='#2e2216';ctx.fillRect(bx,by,32,32);drawIconUnit(ut,bx+16,by+27,.9);
      if(k===0){ctx.fillStyle='#7ab8ff';ctx.fillRect(bx,by+30,32*(e.trainT/UNITS[ut].time),3);if(e.blocked)text('!',bx+24,by+12,'#ff6a5a','bold 12px sans-serif');}});}
    if(D.train)text('Right-click map to set rally point.',x+76,y+128,'#998','11px Georgia, serif');}}
  return;}
 // multiple units
 const cnt={};for(const u of sel)cnt[u.type]=(cnt[u.type]||0)+1;text(`${sel.length} units selected`,x,y+16,'#ffe7a8','bold 15px Georgia, serif');
 Object.keys(cnt).forEach((t,k)=>{const bx=x+k*62,by=y+26;const hov=btn(bx,by,56,56,()=>{sel=sel.filter(u=>u.type===t);},{tip:{t:`${US(t,sel[0].owner).name} ×${cnt[t]}`,d:'Click to select only these'}});ctx.fillStyle=hov?'#5a4630':'rgba(0,0,0,.3)';ctx.fillRect(bx,by,56,56);drawIconUnit(t,bx+28,by+46,1.4);text('×'+cnt[t],bx+52,by+16,'#fff','bold 12px sans-serif','right');});
 const hp=sel.reduce((s,u)=>s+u.hp,0),mx=sel.reduce((s,u)=>s+u.maxhp,0);ctx.fillStyle='#222';ctx.fillRect(x,y+88,200,6);ctx.fillStyle='#5ae05a';ctx.fillRect(x,y+88,200*hp/mx,6);
 if(sel[0].owner===me)unitCmdButtons(x,y+100);}
function unitCmdButtons(x,y){if(sel.some(u=>u.kind==='unit'&&canGar(u)))smallBtn(x+202,y,104,24,'Garrison (G)',garrisonSel,{t:'Garrison [G]',d:'Peasants/spearmen/archers enter the nearest Keep, Fortress or Tower with space (or right-click one). Invulnerable inside.'});
 smallBtn(x,y,110,24,'Attack-move (X)',()=>{amoveMode=true;placing=null;},{t:'Attack-move',d:'Move and engage every enemy encountered on the way.'},amoveMode);
 smallBtn(x+116,y,80,24,'Stop (C)',stopSel,{t:'Stop',d:'Halt all current orders.'});}
function stopSel(){const ids=sel.filter(u=>u.kind==='unit'&&u.owner===me).map(u=>u.id);if(ids.length)issue({t:'stop',ids});}
function trainCmd(e,ut){if(unitLocked(ut)){msg(`${UNITS[ut].name} requires the ${AGES[UNITS[ut].age]} — build a University.`,'#ff9a8a',me);AU.play('err');return;}if(!afford(players[me],US(ut,me).cost)){msg('Not enough resources.','#ff9a8a',me);AU.play('err');return;}if(e.queue.length>=5){msg('Queue is full.','#ff9a8a',me);AU.play('err');return;}issue({t:'train',bid:e.id,ut});}
function farmCount(e){return e.wk!=null?e.wk:e.workers.filter(w=>!w.dead&&w.job&&w.job.farm===e).length;}
let idleIdx=0;function selectIdle(){const idle=units.filter(u=>u.owner===me&&u.type==='peasant'&&u.state==='idle');if(!idle.length){msg('No idle peasants.','#cdbb90',me);AU.play('err');return;}const u=idle[idleIdx++%idle.length];sel=[u];centerOn(u.x,u.y);}

// ===== overlays =====
function overlayPanel(w,h){const x=W/2-w/2,y=H/2-h/2;ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(0,0,W,H);panelBg(x,y,w,h);return[x,y];}
function bigBtn(x,y,w,label,on,active){const hov=btn(x,y,w,38,on);ctx.fillStyle=active?'#6a7a3a':hov?'#7a5a30':'#4a3820';ctx.fillRect(x,y,w,38);ctx.strokeStyle='#c0a060';ctx.strokeRect(x+.5,y+.5,w-1,37);text(label,x+w/2,y+25,'#fff0c8','bold 16px Georgia, serif','center');}
function drawHelp(){uiBtns=[];tip=null;const [x,y]=overlayPanel(Math.min(W-40,900),Math.min(H-40,720));const L=[
 ['Goal','Make all three rival kingdoms surrender: destroy their Keep, or crush their army and economy. If your Keep falls, you lose.'],
 ['Camera','WASD / arrow keys, mouse at screen edge, or right/middle-drag to pan. Mouse wheel or +/- to zoom. Click/drag minimap to jump. Space = jump to last alert / Keep.'],
 ['Select','Left-click a unit or building. Drag a box to select many (military is preferred over peasants). Shift adds. Double-click selects all of that type on screen.'],
 ['Command','Right-click ground to move, an enemy to attack. X then left-click = attack-move. C = stop. Ctrl/Shift+1-9 save a group, 1-9 recall it. "." = next idle peasant. The top bar shows how many peasants work each resource, how many are idle (click to select one) and how many are building.'],
 ['Economy','Peasants gather wood (trees), stone (grey rocks), gold (glittering rocks): right-click them. Goods are carried to the Keep or nearest Lumber Camp / Quarry / Gold Mine. Farms give food: right-click a farm with peasants (2 per farm). Markets yield gold.'],
 ['Build','B opens the build menu, then a letter: H House, F Farm, L Lumber Camp, Q Quarry, G Gold Mine, M Market, B Barracks, S Stable, W Workshop, A Wall, E Gate, T Tower, O Fortress, U University, R Research Lab (Shift+letter = place several, Esc cancels). Or click a BUILD button. Place anywhere on open, explored ground that is not occupied by buildings, resources, water or enemy units (red ghost = invalid); there is no territory limit, expansion only needs peasants to walk there and build. Selected peasants (or the nearest idle one) walk over and build; more builders = faster (diminishing). Right-click a site or damaged building with peasants to build/repair, or select the building and press N (Repair: nearest idle peasants; costs wood/stone in proportion to damage). Del cancels a site (full refund; 50% back if destroyed unfinished).'],
 ['Market','Select a finished Market to trade at fixed rates, gold only: sell 100 food, wood or stone for 25 gold (4:1), or buy 100 of them for 400 gold (1 for 4). Shift+click trades ×10. Greyed buttons mean you can\'t afford it. A Market also earns +0.5 gold/sec.'],
 ['Delete','Del or Backspace kills your selected units (any type, no refund) and tears down your selected finished buildings or walls (also the Demolish button), with no refund. On an unfinished site it cancels instead (full refund). Shift+click selects several buildings; double-click selects every one of that type on screen. The Keep cannot be demolished.'],
 ['Gates','A Gate can be placed straight onto your own wall (green ghost): it replaces that wall segment (the wall\'s stone is not refunded). Gates can\'t go over enemy walls or other buildings.'],
 ['Garrison','Right-click your Keep (40), Fortress (30) or Tower (6) with peasants/spearmen/archers, or press G. Inside they are safe and shoot: every garrisoned unit adds 1 arrow per volley (archers 2). Keep: 4 arrows / 0.8 s, Fortress: 8 arrows / 0.8 s out to 11.5 tiles; with no enemy units in range it shoots enemy buildings (towers, keeps and fortresses first, then walls, gates and sites) for 15 damage/s. Fortress arrows deal 6 damage (Keep and Tower 10/9). U unloads (to the rally point). Town Bell: B with the Keep selected (or Shift+B anywhere) calls peasants first, then infantry inside; ring again to release — peasants resume work. Units flee out if the building falls.'],
 ['Army','Keep trains peasants; Barracks: spearmen & archers; Stable: knights; Workshop: catapults (Middle Ages: also trebuchets and siege rams). Q/E/R/T train from the selected building (when the build menu is closed). Right-click with a building selected sets its rally point. Houses raise population (+8 each; Keep and Fortress +10) up to the cap of 200.'],
 ['Ages','A finished University (5,000 of every resource) brings the Middle Ages: trebuchets (range 12, heavy siege) and siege rams (x5 vs buildings, tough, weak vs units) at the Workshop; archers +3 range; spearmen and knights +20% health. A finished Research Lab (10,000 of each, needs the Middle Ages) brings the Modern Age: archers, knights, spearmen and trebuchets become Machine Gunners, Tanks (fire shells 8 tiles, see 10), Infantry (shoot 3 tiles) and Howitzers with +20% speed, +25% health, +50% damage. Existing units upgrade too. Unit costs double with each age. Your age is kept even if the building is later destroyed.'],
 ['Nukes','Select a finished Research Lab: Q (or the button) builds a nuclear bomb for 10,000 of every resource (150 s). K, then click anywhere on the map or minimap (fog ignored) and confirm: after a short flight it destroys every unit and building within 30 tiles, yours included. A Keep caught in the blast means defeat. Lab also launches a spy satellite (3,000 of each, 60 s): the whole map is revealed to you for the rest of the game.'],
 ['Counters','Spearmen beat knights. Knights crush archers & catapults. Archers shred infantry. Catapults demolish walls and buildings. Towers, Keeps and Fortresses shoot arrows.'],
 ['Rivals','Ravenmoor is aggressive and attacks early. Eldmark builds a big economy and strikes late with large armies. Stonehold walls itself in with towers. Rivals also fight each other.'],
 ['Chat','Multiplayer only (lobby and matches): Enter opens the chat box, Enter sends to everyone, Esc cancels. While typing, game hotkeys are off. Mouse wheel over the open chat (or PgUp/PgDn) scrolls the history; recent messages fade after 10 s. There are no teams or alliances, so all chat goes to every player.'],
 ['Other','P / Esc pauses (restart or surrender from the pause menu). F toggles fog of war. H toggles this help. F3 shows the network status in multiplayer (ping, last server update, reconnects). M mutes sound; volume sliders are under the Sound button (top bar) and in the pause menu.']];
 text('How to Play',W/2,y+40,'#ffe7a8','bold 26px Georgia, serif','center');const PHh=Math.min(H-40,720),mw=Math.min(W-40,900)-170;
 // wrap every row, then pick the largest font (13 -> 10 px) that fits above the Continue button
 const wrap=(t,f)=>{ctx.font=f;const out=[];let line='';for(const w2 of t.split(' ')){if(line&&ctx.measureText(line+w2).width>mw){out.push(line);line='';}line+=w2+' ';}out.push(line);return out;};
 let fs=13,rows;for(;fs>=10;fs--){rows=L.map(([h,t])=>[h,wrap(t,fs+'px Georgia, serif')]);const tot=rows.reduce((a,r)=>a+r[1].length*(fs+4)+7,0);if(tot<=PHh-130)break;}fs=Math.max(fs,10);
 let yy=y+72;for(const [h,ls] of rows){text(h,x+24,yy,'#e8c870','bold '+fs+'px Georgia, serif');ls.forEach((l,i)=>text(l,x+130,yy+i*(fs+4),'#ddd',fs+'px Georgia, serif'));yy+=(ls.length-1)*(fs+4)+fs+11;}
 bigBtn(W/2-100,Math.min(yy+4,y+Math.min(H-40,720)-50),200,'Continue',()=>{showHelp=false;},true);}

// ===== ages: locked buttons, Research Lab panel =====
const bldLocked=t=>!!BLD[t].reqAge&&(players[me].age||0)<BLD[t].reqAge;
const unitLocked=ut=>!!UNITS[ut].age&&(players[me].age||0)<UNITS[ut].age;
function lockIcon(x,y){ctx.strokeStyle='#e8d8a8';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y-7,5,Math.PI,0);ctx.stroke();ctx.lineWidth=1;ctx.fillStyle='#e8d8a8';ctx.fillRect(x-7,y-7,14,11);ctx.fillStyle='#3a2c1c';ctx.fillRect(x-1,y-4,2,5);}
function labPanel(e,x,y){const P=players[me];
 const bar=(bx,by,f,col)=>{ctx.fillStyle='#222';ctx.fillRect(bx,by,150,5);ctx.fillStyle=col;ctx.fillRect(bx,by,150*clamp(f,0,1),5);};
 if(e.nukeQ){smallBtn(x,y,150,24,`☢ Building… ${Math.floor(100*(e.nukeT||0)/NUKE.time)}% (cancel)`,()=>issue({t:'cancelnuke',bid:e.id}),{t:'Cancel nuclear bomb',d:'Refunds the full 10,000 of every resource.'});bar(x,y+26,(e.nukeT||0)/NUKE.time,'#ff7a4a');}
 else smallBtn(x,y,150,24,'☢ Build Nuke (Q)',()=>buildNukeCmd(e),{t:'Build a nuclear bomb [Q]',c:NUKE.cost,d:`Takes ${NUKE.time}s. Bombs are stockpiled; launch with K.`});
 smallBtn(x+156,y,130,24,`☢ Launch (K) ×${P.nukes||0}`,()=>startNukeMode(),{t:'Launch a nuclear bomb [K]',d:'Then click anywhere on the map or minimap (fog is ignored). Destroys every unit and building within 30 tiles, including your own. You will be asked to confirm.'},nukeMode);
 if(P.sat)text('🛰 Satellite in orbit: full map vision',x,y+44,'#9fe0ff','12px Georgia, serif');
 else if(e.satQ){smallBtn(x,y+32,150,24,`🛰 Building… ${Math.floor(100*(e.satT||0)/SAT.time)}% (cancel)`,()=>issue({t:'cancelsat',bid:e.id}),{t:'Cancel satellite',d:'Refunds the full 3,000 of every resource.'});bar(x,y+58,(e.satT||0)/SAT.time,'#7ac8ff');}
 else{const lk=(P.age||0)<SAT.age;smallBtn(x,y+32,150,24,lk?'🔒 Satellite (Modern Age)':'🛰 Launch Satellite',()=>{if(lk){msg('The satellite needs the Modern Age.','#ff9a8a',me);AU.play('err');return;}if(!afford(P,SAT.cost)){msg('A satellite costs 3,000 of every resource.','#ff9a8a',me);AU.play('err');return;}issue({t:'buildsat',bid:e.id});},{t:'Spy satellite',c:SAT.cost,d:`Takes ${SAT.time}s, then a rocket lifts off: the fog of war is gone for you for the rest of the game (live view of the whole map).`});}}
