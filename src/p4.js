// ===== rendering: world =====
const iso=(x,y)=>[(x-y)*32,(x+y)*16];
function centerOn(x,y){const p=iso(x,y);cam.x=p[0];cam.y=p[1];}
function screenToWorld(sx,sy){const px=(sx-W/2)/cam.z+cam.x,py=(sy-H/2)/cam.z+cam.y;return{x:(px/32+py/16)/2,y:(py/16-px/32)/2};}
function worldToScreen(x,y){const p=iso(x,y);return[(p[0]-cam.x)*cam.z+W/2,(p[1]-cam.y)*cam.z+H/2];}
const GCOL=['#5b8c3c','#62933f','#689a44','#578536','#71a24a','#c8b57a','#2f5f99','#3569a3'];
function poly(pts,fill,stroke){ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)ctx.lineTo(pts[i],pts[i+1]);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function box(x0,y0,x1,y1,h,c,z=0,a=1){const T=iso(x0,y0),R=iso(x1,y0),B=iso(x1,y1),L=iso(x0,y1);const zt=z+h;
 poly([L[0],L[1]-z,B[0],B[1]-z,B[0],B[1]-zt,L[0],L[1]-zt],rgb(c,.68,a));
 poly([B[0],B[1]-z,R[0],R[1]-z,R[0],R[1]-zt,B[0],B[1]-zt],rgb(c,.86,a));
 poly([T[0],T[1]-zt,R[0],R[1]-zt,B[0],B[1]-zt,L[0],L[1]-zt],rgb(c,1.05,a));
 return{T:[T[0],T[1]-zt],R:[R[0],R[1]-zt],B:[B[0],B[1]-zt],L:[L[0],L[1]-zt]};}
function pyramid(x0,y0,x1,y1,z,rh,c){const T=iso(x0,y0),R=iso(x1,y0),B=iso(x1,y1),L=iso(x0,y1);const C=iso((x0+x1)/2,(y0+y1)/2);const ax=C[0],ay=C[1]-z-rh;
 poly([T[0],T[1]-z,R[0],R[1]-z,ax,ay],rgb(c,1.1));poly([L[0],L[1]-z,T[0],T[1]-z,ax,ay],rgb(c,.95));
 poly([L[0],L[1]-z,B[0],B[1]-z,ax,ay],rgb(c,.7));poly([B[0],B[1]-z,R[0],R[1]-z,ax,ay],rgb(c,.88));}
function gable(x0,y0,x1,y1,z,rh,c){const ym=(y0+y1)/2;const A=iso(x0,y0),Bp=iso(x1,y0),Cp=iso(x1,y1),D=iso(x0,y1),r0=iso(x0,ym),r1=iso(x1,ym);
 poly([A[0],A[1]-z,Bp[0],Bp[1]-z,r1[0],r1[1]-z-rh,r0[0],r0[1]-z-rh],rgb(c,1.08));
 poly([D[0],D[1]-z,Cp[0],Cp[1]-z,r1[0],r1[1]-z-rh,r0[0],r0[1]-z-rh],rgb(c,.75));
 poly([Bp[0],Bp[1]-z,Cp[0],Cp[1]-z,r1[0],r1[1]-z-rh],rgb([200,180,140],.8));}
function merlons(x0,y0,x1,y1,z,c,n){const pts=[];for(let i=0;i<=n;i++){const t=i/n;pts.push([x0+(x1-x0)*t,y1]);pts.push([x1,y0+(y1-y0)*t]);}
 for(const p of pts){const s=0.09;box(p[0]-s,p[1]-s,p[0]+s,p[1]+s,5,c,z);}}
function flag(x,y,z,col,size=1){const p=iso(x,y);const bx=p[0],by=p[1]-z;ctx.strokeStyle='#3a2a1a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx,by-18*size);ctx.stroke();
 const w=Math.sin(time*4+x)*2;ctx.fillStyle=rgb(col);ctx.beginPath();ctx.moveTo(bx,by-18*size);ctx.lineTo(bx+12*size,by-15*size+w);ctx.lineTo(bx,by-11*size);ctx.closePath();ctx.fill();ctx.lineWidth=1;}
