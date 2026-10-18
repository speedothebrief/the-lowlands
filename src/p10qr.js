// ===== tiny QR code encoder (byte mode, ECC L/M, versions 1-40, auto mask) — no external deps =====
const QR=(()=>{
 const ECC={L:{b:1,e:[0,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],n:[0,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25]},
  M:{b:0,e:[0,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],n:[0,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49]}};
 const gmul=(x,y)=>{let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x;}return z&255;};
 const rsDiv=d=>{const r=new Array(d).fill(0);r[d-1]=1;let root=1;for(let i=0;i<d;i++){for(let j=0;j<d;j++){r[j]=gmul(r[j],root);if(j+1<d)r[j]^=r[j+1];}root=gmul(root,2);}return r;};
 const rsRem=(data,div)=>{const r=new Array(div.length).fill(0);for(const b of data){const f=b^r.shift();r.push(0);div.forEach((c,i)=>r[i]^=gmul(c,f));}return r;};
 const alignPos=v=>{if(v===1)return[];const n=Math.floor(v/7)+2,size=v*4+17,step=v===32?26:Math.ceil((v*4+4)/(n*2-2))*2;const r=[6];for(let p=size-7;r.length<n;p-=step)r.splice(1,0,p);return r;};
 const rawMods=v=>{let r=(16*v+128)*v+64;if(v>=2){const n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36;}return r;};
 const dataCap=(v,l)=>Math.floor(rawMods(v)/8)-ECC[l].e[v]*ECC[l].n[v];
 function encode(bytes,lvl){lvl=lvl||'L';let v=1;for(;v<=40;v++)if(4+(v<10?8:16)+bytes.length*8<=dataCap(v,lvl)*8)break;if(v>40)throw new Error('QR: data too long');
  const bits=[];const put=(val,n)=>{for(let i=n-1;i>=0;i--)bits.push((val>>>i)&1);};put(4,4);put(bytes.length,v<10?8:16);for(const b of bytes)put(b,8);
  const cap=dataCap(v,lvl)*8;put(0,Math.min(4,cap-bits.length));while(bits.length%8)bits.push(0);for(let p=0xEC;bits.length<cap;p^=0xEC^0x11)put(p,8);
  const dat=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=b<<1|bits[i+j];dat.push(b);}
  const nb=ECC[lvl].n[v],el=ECC[lvl].e[v],raw=Math.floor(rawMods(v)/8),nShort=nb-raw%nb,shortLen=Math.floor(raw/nb),div=rsDiv(el);const blocks=[];
  for(let i=0,k=0;i<nb;i++){const len=shortLen-el+(i<nShort?0:1);const d=dat.slice(k,k+len);k+=len;blocks.push({d,e:rsRem(d,div)});}
  const cw=[];for(let i=0;i<=shortLen-el;i++)for(const b of blocks)if(i<b.d.length)cw.push(b.d[i]);for(let i=0;i<el;i++)for(const b of blocks)cw.push(b.e[i]);
  const N=v*4+17;const m=[],fn=[];for(let y=0;y<N;y++){m.push(new Array(N).fill(false));fn.push(new Array(N).fill(false));}
  const set=(x,y,d)=>{m[y][x]=d;fn[y][x]=true;};
  for(let i=0;i<N;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
  const finder=(cx,cy)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=N||y>=N)continue;const d=Math.max(Math.abs(dx),Math.abs(dy));set(x,y,d!==2&&d!==4);}};
  finder(3,3);finder(N-4,3);finder(3,N-4);
  const ap=alignPos(v),na=ap.length;for(let i=0;i<na;i++)for(let j=0;j<na;j++){if(i===0&&j===0||i===0&&j===na-1||i===na-1&&j===0)continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(ap[i]+dx,ap[j]+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}
  const fmt=mask=>{const d=ECC[lvl].b<<3|mask;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);const b=(d<<10|r)^0x5412,bit=i=>((b>>>i)&1)===1;
   for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));for(let i=9;i<15;i++)set(14-i,8,bit(i));
   for(let i=0;i<8;i++)set(N-1-i,8,bit(i));for(let i=8;i<15;i++)set(8,N-15+i,bit(i));set(8,N-8,true);};
  fmt(0);
  if(v>=7){let r=v;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);const b=v<<12|r;for(let i=0;i<18;i++){const bt=((b>>>i)&1)===1,a=N-11+i%3,c=Math.floor(i/3);set(a,c,bt);set(c,a,bt);}}
  let i=0;for(let r=N-1;r>=1;r-=2){if(r===6)r=5;for(let vt=0;vt<N;vt++)for(let j=0;j<2;j++){const x=r-j,up=((r+1)&2)===0,y=up?N-1-vt:vt;if(!fn[y][x]&&i<cw.length*8){m[y][x]=((cw[i>>>3]>>>(7-(i&7)))&1)===1;i++;}}}
  const MF=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
  const applyMask=k=>{for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(!fn[y][x]&&MF[k](x,y))m[y][x]=!m[y][x];};
  const penalty=()=>{let p=0,dark=0;const line=get=>{let run=1,s='';for(let k=0;k<N;k++){const c=get(k);s+=c?'1':'0';if(k>0&&c===get(k-1)){run++;if(run===5)p+=3;else if(run>5)p++;}else run=1;}
    s='0000'+s+'0000';for(let k=s.indexOf('1011101');k>=0;k=s.indexOf('1011101',k+1)){if(s.slice(k-4,k)==='0000'||s.slice(k+7,k+11)==='0000')p+=40;}};
   for(let y=0;y<N;y++)line(x=>m[y][x]);for(let x=0;x<N;x++)line(y=>m[y][x]);
   for(let y=0;y<N-1;y++)for(let x=0;x<N-1;x++){const c=m[y][x];if(c===m[y][x+1]&&c===m[y+1][x]&&c===m[y+1][x+1])p+=3;}
   for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(m[y][x])dark++;const t=N*N;p+=(Math.ceil(Math.abs(dark*20-t*10)/t)-1)*10;return p;};
  let best=0,bp=1e9;for(let k=0;k<8;k++){applyMask(k);fmt(k);const p=penalty();if(p<bp){bp=p;best=k;}applyMask(k);}
  applyMask(best);fmt(best);return{size:N,version:v,mask:best,get:(x,y)=>m[y][x]};}
 function draw(canvas,text,px){const bytes=Array.from(new TextEncoder().encode(text));let q;try{q=encode(bytes,bytes.length<1200?'M':'L');}catch(e){q=encode(bytes,'L');}
  const s=px||Math.max(2,Math.floor(320/(q.size+8)));canvas.width=canvas.height=(q.size+8)*s;const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#000';
  for(let y=0;y<q.size;y++)for(let x=0;x<q.size;x++)if(q.get(x,y))c.fillRect((x+4)*s,(y+4)*s,s,s);return q;}
 return{encode,draw};})();
