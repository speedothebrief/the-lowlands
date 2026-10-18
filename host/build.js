// Build the double-click host apps into dist/ (gitignored):
//   node host/build.js [mac-arm64] [mac-x64] [windows] [linux]      (default: all)
// Uses @yao-pkg/pkg (set PKG=/path/to/pkg, otherwise `npx @yao-pkg/pkg@6.14.2`). macOS binaries must carry at least an
// ad-hoc signature (Apple Silicon kills unsigned code): pkg signs them itself on a Mac (codesign) or, on Linux, when
// `ldid` is on PATH. Zips store Unix permissions so the launcher and binary stay executable after unzipping on a Mac.
'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),{execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..'),DIST=path.join(ROOT,'dist');const VER=require('../package.json').version;
const T={
 'mac-arm64':{pkg:'node20-macos-arm64',bin:'the-lowlands-host',mac:true},
 'mac-x64':{pkg:'node20-macos-x64',bin:'the-lowlands-host',mac:true},
 'windows':{pkg:'node20-win-x64',bin:'The-Lowlands-Host.exe'},
 'linux':{pkg:'node20-linux-x64',bin:'the-lowlands-host',tgz:true}};
const want=process.argv.slice(2).filter(a=>T[a]);const list=want.length?want:Object.keys(T);
const pkgCmd=process.env.PKG?[process.env.PKG,[]]:[process.platform==='win32'?'npx.cmd':'npx',['--yes','@yao-pkg/pkg@6.14.2']];
const which=c=>{try{execFileSync(process.platform==='win32'?'where':'which',[c],{stdio:'ignore'});return true;}catch(e){return false;}};
if(list.some(k=>T[k].mac)&&process.platform!=='darwin'&&!which('ldid'))console.warn('WARNING: ldid not on PATH — the macOS binaries will be UNSIGNED and Apple Silicon Macs will refuse to run them.');

const README_MAC=`THE LOWLANDS — game host for macOS
==================================
Start:  double-click "Start The Lowlands Host.command".
A Terminal window opens with the address other players type in their browser
(e.g. http://192.168.1.20:8080/) and your browser opens the game. Keep the window
open while playing; close it (or press Ctrl+C) to stop the host.

FIRST LAUNCH — macOS Gatekeeper
This app is not signed by an Apple developer account, so macOS blocks it the first time:
 * Right-click (or Control-click) "Start The Lowlands Host.command" → Open → Open.
 * macOS 15 Sequoia and newer: double-click it once, click Done, then open
   System Settings → Privacy & Security, scroll down, click "Open Anyway" and confirm.
 * Or in Terminal (works on every version), then double-click normally:
       xattr -dr com.apple.quarantine ~/Downloads/The-Lowlands-Host-mac-*
   (use the folder where you unzipped it).
When macOS asks "accept incoming network connections?", click Allow so others can join.

Other players need nothing installed — just a browser on the same network.
Port 8080 busy? The host picks the next free port and shows it.
`;
const README_WIN=`THE LOWLANDS — game host for Windows
====================================
Start:  double-click The-Lowlands-Host.exe.
A console window opens with the address other players type in their browser
(e.g. http://192.168.1.20:8080/) and your browser opens the game. Keep the window open
while playing; close it to stop the host.

FIRST LAUNCH
 * Windows SmartScreen ("Windows protected your PC"): click "More info" → "Run anyway"
   (the program is not code-signed).
 * Windows Firewall: allow access on PRIVATE networks so other players can join.

Other players need nothing installed — just a browser on the same network.
Port 8080 busy? The host picks the next free port and shows it.
`;
const README_LINUX=`THE LOWLANDS — game host for Linux (x64)
Start: ./the-lowlands-host   (or double-click start.sh in a file manager that runs scripts in a terminal)
`;
const COMMAND=`#!/bin/bash
# The Lowlands — double-click to host a game. Opens Terminal with the address to share.
cd "$(dirname "$0")" || exit 1
xattr -dr com.apple.quarantine . 2>/dev/null   # unzip copies the download quarantine onto the binary too
chmod +x ./the-lowlands-host 2>/dev/null
./the-lowlands-host
echo; read -r -p "The host has stopped. Press Enter to close this window." _
`;
// --- minimal zip writer (deflate) keeping Unix permissions (version made by = Unix) ---
const CRC=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}return b=>{let c=-1;for(let i=0;i<b.length;i++)c=t[(c^b[i])&255]^(c>>>8);return(c^-1)>>>0;};})();
function writeZip(out,entries){const parts=[],cen=[];let off=0;const d=new Date(),dt=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),tm=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);
 for(const e of entries){const name=Buffer.from(e.name,'utf8'),dir=e.name.endsWith('/'),raw=dir?Buffer.alloc(0):e.data,data=dir?raw:zlib.deflateRawSync(raw,{level:9}),crc=CRC(raw),meth=dir?0:8;
  const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0x800,6);lh.writeUInt16LE(meth,8);lh.writeUInt16LE(tm,10);lh.writeUInt16LE(dt,12);
  lh.writeUInt32LE(crc,14);lh.writeUInt32LE(data.length,18);lh.writeUInt32LE(raw.length,22);lh.writeUInt16LE(name.length,26);parts.push(lh,name,data);
  const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(0x0314,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0x800,8);ch.writeUInt16LE(meth,10);ch.writeUInt16LE(tm,12);ch.writeUInt16LE(dt,14);
  ch.writeUInt32LE(crc,16);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(raw.length,24);ch.writeUInt16LE(name.length,28);
  const mode=(dir?0o040755:(e.mode&0o111?0o100755:0o100644));ch.writeUInt32LE(((mode<<16)|(dir?0x10:0))>>>0,38);ch.writeUInt32LE(off,42);cen.push(ch,name);
  off+=lh.length+name.length+data.length;}
 const cd=Buffer.concat(cen),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(off,16);
 fs.writeFileSync(out,Buffer.concat([...parts,cd,end]));}
