// Run only against our installed app started with a temporary localhost debug port.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const before=JSON.parse(await fs.readFile(path.resolve(__dirname,'../../pre-installer-preferences.json'),'utf8'));
 const after=JSON.parse(await fs.readFile(path.join(process.env.APPDATA,'Workshop Link/lists.json'),'utf8'));
 const preferences=games=>games.map(g=>({id:g.id,sync:g.sync,shareList:g.shareList,shareSubscriptions:g.shareSubscriptions})).sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(preferences(after.games),preferences(before.preferences));
 const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();const page=pages.find(p=>p.url.endsWith('/Programs/workshop-link/resources/app.asar/src/index.html'));assert.ok(page,'Installed app page exists');
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let next=0;const pending=new Map();ws.addEventListener('message',event=>{const value=JSON.parse(event.data);if(pending.has(value.id)){pending.get(value.id)(value);pending.delete(value.id);}});
 const cdp=(method,params={})=>new Promise(resolve=>{const id=++next;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)throw new Error(r.result.exceptionDetails.text);return r.result.result.value;};
 let info;
 for(let attempt=0;attempt<45;attempt++){
  info=await evaluate(`window.workshop.action('state').then(r=>{const s=r.data;return{ok:r.ok,version:s.appVersion,installed:s.appUpdates.installed,status:s.appUpdates.status,connected:s.connected,sharing:s.relay.connected,publisherControls:s.appUpdates.publisherAllowed===true,busy:s.busy,games:s.games.length,subscriptions:s.games.reduce((n,g)=>n+g.subscribedIds.length,0),historyItems:s.games.reduce((n,g)=>n+Object.keys(g.itemHistory||{}).length,0)}})`);
  if(!info.busy)break;await new Promise(r=>setTimeout(r,1000));
 }
 const version=require('../package.json').version;
 assert.equal(info.version,version);assert.equal(info.installed,true);assert.equal(info.connected,true);assert.equal(info.sharing,true);assert.equal(info.publisherControls,false);
 assert.equal(await evaluate(`!!document.querySelector('#game-sort')&&!document.querySelector('.breadcrumb,.independent,.guide')`),true);
 const initialSort=await evaluate(`document.querySelector('#game-sort').value`),selectedGame=await evaluate(`document.querySelector('.game-nav.chosen').dataset.id`);
 const playHistoryGames=await evaluate(`window.workshop.action('state').then(r=>r.data.games.filter(g=>g.lastPlayedAt>0).length)`);assert.ok(playHistoryGames>0,'real Steam account play history is available');
 const sortResult=await evaluate(`window.workshop.action('gameSort',{value:'shared'}).then(r=>({ok:r.ok,sort:r.data.gameSort}))`);assert.equal(sortResult.ok,true);assert.equal(sortResult.sort,'shared');
 assert.equal(await evaluate(`document.querySelector('.game-nav.chosen').dataset.id`),selectedGame,'sorting keeps the selected game');
 assert.equal(await evaluate(`Array.from(document.querySelectorAll('.game-nav'),e=>e.dataset.id).join(',')===GameLibrary.sorted(state.games,'shared',state.sharedGameStats).map(g=>g.id).join(',')`),true);
 assert.ok(await evaluate(`document.querySelector('.game-sort-meta').textContent.includes('shared')`));
 await evaluate(`window.workshop.action('gameSort',{value:${JSON.stringify(initialSort)}})`);
 const checked=await evaluate(`window.workshop.action('updateCheck').then(r=>({ok:r.ok,status:r.data?.status,error:r.error}))`);assert.equal(checked.ok,true,checked.error);assert.equal(checked.status,'current');
 await evaluate(`document.querySelector('[data-action=settings]').click()`);
 assert.equal(await evaluate(`!!document.querySelector('[data-action=publisherPrepare],#server-url')`),false);
 await evaluate(`document.querySelector('[data-action=settingsPage][data-id=updates]').click()`);
 assert.ok(await evaluate(`document.querySelector('[data-update-settings]').textContent.includes('${version}')`));
 await evaluate(`document.querySelector('[data-action=close]').click()`);
 assert.equal(await evaluate(`!!document.querySelector('#connection-status')&&!document.querySelector('#steam-status')&&!document.querySelector('#friend-status')`),true);
 assert.ok(info.historyItems>0,'existing downloads get local history records');
 await evaluate(`window.workshop.action('state').then(r=>{const g=r.data.games.find(g=>g.installedDetails?.some(row=>!row.unavailable&&!row.placeholder));document.querySelector('[data-action=game][data-id="'+g.id+'"]').click();})`);
 await evaluate(`document.querySelector('[data-action=tab][data-id=installed]').click()`);
 assert.equal(await evaluate(`!!document.querySelector('.install-meta')`),true);
 await evaluate(`document.querySelector('[data-action=away]').click()`);
 assert.equal(await evaluate(`document.querySelector('#activity-filter')?.value`),'away');
 await evaluate(`document.querySelector('[data-action=tab][data-id=subscriptions]').click()`);
 const friendLoad=await evaluate(`window.workshop.action('state').then(r=>window.workshop.action('friendItems',{game:r.data.games[0].id})).then(r=>({ok:r.ok,error:r.error}))`);assert.equal(friendLoad.ok,true,friendLoad.error);
 await evaluate(`document.querySelector('[data-action=tab][data-id=friends]').click()`);
 for(let i=0;i<40;i++){const idle=await evaluate(`window.workshop.action('state').then(r=>!r.data.busy)`);if(idle)break;await new Promise(r=>setTimeout(r,250));}
 assert.ok(await evaluate(`!!document.querySelector('#peer-select')||document.querySelector('#main').textContent.includes('No friends sharing this game yet')`),'friends tab loads all compatible friends or explains an empty roster');
 await evaluate(`document.querySelector('[data-action=tab][data-id=subscriptions]').click()`);
 await evaluate(`document.querySelector('[data-action=shareApp]').click()`);
 assert.equal(await evaluate(`document.querySelector('#installer-link')?.value`),'https://workshopsync.pages.dev/');
 await evaluate(`document.querySelector('[data-action=close]').click()`);
 console.log(JSON.stringify({installedApp:'passed',...info,preferences:'preserved',liveUpdateCheck:'current'}));
 ws.close();
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
