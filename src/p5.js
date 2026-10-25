// ===== render world =====
function viewBounds(){const c=[screenToWorld(0,0),screenToWorld(W,0),screenToWorld(0,H),screenToWorld(W,H)];
 return{x0:Math.max(0,Math.floor(Math.min(...c.map(p=>p.x)))-2),x1:Math.min(MAP-1,Math.ceil(Math.max(...c.map(p=>p.x)))+2),y0:Math.max(0,Math.floor(Math.min(...c.map(p=>p.y)))-2),y1:Math.min(MAP-1,Math.ceil(Math.max(...c.map(p=>p.y)))+2)};}
function onScreen(x,y,m=60){const s=worldToScreen(x,y);return s[0]>-m&&s[0]<W+m&&s[1]>-m&&s[1]<H+m*2;}
function diamond(path,tx,ty,e=0.6){const p=iso(tx,ty);path.moveTo(p[0],p[1]-e);path.lineTo(p[0]+32+e,p[1]+16);path.lineTo(p[0],p[1]+32+e);path.lineTo(p[0]-32-e,p[1]+16);path.closePath();}
// Ground and fog are flat-coloured diamonds, one per tile. Instead of rebuilding a vector path of every visible tile
// each frame (cost grows with the square of the zoom-out and made zoomed-out frames take seconds in some browsers, so
// units looked frozen), they are 1-pixel-per-tile images drawn with the iso transform (nearest-neighbour = diamonds).
// The ground image is rebuilt when the map changes; the fog image is refreshed from vis every frame (MAP² bytes, cheap).
const groundCan=document.createElement('canvas'),groundCtx=groundCan.getContext('2d');let groundFor=null;
const fogCan=document.createElement('canvas'),fogCtx=fogCan.getContext('2d');let fogImg=null;
const hexRGB=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
function groundLayer(){if(groundFor!==gcls||groundCan.width!==MAP){groundCan.width=groundCan.height=MAP;const im=groundCtx.createImageData(MAP,MAP),d=im.data,C=GCOL.map(hexRGB);
  for(let i=0;i<MAP*MAP;i++){const c=C[gcls[i]];d[i*4]=c[0];d[i*4+1]=c[1];d[i*4+2]=c[2];d[i*4+3]=255;}groundCtx.putImageData(im,0,0);groundFor=gcls;}return groundCan;}
// The fog image has a 1-tile border so the antialiased map edge of the ground image stays covered where the edge is fogged.
// The border copies the fog of the edge tile next to it: an opaque border in front of a VISIBLE edge used to hide the upper
// part of buildings standing on the upper-right (y=0) and upper-left (x=0) edges, because they are drawn up into that band.
function fogLayer(){const N=MAP+2;
 if(fogCan.width!==N||!fogImg){fogCan.width=fogCan.height=N;fogImg=fogCtx.createImageData(N,N);}const d=fogImg.data;
 for(let py=0;py<N;py++)for(let px=0;px<N;px++){const x=px<1?0:px>MAP?MAP-1:px-1,y=py<1?0:py>MAP?MAP-1:py-1;const v=vis[y*MAP+x],o=(py*N+px)*4;
  if(v===0){d[o]=11;d[o+1]=13;d[o+2]=16;d[o+3]=255;}else if(v===1){d[o]=8;d[o+1]=10;d[o+2]=14;d[o+3]=128;}else{d[o]=0;d[o+1]=0;d[o+2]=0;d[o+3]=0;}}
 fogCtx.putImageData(fogImg,0,0);return fogCan;}
