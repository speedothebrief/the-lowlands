// The Lowlands — double-click host app entry point (packaged with @yao-pkg/pkg; no Node install needed).
// Starts the LAN server (8080, or the next free port), prints the addresses to share, opens the browser,
// keeps the console window open (also after an error, so the message can be read), and updates itself from
// GitHub releases when no game is running (LOWLANDS_NO_UPDATE=1 or --no-update turns that off).
'use strict';
const VERSION=(()=>{try{return require('./build-info.json').version;}catch(e){}try{return require('../package.json').version;}catch(e){}return '0.0.0';})();
if(process.argv.includes('--version')){console.log('the-lowlands-host '+VERSION);process.exit(0);}
const {spawn}=require('child_process'),path=require('path');
const W=62,line=(s='')=>'  ║ '+s+' '.repeat(Math.max(0,W-s.length))+' ║';
function pause(code){
 if(!process.stdin.isTTY){process.exit(code);return;}
 console.log('\nPress Enter to close this window.');process.stdin.resume();process.stdin.once('data',()=>process.exit(code));}
function openBrowser(url){if(process.env.NO_BROWSER||process.env.LOWLANDS_OPEN_BROWSER==='0'||process.argv.includes('--no-browser'))return;
 const [cmd,args]=process.platform==='darwin'?['open',[url]]:process.platform==='win32'?['cmd',['/c','start','""',url]]:['xdg-open',[url]];
 try{const c=spawn(cmd,args,{detached:true,stdio:'ignore',windowsHide:true});c.on('error',()=>{});c.unref();}catch(e){}}
process.on('uncaughtException',e=>{console.error('\nThe Lowlands host stopped because of an error:\n  '+(e&&e.stack||e));pause(1);});
if(process.platform==='win32')process.title='The Lowlands — game host';
const UPD=require('./updater.js');if(process.pkg)UPD.cleanupOld();   // remove the previous version left by an update
// restart marker written by the previous version just before it handed over (works for every relaunch style)
const MARK=process.execPath+'.restart';let RESTARTED=null;try{RESTARTED=JSON.parse(require('fs').readFileSync(MARK,'utf8'));require('fs').unlinkSync(MARK);}catch(e){}
if(RESTARTED&&Date.now()-RESTARTED.t>120e3)RESTARTED=null;
if(RESTARTED&&!RESTARTED.openBrowser)process.env.LOWLANDS_OPEN_BROWSER='0';   // open tabs reload themselves
console.log(RESTARTED?`Restarted — now running The Lowlands v${VERSION}.`:`Starting The Lowlands game host v${VERSION}…`);
const S=require('../server.js');
S.onFatal=()=>pause(1);
// restart into the freshly installed executable (same window where possible)
S.restart=()=>{const hadPages=S.wsClients()>0;const exe=process.execPath;
 const env={...process.env};delete env.LOWLANDS_OPEN_BROWSER;
 try{require('fs').writeFileSync(MARK,JSON.stringify({t:Date.now(),from:VERSION,openBrowser:!hadPages}));}catch(e){}
 S.shutdown(()=>{
  if(process.platform==='win32'){   // a new console window; this process exits so its renamed .exe can be deleted
   const c=spawn('cmd.exe',['/d','/s','/c',`start "The Lowlands" /D "${path.dirname(exe)}" "${exe}"`],{windowsVerbatimArguments:true,detached:true,stdio:'ignore',env});c.unref();
   setTimeout(()=>process.exit(0),500);return;}
  if(process.env.LOWLANDS_SUPERVISED){process.exit(75);return;}   // the .command / start.sh loop starts the new version
  const c=spawn(exe,process.argv.slice(2),{stdio:'inherit',env});
  process.on('SIGINT',()=>{});   // Ctrl+C reaches the child too (same terminal); wait for it to exit
  for(const sig of ['SIGTERM','SIGHUP'])process.on(sig,()=>{try{c.kill(sig);}catch(e){}});c.on('exit',code=>process.exit(code==null?0:code));
  c.on('error',e=>{console.error('Could not restart: '+e.message+'\nStart the app again by hand.');pause(1);});});};
let shown=false;
S.banner=(port,ips)=>{const local=`http://localhost:${port}/`;const U=S.updater;
 const show=()=>{if(shown)return;shown=true;
  const out=['','  ╔'+'═'.repeat(W+2)+'╗',line('THE LOWLANDS — game host is running'),line(`Version ${VERSION} · ${U.text()}`.slice(0,W)),line(),
   line('Other players on your network open (any of):')];
  for(const ip of ips)out.push(line(`    »  http://${ip}:${port}/`));
  if(!ips.length)out.push(line('    (no network found — only this computer can play)'));
   out.push(line(),line(`This computer: ${local}`+(process.env.LOWLANDS_OPEN_BROWSER==='0'?'':'  (opening your browser…)')),line(),
   line('Keep this window open while playing. Close it to stop.'),'  ╚'+'═'.repeat(W+2)+'╝','');
  console.log(out.join('\n'));
  if(S.fellBack)console.log(`  Note: port 8080 was busy, so port ${port} is used.\n`);
  if(process.platform==='win32')console.log('  If Windows asks about the firewall, allow access on private networks so others can join.\n');
  if(process.platform==='darwin')console.log('  If macOS asks to accept incoming network connections, click Allow so others can join.\n');
  U.on(u=>console.log(`  [update] ${u.text()}`));
  openBrowser(local);};
 // wait for the first update check, but never more than ~3 s
 Promise.race([S.updateCheck||Promise.resolve(),new Promise(r=>setTimeout(r,3000))]).then(show,show);};
