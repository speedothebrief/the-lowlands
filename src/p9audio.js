// ===== client: audio (WebAudio only, fully procedural) =====
class BattleTimer{ // "under attack" state for the local kingdom: active until `hold` seconds after the last enemy hit
 constructor(hold=10){this.hold=hold;this.last=-Infinity;}
 hit(t){this.last=t;} active(t){return t-this.last<this.hold;} reset(){this.last=-Infinity;}}
const AU=(()=>{
 const num=(v,d)=>typeof v==='number'&&isFinite(v)?clamp(v,0,1):d;
 function load(){try{const o=JSON.parse(localStorage.getItem('kom_audio')||'{}');return{master:num(o.master,.8),music:num(o.music,.6),sfx:num(o.sfx,.8),muted:!!o.muted};}catch(e){return{master:.8,music:.6,sfx:.8,muted:false};}}
 const S=load();
 const battle=new BattleTimer(10);
 const A={S,battle,ac:null,stats:{played:0,dropped:0,battleOn:0,battleOff:0},clock:()=>performance.now()/1000,inBattle:false};
 let ac=null,master,musicBus,sfxBus,battleBus,duck,padF,arpBus,bassBus,rev,revIn,dly,noiseBuf,timer=null;
 const mtof=n=>440*Math.pow(2,(n-69)/12);
 function save(){try{localStorage.setItem('kom_audio',JSON.stringify({master:S.master,music:S.music,sfx:S.sfx,muted:S.muted}));}catch(e){}}
 function applyVol(){if(!ac)return;const t=ac.currentTime;master.gain.setTargetAtTime(S.muted?0:S.master,t,.04);musicBus.gain.setTargetAtTime(S.music*.55,t,.08);sfxBus.gain.setTargetAtTime(S.sfx,t,.04);}
 A.set=(k,v)=>{if(k==='muted')S.muted=!!v;else S[k]=clamp(v,0,1);save();applyVol();};
 A.toggleMute=()=>{A.set('muted',!S.muted);};
 // ---------- graph ----------
 A.init=()=>{
  if(ac){if(ac.state==='suspended')ac.resume().catch(()=>{});return;}
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  try{ac=new C();}catch(e){return;}A.ac=ac;
  const comp=ac.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;comp.attack.value=.005;comp.release.value=.25;comp.connect(ac.destination);
  master=ac.createGain();master.connect(comp);musicBus=ac.createGain();musicBus.connect(master);sfxBus=ac.createGain();sfxBus.connect(master);
  noiseBuf=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate);{const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
  // reverb (generated impulse response)
  rev=ac.createConvolver();{const len=ac.sampleRate*3.2,ir=ac.createBuffer(2,len,ac.sampleRate);for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6);}rev.buffer=ir;}
  revIn=ac.createGain();revIn.gain.value=1;const revOut=ac.createGain();revOut.gain.value=.55;revIn.connect(rev);rev.connect(revOut);revOut.connect(musicBus);
  duck=ac.createGain();duck.connect(musicBus);
  battleBus=ac.createGain();battleBus.gain.value=0;battleBus.connect(musicBus);const bRev=ac.createGain();bRev.gain.value=.25;battleBus.connect(bRev);bRev.connect(revIn);
  // pads: shared lowpass with a very slow LFO
  padF=ac.createBiquadFilter();padF.type='lowpass';padF.frequency.value=900;padF.Q.value=.7;padF.connect(duck);const ps=ac.createGain();ps.gain.value=.7;padF.connect(ps);ps.connect(revIn);
  lfo(.031,450,padF.frequency);
  // arp: echo + reverb
  arpBus=ac.createGain();arpBus.connect(duck);dly=ac.createDelay(2);const fb=ac.createGain(),fl=ac.createBiquadFilter(),wet=ac.createGain();fl.type='lowpass';fl.frequency.value=2400;fb.gain.value=.38;wet.gain.value=.5;
  dly.delayTime.value=M.stepDur*3;arpBus.connect(dly);dly.connect(fl);fl.connect(fb);fb.connect(dly);fl.connect(wet);wet.connect(duck);const as=ac.createGain();as.gain.value=.6;arpBus.connect(as);as.connect(revIn);wet.connect(revIn);
  bassBus=ac.createGain();bassBus.gain.value=1;bassBus.connect(duck);
  // airy noise texture
  {const s=ac.createBufferSource();s.buffer=noiseBuf;s.loop=true;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=1500;f.Q.value=.6;const g=ac.createGain();g.gain.value=.006;lfo(.07,.004,g.gain);lfo(.05,700,f.frequency);s.connect(f);f.connect(g);g.connect(duck);g.connect(revIn);s.start();}
  // battle drone: tritone + minor second, swept bandpass, tempo-synced tremolo (always running, heard only via battleBus)
  {const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=600;f.Q.value=2.5;lfo(.23,420,f.frequency);const g=ac.createGain();g.gain.value=.06;const trem=ac.createGain();trem.gain.value=.5;
   const tl=ac.createOscillator();tl.frequency.value=1/(M.stepDur*2);const tg=ac.createGain();tg.gain.value=.5;tl.connect(tg);tg.connect(trem.gain);tl.start();
   for(const [fq,ty,dt] of [[55,'sawtooth',0],[77.78,'sawtooth',6],[58.27,'square',-5],[110,'sawtooth',11]]){const o=ac.createOscillator();o.type=ty;o.frequency.value=fq;o.detune.value=dt;o.connect(f);o.start();}
   f.connect(g);g.connect(trem);trem.connect(battleBus);}
  applyVol();M.nextT=ac.currentTime+.15;timer=setInterval(tick,50);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ac&&ac.state==='suspended')ac.resume().catch(()=>{});});};
 function lfo(rate,depth,param){const o=ac.createOscillator();o.frequency.value=rate;const g=ac.createGain();g.gain.value=depth;o.connect(g);g.connect(param);o.start();return o;}
 // ---------- tiny synth helpers ----------
 function env(p,t,a,peak,d){p.setValueAtTime(.0001,t);p.exponentialRampToValueAtTime(Math.max(peak,.0002),t+a);p.exponentialRampToValueAtTime(.0001,t+a+d);}
 function tone(dest,type,f0,f1,t,a,peak,d,filt){const o=ac.createOscillator();o.type=type;o.frequency.setValueAtTime(f0,t);if(f1&&f1!==f0)o.frequency.exponentialRampToValueAtTime(f1,t+a+d);const g=ac.createGain();env(g.gain,t,a,peak,d);
  if(filt){const f=ac.createBiquadFilter();f.type=filt[0];f.frequency.value=filt[1];f.Q.value=filt[2]||1;o.connect(f);f.connect(g);}else o.connect(g);g.connect(dest);o.start(t);o.stop(t+a+d+.05);return o;}
 function noise(dest,type,f0,f1,q,t,a,peak,d){const s=ac.createBufferSource();s.buffer=noiseBuf;s.loop=true;const f=ac.createBiquadFilter();f.type=type;f.frequency.setValueAtTime(f0,t);if(f1&&f1!==f0)f.frequency.exponentialRampToValueAtTime(f1,t+a+d);f.Q.value=q;const g=ac.createGain();env(g.gain,t,a,peak,d);
  s.connect(f);f.connect(g);g.connect(dest);s.start(t,Math.random()*1.5);s.stop(t+a+d+.05);}
 const R=(a,b)=>a+Math.random()*(b-a);
 // ---------- sound effects: [gap s, max concurrent of kind, volume, owner-only, positional, fn(out,t,extra)->duration] ----------
 const FX={
  click:[.03,3,.45,0,0,(o,t)=>{tone(o,'sine',1500,900,t,.002,.3,.05);return .07;}],
  sel_peas:[.06,2,.4,0,0,(o,t)=>{tone(o,'sine',880,880,t,.003,.22,.07);tone(o,'sine',1320,1320,t+.05,.003,.18,.09);return .16;}],
  sel_mil:[.06,2,.45,0,0,(o,t)=>{tone(o,'triangle',392,392,t,.003,.3,.08);tone(o,'triangle',587,587,t+.05,.003,.25,.1);noise(o,'highpass',5000,5000,1,t,.001,.12,.03);return .17;}],
  sel_bld:[.06,2,.45,0,0,(o,t)=>{noise(o,'bandpass',900,700,4,t,.001,.6,.06);tone(o,'sine',330,330,t,.004,.2,.18);tone(o,'sine',495,495,t,.004,.12,.18);return .22;}],
  ord_move:[.08,2,.45,0,0,(o,t)=>{tone(o,'triangle',600,950,t,.004,.28,.08);tone(o,'sine',950,950,t+.07,.003,.15,.08);return .16;}],
  ord_atk:[.08,2,.5,0,0,(o,t)=>{tone(o,'sawtooth',320,170,t,.003,.25,.12,['lowpass',1600]);noise(o,'highpass',3000,3000,1,t,.001,.2,.05);return .16;}],
  ord_gather:[.08,2,.45,0,0,(o,t)=>{tone(o,'triangle',520,520,t,.003,.25,.06);tone(o,'triangle',780,780,t+.06,.003,.22,.08);return .15;}],
  place:[.06,2,.6,1,0,(o,t,e)=>{tone(o,'sine',e?110:150,55,t,.003,.6,.2);noise(o,'lowpass',700,300,1,t,.002,.5,.1);return .25;}],
  built:[.3,2,.5,1,0,(o,t,e)=>{if(e){tone(o,'sine',220,220,t,.003,.15,.12);return .15;}[72,76,79,84].forEach((n,i)=>tone(o,'triangle',mtof(n),0,t+i*.07,.004,.2,.45));return .8;}],
  queued:[.05,2,.4,1,0,(o,t)=>{tone(o,'sine',660,660,t,.003,.2,.06);tone(o,'sine',990,990,t+.04,.003,.1,.05);return .1;}],
  trained:[.2,2,.5,1,0,(o,t,e)=>{if(!e){tone(o,'triangle',mtof(67),0,t,.004,.2,.18);tone(o,'triangle',mtof(74),0,t+.09,.004,.2,.25);return .4;}
   tone(o,'sawtooth',mtof(55),0,t,.03,.12,.3,['lowpass',1300]);tone(o,'sawtooth',mtof(62),0,t+.12,.03,.12,.4,['lowpass',1300]);return .6;}],
  chop:[.09,4,.32,0,1,(o,t)=>{noise(o,'bandpass',R(1500,2100),900,2,t,.001,.6,.05);tone(o,'sine',R(200,240),110,t,.001,.35,.06);return .09;}],
  mine:[.09,4,.28,0,1,(o,t)=>{const b=R(2000,2500);for(const k of [1,1.43,1.97])tone(o,'sine',b*k,0,t,.001,.12/k,.14);noise(o,'highpass',3500,3500,1,t,.001,.15,.02);return .18;}],
  drop:[.1,3,.4,1,1,(o,t,e)=>{if(e===3){for(let i=0;i<3;i++)tone(o,'sine',R(2600,3400),0,t+i*.05,.001,.15,.12);return .3;}
   if(e===2){noise(o,'lowpass',1200,500,1,t,.002,.5,.1);tone(o,'sine',120,80,t,.002,.3,.1);return .15;}
   if(e===1){tone(o,'sine',190,90,t,.002,.45,.12);noise(o,'bandpass',600,400,2,t,.002,.3,.08);return .15;}
   noise(o,'bandpass',500,350,1.5,t,.01,.4,.15);return .2;}],
  hit:[.04,6,.42,0,1,(o,t,e)=>{const f=e===1?R(240,280):R(340,420);if(e===2){noise(o,'lowpass',800,400,1,t,.001,.5,.06);tone(o,'sine',160,90,t,.001,.3,.06);return .08;}
   noise(o,'highpass',2600,2600,1,t,.001,.55,.06);tone(o,'square',f,f*.8,t,.001,.14,.06,['bandpass',f*3,6]);if(e===1)tone(o,'sine',120,70,t,.001,.4,.1);return .12;}],
  thk:[.05,4,.3,0,1,(o,t,e)=>{noise(o,'bandpass',e?700:1300,600,4,t,.001,.45,.035);if(e)tone(o,'sine',300,200,t,.001,.2,.05);return .07;}],
  bow:[.05,5,.32,0,1,(o,t)=>{noise(o,'bandpass',3200,800,1.5,t,.012,.35,.14);tone(o,'triangle',170,150,t,.001,.12,.08);return .18;}],
  launch:[.2,3,.6,0,1,(o,t)=>{tone(o,'sawtooth',85,60,t,.02,.12,.25,['bandpass',400,3]);noise(o,'bandpass',1500,350,1,t+.05,.03,.4,.35);tone(o,'sine',90,40,t,.002,.45,.15);return .45;}],
  boom:[.15,4,.75,0,1,(o,t)=>{noise(o,'lowpass',1000,180,.8,t,.002,.9,.6);tone(o,'sine',75,30,t,.002,.8,.5);return .65;}],
  bhit:[.12,3,.45,0,1,(o,t)=>{noise(o,'lowpass',700,300,1,t,.002,.6,.12);tone(o,'sine',110,65,t,.002,.4,.1);return .15;}],
  fall:[.3,2,.85,0,1,(o,t,e)=>{const big=(e||2)/3;noise(o,'lowpass',500,120,.7,t,.03,.9,1.2+big);tone(o,'sine',55,30,t,.01,.7,1+big);
   for(let i=0;i<8;i++)noise(o,'bandpass',R(600,1800),0,3,t+R(.05,1),.002,.25,.06);return 2;}],
  die:[.08,4,.45,0,1,(o,t,e)=>{if(e===2){noise(o,'bandpass',900,300,2,t,.002,.6,.25);tone(o,'sine',90,40,t,.002,.4,.2);return .3;}
   tone(o,'sawtooth',R(190,230),85,t,.01,.22,.3,['bandpass',700,3]);noise(o,'lowpass',500,300,1,t+.05,.002,.35,.1);if(e===1)tone(o,'sawtooth',620,480,t,.03,.08,.35,['bandpass',1300,5]);return .38;}],
  gate:[.3,2,.5,0,1,(o,t)=>{const s=ac.createOscillator();s.type='sawtooth';s.frequency.setValueAtTime(60,t);s.frequency.linearRampToValueAtTime(95,t+.3);s.frequency.linearRampToValueAtTime(70,t+.55);
   const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=520;f.Q.value=6;const g=ac.createGain();env(g.gain,t,.05,.3,.5);s.connect(f);f.connect(g);g.connect(o);s.start(t);s.stop(t+.6);tone(o,'sine',95,60,t+.55,.002,.4,.12);return .75;}],
  err:[.25,1,.5,1,0,(o,t)=>{tone(o,'square',220,220,t,.003,.15,.09,['lowpass',1200]);tone(o,'square',165,165,t+.11,.003,.15,.12,['lowpass',1200]);return .27;}],
  alert:[2,1,.65,1,0,(o,t)=>{for(const s of [0,.85])for(const f of [220,330,440])tone(o,'sawtooth',f,f,t+s,.12,.12,.55,['lowpass',1000]);return 1.6;}],
  horn:[3,1,.7,1,0,(o,t)=>{for(const f of [110,165,220])tone(o,'sawtooth',f,f*.98,t,.35,.14,1.5,['lowpass',650]);tone(o,'sine',90,40,t,.002,.5,.4);tone(o,'sine',90,40,t+.5,.002,.5,.4);return 2;}],
  surr:[1,1,.65,0,0,(o,t)=>{for(const [k,p] of [[1,.3],[2.76,.12],[5.4,.06]])tone(o,'sine',196*k,0,t,.003,p,2.6);return 2.7;}],
  trib:[1,1,.55,1,0,(o,t)=>{for(let i=0;i<12;i++)tone(o,'sine',R(2000,3600),0,t+i*.07+R(0,.03),.001,.12,.15);return 1.1;}],
  victory:[2,1,.7,0,0,(o,t)=>{[60,64,67,72].forEach((n,i)=>{tone(o,'triangle',mtof(n),0,t+i*.16,.01,.25,.3);tone(o,'sawtooth',mtof(n),0,t+i*.16,.01,.06,.3,['lowpass',2000]);});
   for(const n of [72,76,79,84])tone(o,'triangle',mtof(n),0,t+.7,.04,.18,1.6);return 2.4;}],
  defeat:[2,1,.7,0,0,(o,t)=>{[67,63,60,55].forEach((n,i)=>tone(o,'sawtooth',mtof(n),0,t+i*.4,.05,.12,.6,['lowpass',800]));tone(o,'sine',80,35,t+1.6,.002,.6,.8);for(const n of [43,50,55])tone(o,'triangle',mtof(n),0,t+1.6,.1,.12,2);return 3.6;}],
  // Town Bell (reuses the bell partial synth from the music): 3 tolls to call, 2 bright tolls for all-clear
  tbell:[1,1,.8,1,0,(o,t,e)=>{const n=e?2:3;for(let i=0;i<n;i++){const f=e?392:262,tt=t+i*(e?.35:.6);for(const [k,p] of [[1,.32],[2.0,.14],[2.76,.1],[5.4,.05],[.5,.12]])tone(o,'sine',f*k,0,tt,.003,p,e?1.6:2.4);noise(o,'bandpass',f*3,f*3,8,tt,.001,.15,.03);}return e?2.4:3.8;}],
  garr:[.25,2,.45,0,1,(o,t,e)=>{noise(o,'lowpass',600,250,1,t,.003,.5,.12);tone(o,'sine',e?140:110,e?90:70,t,.002,.4,.12);tone(o,'triangle',e?330:220,e?440:165,t+.08,.004,.12,.12);return .25;}],
  hammer:[.07,4,.35,0,1,(o,t,e)=>{noise(o,'bandpass',e?2600:1100,e?2200:800,3,t,.001,.5,.04);tone(o,'sine',e?R(900,1100):R(240,300),e?0:150,t,.001,e?.12:.3,e?.25:.06);if(e)tone(o,'sine',R(1700,1900),0,t+.01,.001,.06,.3);return e?.3:.1;}],
 };
 A.FX=FX;
 const st={};let voices=[];const MAXV=28;
 function posGain(x,y){const s=worldToScreen(x,y);const dx=(s[0]-W/2)/(W/2),dy=(s[1]-(H-PH)/2)/((H-PH)/2);const d=Math.hypot(dx,dy*.8);
  let g=d<1?1:Math.max(0,1-(d-1)/1.3);g*=Math.sqrt(clamp(cam.z,.45,1.3));return{g,pan:clamp(dx*.75,-.9,.9)};}
 A.posGain=posGain;
 A.play=(kind,o)=>{
  if(!ac||ac.state!=='running'||S.muted)return false;const def=FX[kind];if(!def)return false;const [gap,max,vol,,,fn]=def;
  const now=ac.currentTime;const s=st[kind]||(st[kind]={last:-9,ends:[],recent:0,rt:now});
  s.recent*=Math.exp(-(now-s.rt)*3);s.rt=now;
  if(now-s.last<gap){A.stats.dropped++;return false;}
  s.ends=s.ends.filter(e=>e>now);if(s.ends.length>=max){A.stats.dropped++;return false;}
  voices=voices.filter(e=>e>now);if(voices.length>=MAXV&&gap<1){A.stats.dropped++;return false;}
  let g=vol,pan=0;if(o&&o.x!=null&&o.x>=0){const p=posGain(o.x,o.y);if(p.g<.04){A.stats.dropped++;return false;}g*=p.g;pan=p.pan;}
  g*=1/(1+s.recent*.3);s.recent+=1;s.last=now;
  const out=ac.createGain();out.gain.value=g;if(pan&&ac.createStereoPanner){const pn=ac.createStereoPanner();pn.pan.value=pan;out.connect(pn);pn.connect(sfxBus);}else out.connect(sfxBus);
  let dur=.3;try{dur=fn(out,now+.005,o&&o.extra)||.3;}catch(e){console.error(e);}
  s.ends.push(now+dur);voices.push(now+dur);A.stats.played++;return true;};
 A.ui=k=>A.play(k);
 A.resetVoices=()=>{voices=[];for(const k in st)st[k].ends=[];}; // test hook
 // sim events -> sound; 'atk' = an enemy damaged the local kingdom (drives battle music)
 A.events=list=>{if(!list||!list.length)return;
  for(const ev of list){const [k,x,y,o,e]=ev;
   if(k==='atk'){if(o===me)battle.hit(A.clock());continue;}
   const def=FX[k];if(!def)continue;
   if(def[3]&&o!==me)continue;
   if(def[4]){if(x<0)continue;if(fogOn&&o!==me&&vis&&visAt(x,y)!==2)continue;A.play(k,{x,y,extra:e});}
   else A.play(k,{extra:e});}};
 // ---------- generative music ----------
 const M={stepDur:60/72/4,step:0,nextT:0,chord:[57,60,64,67,71],ci:1,motif:[0,2,1,3,2,4,1,3],bt:0};
 const CH=[[53,57,60,64,67],[57,60,64,67,71],[48,55,59,64,67],[52,55,59,62,66],[50,53,57,60,64],[55,59,62,64,69]];
 function tick(){if(!ac)return;const now=ac.currentTime;
  const act=battle.active(A.clock());const tgt=act?1:0;
  if(tgt!==M.bt){M.bt=tgt;A.inBattle=!!tgt;if(tgt)A.stats.battleOn++;else A.stats.battleOff++;battleBus.gain.setTargetAtTime(tgt*.85,now,tgt?.7:1.6);duck.gain.setTargetAtTime(tgt?.7:1,now,1.5);}
  if(M.nextT<now-.2)M.nextT=now+.05;
  while(M.nextT<now+.3){step(M.step,M.nextT);M.step++;M.nextT+=M.stepDur;}}
 A.tick=tick;
 function step(s,t){const sb=s%16;
  if(s%32===0){let n;do{n=Math.floor(Math.random()*CH.length);}while(n===M.ci);M.ci=n;M.chord=CH[n];pad(M.chord,t,M.stepDur*32);bass(M.chord[0],t,M.stepDur*32);
   if(Math.random()<.4){const i=Math.floor(Math.random()*8);M.motif[i]=Math.floor(Math.random()*5);}}
  if(s%32===16&&Math.random()<.5)bass(M.chord[0]+7,t,M.stepDur*14,.06);
  const dens=.32+.18*Math.sin(s/97)+.14*Math.sin(s/41);
  if(sb%2===0?Math.random()<dens+.15:Math.random()<dens*.35){const ns=M.chord.slice().sort((a,b)=>a-b);const n=ns[M.motif[(s>>1)%8]%ns.length]+(Math.random()<.2?24:12);arp(n,t);}
  if(Math.random()<.006)bell(M.chord[Math.floor(Math.random()*M.chord.length)]+24,t);
  if(M.bt||battle.active(A.clock()+0)||battleBus.gain.value>.01)battleStep(s,t);}
 function pad(notes,t,dur){notes.slice(0,4).forEach((n,i)=>{const f=mtof(n);for(const det of [-8,7]){const o=ac.createOscillator();o.type='sawtooth';o.frequency.value=f;o.detune.value=det+R(-3,3);const g=ac.createGain();
   g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.032,t+2.8);g.gain.setValueAtTime(.032,t+dur-.4);g.gain.linearRampToValueAtTime(0,t+dur+3.5);o.connect(g);g.connect(padF);o.start(t);o.stop(t+dur+3.6);}
   if(i===0){const o=ac.createOscillator();o.type='sine';o.frequency.value=f/2;const g=ac.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.05,t+3);g.gain.linearRampToValueAtTime(0,t+dur+3);o.connect(g);g.connect(padF);o.start(t);o.stop(t+dur+3.1);}});}
 function bass(n,t,dur,v=.11){const o=ac.createOscillator();o.type='sine';o.frequency.value=mtof(n-24);const o2=ac.createOscillator();o2.type='triangle';o2.frequency.value=mtof(n-12);const g=ac.createGain(),g2=ac.createGain();g2.gain.value=.15;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.5);g.gain.exponentialRampToValueAtTime(.0005,t+dur);o.connect(g);o2.connect(g2);g2.connect(g);g.connect(bassBus);o.start(t);o2.start(t);o.stop(t+dur+.1);o2.stop(t+dur+.1);}
 function arp(n,t){const o=ac.createOscillator();o.type=Math.random()<.5?'triangle':'sine';o.frequency.value=mtof(n);const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=2200;const g=ac.createGain();env(g.gain,t,.006,.045,.55);o.connect(f);f.connect(g);g.connect(arpBus);o.start(t);o.stop(t+.65);}
 function bell(n,t){for(const [k,p] of [[1,.03],[2.01,.012],[3.98,.006]]){const o=ac.createOscillator();o.type='sine';o.frequency.value=mtof(n)*k;const g=ac.createGain();env(g.gain,t,.01,p,3);o.connect(g);g.connect(revIn);g.connect(duck);o.start(t);o.stop(t+3.1);}}
 function battleStep(s,t){const sb=s%16;const root=(Math.floor(s/32)%2)?46:45; // A / Bb: unsettling semitone shifts
  if(s%2===0){const f=ac.createBiquadFilter();f.type='lowpass';f.Q.value=7;f.frequency.setValueAtTime(140,t);f.frequency.exponentialRampToValueAtTime(sb%4===0?1100:700,t+.03);f.frequency.exponentialRampToValueAtTime(140,t+.2);
   const g=ac.createGain();env(g.gain,t,.005,sb%4===0?.2:.13,.2);f.connect(g);g.connect(battleBus);for(const d of [-9,9]){const o=ac.createOscillator();o.type='sawtooth';o.frequency.value=mtof(root-24);o.detune.value=d;o.connect(f);o.start(t);o.stop(t+.25);}}
  noise(battleBus,'highpass',7500,7500,1,t,.001,sb%2?.035:.065,.03);
  if(sb===0||sb===8||((sb===6||sb===14)&&Math.random()<.35)){tone(battleBus,'sine',115,38,t,.002,.55,.34);noise(battleBus,'lowpass',900,300,1,t,.001,.25,.05);}
  if(sb===0&&s%32===0)for(const k of [12,13,18])tone(battleBus,'sawtooth',mtof(root+k),0,t,.004,.05,.55,['lowpass',1500]);
  if(sb===12&&Math.random()<.5)tone(battleBus,'square',mtof(root+25),mtof(root+24),t,.01,.03,.4,['bandpass',1800,4]);}
 // ---------- settings UI (canvas sliders) ----------
 A.panel=(x,y)=>{ctx.fillStyle='rgba(20,14,8,.92)';ctx.fillRect(x,y,260,128);ctx.strokeStyle='#a08040';ctx.strokeRect(x+.5,y+.5,259,127);
  text('Audio',x+10,y+18,'#ffe7a8','bold 13px Georgia, serif');
  const mh=btn(x+170,y+5,80,20,()=>A.toggleMute(),{tip:{t:'Mute / unmute (M)'}});ctx.fillStyle=S.muted?'#7a3a2a':mh?'#5a4630':'#3a2c1c';ctx.fillRect(x+170,y+5,80,20);text(S.muted?'Muted':'Mute (M)',x+210,y+19,'#f0e0b0','12px Georgia, serif','center');
  [['master','Master'],['music','Music'],['sfx','Effects']].forEach(([k,l],i)=>{const yy=y+40+i*28;text(l,x+10,yy+5,'#ddd','12px Georgia, serif');const sx=x+70,sw=150;
   uiBtns.push({x:sx-6,y:yy-9,w:sw+12,h:18,slider:true,on:()=>A.set(k,(mouse.x-sx)/sw)});
   ctx.fillStyle='#2a2016';ctx.fillRect(sx,yy-2,sw,5);ctx.fillStyle=S.muted?'#776':'#c9a048';ctx.fillRect(sx,yy-2,sw*S[k],5);ctx.fillStyle='#f0e0b0';ctx.beginPath();ctx.arc(sx+sw*S[k],yy+.5,6,0,7);ctx.fill();
   text(Math.round(S[k]*100)+'%',x+250,yy+5,'#cdbb90','11px sans-serif','right');});
  if(!ac||ac.state!=='running')text('Click anywhere to enable sound',x+10,y+122,'#aa9','11px Georgia, serif');};
 return A;})();
let audioPanelOpen=false,activeSlider=null;
window.addEventListener('pointerdown',()=>AU.init(),{capture:true});
window.addEventListener('keydown',()=>AU.init(),{capture:true});
