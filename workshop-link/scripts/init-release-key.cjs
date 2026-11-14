const {app,safeStorage}=require('electron');
const path=require('node:path');
const {initializeReleaseKey}=require('./release-key.cjs');
app.setName('Workshop Link');app.setPath('userData',path.join(app.getPath('appData'),'Workshop Link'));
app.whenReady().then(async()=>{const publicKey=await initializeReleaseKey(safeStorage,app.getPath('userData'));console.log(JSON.stringify({publicKey}));app.exit(0);}).catch(e=>{console.error(e.message);app.exit(1);});
