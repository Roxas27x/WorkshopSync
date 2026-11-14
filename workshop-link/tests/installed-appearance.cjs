// Exercise the installed application's appearance IPC and saved preferences.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();
 const page=pages.find(p=>p.url.endsWith('/Programs/workshop-link/resources/app.asar/src/index.html'));assert.ok(page,'Installed app exists');
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let next=0;const pending=new Map();
 ws.addEventListener('message',event=>{const value=JSON.parse(event.data),item=pending.get(value.id);if(item){clearTimeout(item.timer);pending.delete(value.id);item.resolve(value);}});
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Installed UI timed out'));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.result?.exceptionDetails)throw new Error(result.result.exceptionDetails.text);return result.result.result.value;};
 const preferences=games=>games.map(g=>({id:g.id,sync:g.sync,shareList:g.shareList,shareSubscriptions:g.shareSubscriptions})).sort((a,b)=>a.id.localeCompare(b.id));
 const file=path.join(process.env.APPDATA,'Workshop Link/lists.json');let initial;
 try{
  for(let i=0;i<60;i++){const ready=await evaluate(`window.workshop.action('state').then(r=>!r.data.busy&&r.data.appVersion===${JSON.stringify(require('../package.json').version)})`);if(ready)break;await pause(500);}
  const saved=JSON.parse(await fs.readFile(file,'utf8'));initial=saved.appearance;assert.ok(initial);
  assert.equal(await evaluate(`!!document.querySelector('.library-table')&&!!document.querySelector('.library-sidebar #friends-sidebar')&&!document.querySelector('.stats,.sync-panel')`),true,'Installed Utility layout is active');
  await evaluate(`document.querySelector('[data-action=settings]').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.palette-choice').length`),5);
  await evaluate(`document.querySelector('[data-theme-palette=ocean]').click()`);await pause(200);
  await evaluate(`const mode=document.querySelector('#appearance-mode');mode.value='light';mode.dispatchEvent(new Event('change',{bubbles:true}));`);await pause(200);
  assert.equal(await evaluate(`document.documentElement.dataset.palette==='ocean'&&document.documentElement.style.colorScheme==='light'&&getComputedStyle(document.body).backgroundColor==='rgb(251, 253, 255)'`),true);
  const changed=JSON.parse(await fs.readFile(file,'utf8'));assert.deepEqual(changed.appearance,{palette:'ocean',mode:'light'});assert.deepEqual(preferences(changed.games),preferences(saved.games));
  await cdp('Page.reload');await pause(700);
  assert.equal(await evaluate(`document.documentElement.dataset.palette==='ocean'&&document.documentElement.style.colorScheme==='light'`),true,'Renderer reload retains saved appearance');
  await evaluate(`document.querySelector('[data-action=settings]').click()`);
  assert.equal(await evaluate(`document.querySelector('.palette-choice.current').dataset.id==='ocean'&&document.querySelector('#appearance-mode').value==='light'`),true);
  await evaluate(`document.querySelector('[data-action=close]').click()`);
  console.log('Installed appearance passed: Utility layout, five palettes, immediate mode changes, saved preferences, reload persistence, and unchanged game sharing/sync.');
 }finally{
  if(initial)await evaluate(`window.workshop.action('appearance',${JSON.stringify(initial)})`);
  ws.close();
 }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
