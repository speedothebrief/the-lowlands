// The Lowlands — update checker + self-updater for the standalone host app.
// * every launch and every few hours: GET the latest GitHub release (no token; rate limits / offline handled quietly)
// * packaged host app: download the asset for this platform, verify size + SHA256SUMS, test-run it, wait until no game
//   is running, swap the executable (Windows: rename the locked .exe aside) and ask the launcher to restart
// * plain `node server.js` / Docker: only report "update available" (log + browser menu) — update by rebuilding/pulling
// Off with LOWLANDS_NO_UPDATE=1 (or --no-update). LOWLANDS_UPDATE_URL points the check at another server (tests).
'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto'),{execFile}=require('child_process');
const DEFAULT_URL='https://api.github.com/repos/speedothebrief/the-lowlands/releases/latest';
const UA='the-lowlands-host-updater';
function parseVer(v){const m=String(v||'').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);return m?{n:[+m[1],+m[2],+m[3]],pre:m[4]||''}:null;}
// semver order (prerelease < release; prerelease ids compared numerically/lexically)
function cmpVer(a,b){const A=parseVer(a),B=parseVer(b);if(!A||!B)return 0;for(let i=0;i<3;i++)if(A.n[i]!==B.n[i])return A.n[i]<B.n[i]?-1:1;
 if(A.pre===B.pre)return 0;if(!A.pre)return 1;if(!B.pre)return -1;const x=A.pre.split('.'),y=B.pre.split('.');
 for(let i=0;i<Math.max(x.length,y.length);i++){if(x[i]==null)return -1;if(y[i]==null)return 1;const p=/^\d+$/.test(x[i]),q=/^\d+$/.test(y[i]);
  if(p&&q&&+x[i]!==+y[i])return +x[i]<+y[i]?-1:1;if(p!==q)return p?-1:1;if(x[i]!==y[i])return x[i]<y[i]?-1:1;}return 0;}
function assetFor(platform=process.platform,arch=process.arch){
 if(platform==='darwin')return arch==='arm64'?'The-Lowlands-Host-mac-arm64.zip':'The-Lowlands-Host-mac-x64.zip';
 if(platform==='win32'&&arch==='x64')return 'The-Lowlands-Host-windows.zip';if(platform==='linux'&&arch==='x64')return 'The-Lowlands-Host-linux.zip';return null;}
