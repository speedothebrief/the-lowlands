// ===== client: canvas =====
const cv=document.getElementById('c');const ctx=cv.getContext('2d');
let W=800,H=600;
function resize(){W=cv.width=window.innerWidth;H=cv.height=window.innerHeight;}
window.addEventListener('resize',resize);resize();
let endInfo=null,mode='local',endShown=false,lastClick={t:0,type:null};

// ===== client: build hotkeys (B, then a letter), garrison & bell helpers =====
let buildMenuOpen=false,placeSticky=false,mapSize=(()=>{try{const v=localStorage.getItem('kom_map');return MAPSIZES[v]?v:'small';}catch(e){return 'small';}})();
const BUILD_KEYS={house:'H',farm:'F',lumber:'L',quarry:'Q',mine:'G',market:'M',barracks:'B',stable:'S',workshop:'W',wall:'A',gate:'E',tower:'T',fortress:'O'};
const BUILD_KEY_OF={};for(const t in BUILD_KEYS)BUILD_KEY_OF[BUILD_KEYS[t].toLowerCase()]=t;
function startPlacing(ty,sticky){placing=ty;placeSticky=!!sticky;wallStart=null;amoveMode=false;AU.ui('click');if(!afford(players[me],BLD[ty].cost))msg('Not enough resources for '+BLD[ty].name+'.','#ff9a8a',me);}
function repairSel(){const b=sel[0];if(b&&b.kind==='bld'&&b.owner===me){if(b.built&&b.hp>=b.maxhp-.5){msg('That building is not damaged.','#cdbb90',me);AU.play('err');return;}issue({t:'repairauto',bid:b.id});AU.play('ord_gather');}}
function bellCmd(){issue({t:'bell'});}
function garrisonSel(){const own=sel.filter(u=>u.kind==='unit'&&u.owner===me&&!u.dead);if(!own.length)return;const el=own.filter(canGar);
 if(!el.length){msg('Only peasants, spearmen and archers can garrison.','#ff9a8a',me);AU.play('err');return;}issue({t:'garrison',ids:el.map(u=>u.id)});AU.play('ord_move');}
function unloadSel(){const b=sel[0];if(b&&b.kind==='bld'&&b.owner===me&&BLD[b.type].gar){issue({t:'unload',bid:b.id});}}
const garN=b=>b.garN!=null?b.garN:(b.gar?b.gar.length:0);
const garInfo=b=>b.gar&&b.garN==null?{n:b.gar.length,a:b.gar.filter(u=>u.type==='archer').length,p:b.gar.filter(u=>u.type==='peasant').length}:{n:b.garN||0,a:b.garA||0,p:b.garP||0};
