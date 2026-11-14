const {app,safeStorage}=require('electron');
const path=require('node:path');
const {Relay}=require('../src/relay.cjs');
const {ReleasePublisher}=require('./release-publisher.cjs');
const config=require('../src/update-config.json');
app.setName('Workshop Link');app.setPath('userData',path.join(app.getPath('appData'),'Workshop Link'));
app.whenReady().then(async()=>{
 const input=process.argv.slice(2).find(x=>x.endsWith('.release.json'));if(!input)throw new Error('Pass a prepared .release.json file.');
 const relay=new Relay(config.serviceUrl,{file:path.join(app.getPath('userData'),'companion-session.json'),safeStorage});await relay.load();
 const publisher=new ReleasePublisher({config,relay,safeStorage,userData:app.getPath('userData')});await publisher.prepare(path.resolve(input));const result=await publisher.publish();console.log(`Published WorkshopSync ${result.version}.`);app.exit(0);
}).catch(e=>{console.error(e.message);app.exit(1);});
