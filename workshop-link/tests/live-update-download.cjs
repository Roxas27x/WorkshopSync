// Integration check against the public feed; downloads and verifies without installing.
const {app}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {NsisUpdater}=require('electron-updater');
const {ElectronHttpExecutor}=require('electron-updater/out/electronHttpExecutor');
const {AppUpdates}=require('../src/app-updates.cjs');
const config=require('../src/update-config.json');
const root=path.resolve(__dirname,'../../qa-live-updater');app.setPath('userData',root);
app.whenReady().then(async()=>{
 await fs.mkdir(root,{recursive:true});
 const adapter={version:'0.2.1',name:'Workshop Link update verification',isPackaged:true,appUpdateConfigPath:path.resolve(__dirname,'../installer/win-unpacked/resources/app-update.yml'),userDataPath:root,baseCachePath:path.join(root,'cache'),whenReady:()=>app.whenReady(),onQuit:()=>{},quit:()=>{throw new Error('This download check must never install or quit through the updater.');},relaunch:()=>{throw new Error('This check must never relaunch.');}};
 const native=new NsisUpdater(null,adapter);native.httpExecutor=new ElectronHttpExecutor(()=>{});native.logger=null;
 const updates=new AppUpdates({currentVersion:adapter.version,config,nativeUpdater:native,installed:true});
 await updates.check();assert.equal(updates.snapshot().status,'available');await updates.download();assert.equal(updates.snapshot().status,'ready');assert.equal(native.autoInstallOnAppQuit,false);
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify({version:updates.snapshot().availableVersion,status:'verified',installer:updates.downloaded}));
 console.log('Live update passed: signed public catalog, versioned NSIS feed, installer download, SHA-256/SHA-512 verification, and no automatic installation.');app.exit(0);
}).catch(e=>{console.error(e.stack);app.exit(1);});
