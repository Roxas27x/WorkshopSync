const {app}=require('electron'),path=require('node:path'),assert=require('node:assert/strict');
app.setPath('userData',path.resolve(__dirname,'../../qa-packaged-details'));
app.whenReady().then(async()=>{
 const {WorkshopDetails}=require(path.resolve(__dirname,'../installer/win-unpacked/resources/app.asar/src/workshop-details.cjs'));
 const details=new WorkshopDetails(async(url,body)=>(await fetch(url,{method:'POST',body:new URLSearchParams(body)})).json(),async()=>new Response('Steam is limiting page requests.',{status:429}));
 const row=await details.get('1617936945');assert.equal(row.id,'1617936945');assert.ok(row.descriptionHtml.includes('missing sounds'));assert.ok(row.images.length);assert.equal(row.pageDetails,false);assert.match(row.creator,/^765\d{14}$/);
 console.log('Packaged mod details passed: full live Steam API description and preview remain available when the page is rate-limited.');app.exit(0);
}).catch(error=>{console.error(error.stack);app.exit(1)});