function drawTileLayer(can,off=0){ctx.save();ctx.transform(32,16,-32,16,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(can,-off,-off);ctx.restore();}
let renderStats={tiles:0,units:0};
function renderWorld(menuMode){
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0b0d10';ctx.fillRect(0,0,W,H);
 ctx.setTransform(cam.z,0,0,cam.z,W/2-cam.x*cam.z,H/2-cam.y*cam.z);
 const vb=viewBounds();const waves=new Path2D();const tileVis=[];const wv=cam.z>=0.6;   // waves: too small to see when zoomed out
 const fog=fogOn&&!menuMode;
 drawTileLayer(groundLayer());
 for(let ty=vb.y0;ty<=vb.y1;ty++)for(let tx=vb.x0;tx<=vb.x1;tx++){const s=worldToScreen(tx,ty);if(s[0]<-40*cam.z||s[0]>W+40*cam.z||s[1]<-40*cam.z||s[1]>H+10)continue;
  const i=ty*MAP+tx;tileVis.push(i);
  if(wv&&tiles[i]===1&&(tx*7+ty*13)%4===0){const p=iso(tx+.5,ty+.5);const o=Math.sin(time*1.5+tx+ty)*4;waves.moveTo(p[0]-8+o,p[1]);waves.lineTo(p[0]+2+o,p[1]);}}
 if(wv){ctx.strokeStyle='rgba(200,230,255,.35)';ctx.lineWidth=1.2;ctx.stroke(waves);ctx.lineWidth=1;}
 renderStats.tiles=tileVis.length;renderStats.units=0;
 // decals
 for(const d of decals){if(d.k==='rubble'){const a=1-Math.max(0,(time-d.t-60)/30);ctx.globalAlpha=a*.9;for(let k=0;k<d.w*d.h*3;k++){const px=d.x+((k*37)%(d.w*10))/10,py=d.y+((k*53)%(d.h*10))/10;const p=iso(px,py);ctx.fillStyle=k%2?'#6b6358':'#4a4036';ctx.fillRect(p[0]-3,p[1]-2,6,3);}ctx.globalAlpha=1;}
  else if(!fog||visAt(d.x,d.y)===2){ctx.globalAlpha=Math.max(0,1-(time-d.t)/12)*.7;const p=iso(d.x,d.y);ctx.fillStyle='#5a1a12';ctx.beginPath();ctx.ellipse(p[0],p[1],6,2.5,0,0,7);ctx.fill();ctx.fillStyle=rgb(d.c,.7);ctx.fillRect(p[0]-3,p[1]-1.5,5,2);ctx.globalAlpha=1;}}
 drawScorch();
 // selection rings for buildings + placement ghost under objects
 for(const e of sel)if(e.kind==='bld'){const T=iso(e.tx,e.ty),R=iso(e.tx+e.w,e.ty),B=iso(e.tx+e.w,e.ty+e.h),L=iso(e.tx,e.ty+e.h);ctx.lineWidth=2;poly([T[0],T[1],R[0],R[1],B[0],B[1],L[0],L[1]],null,e.owner===me?'#7dff7d':'#ff6a6a');ctx.lineWidth=1;}
 // drawables
 const dl=[];
 for(const i of tileVis){if(resT[i]){const tx=i%MAP,ty=(i/MAP)|0;dl.push({d:tx+ty+1,f:0,tx,ty});}}
 for(const b of blds){if(!onScreen(b.x,b.y,200))continue;if(fog&&b.owner!==me&&visAt(b.x,b.y)===0)continue;dl.push({d:b.x+b.y+(b.type==='farm'?-1.5:0),f:1,e:b});}
 for(const u of units){if(u.inG||!onScreen(u.x,u.y))continue;if(fog&&u.owner!==me&&visAt(u.x,u.y)!==2)continue;dl.push({d:u.x+u.y,f:2,e:u});}
 dl.sort((a,b)=>a.d-b.d);
 for(const o of dl){if(o.f===0)drawRes(o.tx,o.ty);else if(o.f===1)drawBld(o.e);else{const u=o.e;if(sel.includes(u)){const p=iso(u.x,u.y);ctx.strokeStyle=u.owner===me?'#7dff7d':'#ff6a6a';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p[0],p[1],bigU(u.type)?12:8,bigU(u.type)?6:4,0,0,7);ctx.stroke();ctx.lineWidth=1;}drawUnit(u);}}
 // projectiles
 for(const p of projs){const t=p.life/p.dur;const x=p.sx+(p.tx-p.sx)*t,y=p.sy+(p.ty-p.sy)*t;if(fog&&visAt(x,y)!==2)continue;const q=iso(x,y);
  if(p.k==='arrow'){const z=(p.sz||12)*(1-t)+8*t+Math.sin(Math.PI*t)*14;const q2=iso(p.sx+(p.tx-p.sx)*(t+.05),p.sy+(p.ty-p.sy)*(t+.05));const ang=Math.atan2(q2[1]-q[1]-(Math.cos(Math.PI*t)*-2),q2[0]-q[0]);ctx.strokeStyle='#2a1a0a';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(q[0]-Math.cos(ang)*5,q[1]-z-Math.sin(ang)*5);ctx.lineTo(q[0]+Math.cos(ang)*5,q[1]-z+Math.sin(ang)*5);ctx.stroke();ctx.lineWidth=1;}
  else if(p.k==='bullet'){const q2=iso(p.sx+(p.tx-p.sx)*Math.max(0,t-.25),p.sy+(p.ty-p.sy)*Math.max(0,t-.25));ctx.strokeStyle='rgba(255,230,120,.95)';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(q2[0],q2[1]-10);ctx.lineTo(q[0],q[1]-10);ctx.stroke();ctx.lineWidth=1;}
  else{const z=10+Math.sin(Math.PI*t)*70;ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(q[0],q[1],3,1.5,0,0,7);ctx.fill();if(p.shell){ctx.fillStyle='#3a3e36';ctx.beginPath();ctx.ellipse(q[0],q[1]-z,4,2,-.4,0,7);ctx.fill();ctx.fillStyle='rgba(255,200,90,.8)';ctx.fillRect(q[0]-6,q[1]-z,2,2);}else{ctx.fillStyle='#6a6660';ctx.beginPath();ctx.arc(q[0],q[1]-z,3.5,0,7);ctx.fill();}}}
 for(const q of parts){if(fog&&visAt(q.x,q.y)!==2)continue;const p=iso(q.x,q.y);ctx.globalAlpha=clamp(q.life/q.max,0,1)*(q.smoke?.5:1);ctx.fillStyle=q.c;const s=q.smoke?q.s*(2-q.life/q.max):q.s;ctx.fillRect(p[0]-s/2,p[1]-q.z-s/2,s,s);}ctx.globalAlpha=1;
 // fog
 if(fog)drawTileLayer(fogLayer(),1);
 // health bars
 const hb=(x,y,h,f,col)=>{const p=iso(x,y);ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(p[0]-13,p[1]-h-1,26,5);ctx.fillStyle=f>.5?col:f>.25?'#e8c040':'#e04a3a';ctx.fillRect(p[0]-12,p[1]-h,24*f,3);};
 for(const u of units){if(u.inG||!onScreen(u.x,u.y))continue;if(fog&&u.owner!==me&&visAt(u.x,u.y)!==2)continue;if(sel.includes(u)||(u.hp<u.maxhp&&time-u.lastHit<6)||u.hp<u.maxhp*.999&&sel.includes(u))hb(u.x,u.y,bigU(u.type)?34:28,u.hp/u.maxhp,u.owner===me?'#5ae05a':rgb(players[u.owner].color,1.2));}
 for(const b of blds){if(!onScreen(b.x,b.y,200))continue;if(fog&&b.owner!==me&&visAt(b.x,b.y)===0)continue;if(sel.includes(b)||b.hp<b.maxhp*.98){const hh={keep:100,tower:82,fortress:86,wall:30,gate:34,farm:12}[b.type]||48;hb(b.x,b.y,b.built?hh:20,b.hp/b.maxhp,b.owner===me?'#5ae05a':rgb(players[b.owner].color,1.2));
  if(!b.built){const p=iso(b.x,b.y);ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(p[0]-13,p[1]-(b.built?hh:20)+5,26,4);ctx.fillStyle='#7ab8ff';ctx.fillRect(p[0]-12,p[1]-(b.built?hh:20)+6,24*b.prog,2);}}}
 // garrison badges + builder hammers
 for(const b of blds){const n=garN(b);if((!n&&!(b.bc>0&&b.owner===me))||!onScreen(b.x,b.y,200))continue;if(fog&&b.owner!==me&&visAt(b.x,b.y)===0)continue;const hh=({keep:100,tower:82,fortress:86}[b.type]||48)+12;const p=iso(b.x,b.y);
  if(n){const t='⛨ '+n+'/'+BLD[b.type].gar;ctx.font='bold 11px sans-serif';const w=ctx.measureText(t).width+10;ctx.fillStyle='rgba(20,14,8,.85)';ctx.fillRect(p[0]-w/2,p[1]-hh-12,w,15);ctx.strokeStyle=rgb(players[b.owner].color,1.2);ctx.strokeRect(p[0]-w/2+.5,p[1]-hh-11.5,w-1,14);ctx.fillStyle='#ffe7a8';ctx.textAlign='center';ctx.fillText(t,p[0],p[1]-hh);ctx.textAlign='left';}
  else if(b.bc>0){const rp=b.built&&time-(b.repT||-9)<.6;ctx.font='bold 11px sans-serif';ctx.fillStyle=rp?`rgba(156,242,122,${.7+.3*Math.sin(time*8)})`:'#bfe6ff';ctx.textAlign='center';ctx.fillText((rp?'✚ repairing ⚒ ':'⚒ ')+b.bc,p[0],p[1]-(b.built?hh-12:30));ctx.textAlign='left';}}
 // rally
 for(const e of sel)if(e.kind==='bld'&&e.owner===me&&e.rally){const p=iso(e.rally.x,e.rally.y);ctx.strokeStyle='rgba(255,255,255,.4)';ctx.setLineDash([4,4]);const c=iso(e.x,e.y);ctx.beginPath();ctx.moveTo(c[0],c[1]);ctx.lineTo(p[0],p[1]);ctx.stroke();ctx.setLineDash([]);flag(e.rally.x,e.rally.y,0,players[me].color,.9);}
 // markers
 for(const m of markers){const a=1-(time-m.t)/0.8;if(a<=0)continue;const p=iso(m.x,m.y);ctx.strokeStyle=m.c;ctx.globalAlpha=a;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p[0],p[1],14*(1.3-a),7*(1.3-a),0,0,7);ctx.stroke();ctx.globalAlpha=1;ctx.lineWidth=1;}
 markers=markers.filter(m=>time-m.t<0.8);
 if(!menuMode){drawPlacement();drawNukeFx();ageFx.drawWorld();drawNukeAim();}
 ctx.setTransform(1,0,0,1,0,0);}
