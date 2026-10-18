// The Lowlands — double-click host app entry point (packaged with @yao-pkg/pkg; no Node install needed).
// Starts the LAN server (8080, or the next free port), prints the addresses to share, opens the browser,
// and keeps the console window open (also after an error, so the message can be read).
'use strict';
const {spawn}=require('child_process');
const W=62,line=(s='')=>'  ║ '+s+' '.repeat(Math.max(0,W-s.length))+' ║';
function pause(code){
 if(!process.stdin.isTTY){process.exit(code);return;}
 console.log('\nPress Enter to close this window.');process.stdin.resume();process.stdin.once('data',()=>process.exit(code));}
function openBrowser(url){if(process.env.NO_BROWSER||process.argv.includes('--no-browser'))return;
 const [cmd,args]=process.platform==='darwin'?['open',[url]]:process.platform==='win32'?['cmd',['/c','start','""',url]]:['xdg-open',[url]];
 try{const c=spawn(cmd,args,{detached:true,stdio:'ignore',windowsHide:true});c.on('error',()=>{});c.unref();}catch(e){}}
process.on('uncaughtException',e=>{console.error('\nThe Lowlands host stopped because of an error:\n  '+(e&&e.stack||e));pause(1);});
if(process.platform==='win32')process.title='The Lowlands — game host';
console.log('Starting The Lowlands game host…');
const S=require('../server.js');
S.onFatal=()=>pause(1);
S.banner=(port,ips)=>{const local=`http://localhost:${port}/`;
 const out=['','  ╔'+'═'.repeat(W+2)+'╗',line('THE LOWLANDS — game host is running'),line(),
  line('Other players on your network open (any of):')];
 for(const ip of ips)out.push(line(`    »  http://${ip}:${port}/`));
 if(!ips.length)out.push(line('    (no network found — only this computer can play)'));
 out.push(line(),line('Peer-to-peer room codes also use this as signaling server:'));
 for(const ip of ips)out.push(line(`    ${ip}:${port}`));
 out.push(line(),line(`This computer: ${local}  (opening your browser…)`),line(),
  line('Keep this window open while playing. Close it to stop.'),'  ╚'+'═'.repeat(W+2)+'╝','');
 console.log(out.join('\n'));
 if(port!==8080)console.log(`  Note: port 8080 was busy, so port ${port} is used.\n`);
 if(process.platform==='win32')console.log('  If Windows asks about the firewall, allow access on private networks so others can join.\n');
 if(process.platform==='darwin')console.log('  If macOS asks to accept incoming network connections, click Allow so others can join.\n');
 openBrowser(local);};