const STONE=[150,146,136],WOOD=[150,105,62],PLASTER=[214,196,158];
function drawBld(b,alpha){const D=BLD[b.type];const P=players[b.owner]||{color:[128,128,128]};const tc=P.color;const x0=b.tx,y0=b.ty,x1=b.tx+b.w,y1=b.ty+b.h;
 const roofC=[(tc[0]+120)/2.2,(tc[1]+70)/2.2,(tc[2]+40)/2.2];
 if(alpha!=null)ctx.globalAlpha=alpha;
 const C=iso(b.x,b.y);ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(C[0]+6,C[1]+2,(b.w+b.h)*15,(b.w+b.h)*7.5,0,0,7);ctx.fill();
 if(!b.built){const T=iso(x0,y0),R=iso(x1,y0),Bt=iso(x1,y1),L=iso(x0,y1);poly([T[0],T[1],R[0],R[1],Bt[0],Bt[1],L[0],L[1]],'rgba(120,90,55,.85)');
  if(D.walk){drawFarmField(b,b.prog);}else{const hh=Math.max(2,(D.wall?20:b.type==='tower'?48:26)*b.prog);box(x0+.15,y0+.15,x1-.15,y1-.15,hh,D.wall||b.type==='tower'||b.type==='fortress'||b.type==='keep'?STONE:WOOD,0,.75);
   ctx.strokeStyle='#6b4a22';ctx.lineWidth=1.5;for(const [px,py] of [[x0+.1,y1-.1],[x1-.1,y1-.1],[x1-.1,y0+.1],[x0+.1,y0+.1]]){const q=iso(px,py);ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.lineTo(q[0],q[1]-hh-8);ctx.stroke();}ctx.lineWidth=1;}
  ctx.globalAlpha=1;return;}
 switch(b.type){
 case 'keep':{box(x0+.15,y0+.15,x1-.15,y1-.15,30,STONE);merlons(x0+.15,y0+.15,x1-.15,y1-.15,30,STONE,6);
  const L=iso(x0+.15,y1-.15),Bt=iso(x1-.15,y1-.15);const dx=(L[0]+Bt[0])/2,dy=(L[1]+Bt[1])/2;ctx.fillStyle='#3a2a1c';ctx.beginPath();ctx.moveTo(dx-6,dy-3);ctx.lineTo(dx-6,dy-14);ctx.quadraticCurveTo(dx,dy-20,dx+6,dy-14);ctx.lineTo(dx+6,dy+3);ctx.fill();
  box(x0+.85,y0+.85,x1-.85,y1-.85,34,STONE,30);merlons(x0+.85,y0+.85,x1-.85,y1-.85,64,STONE,3);pyramid(x0+.8,y0+.8,x1-.8,y1-.8,69,22,tc);flag(b.x,b.y,91,tc,1.2);
  const R=iso(x1-.15,y0+.5);ctx.fillStyle=rgb(tc);ctx.fillRect(R[0]-14,R[1]-26,7,16);break;}
 case 'house':{box(x0+.3,y0+.3,x1-.3,y1-.3,15,PLASTER);gable(x0+.2,y0+.25,x1-.2,y1-.25,15,13,roofC);const L=iso(x0+.3,y1-.3),Bt=iso(x1-.3,y1-.3);ctx.fillStyle='#4a3020';ctx.fillRect((L[0]+Bt[0])/2-3,(L[1]+Bt[1])/2-10,6,9);break;}
 case 'farm':drawFarmField(b,1);break;
 case 'lumber':{box(x0+.3,y0+.2,x1-.9,y1-.3,14,WOOD);gable(x0+.25,y0+.15,x1-.85,y1-.25,14,10,roofC);
  for(let i=0;i<3;i++){const p=iso(x1-.45,y0+.5+i*.4);ctx.fillStyle='#7a5230';ctx.beginPath();ctx.ellipse(p[0],p[1]-4,7,3.5,0,0,7);ctx.fill();ctx.fillStyle='#c79a62';ctx.beginPath();ctx.ellipse(p[0]+6,p[1]-4,2,3,0,0,7);ctx.fill();}flag(x0+.3,y1-.3,14,tc,.8);break;}
 case 'quarry':{box(x0+.3,y0+.2,x1-1,y1-.3,13,WOOD);gable(x0+.25,y0+.15,x1-.95,y1-.25,13,9,roofC);box(x1-.8,y0+.4,x1-.3,y0+.9,8,STONE);box(x1-.85,y0+1.1,x1-.35,y0+1.6,6,STONE);box(x1-.7,y0+.8,x1-.35,y0+1.15,6,STONE,8);flag(x0+.3,y1-.3,13,tc,.8);break;}
 case 'mine':{box(x0+.3,y0+.3,x1-.3,y1-.3,16,[110,95,80]);const L=iso(x0+.3,y1-.3),Bt=iso(x1-.3,y1-.3);ctx.fillStyle='#120c06';ctx.beginPath();ctx.moveTo(L[0]*.6+Bt[0]*.4-7,L[1]*.6+Bt[1]*.4);ctx.lineTo(L[0]*.6+Bt[0]*.4-7,L[1]*.6+Bt[1]*.4-11);ctx.lineTo(L[0]*.6+Bt[0]*.4+7,L[1]*.6+Bt[1]*.4-8);ctx.lineTo(L[0]*.6+Bt[0]*.4+7,L[1]*.6+Bt[1]*.4+3);ctx.fill();
  gable(x0+.25,y0+.25,x1-.25,y1-.25,16,8,roofC);const g=iso(x1-.2,y1-.1);ctx.fillStyle='#e8c040';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(g[0]+(i%3)*4-4,g[1]-3-(i>2?3:0),2.4,0,7);ctx.fill();}flag(x0+.4,y0+.4,24,tc,.8);break;}
 case 'market':{for(const [sx,sy] of [[.3,.3],[1.6,.3],[.3,1.6],[1.6,1.6]]){box(x0+sx,y0+sy,x0+sx+1.05,y0+sy+1.05,10,WOOD);
   const T=iso(x0+sx-.05,y0+sy-.05),R=iso(x0+sx+1.1,y0+sy-.05),Bt=iso(x0+sx+1.1,y0+sy+1.1),L=iso(x0+sx-.05,y0+sy+1.1);
   for(let k=0;k<4;k++){const t0=k/4,t1=(k+1)/4;const p0=[L[0]+(Bt[0]-L[0])*t0,L[1]+(Bt[1]-L[1])*t0],p1=[L[0]+(Bt[0]-L[0])*t1,L[1]+(Bt[1]-L[1])*t1],q0=[T[0]+(R[0]-T[0])*t0,T[1]+(R[1]-T[1])*t0],q1=[T[0]+(R[0]-T[0])*t1,T[1]+(R[1]-T[1])*t1];
    poly([p0[0],p0[1]-12,p1[0],p1[1]-12,q1[0],q1[1]-20,q0[0],q0[1]-20],k%2?'#eee':rgb(tc));}}
  const c=iso(b.x,b.y);ctx.fillStyle='#d9b24a';ctx.beginPath();ctx.arc(c[0],c[1]-3,3,0,7);ctx.fill();break;}
 case 'barracks':{box(x0+.2,y0+.2,x1-.2,y1-.2,24,[160,130,95]);merlons(x0+.2,y0+.2,x1-.2,y1-.2,24,[160,130,95],5);box(x0+1,y0+1,x1-1,y1-1,8,WOOD,24);gable(x0+.95,y0+.95,x1-.95,y1-.95,32,8,roofC);
  const R=iso(x1-.2,y0+1.2);ctx.fillStyle=rgb(tc);ctx.fillRect(R[0]-10,R[1]-20,8,14);ctx.fillRect(R[0]-24,R[1]-27,8,14);flag(x0+.3,y0+.3,29,tc);
  const L=iso(x0+.2,y1-.2),Bt=iso(x1-.2,y1-.2);ctx.fillStyle='#3a2616';ctx.fillRect((L[0]+Bt[0])/2-6,(L[1]+Bt[1])/2-16,12,15);break;}
 case 'stable':{box(x0+.2,y0+.5,x1-.2,y1-.5,16,WOOD);gable(x0+.1,y0+.4,x1-.1,y1-.4,16,14,roofC);
  ctx.strokeStyle='#5a3a1a';ctx.lineWidth=1.5;const f0=iso(x0+.1,y1-.1),f1=iso(x1-.1,y1-.1);ctx.beginPath();ctx.moveTo(f0[0],f0[1]-5);ctx.lineTo(f1[0],f1[1]-5);ctx.moveTo(f0[0],f0[1]-2);ctx.lineTo(f1[0],f1[1]-2);ctx.stroke();ctx.lineWidth=1;
  flag(x1-.3,y0+.6,24,tc);const hc=iso(x0+.8,y1-.25);ctx.fillStyle='#6b4a2b';ctx.beginPath();ctx.ellipse(hc[0],hc[1]-7,7,3.5,0,0,7);ctx.fill();break;}
 case 'workshop':{box(x0+.25,y0+.25,x1-.25,y1-.25,20,WOOD);gable(x0+.15,y0+.2,x1-.15,y1-.2,20,12,roofC);
  const w=iso(x1-.1,y0+1.5);ctx.strokeStyle='#4a3018';ctx.lineWidth=2.5;ctx.beginPath();ctx.ellipse(w[0],w[1]-10,6,9,0,0,7);ctx.stroke();ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(w[0],w[1]-19);ctx.lineTo(w[0],w[1]-1);ctx.stroke();flag(x0+.3,y0+.3,32,tc);break;}
 case 'wall':{box(x0,y0,x1,y1,20,STONE);merlons(x0+.1,y0+.1,x1-.1,y1-.1,20,STONE,1);const c=iso(x1-.05,y1-.5);ctx.fillStyle=rgb(tc,.9,.7);ctx.fillRect(c[0]-2,c[1]-14,3,4);break;}
 case 'gate':{box(x0,y0,x1,y1,24,[130,124,115]);const L=iso(x0+.2,y1),Bt=iso(x1-.2,y1);poly([L[0],L[1],Bt[0],Bt[1],Bt[0],Bt[1]-15,L[0],L[1]-15],'#5a3a1c');const R=iso(x1,y1-.2),T=iso(x1,y0+.2);poly([R[0],R[1],T[0],T[1],T[0],T[1]-15,R[0],R[1]-15],'#6a4422');
  box(x0,y0,x1,y1,4,tc,24);break;}
 case 'tower':{box(x0+.15,y0+.15,x1-.15,y1-.15,46,STONE);box(x0+.05,y0+.05,x1-.05,y1-.05,6,STONE,46);merlons(x0+.05,y0+.05,x1-.05,y1-.05,52,STONE,2);pyramid(x0+.1,y0+.1,x1-.1,y1-.1,57,16,tc);flag(b.x,b.y,73,tc,.9);
  const c=iso(x0+.5,y1-.15);ctx.fillStyle='#222';ctx.fillRect(c[0]-1.5,c[1]-34,3,7);break;}
 case 'fortress':{box(x0+.2,y0+.2,x1-.2,y1-.2,34,STONE);merlons(x0+.2,y0+.2,x1-.2,y1-.2,34,STONE,7);box(x0+.9,y0+.9,x1-.9,y1-.9,22,STONE,34);pyramid(x0+.85,y0+.85,x1-.85,y1-.85,56,18,tc);
  for(const [cx,cy] of [[x0+.45,y0+.45],[x1-.45,y0+.45],[x0+.45,y1-.45],[x1-.45,y1-.45]]){box(cx-.4,cy-.4,cx+.4,cy+.4,52,[160,156,146]);pyramid(cx-.45,cy-.45,cx+.45,cy+.45,52,16,tc);}
  flag(b.x,b.y,74,tc,1.3);break;}
 }
 if(b.hp<b.maxhp*.5&&Math.random()<.06)parts.push({x:b.x+rr(-b.w/3,b.w/3),y:b.y+rr(-b.h/3,b.h/3),z:20,vx:.2,vy:-.2,vz:15,life:1.5,max:1.5,c:b.hp<b.maxhp*.25?'#e86a1a':'#555',s:4,smoke:true});
 ctx.globalAlpha=1;}