function filesOf(dir,base){const r=[{name:base+'/'}];for(const f of fs.readdirSync(dir).sort()){const p=path.join(dir,f),st=fs.statSync(p);
 if(st.isDirectory())r.push(...filesOf(p,base+'/'+f));else r.push({name:base+'/'+f,data:fs.readFileSync(p),mode:st.mode});}return r;}

fs.mkdirSync(DIST,{recursive:true});
for(const k of list){const t=T[k],name='The-Lowlands-Host-'+k,dir=path.join(DIST,name);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
 const bin=path.join(dir,t.bin);console.log(`\n== ${name}  (${t.pkg})`);
 execFileSync(pkgCmd[0],[...pkgCmd[1],ROOT,'--targets',t.pkg,'--output',bin,'--compress','GZip','--no-bytecode','--public-packages','*','--public'],{stdio:'inherit',cwd:ROOT,shell:process.platform==='win32'});
 fs.chmodSync(bin,0o755);
 if(t.mac){fs.writeFileSync(path.join(dir,'Start The Lowlands Host.command'),COMMAND,{mode:0o755});fs.chmodSync(path.join(dir,'Start The Lowlands Host.command'),0o755);fs.writeFileSync(path.join(dir,'READ ME FIRST.txt'),README_MAC);}
 else if(k==='windows')fs.writeFileSync(path.join(dir,'READ ME FIRST.txt'),README_WIN.replace(/\n/g,'\r\n'));
 else{fs.writeFileSync(path.join(dir,'start.sh'),'#!/bin/sh\ncd "$(dirname "$0")" && exec ./the-lowlands-host\n',{mode:0o755});fs.chmodSync(path.join(dir,'start.sh'),0o755);fs.writeFileSync(path.join(dir,'READ ME FIRST.txt'),README_LINUX);}
 const zip=path.join(DIST,name+'.zip');writeZip(zip,filesOf(dir,name));
 if(t.tgz)execFileSync('tar',['-czf',name+'.tar.gz',name],{cwd:DIST});
 for(const f of [zip,...(t.tgz?[path.join(DIST,name+'.tar.gz')]:[])])console.log(`   ${path.relative(ROOT,f)}  ${(fs.statSync(f).size/1048576).toFixed(1)} MB`);}
console.log(`\nThe Lowlands ${VER}: done.`);