let markers=[];
function wallLine(a,b){const pts=[];let x0=a[0],y0=a[1];const x1=b[0],y1=b[1];const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let err=dx+dy;
 for(let g=0;g<200;g++){pts.push([x0,y0]);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x0+=sx;}if(e2<=dx){err+=dx;y0+=sy;}}return pts;}
function placeSpot(){const D=BLD[placing];const w=screenToWorld(mouse.x,mouse.y);return[Math.floor(w.x-D.w/2+.5),Math.floor(w.y-D.h/2+.5)];}
function drawPlacement(){if(!placing||mouseOverUI())return;const D=BLD[placing];
 let spots;if(D.wall&&wallStart){const w=screenToWorld(mouse.x,mouse.y);spots=wallLine(wallStart,[Math.floor(w.x),Math.floor(w.y)]);}else spots=[placeSpot()];
 let total=0;for(const [tx,ty] of spots){const why=canPlace(placing,tx,ty,me,null);total++;const ok=!why&&affordN(D.cost,total);
  const T=iso(tx,ty),R=iso(tx+D.w,ty),B=iso(tx+D.w,ty+D.h),L=iso(tx,ty+D.h);poly([T[0],T[1],R[0],R[1],B[0],B[1],L[0],L[1]],ok?'rgba(80,255,80,.3)':'rgba(255,60,60,.35)',ok?'#7f7':'#f66');
  if(spots.length===1){drawBld({type:placing,tx,ty,w:D.w,h:D.h,x:tx+D.w/2,y:ty+D.h/2,owner:me,built:true,prog:1,hp:1,maxhp:1,id:0},0.55);placeWhy=why||(!afford(players[me],D.cost)?'Not enough resources':null);}}
 if(D.shoot&&spots.length===1){const [tx,ty]=spots[0];const c=iso(tx+D.w/2,ty+D.h/2);ctx.strokeStyle='rgba(255,255,255,.3)';ctx.beginPath();ctx.ellipse(c[0],c[1],D.shoot.range*45,D.shoot.range*22.6,0,0,7);ctx.stroke();}}