function drawFarmField(b,prog){const x0=b.tx+.08,y0=b.ty+.08,x1=b.tx+b.w-.08,y1=b.ty+b.h-.08;const T=iso(x0,y0),R=iso(x1,y0),Bt=iso(x1,y1),L=iso(x0,y1);
 poly([T[0],T[1],R[0],R[1],Bt[0],Bt[1],L[0],L[1]],'#7a5a34');
 const g=0.5+0.5*Math.sin(time*.05+b.id);const crop=prog<1?'#8a6a3a':`rgb(${110+g*110|0},${150+g*40|0},${50})`;
 ctx.strokeStyle=crop;ctx.lineWidth=2.2;ctx.beginPath();const n=Math.floor(7*prog);for(let i=0;i<n;i++){const t=(i+.5)/7;const a=iso(x0+.1,y0+(y1-y0)*t),c=iso(x1-.1,y0+(y1-y0)*t);ctx.moveTo(a[0],a[1]-1);ctx.lineTo(c[0],c[1]-1);}ctx.stroke();ctx.lineWidth=1;
 const P=players[b.owner];if(P&&prog>=1){const p=iso(x0,y1);ctx.fillStyle='#5a3a1a';ctx.fillRect(p[0]-1,p[1]-10,2,10);ctx.fillStyle=rgb(P.color);ctx.fillRect(p[0]+1,p[1]-10,6,4);}}
