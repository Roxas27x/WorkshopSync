const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {AppUpdates}=require('../src/app-updates.cjs');
const {verifyRelease,hashInstaller}=require('../src/release-crypto.cjs');
const {releaseText,validateRelease,compareReleaseVersions}=require('../src/release-format.cjs');
const pair=crypto.generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
const bytes=Buffer.from('test installer payload');
const manifest={schema:1,version:'0.3.0',platform:'win32',arch:'x64',file:'Workshop-Link-Setup-0.3.0.exe',size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sha512:crypto.createHash('sha512').update(bytes).digest('base64'),publishedAt:'2026-11-13T03:00:00Z',notes:'A useful update.'};
const signed=(m=manifest)=>({manifest:m,signature:crypto.sign(null,Buffer.from(releaseText(m)),pair.privateKey).toString('base64')});
async function fixture(t,{envelope=signed(),currentVersion='0.2.1',installed=true,feedVersion='0.3.0'}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'workshop-update-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,manifest.file);await fs.writeFile(file,bytes);
 const native=new EventEmitter();native.checked=0;native.downloads=0;native.installs=0;
 native.setFeedURL=value=>{native.feed=value;};native.checkForUpdates=async()=>{native.checked++;return{updateInfo:{version:feedVersion}};};native.downloadUpdate=async()=>{native.downloads++;return[file];};native.quitAndInstall=()=>native.installs++;
 const updater=new AppUpdates({currentVersion,installed,nativeUpdater:native,config:{publicKey,serviceUrl:'https://sync.test'},fetcher:async()=>new Response(JSON.stringify(envelope))});return{updater,native,file};
}
test('signed catalog rejects tampering, missing signatures and the wrong signing key',()=>{
 assert.deepEqual(verifyRelease(signed(),publicKey),manifest);
 const changed=signed();changed.manifest={...manifest,notes:'Changed'};assert.throws(()=>verifyRelease(changed,publicKey),/signature/);
 assert.throws(()=>verifyRelease({manifest},publicKey),/signed/);
 const other=crypto.generateKeyPairSync('ed25519').publicKey.export({format:'der',type:'spki'}).toString('base64');assert.throws(()=>verifyRelease(signed(),other),/signature/);
});
test('release validation prevents paths, unsupported platforms, excessive size and ambiguous versions',()=>{
 for(const change of [{file:'../evil.exe'},{version:'01.3.0'},{platform:'linux'},{arch:'arm64'},{size:201*1024*1024},{sha512:'bad'}])assert.throws(()=>validateRelease({...manifest,...change}));
 assert.equal(compareReleaseVersions('0.10.0','0.9.9'),1);
});
test('updates require explicit download and restart, verifying the saved installer before each',async t=>{
 const{updater,native,file}=await fixture(t);await updater.check();assert.equal(updater.snapshot().status,'available');assert.equal(native.checked,0);assert.equal(native.downloads,0);assert.equal(native.autoDownload,false);assert.equal(native.autoInstallOnAppQuit,false);
 await updater.download();assert.equal(updater.snapshot().status,'ready');assert.equal(native.installs,0);assert.equal(native.feed.url,'https://sync.test/updates/0.3.0/');assert.deepEqual(await hashInstaller(file),{size:manifest.size,sha256:manifest.sha256,sha512:manifest.sha512});
 let saved=false;await updater.install(async()=>{saved=true;});assert.ok(saved);assert.equal(native.installs,1);
});
test('same and older published versions never become available',async t=>{
 for(const currentVersion of ['0.3.0','0.4.0']){const{updater,native}=await fixture(t,{currentVersion});await updater.check();assert.equal(updater.snapshot().status,'current');await assert.rejects(updater.download(),/available/);assert.equal(native.downloads,0);}
});
test('untrusted feeds never reach the native updater',async t=>{
 const envelope=signed();envelope.manifest={...manifest,sha256:'0'.repeat(64)};const{updater,native}=await fixture(t,{envelope});await assert.rejects(updater.check(),/signature/);assert.equal(native.checked,0);await assert.rejects(updater.download(),/available/);
});
test('feed version mismatch and corrupt downloads cannot install',async t=>{
 const a=await fixture(t,{feedVersion:'0.3.1'});await a.updater.check();await assert.rejects(a.updater.download(),/signed release/);assert.equal(a.native.downloads,0);assert.equal(a.native.installs,0);
 const b=await fixture(t);await fs.writeFile(b.file,'corrupted');await b.updater.check();await assert.rejects(b.updater.download(),/signed release/);assert.equal(b.updater.snapshot().status,'error');assert.equal(b.native.installs,0);
});
test('installer changed after download is rejected before restart or saving',async t=>{
 const{updater,native,file}=await fixture(t);await updater.check();await updater.download();await fs.writeFile(file,'changed later');let saved=false;await assert.rejects(updater.install(async()=>{saved=true;}),/signed release/);assert.equal(saved,false);assert.equal(native.installs,0);
});
test('portable installations explain the one-time setup requirement',async t=>{const{updater,native}=await fixture(t,{installed:false});await updater.check();await assert.rejects(updater.download(),/Windows Setup/);assert.equal(native.checked,0);});
