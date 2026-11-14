// Integration test of the installed app's real download/restart path against the live feed.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const asar=require('@electron/asar');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const target=require('../package.json').version;
 const saved=JSON.parse(await fs.readFile(path.join(process.env.APPDATA,'Workshop Link/lists.json'),'utf8'));
 const preferences=games=>games.map(g=>({id:g.id,sync:g.sync,shareList:g.shareList,shareSubscriptions:g.shareSubscriptions})).sort((a,b)=>a.id.localeCompare(b.id));
 const chosen=games=>games.map(g=>({id:g.id,items:(g.modLists?.find(list=>list.id==='default')?.items||g.items||[]).map(item=>item.id).sort()})).sort((a,b)=>a.id.localeCompare(b.id));
 const listChoices=games=>games.map(g=>({id:g.id,lists:(g.modLists||[]).map(list=>({id:list.id,name:list.name,items:list.items.map(row=>row.id).sort(),audience:list.audience,sync:list.sync})),privateItemIds:g.privateItemIds||[],audience:g.sharingAudience,following:g.following})).sort((a,b)=>a.id.localeCompare(b.id));
 await fs.writeFile(path.resolve(__dirname,'../../pre-installer-preferences.json'),JSON.stringify({preferences:preferences(saved.games),appearance:saved.appearance,chosen:chosen(saved.games)}));
 const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();const page=pages.find(p=>p.url.endsWith('/Programs/workshop-link/resources/app.asar/src/index.html'));assert.ok(page);
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let next=0;const pending=new Map();ws.addEventListener('message',event=>{const value=JSON.parse(event.data);const item=pending.get(value.id);if(item){clearTimeout(item.timer);pending.delete(value.id);item.resolve(value);}});
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Installed app operation timed out.'));},120000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)throw new Error(r.result.exceptionDetails.text);return r.result.result.value;};
 let info;for(let i=0;i<40;i++){info=await evaluate(`window.workshop.action('state').then(r=>({version:r.data.appVersion,busy:r.data.busy}))`);if(!info.busy)break;await pause(1000);}
 assert.notEqual(info.version,target);console.log('Updating installed version '+info.version+' to '+target+'.');
 let result=await evaluate(`window.workshop.action('updateCheck').then(r=>({ok:r.ok,status:r.data?.status,version:r.data?.availableVersion,error:r.error}))`);assert.equal(result.ok,true,result.error);assert.equal(result.status,'available');assert.equal(result.version,target);
 result=await evaluate(`window.workshop.action('updateDownload').then(r=>({ok:r.ok,status:r.data?.status,error:r.error}))`);assert.equal(result.ok,true,result.error);assert.equal(result.status,'ready');console.log('Live installer downloaded and verified by the installed app.');
 // Return immediately so app shutdown does not leave a pending protocol response.
 await evaluate(`setTimeout(()=>window.workshop.action('updateInstall'),100);true`);ws.close();
 const packageFile=path.join(process.env.LOCALAPPDATA,'Programs/workshop-link/resources/app.asar');let installed;
 for(let i=0;i<90;i++){await pause(1000);try{asar.uncache(packageFile);installed=JSON.parse(asar.extractFile(packageFile,'package.json')).version;}catch{}if(installed===target)break;}
 assert.equal(installed,target,'NSIS installs the offered version');
 let after;for(let i=0;i<30;i++){after=JSON.parse(await fs.readFile(path.join(process.env.APPDATA,'Workshop Link/lists.json'),'utf8'));if(after.version===5)break;await pause(1000);}
 assert.equal(after.version,5,'New app migrates to the audience-aware state format');assert.deepEqual(preferences(after.games),preferences(saved.games));assert.deepEqual(after.appearance,saved.appearance);assert.deepEqual(chosen(after.games),chosen(saved.games),'Chosen mods migrate to the default named list');
 assert.deepEqual(listChoices(after.games),listChoices(saved.games),'Every named list, item privacy choice, friend audience and follow selection is preserved');
 if(saved.version===3)await fs.access(path.join(process.env.APPDATA,'Workshop Link/lists.json.v3-backup'));
 if(saved.version===2)await fs.access(path.join(process.env.APPDATA,'Workshop Link/lists.json.v2-backup'));
 console.log('Installed update passed: real in-app download, verified installer, restart, version '+target+', named-list migration and preserved per-game preferences.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