function drawRes(tx,ty){const i=ty*MAP+tx,t=resT[i],v=treeV[i];const p=iso(tx+.5,ty+.5);const x=p[0]+((v*7)%5-2),y=p[1];
 if(t===1){ctx.fillStyle='rgba(0,0,0,.2)';ctx.beginPath();ctx.ellipse(x+3,y+1,13,6,0,0,7);ctx.fill();ctx.fillStyle='#5a3b20';ctx.fillRect(x-2,y-10,4,10);
  if(v<2){const cs=v?['#2d5a24','#386c2b','#447d33']:['#2a5521','#33652a','#3f7731'];for(let k=0;k<3;k++){ctx.fillStyle=cs[k];ctx.beginPath();ctx.moveTo(x-13+k*3,y-8-k*9);ctx.lineTo(x,y-28-k*9);ctx.lineTo(x+13-k*3,y-8-k*9);ctx.closePath();ctx.fill();}}
  else{const cs=['#3a6e2c','#4a8236','#5a953f'];ctx.fillStyle=cs[0];ctx.beginPath();ctx.arc(x,y-20,12,0,7);ctx.fill();ctx.fillStyle=cs[1];ctx.beginPath();ctx.arc(x-3,y-23,9,0,7);ctx.fill();ctx.fillStyle=cs[2];ctx.beginPath();ctx.arc(x-5,y-26,5,0,7);ctx.fill();}}
 else{const gold=t===3;ctx.fillStyle='rgba(0,0,0,.2)';ctx.beginPath();ctx.ellipse(x+2,y+2,16,7,0,0,7);ctx.fill();
  const rocks=[[-8,0,9],[6,-1,10],[-1,-6,11]];for(const [ox,oy,s] of rocks){const c=gold?[120,100,70]:[140,138,132];poly([x+ox-s,y+oy,x+ox-s*.5,y+oy-s*.9,x+ox+s*.4,y+oy-s,x+ox+s,y+oy-s*.2,x+ox+s*.6,y+oy+s*.35,x+ox-s*.4,y+oy+s*.4],rgb(c,.8));poly([x+ox-s*.5,y+oy-s*.9,x+ox+s*.4,y+oy-s,x+ox+s,y+oy-s*.2,x+ox,y+oy-s*.3],rgb(c,1.15));}
  if(gold){ctx.fillStyle='#f2cf3a';for(let k=0;k<5;k++){ctx.beginPath();ctx.arc(x-9+((k*7+v*3)%18),y-3-((k*5)%9),1.8,0,7);ctx.fill();}if(Math.sin(time*3+i)>.95){ctx.fillStyle='#fff';ctx.fillRect(x-2,y-9,2,2);}}}}
