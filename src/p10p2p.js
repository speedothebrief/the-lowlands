// ===== browser peer-to-peer multiplayer (WebRTC DataChannels) =====
// The host's browser runs the authoritative simulation in an isolated copy of the SIM code (same code as server.js)
// plus the shared room/lobby logic (createRoom); its own UI is just another client fed by a loopback.
// Signaling: manual offer/answer codes (copy-paste or QR) — works from file:// with no server — or, when the page is
// served by server.js, a room code relayed over its /sig websocket.
let p2p=null; // {role:'host'|'join', ...}
const P2P_CH=16000;
function p2pIce(){let stun=false;try{stun=localStorage.getItem('kom_stun')==='1';}catch(e){}return{iceServers:stun?[{urls:'stun:stun.l.google.com:19302'}]:[]};}
// large messages (init map data) are split into chunks; DataChannels are ordered + reliable
function dcSend(dc,s){if(!dc||dc.readyState!=='open')return;try{if(s.length<=P2P_CH){dc.send(s);return;}const id=(dcSend.n=(dcSend.n||0)+1),n=Math.ceil(s.length/P2P_CH);
 for(let i=0;i<n;i++)dc.send('\u0001'+id+'|'+i+'|'+n+'|'+s.slice(i*P2P_CH,(i+1)*P2P_CH));}catch(e){console.warn('p2p send',e);}}
function dcRecv(dc,cb){const parts=new Map();dc.onmessage=ev=>{const s=ev.data;if(typeof s!=='string')return;
 if(s.charCodeAt(0)===1){const a=s.indexOf('|'),b=s.indexOf('|',a+1),c=s.indexOf('|',b+1);const id=s.slice(1,a),i=+s.slice(a+1,b),n=+s.slice(b+1,c);let p=parts.get(id);if(!p){p=[];parts.set(id,p);}p[i]=s.slice(c+1);
  if(p.filter(x=>x!=null).length===n){parts.delete(id);cb(p.join(''));}return;}cb(s);};}
// ---- signaling codes: JSON {k:'o'|'a', s:sdp} → deflate-raw (if available) → base64url, prefixed LL1 (deflated) / LL0 (plain)
const b64u=u8=>{let s='';for(let i=0;i<u8.length;i+=8192)s+=String.fromCharCode.apply(null,u8.subarray(i,i+8192));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const unb64u=s=>{s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;};
async function pipeBytes(u8,stream){const r=new Response(new Blob([u8]).stream().pipeThrough(stream));return new Uint8Array(await r.arrayBuffer());}
async function encodeSig(obj){const raw=new TextEncoder().encode(JSON.stringify(obj));
 if(typeof CompressionStream!=='undefined'){try{return 'LL1'+b64u(await pipeBytes(raw,new CompressionStream('deflate-raw')));}catch(e){}}return 'LL0'+b64u(raw);}
async function decodeSig(code){code=String(code||'').replace(/\s+/g,'');const v=code.slice(0,3);let u=unb64u(code.slice(3));
 if(v==='LL1')u=await pipeBytes(u,new DecompressionStream('deflate-raw'));else if(v!=='LL0')throw new Error('Not a Lowlands connection code');return JSON.parse(new TextDecoder().decode(u));}
function iceDone(pc,ms){return new Promise(res=>{if(pc.iceGatheringState==='complete')return res();const t=setTimeout(res,ms||3000);
 pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(t);res();}});});}
// isolated simulation instance for the host (separate scope from the page's client-side copy)
function makeSimInstance(){const src=document.querySelector('script').textContent;const A='/*SIM'+'-BEGIN*/',B='/*SIM'+'-END*/';
 return new Function(src.slice(src.indexOf(A),src.indexOf(B))+';return {setupGame,sim,applyCmd,makeSnap,mapData,playersMeta,makeAI,surrender,STEP,KINGDOMS,get:()=>({players,time,gameOver,seed})};')();}
// timer that keeps running in a background tab (worker ticks are not throttled like page timers); falls back to setInterval
function p2pTimer(fn,ms){try{const w=new Worker(URL.createObjectURL(new Blob([`setInterval(()=>postMessage(0),${ms});`],{type:'text/javascript'})));w.onmessage=fn;return()=>w.terminate();}
 catch(e){const h=setInterval(fn,ms);return()=>clearInterval(h);}}
