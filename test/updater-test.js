// Self-updater test with a local fake "GitHub releases" server (no network needed):
//   node test/updater-test.js        (builds two Linux host apps with pkg: an "old" one and the "new" release asset;
//                                     PKG=/path/to/pkg to use a local pkg; CHROME=... adds the browser reload check)
// Covers: semver, startup never blocked >~3 s by a hanging API, offline, rate limit, LOWLANDS_NO_UPDATE, size and
// SHA-256 verification, no restart while a game runs, install + restart once idle (same port, new executable),
// connected browser reloads to the new version, and the start.sh loop (exit code 75).
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),crypto=require('crypto'),{spawn,execFileSync}=require('child_process');
const WS=require('ws');const U=require('../host/updater.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const ROOT=path.join(__dirname,'..'),TMP=fs.mkdtempSync(path.join(os.tmpdir(),'lowlands-upd-'));
const WIN=process.platform==='win32';const KEY=process.platform==='darwin'?(process.arch==='arm64'?'mac-arm64':'mac-x64'):WIN?'windows':'linux';
const ASSET=U.assetFor(),BIN=U.binName(),FOLDER='The-Lowlands-Host-'+KEY;
const OLD='1.0.9',NEW=require('../package.json').version;const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// ---- unit
ok(U.cmpVer('1.1.0','1.0.9')>0&&U.cmpVer('v1.1.0','1.1.0')===0&&U.cmpVer('1.10.0','1.9.0')>0&&U.cmpVer('1.1.0-rc.1','1.1.0')<0&&U.cmpVer('1.1.0','1.1.1')<0,'semver comparison');
ok(U.assetFor('darwin','arm64')==='The-Lowlands-Host-mac-arm64.zip'&&U.assetFor('darwin','x64')==='The-Lowlands-Host-mac-x64.zip'&&U.assetFor('win32','x64')==='The-Lowlands-Host-windows.zip'&&U.assetFor('linux','x64')==='The-Lowlands-Host-linux.zip','asset chosen per platform/arch');
ok(U.parseSums('ab'.repeat(32)+'  '+ASSET+'\n').get(ASSET)==='ab'.repeat(32),'SHA256SUMS parsing');
// ---- build an old binary and the new release
function build(ver,dir){execFileSync(process.execPath,[path.join(ROOT,'host/build.js'),KEY],{cwd:ROOT,stdio:'ignore',env:{...process.env,LOWLANDS_VERSION:ver,LOWLANDS_DIST:dir}});}
console.log(`building v${OLD} and v${NEW} host apps (${KEY})…`);build(OLD,path.join(TMP,'old'));build(NEW,path.join(TMP,'new'));
const zip=fs.readFileSync(path.join(TMP,'new',ASSET));const newBin=fs.readFileSync(path.join(TMP,'new',FOLDER,BIN));
// ---- fake GitHub
let mode='old',hits=0;
const fake=http.createServer((req,res)=>{const base=`http://127.0.0.1:${fake.address().port}`;
 if(req.url==='/releases/latest'){hits++;if(mode==='hang')return;   // never answers
  if(mode==='ratelimit'){res.writeHead(403,{'x-ratelimit-remaining':'0','x-ratelimit-reset':String(Math.floor(Date.now()/1000)+3600)});res.end('{"message":"API rate limit exceeded"}');return;}
  const tag=mode==='old'?'v'+OLD:'v'+NEW;const size=mode==='badsize'?zip.length+1:zip.length;
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({tag_name:tag,draft:false,prerelease:false,assets:[
   {name:ASSET,size,browser_download_url:base+'/dl/'+ASSET+''},{name:'SHA256SUMS',size:100,browser_download_url:base+'/dl/SHA256SUMS'}]}));}
 else if(req.url==='/dl/'+ASSET+''){res.writeHead(302,{Location:base+'/blob/linux.zip'});res.end();}   // like GitHub's redirect to its CDN
 else if(req.url==='/blob/linux.zip'){res.writeHead(200,{'Content-Length':zip.length});res.end(zip);}
 else if(req.url==='/dl/SHA256SUMS'){res.end((mode==='badsha'?'0'.repeat(64):sha(zip))+'  '+ASSET+'\n');}
 else{res.writeHead(404);res.end();}});
