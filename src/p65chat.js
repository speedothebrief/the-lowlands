// ===== client: chat (server multiplayer only: LAN lobby + matches) =====
// Enter opens the chat box (a real <input>, so the global hotkey handler ignores every key while typing),
// Enter sends, Esc cancels. Solo: Enter does nothing. Messages are drawn on the canvas with fillText (never HTML).
const CHAT_MAX=200,CHAT_SHOW=6,CHAT_FADE=10;
let chatLog=[],chatOpen=false,chatScroll=0,chatDraft='',chatRect=null;
const chatEl=(()=>{const e=document.createElement('input');e.type='text';e.maxLength=CHAT_MAX;e.id='chat-input';e.autocomplete='off';e.spellcheck=false;
 e.placeholder='Message to everyone (Enter sends, Esc cancels)';e.setAttribute('aria-label','Chat message');
 Object.assign(e.style,{position:'fixed',left:'12px',top:'0',width:'360px',height:'26px',boxSizing:'border-box',display:'none',font:'13px Georgia, serif',color:'#f6ecd2',
  background:'rgba(20,14,8,.94)',border:'1px solid #c0a060',borderRadius:'3px',padding:'3px 8px',outline:'none',zIndex:5});
 document.body.appendChild(e);return e;})();
function cleanChatText(t){t=String(t==null?'':t).replace(/[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/g,' ').replace(/\s+/g,' ').trim();const a=Array.from(t);return a.length>CHAT_MAX?a.slice(0,CHAT_MAX).join(''):t;}
function chatAvailable(){return netKind==='server'&&netAvailable&&(state==='lobby'||(mode==='net'&&inGame()));}
function chatBox(){if(state==='lobby'){const w=Math.min(380,Math.max(240,W/2-340));return{x:Math.max(12,W-w-12),w,bottom:H-12};}const w=Math.min(420,W-24);return{x:12,w,bottom:H-PH-12};}
function openChat(){if(!chatAvailable())return false;chatOpen=true;keys.clear();buildMenuOpen=false;chatScroll=0;
 const b=chatBox();chatEl.style.left=b.x+'px';chatEl.style.width=b.w+'px';chatEl.style.top=(b.bottom-26)+'px';chatEl.style.display='block';chatEl.value=chatDraft;chatEl.focus();return true;}
function closeChat(keepDraft){if(!chatOpen)return;chatOpen=false;chatDraft=keepDraft?chatEl.value:'';chatEl.style.display='none';chatEl.blur();keys.clear();}
function sendChat(raw){const t=cleanChatText(raw);if(!t)return;
 if(/^\/(t|team|ally|allies)(\s|$)/i.test(t)){chatLocal('There are no teams or alliances: every kingdom fights alone, so chat always goes to everyone. Not sent.');return;}
 const body=t.replace(/^\/all\s+/i,'');if(body)netSend({t:'chat',ch:'all',text:body});}
function chatLocal(text){chatLog.push({sys:true,local:true,text,ts:Date.now(),rt:Date.now()});trimChat();}
function trimChat(){if(chatLog.length>100)chatLog.splice(0,chatLog.length-100);}
// called for every chat message from the server (even before Join LAN, so the lobby shows recent history)
function onChat(m){
 if(m.t==='chathist'){chatLog=(Array.isArray(m.items)?m.items:[]).map(x=>({...x,text:cleanChatText(x.text),rt:0}));chatScroll=0;return;}
 const e={...m,text:cleanChatText(m.text),rt:Date.now()};if(!e.text)return;chatLog.push(e);trimChat();
 if(netKind==='server'&&!e.sys&&e.cid!==myCid)AU.ui('chat');}
chatEl.addEventListener('keydown',e=>{e.stopPropagation();
 if(e.key==='Enter'){e.preventDefault();const v=chatEl.value;closeChat(false);sendChat(v);}
 else if(e.key==='Escape'){e.preventDefault();closeChat(false);}
 else if(e.key==='PageUp'){e.preventDefault();chatScroll+=5;}else if(e.key==='PageDown'){e.preventDefault();chatScroll=Math.max(0,chatScroll-5);}});
chatEl.addEventListener('keyup',e=>e.stopPropagation());
chatEl.addEventListener('blur',()=>{if(chatOpen)closeChat(true);});   // clicking the map closes the box, keeping what was typed
function chatWheel(dy){if(!chatOpen||!chatRect||!inRect(mouse.x,mouse.y,chatRect))return false;chatScroll=Math.max(0,chatScroll+(dy<0?3:-3));return true;}
const chatColor=m=>m.sys?'#d8c48a':(m.slot>=0&&KINGDOMS[m.slot]?rgb(KINGDOMS[m.slot].color,1.35):'#c8c8c8');
const hhmm=ts=>{const d=new Date(ts);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
// word-wrap one message into lines; the first line carries the coloured "Name:" prefix
function chatLines(m,width){const font='13px Georgia, serif';const pre=m.sys?'':m.name+': ';const tsS=m.ts?hhmm(m.ts)+' ':'';
 ctx.font='11px Georgia, serif';const tsW=ctx.measureText(tsS).width;ctx.font='bold '+font;const preW=pre?ctx.measureText(pre).width:0;ctx.font=m.sys?'italic '+font:font;
 const M=s=>ctx.measureText(s).width,out=[];let line='',ind=tsW+preW;const push=()=>{out.push({t:line,ind});line='';ind=8;};
 for(let w of m.text.split(' ')){
  while(M(w)>width-8){if(line||ind>8)push();let i=w.length;while(i>1&&M(w.slice(0,i))>width-ind)i--;line=w.slice(0,i);push();w=w.slice(i);}   // hard-break very long words
  const t=line?line+' '+w:w;if(M(t)>width-ind){if(line||ind>8)push();line=w;}else line=t;}
 out.push({t:line,ind});Object.assign(out[0],{first:true,ts:tsS,tsW,pre});return out;}
function drawChatLine(m,L,x,y,alpha){ctx.globalAlpha=alpha;const font='13px Georgia, serif';
 if(L.first){if(L.ts)text(L.ts,x,y,'#8a8270','11px Georgia, serif');if(L.pre)text(L.pre,x+L.tsW,y,chatColor(m),'bold '+font);}
 text(L.t,x+L.ind,y,m.sys?'#d8c48a':'#f2ead6',m.sys?'italic '+font:font);ctx.globalAlpha=1;}
function drawChat(){chatRect=null;if(chatOpen&&!chatAvailable())closeChat(false);
 const lobbyV=state==='lobby'&&netKind==='server'&&netAvailable;if(!(chatOpen||lobbyV||(mode==='net'&&inGame())))return;
 const b=chatBox(),lh=17,inner=b.w-16;
 if(chatOpen){chatEl.style.left=b.x+'px';chatEl.style.width=b.w+'px';chatEl.style.top=(b.bottom-26)+'px';}
 if(chatOpen||lobbyV){   // panel with scrollable history
  const maxL=Math.max(3,Math.min(chatOpen?14:8,Math.floor((b.bottom-(state==='lobby'?60:90))/lh)-3));
  const all=[];for(const m of chatLog)for(const L of chatLines(m,inner))all.push([m,L]);
  chatScroll=Math.min(chatScroll,Math.max(0,all.length-maxL));const end=all.length-chatScroll,view=all.slice(Math.max(0,end-maxL),end);
  const ph=maxL*lh+(chatOpen?40:30),py=b.bottom-ph;chatRect={x:b.x,y:py,w:b.w,h:ph};
  ctx.fillStyle='rgba(10,8,5,.66)';ctx.fillRect(b.x,py,b.w,ph);ctx.strokeStyle='rgba(192,160,96,.5)';ctx.strokeRect(b.x+.5,py+.5,b.w-1,ph-1);
  text(chatScroll>0?`Chat  ▲ ${chatScroll} newer below (wheel / PgDn)`:'Chat',b.x+8,py+14,'#e8c870','bold 11px Georgia, serif');
  let y=py+18+lh;if(!view.length)text(chatOpen?'No messages yet.':'No messages yet. Press Enter to chat.',b.x+8,y,'#8a8270','italic 12px Georgia, serif');
  for(const [m,L] of view){drawChatLine(m,L,b.x+8,y,1);y+=lh;}
  if(!chatOpen)text('Enter: chat',b.x+b.w-8,b.bottom-8,'#8a8270','11px Georgia, serif','right');
  return;}
 // closed, in a match: the last few messages, fading out after ~10 s; never intercepts the mouse
 const now=Date.now(),rec=chatLog.filter(m=>m.rt&&now-m.rt<CHAT_FADE*1000).slice(-CHAT_SHOW);if(!rec.length)return;
 const rows=[];for(const m of rec){const a=clamp((CHAT_FADE*1000-(now-m.rt))/1500,0,1);for(const L of chatLines(m,inner))rows.push([m,L,a]);}
 let y=b.bottom-6-(rows.length-1)*lh;for(const [m,L,a] of rows){ctx.globalAlpha=a*.55;ctx.fillStyle='#000';ctx.fillRect(b.x,y-13,b.w,lh);ctx.globalAlpha=1;drawChatLine(m,L,b.x+8,y,a);y+=lh;}}
