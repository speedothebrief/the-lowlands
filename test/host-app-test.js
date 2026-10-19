// Smoke test of a packaged double-click host app (built by `node host/build.js`):
//   node test/host-app-test.js [path/to/the-lowlands-host[.exe]]   (default: dist/The-Lowlands-Host-linux/the-lowlands-host)
// Runs the binary from a copy in a temp dir (no Node or node_modules beside it), checks the banner, HTTP, /ws game
// lobby, the automatic browser launch (fake opener), and the port-in-use fallback with a second copy.
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');const WS=require('ws');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const src=path.resolve(process.argv[2]||path.join(__dirname,'..','dist','The-Lowlands-Host-linux','the-lowlands-host'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lowlands-host-'));const bin=path.join(tmp,path.basename(src));fs.copyFileSync(src,bin);fs.chmodSync(bin,0o755);
// fake browser opener (xdg-open / open) that records the URL
const fake=path.join(tmp,'fakebin');fs.mkdirSync(fake);const opened=path.join(tmp,'opened.txt');
for(const n of ['xdg-open','open'])fs.writeFileSync(path.join(fake,n),`#!/bin/sh\necho "$1" >> "${opened}"\n`,{mode:0o755});
const base={...process.env};delete base.PORT;delete base.NO_BROWSER;delete base.PORT_STRICT;base.LOWLANDS_NO_UPDATE='1';   // updater has its own test (test/updater-test.js)
const run=(env={})=>{const p=spawn(bin,[],{cwd:tmp,env:{...base,PATH:fake+path.delimiter+process.env.PATH,...env}});p.out='';p.stdout.on('data',d=>p.out+=d);p.stderr.on('data',d=>p.out+=d);return p;};
const wait=async(p,re,ms)=>{const t=Date.now();while(!re.test(p.out)&&Date.now()-t<ms)await sleep(100);return re.test(p.out);};
const wsFirst=(url,want)=>new Promise(r=>{const w=new WS(url);const t=setTimeout(()=>{r(null);w.terminate();},4000);
 w.on('message',d=>{const m=JSON.parse(d);if(want&&m.t!==want)return;clearTimeout(t);r(m);w.close();});w.on('error',()=>{clearTimeout(t);r(null);});});
(async()=>{
 const sz=fs.statSync(src).size;console.log(`binary: ${src} (${(sz/1048576).toFixed(1)} MB), running from ${tmp}`);
 const busy=await new Promise(r=>{const s=require('net').createServer().once('error',()=>r(true)).listen(8080,'0.0.0.0',()=>{s.close();r(false);});});
 const WIN=process.platform==='win32';const A=run(WIN?{NO_BROWSER:'1'}:{});ok(await wait(A,/game host is running[\s\S]*╝/,15000),'binary starts and prints the banner');
 const pA=+(A.out.match(/localhost:(\d+)/)||[])[1];ok(busy?pA>8080:pA===8080,`listens on ${pA}${busy?' (8080 was already busy here)':''}`);
 const ips=[];for(const l of Object.values(os.networkInterfaces()))for(const n of l||[])if((n.family==='IPv4'||n.family===4)&&!n.internal)ips.push(n.address);
 ok(ips.every(ip=>A.out.includes(`http://${ip}:${pA}/`)),'banner lists every LAN IPv4 URL: '+ips.map(ip=>`http://${ip}:${pA}/`).join(' '));
 await sleep(800);if(WIN)console.log('  (browser launch not checked on Windows)');else ok(fs.existsSync(opened)&&fs.readFileSync(opened,'utf8').trim()===`http://localhost:${pA}/`,'opens the default browser at the local URL');
 const r=await fetch(`http://127.0.0.1:${pA}/`);const h=await r.text();ok(r.ok&&h.includes('/*SIM-BEGIN*/')&&h.length>100000,`HTTP serves the embedded index.html (${h.length} bytes)`);
 const w=await wsFirst(`ws://127.0.0.1:${pA}/ws`,'welcome');const vv=await wsFirst(`ws://127.0.0.1:${pA}/ws`,'version');
 ok(vv&&/^\d+\.\d+\.\d+/.test(vv.version)&&A.out.includes('Version '+vv.version+' · update check off'),`banner and /ws report the version (${vv&&vv.version}) and update status`);ok(w&&w.t==='welcome','WebSocket /ws game lobby answers ('+JSON.stringify(w)+')');
 const B=run(WIN?{NO_BROWSER:'1'}:{});ok(await wait(B,/game host is running[\s\S]*╝/,15000),'a second copy still starts');
 const pB=+(B.out.match(/localhost:(\d+)/)||[])[1];ok(pB>pA&&/is in use, trying/.test(B.out)&&(busy||B.out.includes('port 8080 was busy')),`port in use → second copy falls back to port ${pB}`);
 const r2=await fetch(`http://127.0.0.1:${pB}/`);ok(r2.ok,'second copy serves HTTP on the fallback port');
 const C=run({PORT:String(pA),NO_BROWSER:'1'});ok(await wait(C,/already in use/,8000),'an explicitly chosen busy PORT gives a clear message');C.kill();
 A.kill();B.kill();await sleep(300);fs.rmSync(tmp,{recursive:true,force:true});
 console.log(fails?fails+' FAILURES':'ALL HOST APP TESTS PASSED');process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
