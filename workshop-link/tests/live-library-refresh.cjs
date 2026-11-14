// Read-only validation of the installed app's combined library refresh.
const assert=require('node:assert/strict');
(async()=>{
 const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();const page=pages.find(p=>p.url.endsWith('/Programs/workshop-link/resources/app.asar/src/index.html'));assert.ok(page);
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});let next=0;const pending=new Map();
 ws.addEventListener('message',event=>{const data=JSON.parse(event.data),item=pending.get(data.id);if(item){clearTimeout(item.timer);pending.delete(data.id);item.resolve(data);}});
 const evaluate=expression=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Library refresh check timed out.'));},240000);pending.set(id,{timer,resolve:response=>{if(response.result?.exceptionDetails)reject(new Error(response.result.exceptionDetails.text));else resolve(response.result.result.value);}});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});
 let idle=false;for(let i=0;i<60;i++){idle=await evaluate(`window.workshop.action('state').then(r=>!r.data.busy)`);if(idle)break;await new Promise(r=>setTimeout(r,500));}assert.ok(idle);
 const action=process.argv.includes('--legacy')?'webSubscriptions':'refreshLibrary';
 const result=await evaluate(`window.workshop.action('${action}').then(r=>({ok:r.ok,error:r.error,code:r.code,games:r.data?.games?.length,subscriptions:r.data?.games?.reduce((n,g)=>n+g.subscribedIds.length,0)}))`);
 console.log(JSON.stringify({libraryRefresh:result.ok?'passed':'needs-attention',...result}));ws.close();assert.equal(result.ok,true,result.error);
})().catch(e=>{console.error(e.message);process.exit(1);});