const binName=(platform=process.platform)=>platform==='win32'?'The-Lowlands-Host.exe':'the-lowlands-host';
async function getJSON(url,ms){const r=await fetch(url,{headers:{'User-Agent':UA,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(ms)});
 if(r.status===403||r.status===429){const reset=+r.headers.get('x-ratelimit-reset')||0,ra=+r.headers.get('retry-after')||0;const e=new Error('GitHub rate limit');e.rateLimit=true;
  e.retryAt=ra?Date.now()+ra*1000:reset?reset*1000:Date.now()+3600e3;throw e;}
 if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function getBuf(url,ms,max){const r=await fetch(url,{headers:{'User-Agent':UA,Accept:'application/octet-stream'},signal:AbortSignal.timeout(ms),redirect:'follow'});
 if(!r.ok)throw new Error('download HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer());if(max&&b.length>max)throw new Error('download too large');return b;}
// minimal zip reader (stored/deflate) using the central directory
function readZip(buf){let e=buf.length-22;while(e>=0&&buf.readUInt32LE(e)!==0x06054b50)e--;if(e<0)throw new Error('not a zip file');
 const n=buf.readUInt16LE(e+10);let p=buf.readUInt32LE(e+16);const out=[];
 for(let i=0;i<n;i++){if(buf.readUInt32LE(p)!==0x02014b50)throw new Error('bad zip directory');const meth=buf.readUInt16LE(p+10),csz=buf.readUInt32LE(p+20),usz=buf.readUInt32LE(p+24),
  nl=buf.readUInt16LE(p+28),xl=buf.readUInt16LE(p+30),cl=buf.readUInt16LE(p+32),attr=buf.readUInt32LE(p+38),lo=buf.readUInt32LE(p+42),name=buf.toString('utf8',p+46,p+46+nl);p+=46+nl+xl+cl;
  out.push({name,mode:attr>>>16,size:usz,data:()=>{const ln=buf.readUInt16LE(lo+26),lx=buf.readUInt16LE(lo+28),d=buf.subarray(lo+30+ln+lx,lo+30+ln+lx+csz);
   const r=meth===0?Buffer.from(d):meth===8?zlib.inflateRawSync(d):null;if(!r)throw new Error('unsupported zip method '+meth);if(r.length!==usz)throw new Error('zip entry size mismatch');return r;}});}
 return out;}
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
function parseSums(txt){const m=new Map();for(const l of String(txt).split(/\r?\n/)){const x=l.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);if(x)m.set(x[2].trim(),x[1].toLowerCase());}return m;}
// run the downloaded binary with --version: proves it starts on this machine (signature, arch) and is the right version
function probe(bin,expect,ms=20000){return new Promise(res=>{execFile(bin,['--version'],{timeout:ms,env:{...process.env,LOWLANDS_NO_UPDATE:'1'}},(err,out)=>{
 const v=String(out||'').trim().split(/\s+/).pop();res(!err&&cmpVer(v,expect)===0?null:(err?err.message:'reports version '+v));});});}

function createUpdater(o){
 const log=o.log||console.log,current=o.version,url=process.env.LOWLANDS_UPDATE_URL||DEFAULT_URL;
 const disabled=!!process.env.LOWLANDS_NO_UPDATE&&process.env.LOWLANDS_NO_UPDATE!=='0'||process.argv.includes('--no-update');
 const every=+process.env.LOWLANDS_UPDATE_INTERVAL_MS||4*3600e3,idleNeed=process.env.LOWLANDS_UPDATE_IDLE_MS!=null?+process.env.LOWLANDS_UPDATE_IDLE_MS:30000;
 const U={current,latest:null,status:disabled?'disabled':'checking',detail:'',selfUpdate:!!o.selfUpdate&&!disabled,ready:null,busy:false,listeners:new Set(),url};
 const set=(status,detail)=>{const ch=U.status!==status||U.detail!==(detail||'');U.status=status;U.detail=detail||'';if(ch)for(const f of U.listeners)try{f(U);}catch(e){}};
 U.on=f=>U.listeners.add(f);U.text=()=>({disabled:'update check off',checking:'checking for updates…',uptodate:'up to date',offline:'could not check for updates (offline?)',
  ratelimited:'update check rate-limited by GitHub — will retry later',available:`update v${U.latest} available`+(U.selfUpdate?' — downloading…':' — rebuild/pull to update'),
  downloaded:`update v${U.latest} ready — installs when no game is running`,installing:`installing v${U.latest}…`,failed:`update v${U.latest} failed: ${U.detail}`})[U.status]||U.status;
 let nextAt=0,timer=null,idleSince=null;
 async function check(ms){if(disabled||U.busy)return U;if(Date.now()<nextAt&&U.status==='ratelimited')return U;
  let rel;try{rel=await getJSON(url,ms);}catch(e){if(e.rateLimit){nextAt=e.retryAt;set('ratelimited');}else if(U.status==='checking')set('offline',e.message);return U;}
  const tag=rel&&(rel.tag_name||rel.name);if(!parseVer(tag)||rel.draft||rel.prerelease){if(U.status==='checking')set('uptodate');return U;}
  const v=parseVer(tag).n.join('.')+(parseVer(tag).pre?'-'+parseVer(tag).pre:'');
  if(cmpVer(v,current)<=0){U.latest=v;set('uptodate');return U;}
  if(U.latest===v&&['downloaded','installing','available'].includes(U.status))return U;
  U.latest=v;U.release=rel;set('available');log(`Update available: v${v} (this is v${current}).`+(U.selfUpdate?' Downloading it…':' To update: rebuild/pull the server (git pull && docker compose up -d --build), or download the new host app.'));
  if(U.selfUpdate)download().catch(e=>{set('failed',e.message);log('Update failed: '+e.message);});return U;}
 async function download(){U.busy=true;try{const rel=U.release,name=assetFor();if(!name)throw new Error('no download for '+process.platform+'-'+process.arch);
  const a=(rel.assets||[]).find(x=>x.name===name);if(!a)throw new Error(name+' is not attached to the release');
  const zip=await getBuf(a.browser_download_url,10*60e3,300e6);if(a.size&&zip.length!==a.size)throw new Error(`size mismatch (${zip.length} ≠ ${a.size} bytes)`);
  const sa=(rel.assets||[]).find(x=>x.name==='SHA256SUMS');
  if(sa){const sums=parseSums((await getBuf(sa.browser_download_url,60e3,1e6)).toString('utf8'));const want=sums.get(name);
   if(!want)throw new Error('SHA256SUMS has no entry for '+name);if(sha256(zip)!==want)throw new Error('SHA-256 checksum mismatch');}
  else log('  (release has no SHA256SUMS — verified size only)');
  const ent=readZip(zip).find(e=>e.name.split('/').pop()===binName()&&!e.name.endsWith('/'));if(!ent)throw new Error(binName()+' not found in '+name);
  const exe=o.exePath||process.execPath,dir=path.dirname(exe),tmp=path.join(dir,'.'+path.basename(exe)+'.new'+(process.platform==='win32'?'.exe':''));
  try{fs.writeFileSync(tmp,ent.data(),{mode:0o755});fs.chmodSync(tmp,0o755);}catch(e){throw new Error(`cannot write next to ${exe} (${e.code||e.message}) — move the app to a folder you can write to, or download v${U.latest} manually`);}
  const bad=await probe(tmp,U.latest);if(bad){try{fs.unlinkSync(tmp);}catch(e){}throw new Error('the new version does not start here: '+bad);}
  U.ready={tmp,exe};set('downloaded');log(`Update v${U.latest} downloaded and verified${sa?' (SHA-256)':''}. It installs automatically when no game is running.`);maybeInstall();}
  finally{U.busy=false;}}
 function maybeInstall(){if(!U.ready||U.status!=='downloaded')return;if(!o.isIdle()){idleSince=null;return;}if(idleSince==null)idleSince=Date.now();if(Date.now()-idleSince<idleNeed)return;
  set('installing');try{swap(U.ready.tmp,U.ready.exe);}catch(e){set('failed',e.message);log('Update failed: '+e.message);return;}log(`Installed v${U.latest}. Restarting…`);o.restart(U);}
 U.check=check;U.maybeInstall=maybeInstall;
 U.start=()=>{if(disabled)return Promise.resolve(U);const first=check(+process.env.LOWLANDS_UPDATE_TIMEOUT_MS||2500);
  timer=setInterval(()=>check(15000),every);timer.unref();const it=setInterval(maybeInstall,Math.min(5000,Math.max(200,idleNeed/4)));it.unref();return first;};
 return U;}
// replace the executable: write was done to a temp file in the same folder; now rename it over the old one.
// Windows can't overwrite or delete a running .exe but can rename it: exe → exe.old, new → exe (old deleted on next start)
function swap(tmp,exe){const old=exe+'.old';try{fs.unlinkSync(old);}catch(e){}
 if(process.platform==='win32'){fs.renameSync(exe,old);try{fs.renameSync(tmp,exe);}catch(e){fs.renameSync(old,exe);throw e;}}
 else{fs.renameSync(tmp,exe);fs.chmodSync(exe,0o755);}}   // atomic; the running process keeps the old inode
function cleanupOld(exe=process.execPath){const old=exe+'.old';let n=0;const t=()=>{try{fs.unlinkSync(old);}catch(e){if(e.code!=='ENOENT'&&++n<30)setTimeout(t,1000).unref();}};t();}
module.exports={createUpdater,cmpVer,parseVer,assetFor,binName,readZip,parseSums,sha256,swap,cleanupOld,DEFAULT_URL};