let placeWhy=null;
function affordN(c,n){for(const r in c)if(players[me].res[r]<c[r]*n)return false;return true;}

// ===== minimap =====
const mmCan=document.createElement('canvas');mmCan.width=MAP;mmCan.height=MAP;const mmCtx=mmCan.getContext('2d');let mmImg=mmCtx.createImageData(MAP,MAP);
const MMC=[[78,128,52],[84,136,56],[90,142,60],[74,120,48],[96,150,66],[190,172,112],[44,90,150],[50,98,158]];
function updateMinimap(menuMode){if(mmCan.width!==MAP){mmCan.width=mmCan.height=MAP;mmImg=mmCtx.createImageData(MAP,MAP);}const d=mmImg.data;const fog=fogOn&&!menuMode;
 for(let i=0;i<MAP*MAP;i++){let c=MMC[gcls[i]];if(resT[i]===1)c=[38,78,32];else if(resT[i]===2)c=[150,150,150];else if(resT[i]===3)c=[230,190,50];
  const b=bgrid&&bgrid[i];if(b&&(!fog||b.owner===me||vis[i]>0))c=rgbArr(players[b.owner].color);
  let f=1;if(fog){if(vis[i]===0)f=0.08;else if(vis[i]===1)f=0.55;}
  d[i*4]=c[0]*f;d[i*4+1]=c[1]*f;d[i*4+2]=c[2]*f;d[i*4+3]=255;}
 mmCtx.putImageData(mmImg,0,0);mmDirty=false;}