// ---- host
function p2pHost(){p2pLeave(true);const API=makeSimInstance();
 const room=createRoom(API,{p2p:true,timer:p2pTimer,log:m=>console.log('[host] '+m)});
 // drive the room's loop from an unthrottled timer
 p2p={role:'host',API,room,peers:new Set(),sig:null,code:null};
 netKind='p2p';lobby=null;
 const self=room.join(s=>queueMicrotask(()=>{if(p2p&&p2p.role==='host'){let m;try{m=JSON.parse(s);}catch(e){return;}handleNet(m);}}),'this browser');
 p2p.self=self;conn={send:s=>{let m;try{m=JSON.parse(s);}catch(e){return;}self.msg(m);}};
 self.msg({t:'hello',name:myName()||'Host'});state='lobby';p2pRelayHost();}
function p2pNewPeer(){const pc=new RTCPeerConnection(p2pIce());const dc=pc.createDataChannel('game',{ordered:true});const peer={pc,dc,h:null,state:'waiting',inv:Math.random().toString(36).slice(2,8)};p2p.peers.add(peer);
 dc.onopen=()=>{if(!p2p||p2p.role!=='host'){pc.close();return;}peer.state='open';peer.h=p2p.room.join(s=>dcSend(dc,s),'WebRTC peer');p2pModalClose(peer);};
 dcRecv(dc,s=>{let m;try{m=JSON.parse(s);}catch(e){return;}if(peer.h)peer.h.msg(m);});
 const gone=()=>{if(peer.state==='gone')return;peer.state='gone';if(peer.h)peer.h.leave();if(p2p)p2p.peers.delete(peer);try{pc.close();}catch(e){}};
 dc.onclose=gone;pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState))gone();};peer.gone=gone;return peer;}
async function p2pMakeOffer(peer){await peer.pc.setLocalDescription(await peer.pc.createOffer());await iceDone(peer.pc);return encodeSig({k:'o',s:peer.pc.localDescription.sdp,i:peer.inv});}
async function p2pAcceptAnswer(peer,code){const d=await decodeSig(code);if(d.k!=='a')throw new Error('That is not an answer code (it should come from the joining player).');
 if(p2p&&p2p.role==='host'&&d.i){const byId=[...p2p.peers].find(q=>q.inv===d.i);if(byId)peer=byId;else if(peer&&peer.inv!==d.i)throw new Error('That answer belongs to an older invite.');}
 if(!peer||peer.pc.signalingState!=='have-local-offer')throw new Error('No open invite is waiting for that answer.');await peer.pc.setRemoteDescription({type:'answer',sdp:d.s});}
