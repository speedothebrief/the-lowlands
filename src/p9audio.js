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
 let ac=null,master,musicBus,sfxBus,battleBus,duck,padF,arpBus,bassBus,rev,revIn,dly,noiseBuf,timer=null,TH=null,o0,r0;
 const mtof=n=>440*Math.pow(2,(n-69)/12);
 function save(){try{localStorage.setItem('kom_audio',JSON.stringify({master:S.master,music:S.music,sfx:S.sfx,muted:S.muted}));}catch(e){}}
 function applyVol(){if(!ac)return;const t=ac.currentTime;master.gain.setTargetAtTime(S.muted?0:S.master,t,.04);musicBus.gain.setTargetAtTime(S.music*.55,t,.08);sfxBus.gain.setTargetAtTime(S.sfx,t,.04);}
 A.set=(k,v)=>{if(k==='muted')S.muted=!!v;else S[k]=clamp(v,0,1);save();applyVol();};
 A.toggleMute=()=>{A.set('muted',!S.muted);};
 // ---------- graph ----------
 A.init=()=>{
  if(ac){if(ac.state==='suspended')ac.resume().catch(()=>{});return;}
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  try{ac=new C();}catch(e){return;}A.ac=ac;graph();
  applyVol();M.nextT=ac.currentTime+.15;timer=setInterval(tick,50);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ac&&ac.state==='suspended')ac.resume().catch(()=>{});});};
 // the whole music/sfx graph on the current context (the live one, or an OfflineAudioContext for A.render)
 function graph(){
  const comp=ac.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;comp.attack.value=.005;comp.release.value=.25;comp.connect(ac.destination);
  master=ac.createGain();master.connect(comp);musicBus=ac.createGain();musicBus.connect(master);sfxBus=ac.createGain();sfxBus.connect(master);
  noiseBuf=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate);{const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
  // reverb (generated impulse response)
  rev=ac.createConvolver();{const len=ac.sampleRate*3.2,ir=ac.createBuffer(2,len,ac.sampleRate);for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6);}rev.buffer=ir;}
  revIn=ac.createGain();revIn.gain.value=1;const revOut=ac.createGain();revOut.gain.value=.55;revIn.connect(rev);rev.connect(revOut);revOut.connect(musicBus);
  duck=ac.createGain();duck.connect(musicBus);
  // (v1.4.6) one bus pair per age theme (dry -> duck, wet -> reverb), crossfaded when your kingdom advances
  TH=[0,1,2].map(k=>{const d=ac.createGain(),w=ac.createGain();d.gain.value=w.gain.value=0;d.connect(duck);w.connect(revIn);return{d,w};});o0=TH[0].d;r0=TH[0].w;
  battleBus=ac.createGain();battleBus.gain.value=0;battleBus.connect(musicBus);const bRev=ac.createGain();bRev.gain.value=.25;battleBus.connect(bRev);bRev.connect(revIn);
  // pads: shared lowpass with a very slow LFO
  padF=ac.createBiquadFilter();padF.type='lowpass';padF.frequency.value=900;padF.Q.value=.7;padF.connect(o0);const ps=ac.createGain();ps.gain.value=.7;padF.connect(ps);ps.connect(r0);
  lfo(.031,450,padF.frequency);
  // arp: echo + reverb
  arpBus=ac.createGain();arpBus.connect(o0);dly=ac.createDelay(2);const fb=ac.createGain(),fl=ac.createBiquadFilter(),wet=ac.createGain();fl.type='lowpass';fl.frequency.value=2400;fb.gain.value=.38;wet.gain.value=.5;
  dly.delayTime.value=M.stepDur*3;arpBus.connect(dly);dly.connect(fl);fl.connect(fb);fb.connect(dly);fl.connect(wet);wet.connect(o0);const as=ac.createGain();as.gain.value=.6;arpBus.connect(as);as.connect(r0);wet.connect(r0);
  bassBus=ac.createGain();bassBus.gain.value=1;bassBus.connect(o0);
  // airy noise texture
  {const s=ac.createBufferSource();s.buffer=noiseBuf;s.loop=true;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=1500;f.Q.value=.6;const g=ac.createGain();g.gain.value=.006;lfo(.07,.004,g.gain);lfo(.05,700,f.frequency);s.connect(f);f.connect(g);g.connect(o0);g.connect(r0);s.start();}
  // battle drone: tritone + minor second, swept bandpass, tempo-synced tremolo (always running, heard only via battleBus)
  {const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=600;f.Q.value=2.5;lfo(.23,420,f.frequency);const g=ac.createGain();g.gain.value=.06;const trem=ac.createGain();trem.gain.value=.5;
   const tl=ac.createOscillator();tl.frequency.value=1/(M.stepDur*2);const tg=ac.createGain();tg.gain.value=.5;tl.connect(tg);tg.connect(trem.gain);tl.start();
   for(const [fq,ty,dt] of [[55,'sawtooth',0],[77.78,'sawtooth',6],[58.27,'square',-5],[110,'sawtooth',11]]){const o=ac.createOscillator();o.type=ty;o.frequency.value=fq;o.detune.value=dt;o.connect(f);o.start();}
   f.connect(g);g.connect(trem);trem.connect(battleBus);}
  }
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
  chat:[.25,1,.35,0,0,(o,t)=>{tone(o,'sine',880,880,t,.004,.16,.12);tone(o,'sine',1318,1318,t+.07,.004,.12,.16);return .25;}],
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
  gun:[.04,5,.3,0,1,(o,t,e)=>{noise(o,'highpass',e?900:1800,e?600:1200,1,t,.001,.6,e?.12:.05);tone(o,'square',e?90:160,60,t,.001,.2,e?.12:.04,['lowpass',1200]);return e?.2:.08;}],
  siren:[3,1,.55,0,0,(o,t)=>{for(let i=0;i<3;i++){tone(o,'sawtooth',420,780,t+i*.9,.4,.1,.45,['lowpass',1600]);}return 2.8;}],
  nuke:[2,1,1,0,0,(o,t)=>{noise(o,'lowpass',2400,60,.6,t,.005,1,4.5);tone(o,'sine',60,22,t,.005,1,4);noise(o,'bandpass',300,80,.8,t+.3,.4,.6,5);return 6;}],
  ageup:[2,1,.7,1,0,(o,t)=>{[55,60,64,67,72].forEach((n,i)=>{tone(o,'triangle',mtof(n),0,t+i*.13,.01,.22,.4);tone(o,'sawtooth',mtof(n),0,t+i*.13,.01,.05,.4,['lowpass',1800]);});
   for(const n of [60,64,67,72,76])tone(o,'triangle',mtof(n),0,t+.75,.05,.15,2);for(const [k,p] of [[1,.12],[2.76,.05]])tone(o,'sine',mtof(84)*k,0,t+.75,.003,p,2.5);return 3;}],
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
  trade:[.15,2,.45,1,0,(o,t)=>{for(let i=0;i<4;i++)tone(o,'sine',R(2300,3300),0,t+i*.05+R(0,.02),.001,.12,.12);tone(o,'triangle',660,880,t,.003,.08,.12);return .4;}],
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
 const M={stepDur:60/72/4,step:0,nextT:0,chord:[57,60,64,67,71],ci:1,motif:[0,2,1,3,2,4,1,3],bt:0,theme:null,live:[0,0,0],ps:null};
 const CH=[[53,57,60,64,67],[57,60,64,67,71],[48,55,59,64,67],[52,55,59,62,66],[50,53,57,60,64],[55,59,62,64,69]];
 // (v1.4.6) one music theme per age: 0 Early (the original ambient piece), 1 Middle Ages, 2 Modern Age.
 // Themes 1 and 2 run on their own clocks; theme 0 shares the 72 bpm clock with the battle layer, which plays over any theme.
 const TC=[null,{stepDur:60/168,step:0,nextT:0},{stepDur:60/116/4,step:0,nextT:0}];
 const TRIM=[1,.91,.89];   // per-theme level, matched by loudness (see test/audio-test.js and A.render)
 A.TRIM=TRIM;A.levels=()=>TH?TH.map(b=>b.d.gain.value):[];A.theme=null;A.stats.themeSw=0;
 // the theme to play: your own kingdom's age while in a game (solo or LAN, also after a reload/reconnect), Early in the menus
 A.themeFor=()=>(state==='play'||state==='paused')&&players&&players[me]?clamp(players[me].age|0,0,2):0;
 // switch themes. An age advance in a running game waits for the age-up fanfare (~1.6 s, while the banner rises) and then
 // crossfades over ~3.5 s; joining or reloading mid-game switches at once; other changes (back to the menu) crossfade at once.
 function setTheme(k,how){const now=ac.currentTime,start=how==='age'?now+1.6:now,fade=how==='now'?0:how==='age'?3.5:2;const prev=M.theme;M.theme=k;A.theme=k;if(prev!=null&&prev!==k)A.stats.themeSw++;
  TH.forEach((b,i)=>{const v=i===k?TRIM[i]:0;for(const g of [b.d,b.w]){const p=g.gain;const cur=p.value;p.cancelScheduledValues(now);p.setValueAtTime(cur,now);
    if(!fade)p.setValueAtTime(v,now);else if(i===k){p.setValueAtTime(cur,start);p.linearRampToValueAtTime(v,start+fade);}else{p.setValueAtTime(cur,start);p.linearRampToValueAtTime(0,start+fade);}}
   if(i===k){if(i&&!(M.live[i]>now)){TC[i].step=0;TC[i].nextT=start;}M.live[i]=1e9;}else if(M.live[i]>now)M.live[i]=start+fade+.1;});}
 A.setTheme=(k,how)=>{if(ac)setTheme(k,how||'now');};
 function tick(){if(!ac)return;const now=ac.currentTime;
  const want=A.themeFor(),inGame=state==='play'||state==='paused';
  if(M.theme==null)setTheme(want,'now');
  else if(want!==M.theme)setTheme(want,M.ps&&inGame&&want>M.theme?'age':inGame&&!M.ps?'now':'fade');
  M.ps=inGame;
  const act=battle.active(A.clock());const tgt=act?1:0;
  if(tgt!==M.bt){M.bt=tgt;A.inBattle=!!tgt;if(tgt)A.stats.battleOn++;else A.stats.battleOff++;battleBus.gain.setTargetAtTime(tgt*.85,now,tgt?.7:1.6);duck.gain.setTargetAtTime(tgt?.7:1,now,1.5);}
  if(M.nextT<now-.2)M.nextT=now+.05;
  while(M.nextT<now+.3){step(M.step,M.nextT);M.step++;M.nextT+=M.stepDur;}
  for(const k of [1,2])run(k,now+.3,now);}
 A.tick=tick;
 function run(k,until,now){const c=TC[k];if(!(M.live[k]>now))return;if(c.nextT<now-.2&&now>0)c.nextT=now+.05;
  while(c.nextT<until&&c.nextT<M.live[k]){(k===1?mid:mod)(c.step,c.nextT);c.step++;c.nextT+=c.stepDur;}}
 function step(s,t){const sb=s%16;
  if(M.live[0]>t){
  if(s%32===0){let n;do{n=Math.floor(Math.random()*CH.length);}while(n===M.ci);M.ci=n;M.chord=CH[n];pad(M.chord,t,M.stepDur*32);bass(M.chord[0],t,M.stepDur*32);
   if(Math.random()<.4){const i=Math.floor(Math.random()*8);M.motif[i]=Math.floor(Math.random()*5);}}
  if(s%32===16&&Math.random()<.5)bass(M.chord[0]+7,t,M.stepDur*14,.06);
  const dens=.32+.18*Math.sin(s/97)+.14*Math.sin(s/41);
  if(sb%2===0?Math.random()<dens+.15:Math.random()<dens*.35){const ns=M.chord.slice().sort((a,b)=>a-b);const n=ns[M.motif[(s>>1)%8]%ns.length]+(Math.random()<.2?24:12);arp(n,t);}
  if(Math.random()<.006)bell(M.chord[Math.floor(Math.random()*M.chord.length)]+24,t);}
  if(M.bt||battle.active(A.clock()+0)||battleBus.gain.value>.01)battleStep(s,t);}
 // ---------- Middle Ages: D Dorian estampie in 6/8 (dotted quarter = 56): drone fifths, plucked lute, recorder, tabor ----------
 const MD={ph:-1,root:50,mel:null,on:false};const DOR=[0,2,3,5,7,9,10];
 const dor=d=>62+DOR[((d%7)+7)%7]+12*Math.floor(d/7);   // scale degree -> MIDI (degree 0 = D4)
 const RH6=[[2,1,2,1],[3,3],[1,1,1,1,2],[2,1,3],[3,2,1],[1,1,1,3],[2,1,1,2]];
 function midPhrase(){const bars=[];let d=Math.random()<.5?0:4;
  for(let b=0;b<4;b++){const r=RH6[Math.floor(Math.random()*RH6.length)],ns=[];let at=0;
   for(const len of r){if(b===3&&at+len>=6){d=Math.random()<.6?0:4;}else{const j=Math.random();d+=j<.35?1:j<.7?-1:j<.82?2:j<.94?-2:0;d=clamp(d,-2,8);}ns.push([at,len,d]);at+=len;}
   bars.push(ns);}return bars;}
 function mid(s,t){const sd=TC[1].stepDur,bar=Math.floor(s/6),sb=s%6,pb=bar%8;
  if(s%48===0){MD.ph++;MD.root=[50,50,48,50,53,50,48,50][MD.ph%8];drone(MD.root,t,sd*48);if(MD.ph%2===0)MD.mel=midPhrase();MD.on=MD.ph%3!==2;}
  // lute: broken chord over the drone root, a few notes skipped
  const L=[0,7,12,MD.root===48?16:15,12,7][sb];if(Math.random()<(sb===0?1:.78))pluck(MD.root+L,t,sb===0?.07:.05);
  if(sb===0&&pb%2===1&&Math.random()<.5)pluck(MD.root+19,t+sd*.5,.03);
  // tabor: strong 1, lighter 4, sometimes 6; a little roll into each phrase
  if(sb===0)tabor(t,1);else if(sb===3)tabor(t,.6);else if(sb===5&&Math.random()<.4)tabor(t,.35);
  if(pb===7&&sb>=3)tabor(t+sd*.5,.3);
  // recorder: 4-bar tune played twice (answer varies), resting every third phrase
  if(MD.on&&MD.mel){const ns=MD.mel[pb%4];for(const [at,len,d] of ns)if(at===sb){let dd=d;if(pb>=4&&pb<7&&Math.random()<.25)dd+=Math.random()<.5?1:-1;recorder(dor(dd)+(MD.root===48&&dd%7===0?-2:0),t,len*sd);}}}
 function drone(n,t,dur){for(const [m,v] of [[n-12,.024],[n-5,.018],[n,.01]])for(const det of [-5,5]){const o=ac.createOscillator();o.type='sawtooth';o.frequency.value=mtof(m);o.detune.value=det;
   const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=700;f.Q.value=1.5;const g=ac.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+2);g.gain.setValueAtTime(v,t+dur);g.gain.linearRampToValueAtTime(0,t+dur+2.2);
   o.connect(f);f.connect(g);g.connect(TH[1].d);g.connect(TH[1].w);o.start(t);o.stop(t+dur+2.3);}}
 function pluck(n,t,v){const f=ac.createBiquadFilter();f.type='lowpass';f.Q.value=2;f.frequency.setValueAtTime(3200,t);f.frequency.exponentialRampToValueAtTime(380,t+.35);const g=ac.createGain();env(g.gain,t,.003,v,1.1);
  for(const [ty,k,dt] of [['sawtooth',1,-4],['triangle',2,3]]){const o=ac.createOscillator();o.type=ty;o.frequency.value=mtof(n)*k;o.detune.value=dt;o.connect(f);o.start(t);o.stop(t+1.2);}
  f.connect(g);g.connect(TH[1].d);const w=ac.createGain();w.gain.value=.5;g.connect(w);w.connect(TH[1].w);}
 function recorder(n,t,dur){const fr=mtof(n),g=ac.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.06,t+.05);g.gain.setValueAtTime(.06,t+Math.max(.06,dur*.88-.06));g.gain.linearRampToValueAtTime(0,t+dur*.88+.04);
  const vib=ac.createOscillator();vib.frequency.value=5.2;const vg=ac.createGain();vg.gain.setValueAtTime(0,t);vg.gain.linearRampToValueAtTime(fr*.006,t+Math.min(.5,dur));vib.connect(vg);
  for(const [ty,k,v] of [['sine',1,1],['triangle',1,.35],['sine',2,.12]]){const o=ac.createOscillator();o.type=ty;o.frequency.value=fr*k;vg.connect(o.frequency);const og=ac.createGain();og.gain.value=v;o.connect(og);og.connect(g);o.start(t);o.stop(t+dur+.1);}
  vib.start(t);vib.stop(t+dur+.1);noise(g,'bandpass',fr*2.2,fr*2,3,t,.02,.25,.12);
  g.connect(TH[1].d);const w=ac.createGain();w.gain.value=.8;g.connect(w);w.connect(TH[1].w);}
 function tabor(t,a){noise(TH[1].d,'bandpass',1100,900,1.2,t,.001,.09*a,.09);tone(TH[1].d,'sine',190,105,t,.002,.22*a,.16);noise(TH[1].w,'bandpass',1100,900,1.2,t,.001,.03*a,.08);}
 // ---------- Modern Age: A minor march at 116 bpm: kick + snare + hats, staccato ostinato, brass chords, horn calls ----------
 const MO={ph:-1,prog:null,horn:false,hm:null};
 const CH2={Am:[45,57,60,64],F:[41,57,60,65],C:[48,55,60,64],G:[43,55,59,62],Dm:[38,57,62,65],E:[40,56,59,64]};
 const PROG=[['Am','F','C','G'],['Am','F','Dm','E'],['Am','G','F','E'],['Am','Dm','F','E']];
 const RH16=[[6,2,6,2],[4,4,8],[8,4,4],[3,3,2,8],[2,2,4,8]];
 function mod(s,t){const sd=TC[2].stepDur,bar=Math.floor(s/16),sb=s%16,pb=bar%4;
  if(s%64===0){MO.ph++;MO.prog=PROG[MO.ph%2===0?0:1+Math.floor(Math.random()*3)];MO.horn=MO.ph%2===1;if(MO.horn)MO.hm=[0,1,2,3].map(()=>RH16[Math.floor(Math.random()*RH16.length)]);
   tone(TH[2].d,'sine',82,58,t,.004,.3,1.1);noise(TH[2].w,'lowpass',400,120,1,t,.002,.12,.9);}   // timpani on each phrase
  const C=CH2[MO.prog[pb]];
  if(sb===0)brass(C.slice(1),t,sd*16);
  // drums: kick on 1 and 3 (+ pickups), march snare on 2 and 4 with ghost notes, a roll into the next phrase, light hats
  if(sb===0||sb===8||(sb===10&&Math.random()<.4)||(sb===6&&Math.random()<.2)){tone(TH[2].d,'sine',130,42,t,.002,.42,.22);noise(TH[2].d,'lowpass',600,200,1,t,.001,.06,.03);}
  if(sb===4||sb===12)snare(t,1);else if((sb===2||sb===7||sb===10||sb===14||sb===15)&&Math.random()<.35)snare(t,.3);
  if(pb===3&&sb>=12)snare(t+sd*.5,.45);
  if(sb%2===0)noise(TH[2].d,'highpass',8000,8000,1,t,.001,sb%4===0?.022:.014,.03);
  // ostinato: driving staccato 16ths on the chord root, fifth and octave
  const O=[0,0,12,0,7,0,12,7,0,0,12,0,7,12,7,12][sb];stac(C[0]+12+O,t,sd*.8);
  if(sb===0||sb===3||sb===8||sb===11)sub(C[0],t,sd*(sb===0||sb===8?3:5));
  // horn call every other phrase, built from the chord's tones
  if(MO.horn&&MO.hm){let at=0;for(const len of MO.hm[pb]){if(at===sb){const top=C.slice(1).map(n=>n+12),n=top[Math.floor(Math.random()*top.length)]-(Math.random()<.3?12:0);horn(n,t,len*sd);}at+=len;}}}
 function brass(ns,t,dur){for(const n of ns)for(const det of [-7,6]){const o=ac.createOscillator();o.type='sawtooth';o.frequency.value=mtof(n-12);o.detune.value=det;const f=ac.createBiquadFilter();f.type='lowpass';f.Q.value=1.2;
   f.frequency.setValueAtTime(350,t);f.frequency.linearRampToValueAtTime(1500,t+.35);f.frequency.exponentialRampToValueAtTime(800,t+dur);const g=ac.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.022,t+.25);g.gain.setValueAtTime(.022,t+dur-.15);g.gain.linearRampToValueAtTime(0,t+dur+.35);
   o.connect(f);f.connect(g);g.connect(TH[2].d);const w=ac.createGain();w.gain.value=.6;g.connect(w);w.connect(TH[2].w);o.start(t);o.stop(t+dur+.4);}}
 function snare(t,a){noise(TH[2].d,'bandpass',1900,1500,.8,t,.001,.16*a,.13);tone(TH[2].d,'triangle',210,165,t,.001,.1*a,.06);noise(TH[2].w,'bandpass',1900,1500,.8,t,.001,.05*a,.12);}
 function stac(n,t,d){tone(TH[2].d,'square',mtof(n),0,t,.003,.032,d,['lowpass',1100,1]);}
 function sub(n,t,d){tone(TH[2].d,'sawtooth',mtof(n),0,t,.005,.07,d,['lowpass',320,1]);tone(TH[2].d,'sine',mtof(n-12),0,t,.005,.09,d);}
 function horn(n,t,dur){const g=ac.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.05,t+.08);g.gain.setValueAtTime(.05,t+Math.max(.09,dur*.9-.05));g.gain.linearRampToValueAtTime(0,t+dur*.9+.1);
  const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(600,t);f.frequency.linearRampToValueAtTime(1800,t+.12);f.frequency.linearRampToValueAtTime(1200,t+dur);
  for(const [ty,dt] of [['sawtooth',-4],['sawtooth',5],['square',0]]){const o=ac.createOscillator();o.type=ty;o.frequency.value=mtof(n);o.detune.value=dt;o.connect(f);o.start(t);o.stop(t+dur+.15);}
  f.connect(g);g.connect(TH[2].d);const w=ac.createGain();w.gain.value=.9;g.connect(w);w.connect(TH[2].w);}
 // ---------- offline preview render (tests / exporting a clip): the same synthesis on an OfflineAudioContext ----------
 A.render=async(k,secs,sr=44100)=>{const sv=[ac,master,musicBus,sfxBus,battleBus,duck,padF,arpBus,bassBus,rev,revIn,dly,noiseBuf,TH,o0,r0],sM=structuredClone(M),sT=structuredClone(TC),sMD=structuredClone(MD),sMO=structuredClone(MO);
  const off=new OfflineAudioContext(2,Math.ceil(sr*secs),sr);
  try{ac=off;graph();master.gain.value=.8;musicBus.gain.value=.6*.55;sfxBus.gain.value=0;Object.assign(M,{theme:null,live:[0,0,0],nextT:.05,step:0,bt:0});TC[1].nextT=TC[2].nextT=.05;
   setTheme(k,'now');TC[k]&&(TC[k].nextT=.05);while(M.nextT<secs){step(M.step,M.nextT);M.step++;M.nextT+=M.stepDur;}if(k)run(k,secs,0);}
  finally{[ac,master,musicBus,sfxBus,battleBus,duck,padF,arpBus,bassBus,rev,revIn,dly,noiseBuf,TH,o0,r0]=sv;Object.assign(M,sM);Object.assign(TC[1],sT[1]);Object.assign(TC[2],sT[2]);Object.assign(MD,sMD);Object.assign(MO,sMO);}
  const b=await off.startRendering();return [b.getChannelData(0),b.getChannelData(1)];};
 function pad(notes,t,dur){notes.slice(0,4).forEach((n,i)=>{const f=mtof(n);for(const det of [-8,7]){const o=ac.createOscillator();o.type='sawtooth';o.frequency.value=f;o.detune.value=det+R(-3,3);const g=ac.createGain();
   g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.032,t+2.8);g.gain.setValueAtTime(.032,t+dur-.4);g.gain.linearRampToValueAtTime(0,t+dur+3.5);o.connect(g);g.connect(padF);o.start(t);o.stop(t+dur+3.6);}
   if(i===0){const o=ac.createOscillator();o.type='sine';o.frequency.value=f/2;const g=ac.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.05,t+3);g.gain.linearRampToValueAtTime(0,t+dur+3);o.connect(g);g.connect(padF);o.start(t);o.stop(t+dur+3.1);}});}
 function bass(n,t,dur,v=.11){const o=ac.createOscillator();o.type='sine';o.frequency.value=mtof(n-24);const o2=ac.createOscillator();o2.type='triangle';o2.frequency.value=mtof(n-12);const g=ac.createGain(),g2=ac.createGain();g2.gain.value=.15;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.5);g.gain.exponentialRampToValueAtTime(.0005,t+dur);o.connect(g);o2.connect(g2);g2.connect(g);g.connect(bassBus);o.start(t);o2.start(t);o.stop(t+dur+.1);o2.stop(t+dur+.1);}
 function arp(n,t){const o=ac.createOscillator();o.type=Math.random()<.5?'triangle':'sine';o.frequency.value=mtof(n);const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=2200;const g=ac.createGain();env(g.gain,t,.006,.045,.55);o.connect(f);f.connect(g);g.connect(arpBus);o.start(t);o.stop(t+.65);}
 function bell(n,t){for(const [k,p] of [[1,.03],[2.01,.012],[3.98,.006]]){const o=ac.createOscillator();o.type='sine';o.frequency.value=mtof(n)*k;const g=ac.createGain();env(g.gain,t,.01,p,3);o.connect(g);g.connect(r0);g.connect(o0);o.start(t);o.stop(t+3.1);}}
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