// ---- run a copy of the old app
const fakebin=path.join(TMP,'fakebin');fs.mkdirSync(fakebin);const opened=path.join(TMP,'opened.txt');fs.writeFileSync(path.join(fakebin,'xdg-open'),`#!/bin/sh\necho "$1" >> "${opened}"\n`,{mode:0o755});
const base={...process.env};for(const k of ['PORT','NO_BROWSER','LOWLANDS_NO_UPDATE','LOWLANDS_SUPERVISED','LOWLANDS_RESTARTED','LOWLANDS_OPEN_BROWSER'])delete base[k];
let PORTN=8170;
function app(name,env={},cmd){const dir=path.join(TMP,name);fs.cpSync(path.join(TMP,'old',FOLDER),dir,{recursive:true});const port=PORTN++;
 const p=spawn(cmd?path.join(dir,cmd):path.join(dir,BIN),[],{cwd:dir,detached:!WIN,windowsHide:true,env:{...base,PATH:fakebin+path.delimiter+process.env.PATH,...(WIN?{NO_BROWSER:'1'}:{}),PORT:String(port),
  LOWLANDS_UPDATE_URL:`http://127.0.0.1:${fake.address().port}/releases/latest`,LOWLANDS_UPDATE_IDLE_MS:'1000',LOWLANDS_UPDATE_INTERVAL_MS:'1000',...env}});
 p.out='';p.stdout.on('data',d=>p.out+=d);p.stderr.on('data',d=>p.out+=d);p.dir=dir;p.port=port;p.t0=Date.now();p.stop=()=>{if(WIN){try{execFileSync('powershell',['-NoProfile','-Command',`Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force }`],{stdio:'ignore'});}catch(e){}try{p.kill();}catch(e){}}else try{process.kill(-p.pid,'SIGKILL');}catch(e){}};return p;}