function drawUnit(u,iconMode){const D=UNITS[u.type];const P=players[u.owner];const c=P?P.color:[128,128,128];const p=iconMode?[0,0]:iso(u.x,u.y);
 ctx.save();ctx.translate(p[0],p[1]);
 if(!iconMode){ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(0,0,u.type==='knight'||u.type==='catapult'?11:6,u.type==='knight'||u.type==='catapult'?5:3,0,0,7);ctx.fill();}
 if(u.dir<0)ctx.scale(-1,1);
 const walk=u.moving||(u.path&&u.path.length);const bob=walk?Math.abs(Math.sin(u.anim*10))*1.5:0;const leg=walk?Math.sin(u.anim*10)*2.5:0;
 const skin='#e2b68c',tcol=rgb(c),tdark=rgb(c,.6);
 const legs=(y0)=>{ctx.strokeStyle='#3a2a1a';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(-1.5,y0);ctx.lineTo(-1.5-leg,0);ctx.moveTo(1.5,y0);ctx.lineTo(1.5+leg,0);ctx.stroke();ctx.lineWidth=1;};
 if(u.type==='peasant'){legs(-5);ctx.fillStyle='#8a6a42';ctx.beginPath();ctx.ellipse(0,-9-bob,4,5,0,0,7);ctx.fill();ctx.fillStyle=tcol;ctx.fillRect(-4,-9-bob,8,2);
  ctx.fillStyle=skin;ctx.beginPath();ctx.arc(0,-16-bob,3,0,7);ctx.fill();ctx.fillStyle='#c9a85a';ctx.beginPath();ctx.ellipse(0,-18.5-bob,5,1.6,0,0,7);ctx.fill();
  if(u.working){const a=Math.sin(u.anim*9)*0.9;ctx.save();ctx.translate(3,-11-bob);ctx.rotate(-0.6+a);ctx.strokeStyle='#5a3a1a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(8,0);ctx.stroke();ctx.fillStyle=u.state==='farm'?'#aaa':'#bbb';ctx.fillRect(7,-2.5,2.5,5);ctx.restore();ctx.lineWidth=1;}
  if(u.carry>0){ctx.fillStyle=u.carryT==='wood'?'#7a5230':u.carryT==='stone'?'#999':'#e8c040';ctx.fillRect(-7,-14-bob,4,5);}}
 else if(u.type==='spearman'){legs(-5);const sw=u.swingT&&time-u.swingT<.25?4:0;ctx.strokeStyle='#5a4028';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(4+sw,-26-bob);ctx.lineTo(4+sw*.3,2-bob);ctx.stroke();ctx.fillStyle='#ccc';ctx.beginPath();ctx.moveTo(4+sw,-30-bob);ctx.lineTo(2.5+sw,-25-bob);ctx.lineTo(5.5+sw,-25-bob);ctx.fill();ctx.lineWidth=1;
  ctx.fillStyle=tcol;ctx.beginPath();ctx.ellipse(0,-9-bob,4.5,5.5,0,0,7);ctx.fill();ctx.fillStyle=skin;ctx.beginPath();ctx.arc(0,-16.5-bob,3,0,7);ctx.fill();ctx.fillStyle='#8d9196';ctx.beginPath();ctx.arc(0,-17.5-bob,3.3,Math.PI,0);ctx.fill();
  ctx.fillStyle=tdark;ctx.beginPath();ctx.ellipse(-3,-9-bob,3,4.5,0,0,7);ctx.fill();ctx.strokeStyle='#d8c070';ctx.stroke();}
 else if(u.type==='archer'){legs(-5);ctx.fillStyle='#5a7a3a';ctx.beginPath();ctx.ellipse(0,-9-bob,4,5,0,0,7);ctx.fill();ctx.fillStyle=tcol;ctx.fillRect(-4,-11-bob,8,3);ctx.fillStyle=skin;ctx.beginPath();ctx.arc(0,-16-bob,3,0,7);ctx.fill();
  ctx.fillStyle=tdark;ctx.beginPath();ctx.moveTo(-3.5,-16-bob);ctx.lineTo(0,-22-bob);ctx.lineTo(3.5,-16-bob);ctx.fill();ctx.fillStyle='#6a4520';ctx.fillRect(-5,-15-bob,2,7);
  ctx.strokeStyle='#7a5228';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(4,-11-bob,7,-1.2,1.2);ctx.stroke();ctx.strokeStyle='#ddd';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(4+7*Math.cos(-1.2),-11-bob+7*Math.sin(-1.2));ctx.lineTo(4+7*Math.cos(1.2),-11-bob+7*Math.sin(1.2));ctx.stroke();ctx.lineWidth=1;}
 else if(u.type==='knight'){const lg=walk?Math.sin(u.anim*14)*3:0;ctx.strokeStyle='#4a3020';ctx.lineWidth=2;ctx.beginPath();for(const [lx,ph] of [[-6,1],[-3,-1],[4,-1],[7,1]]){ctx.moveTo(lx,-7);ctx.lineTo(lx+lg*ph,0);}ctx.stroke();ctx.lineWidth=1;
  ctx.fillStyle='#6b4a2b';ctx.beginPath();ctx.ellipse(0,-9-bob*.5,9,4.5,0,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(6,-11);ctx.lineTo(12,-17-bob*.5);ctx.lineTo(14,-14-bob*.5);ctx.lineTo(9,-8);ctx.fill();
  ctx.fillStyle=tcol;ctx.fillRect(-8,-10-bob*.5,13,4);ctx.fillStyle='#9aa0a6';ctx.beginPath();ctx.ellipse(0,-17-bob,3.5,4.5,0,0,7);ctx.fill();ctx.fillStyle=tcol;ctx.fillRect(-3,-18-bob,6,3);
  ctx.fillStyle='#b0b6bc';ctx.beginPath();ctx.arc(0,-23-bob,2.8,0,7);ctx.fill();ctx.fillStyle=tcol;ctx.fillRect(-.7,-28-bob,1.4,3);
  const sw=u.swingT&&time-u.swingT<.25?3:0;ctx.strokeStyle='#6a4a2a';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(-2,-16-bob);ctx.lineTo(16+sw,-22-bob+sw);ctx.stroke();ctx.lineWidth=1;}
 else if(u.type==='catapult'){const fire=u.fireT?Math.max(0,1-(time-u.fireT)/0.35):0;ctx.fillStyle='#7a5530';ctx.fillRect(-10,-8,20,5);ctx.fillStyle='#5a3a1c';ctx.fillRect(-9,-12,3,6);ctx.fillRect(5,-12,3,6);
  ctx.strokeStyle='#3a2410';ctx.lineWidth=2;for(const wx of [-7,7]){ctx.beginPath();ctx.arc(wx,-3,3.5,0,7);ctx.stroke();}ctx.lineWidth=2.5;ctx.strokeStyle='#8a6038';
  const ang=-0.5-fire*1.6+(u.cd>1?0:0);ctx.beginPath();ctx.moveTo(4,-9);ctx.lineTo(4+Math.cos(Math.PI+ang)*16,-9+Math.sin(Math.PI+ang)*16);ctx.stroke();ctx.lineWidth=1;
  if(u.cd<UNITS.catapult.cd-0.6&&fire===0){ctx.fillStyle='#777';ctx.beginPath();ctx.arc(4+Math.cos(Math.PI+ang)*16,-11+Math.sin(Math.PI+ang)*16,2.5,0,7);ctx.fill();}
  ctx.fillStyle=tcol;ctx.fillRect(-9,-18,1.5,8);ctx.fillRect(-7.5,-18,5,3);}
 ctx.restore();}