const rgbArr=c=>c;
function mmRect(){return{x:W-252,y:H-PH+12,w:240,h:120};}
let MMS=1.25;
function drawMinimap(menuMode){const r=mmRect();MMS=120/MAP;if(mmDirty)updateMinimap(menuMode);
 ctx.fillStyle='#0b0d10';ctx.fillRect(r.x-2,r.y-2,r.w+4,r.h+4);
 ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.clip();
 ctx.setTransform(MMS,MMS/2,-MMS,MMS/2,r.x+r.w/2,r.y);ctx.imageSmoothingEnabled=false;ctx.drawImage(mmCan,0,0);
 const fog=fogOn&&!menuMode;
 const ds=1.6*MAP/96;for(const u of units){if(u.inG)continue;if(fog&&u.owner!==me&&visAt(u.x,u.y)!==2)continue;ctx.fillStyle=rgb(players[u.owner].color,1.25);ctx.fillRect(u.x-ds/2,u.y-ds/2,ds,ds);}
 for(const p of pings){if(p.o!==me||time-p.t>4)continue;if(Math.floor((time-p.t)*4)%2)continue;ctx.strokeStyle='#ff4040';ctx.lineWidth=.6;ctx.beginPath();ctx.arc(p.x,p.y,3+(time-p.t)*2,0,7);ctx.stroke();}
 const c=[screenToWorld(0,34),screenToWorld(W,34),screenToWorld(W,H-PH),screenToWorld(0,H-PH)];ctx.strokeStyle='#fff';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(c[0].x,c[0].y);for(let k=1;k<4;k++)ctx.lineTo(c[k].x,c[k].y);ctx.closePath();ctx.stroke();
 ctx.restore();ctx.setTransform(1,0,0,1,0,0);ctx.strokeStyle='#a08040';ctx.strokeRect(r.x-2.5,r.y-2.5,r.w+5,r.h+5);}
function mmToWorld(mx,my){const r=mmRect();MMS=120/MAP;const u=(mx-r.x-r.w/2)/MMS,v=(my-r.y)*2/MMS;return{x:(u+v)/2,y:(v-u)/2};}

