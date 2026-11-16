// Manual network check: generate and cancel an unapproved Steam QR challenge.
// Uses an isolated profile and never reads the installed user's credentials.
const {app,safeStorage,session}=require('electron'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');app.setPath('userData',path.resolve(root,'../qa-packaged-renewal'));
app.whenReady().then(async()=>{
 const {SteamRenewal}=require(path.join(root,'installer/win-unpacked/resources/app.asar/src/steam-renewal.cjs'));
 const renewal=new SteamRenewal({file:path.join(app.getPath('userData'),'steam-renewal.json'),storage:safeStorage,cookies:session.defaultSession.cookies,verify:async()=>assert.fail('This test must not approve a Steam login')});
 try{const state=await renewal.start('76561198000000001');assert.equal(state.status,'waiting');assert.equal(state.configured,false);assert.ok(state.qrImage.startsWith('data:image/'));assert.equal(state.refreshToken,undefined);console.log('Packaged Steam QR handshake passed; unapproved challenge cancelled.');}
 finally{await renewal.disable();}
 app.exit(0);
}).catch(error=>{console.error(error.message);app.exit(1);});