async function p2pInvite(){if(!p2p||p2p.role!=='host')return;const peer=p2pNewPeer();p2pModal('invite',{peer});try{const code=await p2pMakeOffer(peer);p2pModalShow(code);}catch(e){p2pStatus('Could not create an invite: '+e.message);}}
// relay (server.js /sig): host gets a room code; joiners connect by code; the server only forwards offer/answer
// Signaling server: saved address (e.g. 192.168.1.20:8080, wardenfam.com:8080, https://x.example) or, by default,
// the origin serving this page. ws:// or wss:// is chosen automatically (wss for https pages / https:// or wss:// addresses).
function sigAddr(){try{return (localStorage.getItem('kom_sig')||'').trim();}catch(e){return '';}}
function sigParse(a){a=String(a||'').trim();if(!a)return null;let sec=location.protocol==='https:';const m=a.match(/^([a-z]+):\/\//i);
 if(m){const sc=m[1].toLowerCase();sec=sc==='https'||sc==='wss';a=a.slice(m[0].length);}a=a.replace(/[\/?#].*$/,'');if(!/^[\w.\-\[\]:]+$/.test(a))return null;
 return{ws:(sec?'wss://':'ws://')+a+'/sig',http:(sec?'https://':'http://')+a+'/',host:a};}
function sigInfo(){const a=sigAddr();if(a)return sigParse(a);return /^https?:$/.test(location.protocol)?{ws:(location.protocol==='https:'?'wss://':'ws://')+location.host+'/sig',http:location.origin+location.pathname,host:location.host,dflt:true}:null;}
function sigURL(){const i=sigInfo();return i?i.ws:null;}
function sigSave(a){a=String(a||'').trim();if(a&&!sigParse(a))return false;try{a?localStorage.setItem('kom_sig',a):localStorage.removeItem('kom_sig');}catch(e){}
 if(p2p&&p2p.role==='host'){try{p2p.sig&&p2p.sig.close();}catch(e){}p2p.sig=null;p2p.code=null;p2p.sigState=null;p2pRelayHost();}return true;}
function sigCodeNorm(c){return String(c||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,5);}
function p2pRelayHost(){const u=sigURL();if(!u){p2p.sigState='none';return;}let s;try{s=new WebSocket(u);}catch(e){p2p.sigState='fail';return;}p2p.sig=s;p2p.sigState='connecting';const pend=new Map();
 s.onopen=()=>s.send(JSON.stringify({t:'host'}));s.onerror=()=>{};s.onclose=()=>{if(p2p&&p2p.sig===s){p2p.sigState=p2p.code?'closed':'fail';p2p.code=null;}};
 s.onmessage=async ev=>{let m;try{m=JSON.parse(ev.data);}catch(e){return;}if(!p2p||p2p.sig!==s)return;
  if(m.t==='code'){p2p.code=m.code;p2p.sigState='ok';const e=document.getElementById('p2pRC');if(e)e.textContent=m.code;}
  else if(m.t==='peer'){const peer=p2pNewPeer();pend.set(m.id,peer);try{const code=await p2pMakeOffer(peer);s.send(JSON.stringify({t:'sig',to:m.id,data:code}));}catch(e){console.warn(e);}}
  else if(m.t==='sig'){const peer=pend.get(m.from);if(peer){pend.delete(m.from);try{await p2pAcceptAnswer(peer,m.data);}catch(e){console.warn(e);}}}};}
// ---- join
function p2pJoinStart(){p2pLeave(true);p2p={role:'join',pc:null,dc:null};p2pModal('join',{});}
async function p2pJoinWithOffer(code){const d=await decodeSig(code);if(d.k!=='o')throw new Error('That is not an invite code (it should come from the host).');
 const pc=new RTCPeerConnection(p2pIce());p2p.pc=pc;
 pc.ondatachannel=ev=>{const dc=ev.channel;p2p.dc=dc;dcRecv(dc,s=>{let m;try{m=JSON.parse(s);}catch(e){return;}if(p2p&&p2p.dc===dc)handleNet(m);});dc.onopen=()=>{netKind='p2p';lobby=null;conn={send:s=>dcSend(dc,s)};
   netSend({t:'hello',name:myName()});state='lobby';p2pModalClose();};
  dc.onclose=()=>{if(p2p&&p2p.dc===dc)p2pLost();};};
 pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'&&p2p&&p2p.pc===pc)p2pLost();};
 await pc.setRemoteDescription({type:'offer',sdp:d.s});await pc.setLocalDescription(await pc.createAnswer());await iceDone(pc);
 return encodeSig({k:'a',s:pc.localDescription.sdp,i:d.i});}
function p2pJoinRoom(rc){rc=sigCodeNorm(rc);const u=sigURL();if(!u){p2pStatus('Set a signaling server address first (the LAN/Synology server running server.js).');return;}if(rc.length<4){p2pStatus('Room codes have 4–5 letters.');return;}
 if(!p2p)p2p={role:'join',pc:null,dc:null};try{p2p.sig&&p2p.sig.close();}catch(e){}
 let s;try{s=new WebSocket(u);}catch(e){p2pStatus('Bad signaling server address.');return;}p2p.sig=s;let opened=false;
 const to=setTimeout(()=>{if(!opened){try{s.close();}catch(e){}p2pStatus(`Can't reach the signaling server at ${sigInfo().host}.`);}},6000);
 s.onerror=()=>{if(!opened){clearTimeout(to);p2pStatus(`Can't reach the signaling server at ${sigInfo().host}.`);}};
 s.onopen=()=>{opened=true;clearTimeout(to);p2pStatus('Joining room '+rc+'…');s.send(JSON.stringify({t:'join',code:rc,name:myName()}));};
 s.onmessage=async ev=>{let m;try{m=JSON.parse(ev.data);}catch(e){return;}
  if(m.t==='nocode')p2pStatus(`No open room "${rc}" on ${sigInfo().host}.`);
  else if(m.t==='sig'){try{const ans=await p2pJoinWithOffer(m.data);s.send(JSON.stringify({t:'sig',data:ans}));p2pStatus('Connecting…');}catch(e){p2pStatus(e.message);}}
  else if(m.t==='hostgone'){}};}
function p2pLost(){const was=mode==='net';p2pLeave(true);if(was){mode='local';previewMap();}state='menu';msg('Lost the connection to the host.','#ff7a6a',me);}
function p2pLeave(quiet){if(!p2p)return;const P=p2p;p2p=null;
 if(P.role==='host'){for(const pe of [...P.peers]){try{pe.dc.close();}catch(e){}try{pe.pc.close();}catch(e){}}P.room.close();}
 else{try{P.dc&&P.dc.close();}catch(e){}try{P.pc&&P.pc.close();}catch(e){}}
 try{P.sig&&P.sig.close();}catch(e){}p2pModalClose();if(netKind==='p2p'){netKind=null;conn=null;lobby=null;}}
// ---- DOM dialog for codes (canvas UI can't do copy/paste)
let p2pDlg=null;
function p2pModal(kind,o){p2pModalClose();const d=document.createElement('div');d.id='p2pModal';p2pDlg={el:d,kind,peer:o.peer};
 d.style.cssText='position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(580px,94vw);max-height:94vh;overflow:auto;background:#1b1712;border:2px solid #8a6d3b;border-radius:8px;padding:16px 18px;color:#eee;font:14px Georgia,serif;z-index:10;box-shadow:0 8px 40px #000';
 const stun=(()=>{try{return localStorage.getItem('kom_stun')==='1';}catch(e){return false;}})();
 const ta='width:100%;box-sizing:border-box;height:58px;background:#0e0c09;color:#cfe;border:1px solid #665;font:11px monospace;word-break:break-all';
 const btn='background:#5a4426;color:#ffe7a8;border:1px solid #a8844a;border-radius:4px;padding:5px 12px;margin:4px 6px 4px 0;font:13px Georgia,serif;cursor:pointer';
 const relay=!!sigURL(),code=p2p&&p2p.code;
 const si=sigInfo();const sigBox=`<p style="margin:6px 0;font-size:12px;color:#aa9">Signaling server: <input id="p2pSig" value="${sigAddr().replace(/"/g,'')}" placeholder="${si&&si.dflt?si.host+' (this page)':'e.g. 192.168.1.20:8080'}" style="width:190px;background:#0e0c09;color:#cfe;border:1px solid #665;font:12px monospace"> <button id="p2pSigSave" style="${btn};font-size:11px;padding:2px 8px">Save</button> <span id="p2pSigNow">${si?'using '+si.host:'none set'}</span></p>`;
 const qr=`<div style="text-align:center"><canvas id="p2pQR" style="max-width:100%;image-rendering:pixelated;display:none"></canvas></div>`;
 const stunBox=`<label style="font-size:12px;color:#aa9"><input type="checkbox" id="p2pStun" ${stun?'checked':''}> use a public STUN server (only needed across the internet; LAN works without)</label>
  <div id="p2pStatus" style="color:#ffd27a;min-height:18px;margin-top:6px"></div>`;
 if(kind==='invite')d.innerHTML=`<div style="font:bold 18px Georgia;color:#ffe7a8">Invite a player</div>
  ${relay?`<p style="margin:8px 0">Players choose <i>Join (peer-to-peer)</i> and type the room code <b id="p2pRC" style="font:bold 22px monospace;color:#ffe7a8;letter-spacing:3px">${code||'…'}</b></p>`:''}
  ${sigBox}
  <details id="p2pManual" style="margin:8px 0" ${relay&&code?'':'open'}><summary style="color:#aa9;cursor:pointer">No signaling server? Exchange codes by copy-paste instead</summary>
  <p style="margin:6px 0">1. Send this <b>invite code</b> to the other player (copy-paste it, or let them scan the QR code):</p>
  <textarea id="p2pCode" readonly style="${ta}" placeholder="creating…"></textarea><br><button id="p2pCopy" style="${btn}">Copy invite code</button>${qr}
  <p style="margin:6px 0">2. Paste the <b>answer code</b> they send back:</p>
  <textarea id="p2pIn" style="${ta}"></textarea><br><button id="p2pGo" style="${btn}">Connect</button></details>
  <button id="p2pClose" style="${btn}">Close</button>${stunBox}`;
 else d.innerHTML=`<div style="font:bold 18px Georgia;color:#ffe7a8">Join a peer-to-peer game</div>
  <p style="margin:10px 0 4px">Type the host's <b>room code</b>:</p>
  <p style="margin:4px 0"><input id="p2pRoom" maxlength="5" autocomplete="off" spellcheck="false" placeholder="ABCD" style="width:120px;text-transform:uppercase;letter-spacing:4px;background:#0e0c09;color:#ffe7a8;border:1px solid #a8844a;font:bold 24px monospace;padding:4px 8px"> <button id="p2pRoomGo" style="${btn};font-size:16px">Join</button> <button id="p2pClose" style="${btn}">Cancel</button></p>
  ${sigBox}
  <details id="p2pManual" style="margin:8px 0" ${relay?'':'open'}><summary style="color:#aa9;cursor:pointer">No signaling server? Exchange codes by copy-paste instead</summary>
  <p style="margin:6px 0">1. Paste the host's <b>invite code</b>:</p><textarea id="p2pIn" style="${ta}"></textarea><br><button id="p2pGo" style="${btn}">Create answer</button>
  <div id="p2pAns" style="display:none"><p style="margin:6px 0">2. Send this <b>answer code</b> back to the host (copy-paste, or let them scan the QR code):</p>
  <textarea id="p2pCode" readonly style="${ta}"></textarea><br><button id="p2pCopy" style="${btn}">Copy answer code</button>${qr}</div></details>${stunBox}`;
 document.body.appendChild(d);const $=id=>d.querySelector('#'+id);
 const copyBtn=(b,t)=>{if($(b))$(b).onclick=()=>{p2pCopyText($(t).value);p2pStatus('Copied.');};};
 copyBtn('p2pCopy','p2pCode');
 if($('p2pSigSave'))$('p2pSigSave').onclick=()=>{const v=$('p2pSig').value;if(!sigSave(v)){p2pStatus('Use an address like 192.168.1.20:8080 or wardenfam.com:8080.');return;}const i=sigInfo();$('p2pSigNow').textContent=i?'using '+i.host:'none set';p2pStatus(i?'Signaling server saved: '+i.host:'Signaling server cleared.');};
 if($('p2pRoom')){$('p2pRoom').addEventListener('input',e=>{e.target.value=sigCodeNorm(e.target.value);});$('p2pRoom').addEventListener('keydown',e=>{if(e.key==='Enter')$('p2pRoomGo').click();});setTimeout(()=>{try{$('p2pRoom').focus();}catch(e){}},0);}
 if($('p2pStun'))$('p2pStun').onchange=e=>{try{localStorage.setItem('kom_stun',e.target.checked?'1':'0');}catch(x){}};
 $('p2pClose').onclick=()=>{if(kind==='invite'){if(o.peer&&o.peer.state!=='open')o.peer.gone();p2pModalClose();}else{p2pLeave(true);state='menu';}};
 if(kind==='invite'){
  $('p2pGo').onclick=async()=>{try{p2pStatus('Connecting…');await p2pAcceptAnswer(o.peer,$('p2pIn').value);}catch(e){p2pStatus(e.message);}};}
 else if(kind==='join'){$('p2pGo').onclick=()=>p2pJoinFrom($('p2pIn').value);
  $('p2pRoomGo').onclick=()=>{const v=$('p2pSig').value.trim();if(v!==sigAddr()&&!sigSave(v)){p2pStatus('Bad signaling server address.');return;}p2pStatus('Contacting room…');p2pJoinRoom($('p2pRoom').value);};}}
async function p2pJoinFrom(text){if(!p2pDlg||p2pDlg.kind!=='join')return;const d=p2pDlg.el;const md=d.querySelector('#p2pManual');if(md)md.open=true;
 try{p2pStatus('Creating answer…');const a=await p2pJoinWithOffer(text);d.querySelector('#p2pAns').style.display='';p2pModalShow(a);p2pStatus('Send the answer code to the host, then wait…');}catch(e){p2pStatus(e.message);}}
function p2pModalShow(code){if(!p2pDlg)return;const d=p2pDlg.el;const ce=d.querySelector('#p2pCode');if(ce)ce.value=code;const c=d.querySelector('#p2pQR');if(!c)return;try{QR.draw(c,code);c.style.display='';}catch(e){c.style.display='none';}}
function p2pStatus(t){if(p2pDlg){const s=p2pDlg.el.querySelector('#p2pStatus');if(s)s.textContent=t;}}
function p2pModalClose(peer){if(!p2pDlg)return;if(peer&&p2pDlg.peer!==peer)return;p2pDlg.el.remove();p2pDlg=null;}

async function p2pCopyText(t){try{await navigator.clipboard.writeText(t);return true;}catch(e){}
 try{const x=document.createElement('textarea');x.value=t;x.style.cssText='position:fixed;left:-999px';document.body.appendChild(x);x.select();const ok=document.execCommand('copy');x.remove();return ok;}catch(e){return false;}}