// ===== nuclear bomb / satellite visuals (state comes from nukeFx: sim locally, snapshot 'N' in multiplayer) =====
const isoR=R=>[R*45.25,R*22.63];   // a circle of R tiles on the iso ground
function drawScorch(){for(const f of nukeFx){if(f.sat||f.boomT<0)continue;const a=clamp(1-(time-f.boomT)/60,0,1);if(a<=0)continue;const c=iso(f.tx,f.ty),[rx,ry]=isoR(NUKE.radius);
 const g=ctx.createRadialGradient(c[0],c[1],0,c[0],c[1],rx);g.addColorStop(0,`rgba(20,12,8,${.75*a})`);g.addColorStop(.7,`rgba(40,28,18,${.5*a})`);g.addColorStop(1,'rgba(40,28,18,0)');
 ctx.save();ctx.translate(c[0],c[1]);ctx.scale(1,ry/rx);ctx.translate(-c[0],-c[1]);ctx.fillStyle=g;ctx.beginPath();ctx.arc(c[0],c[1],rx,0,7);ctx.fill();ctx.restore();}}
function drawNukeFx(){for(const f of nukeFx){
 if(f.sat){const t=time-f.t0;if(t<0||t>f.dur)continue;const c=iso(f.sx,f.sy);const z=60+t*t*70;   // rocket climbing out of the Lab
  for(let i=0;i<14;i++){const tt=Math.max(0,t-i*.08);const zz=60+tt*tt*70;ctx.fillStyle=`rgba(230,230,230,${.35*(1-i/14)})`;ctx.beginPath();ctx.arc(c[0]+Math.sin(i*1.7)*i*.8,c[1]-zz+18,4+i*1.2,0,7);ctx.fill();}
  ctx.fillStyle='#ffb040';ctx.beginPath();ctx.moveTo(c[0]-3,c[1]-z+8);ctx.lineTo(c[0],c[1]-z+22+Math.random()*8);ctx.lineTo(c[0]+3,c[1]-z+8);ctx.fill();
  ctx.fillStyle='#eef';ctx.fillRect(c[0]-3,c[1]-z-12,6,20);ctx.fillStyle='#c33';ctx.beginPath();ctx.moveTo(c[0]-3,c[1]-z-12);ctx.lineTo(c[0],c[1]-z-19);ctx.lineTo(c[0]+3,c[1]-z-12);ctx.fill();continue;}
 if(f.boomT<0){const t=clamp((time-f.t0)/f.dur,0,1);const x=f.sx+(f.tx-f.sx)*t,y=f.sy+(f.ty-f.sy)*t;const q=iso(x,y);const H=Math.min(900,200+dist(f.sx,f.sy,f.tx,f.ty)*12);const z=Math.sin(Math.PI*t)*H+20*(1-t);
  const q2=iso(f.sx+(f.tx-f.sx)*Math.min(1,t+.01),f.sy+(f.ty-f.sy)*Math.min(1,t+.01));const z2=Math.sin(Math.PI*Math.min(1,t+.01))*H;const ang=Math.atan2((q2[1]-z2)-(q[1]-z),q2[0]-q[0]);
  ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(q[0],q[1],8,4,0,0,7);ctx.fill();
  const tg=iso(f.tx,f.ty),[rx,ry]=isoR(NUKE.radius);ctx.strokeStyle=`rgba(255,60,40,${.35+.25*Math.sin(time*10)})`;ctx.lineWidth=2/cam.z;ctx.beginPath();ctx.ellipse(tg[0],tg[1],rx,ry,0,0,7);ctx.stroke();ctx.lineWidth=1;
  ctx.save();ctx.translate(q[0],q[1]-z);ctx.rotate(ang);ctx.fillStyle='#ffb040';ctx.beginPath();ctx.moveTo(-9,-2);ctx.lineTo(-18-Math.random()*6,0);ctx.lineTo(-9,2);ctx.fill();
  ctx.fillStyle='#d8dbe0';ctx.fillRect(-9,-3,18,6);ctx.fillStyle='#e8c020';ctx.fillRect(-2,-3,3,6);ctx.fillStyle='#555';ctx.beginPath();ctx.moveTo(9,-3);ctx.lineTo(14,0);ctx.lineTo(9,3);ctx.fill();ctx.restore();continue;}
 const t=time-f.boomT;if(t>14)continue;const c=iso(f.tx,f.ty),[rx,ry]=isoR(NUKE.radius);
 if(t<1.6){const k=Math.min(1,t/1.2);ctx.strokeStyle=`rgba(255,240,200,${.9*(1-t/1.6)})`;ctx.lineWidth=6/cam.z;ctx.beginPath();ctx.ellipse(c[0],c[1],rx*k,ry*k,0,0,7);ctx.stroke();ctx.lineWidth=1;   // shockwave
  const g=ctx.createRadialGradient(c[0],c[1]-40,0,c[0],c[1]-40,rx*k);g.addColorStop(0,`rgba(255,255,240,${1-t/1.6})`);g.addColorStop(.4,`rgba(255,190,80,${.7*(1-t/1.6)})`);g.addColorStop(1,'rgba(255,120,40,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(c[0],c[1]-40,rx*k,0,7);ctx.fill();}
 const a=clamp(1-(t-8)/6,0,1),rise=Math.min(1,t/4),sh=650*rise,cr=80+260*rise;   // mushroom cloud
 ctx.globalAlpha=a;const sg=ctx.createLinearGradient(0,c[1],0,c[1]-sh);sg.addColorStop(0,'#5a4030');sg.addColorStop(1,'#c07040');ctx.fillStyle=sg;ctx.beginPath();ctx.moveTo(c[0]-40-30*rise,c[1]);ctx.quadraticCurveTo(c[0]-18,c[1]-sh*.5,c[0]-26,c[1]-sh);ctx.lineTo(c[0]+26,c[1]-sh);ctx.quadraticCurveTo(c[0]+18,c[1]-sh*.5,c[0]+40+30*rise,c[1]);ctx.fill();
 for(let i=0;i<9;i++){const an=i/9*Math.PI*2+t*.2;const px=c[0]+Math.cos(an)*cr*.7,py=c[1]-sh-cr*.15+Math.sin(an)*cr*.25;const cg=ctx.createRadialGradient(px,py,0,px,py,cr*.55);cg.addColorStop(0,t<3?'#ffd080':'#b07850');cg.addColorStop(1,'rgba(90,60,45,0)');ctx.fillStyle=cg;ctx.beginPath();ctx.arc(px,py,cr*.55,0,7);ctx.fill();}
 const hg=ctx.createRadialGradient(c[0],c[1]-sh-cr*.2,0,c[0],c[1]-sh-cr*.2,cr);hg.addColorStop(0,t<2.5?'rgba(255,240,180,.95)':'rgba(220,150,90,.9)');hg.addColorStop(.6,'rgba(170,100,60,.75)');hg.addColorStop(1,'rgba(90,60,45,0)');ctx.fillStyle=hg;ctx.beginPath();ctx.ellipse(c[0],c[1]-sh-cr*.2,cr,cr*.6,0,0,7);ctx.fill();ctx.globalAlpha=1;}}
function drawNukeAim(){if(!nukeMode||mouseOverUI())return;const w=screenToWorld(mouse.x,mouse.y);const c=iso(w.x,w.y),[rx,ry]=isoR(NUKE.radius);
 ctx.fillStyle='rgba(255,40,30,.12)';ctx.strokeStyle='rgba(255,70,50,.9)';ctx.lineWidth=2/cam.z;ctx.beginPath();ctx.ellipse(c[0],c[1],rx,ry,0,0,7);ctx.fill();ctx.stroke();
 ctx.beginPath();ctx.moveTo(c[0]-20,c[1]);ctx.lineTo(c[0]+20,c[1]);ctx.moveTo(c[0],c[1]-10);ctx.lineTo(c[0],c[1]+10);ctx.stroke();ctx.lineWidth=1;}