const wait=async(p,re,ms)=>{const t=Date.now();while(!re.test(p.out)&&Date.now()-t<ms)await sleep(50);return re.test(p.out);};
const ver=async port=>{try{return (await (await fetch(`http://127.0.0.1:${port}/version`)).json());}catch(e){return null;}};
(async()=>{await new Promise(r=>fake.listen(0,'127.0.0.1',r));
 {mode='hang';const p=app('hang');const okB=await wait(p,/game host is running/,8000);const dt=Date.now()-p.t0;
  ok(okB&&dt<5000,`a hanging GitHub API delays startup only ~3 s (banner after ${dt} ms)`);
  ok(/Version 1\.0\.9 · could not check for updates/.test(p.out),'…and the banner says the check failed');p.stop();}
 {const p=app('offline',{LOWLANDS_UPDATE_URL:'http://127.0.0.1:9/releases/latest'});ok(await wait(p,/Version 1\.0\.9 · could not check for updates \(offline\?\)/,15000),'offline: banner says the check failed, host runs');
  ok((await ver(p.port)||{}).version===OLD,'offline host serves normally');p.stop();}
 {mode='ratelimit';const p=app('rl');ok(await wait(p,/rate-limited by GitHub/,15000),'GitHub rate limit (403) handled, retried later');const h0=hits;await sleep(2500);ok(hits===h0,'no hammering while rate-limited (waits for x-ratelimit-reset)');p.stop();}
 {mode='new';const h0=hits;const p=app('off',{LOWLANDS_NO_UPDATE:'1'});ok(await wait(p,/Version 1\.0\.9 · update check off/,15000),'LOWLANDS_NO_UPDATE=1: banner says off');await sleep(1500);ok(hits===h0,'…and GitHub is never contacted');p.stop();}
 for(const [m,re,what] of [['badsha',/SHA-256 checksum mismatch/,'SHA-256 mismatch'],['badsize',/size mismatch/,'size mismatch']]){mode=m;const p=app(m);
  ok(await wait(p,re,15000),`${what} → update refused`);ok(sha(fs.readFileSync(path.join(p.dir,BIN)))!==sha(newBin)&&(await ver(p.port)||{}).version===OLD,'…executable untouched, old version keeps running');p.stop();}
 // ---- full path: a game is running when the update appears
 mode='old';const p=app('e2e');await wait(p,/game host is running/,8000);fs.writeFileSync(opened,'');
 const msgs=[];const c=new WS(`ws://127.0.0.1:${p.port}/ws`);c.on('message',d=>msgs.push(JSON.parse(d)));await new Promise(r=>c.on('open',r));
 c.send(JSON.stringify({t:'hello',name:'T'}));await sleep(300);c.send(JSON.stringify({t:'slot',slot:0}));c.send(JSON.stringify({t:'start'}));await sleep(1000);
 let br=null,pg=null;const CH=process.env.CHROME||'/usr/bin/google-chrome';
 if(fs.existsSync(CH)){try{const pp=require('puppeteer-core');br=await pp.launch({executablePath:CH,headless:'new',args:['--no-sandbox']});pg=await br.newPage();await pg.goto(`http://127.0.0.1:${p.port}/`);}catch(e){console.log('  (no browser check: '+e.message+')');}}
 ok(msgs.some(m=>m.t==='init'),'a LAN game is running');mode='new';
 ok(await wait(p,/\[update\] update v[\d.]+ ready — installs when no game is running/,30000),'update found, downloaded, verified (size + SHA-256, test-run) during the game');
 ok(msgs.some(m=>m.t==='version'&&m.latest===NEW),'connected clients are told an update is pending');
 const s0=msgs.filter(m=>m.t==='snap').length;await sleep(4000);const s1=msgs.filter(m=>m.t==='snap').length;
 ok(s1-s0>40&&!/Installed v/.test(p.out)&&c.readyState===1,`no restart while the game runs (${s1-s0} snapshots in 4 s, connection kept)`);
 const tEnd=Date.now();c.send(JSON.stringify({t:'tolobby'}));
 const upNew=async ms=>{const t=Date.now();while(Date.now()-t<ms){if((await ver(p.port)||{}).version===NEW)return true;await sleep(200);}return false;};
 ok(WIN?await wait(p,/Installed v/,30000)&&await upNew(30000):await wait(p,/Restarted — now running The Lowlands v/,30000),`game over → installed and restarted itself (${((Date.now()-tEnd)/1000).toFixed(1)} s)`);
 if(!WIN)await wait(p,/game host is running[\s\S]*game host is running/,8000);
 ok((await ver(p.port)||{}).version===NEW,`same port now serves v${NEW}`);
 ok(sha(fs.readFileSync(path.join(p.dir,BIN)))===sha(newBin)&&((WIN||fs.statSync(path.join(p.dir,BIN)).mode&0o111)),'the executable on disk is the new release (and still executable)');
 if(WIN){let gone=false;for(let i=0;i<40&&!gone;i++){gone=!fs.existsSync(path.join(p.dir,BIN+'.old'));if(!gone)await sleep(500);}ok(gone,'Windows: the renamed old .exe is deleted by the new version');}
 else ok(/Version [\d.]+ · up to date/.test(p.out.split('Restarted —')[1]||''),'the restarted banner shows the new version, up to date');
 if(pg){ok(await (async()=>{for(let i=0;i<100;i++){const v=await pg.evaluate(()=>typeof srvVer!=='undefined'&&srvVer).catch(()=>null);if(v===NEW)return true;await sleep(200);}return false;})(),'the open browser tab reloaded itself and shows the new server version');
  ok(await pg.evaluate(()=>sessionStorage.getItem('kom_updated')),'…with an "updated" note in the menu');
  ok(fs.readFileSync(opened,'utf8').trim()==='','no extra browser tab opened on restart (the open tab reloaded)');await br.close();}
 c.terminate();p.stop();
 // ---- start.sh / .command style loop: exit code 75 → started again
 if(!WIN){mode='new';const q=app('loop',{},KEY==='linux'?'start.sh':'Start The Lowlands Host.command');ok(await wait(q,/Restarted — now running/,40000)&&await (async()=>{for(let i=0;i<50;i++){if((await ver(q.port)||{}).version===NEW)return true;await sleep(200);}return false;})(),'start.sh loop (LOWLANDS_SUPERVISED): updated binary started again by the script');if(fails)console.log(q.out);q.stop();}
 fake.close();fs.rmSync(TMP,{recursive:true,force:true});console.log(fails?fails+' FAILURES':'ALL UPDATER TESTS PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
