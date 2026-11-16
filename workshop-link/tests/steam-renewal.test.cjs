const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{EventEmitter,once}=require('node:events');
const {SteamRenewal,cookiePlan}=require('../src/steam-renewal.cjs');
const SELF='76561198000000001',OTHER='76561198000000002',TOKEN='test-only-refresh-credential';
const cookies=owner=>[`steamLoginSecure=${encodeURIComponent(owner+'||test-only-web-token')}; Domain=.steamcommunity.com; Path=/; Secure; HttpOnly; SameSite=None`,'sessionid=test-only-csrf; Domain=.steamcommunity.com; Path=/; Secure'];
const waitFor=async predicate=>{for(let i=0;i<1000;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,2));}assert.fail('Expected state transition did not complete');};
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'workshopsync-renewal-'));assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));t.after(async()=>{await value.renewal.serial.catch(()=>{});await fs.rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:50});});
 const value={file:path.join(dir,'steam-renewal.json'),sessions:[],writes:[],clock:2000000000000,verifyCount:0};
 const storage={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async plain=>Buffer.from('sealed:'+Buffer.from(plain).toString('base64')),decryptStringAsync:async bytes=>({result:Buffer.from(bytes.toString().slice(7),'base64').toString()})};value.storage=storage;
 const options={file:value.file,storage,cookies:{set:async cookie=>value.writes.push(cookie),flushStore:async()=>{}},verify:async expected=>{assert.equal(expected,SELF);value.verifyCount++;},now:()=>value.clock,makeQR:()=> 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///w==',createSession:()=>{
  const session=new EventEmitter();session.steamID={getSteamID64:()=>session.owner||SELF};session.refreshToken=TOKEN;session.startWithQR=async()=>({qrChallengeUrl:'https://s.team/q/1/test-only-challenge'});session.cancelLoginAttempt=()=>{session.cancelled=true;};session.getWebCookies=async()=>value.exchange?value.exchange(session):cookies(session.owner||SELF);value.sessions.push(session);return session;
 }};value.options=options;value.renewal=new SteamRenewal(options);value.enroll=async()=>{await value.renewal.start(SELF);const ready=once(value.renewal,'connected');value.sessions.at(-1).emit('authenticated');await ready;};return value;
}
test('Keep me signed in defaults off and setup exposes only a QR challenge',async t=>{
 const f=await fixture(t);await f.renewal.load(SELF);assert.equal(f.renewal.snapshot(SELF).enabled,false);const info=await f.renewal.start(SELF);assert.equal(info.status,'waiting');assert.ok(info.qrImage.startsWith('data:image/'));assert.equal(JSON.stringify(info).includes(TOKEN),false);assert.equal(f.writes.length,0);f.renewal.cancel();
});
test('approved own-account sign-in saves only an encrypted credential and keeps it out of snapshots',async t=>{
 const f=await fixture(t);await f.enroll();const raw=await fs.readFile(f.file,'utf8'),record=JSON.parse(raw);assert.equal(raw.includes(TOKEN),false);assert.equal(record.enabled,true);assert.equal(record.steamid,SELF);assert.ok(record.secret);assert.equal(f.renewal.snapshot(SELF).configured,true);assert.equal(f.renewal.snapshot(SELF).status,'ready');assert.equal(f.renewal.snapshot(SELF).qrImage,null);assert.equal(JSON.stringify(f.renewal.snapshot(SELF)).includes(TOKEN),false);assert.equal(f.verifyCount,1);assert.ok(f.writes.every(cookie=>cookie.secure));
});
test('saved credentials renew after a restart without a new QR approval',async t=>{
 const f=await fixture(t);await f.enroll();f.clock+=6*60*60000+1;const fresh=new SteamRenewal(f.options);await fresh.load(SELF);const before=f.sessions.length;assert.equal(await fresh.renew(SELF),true);assert.equal(f.sessions.length,before+1);assert.equal(fresh.snapshot(SELF).status,'ready');assert.equal(f.sessions.at(-1).cancelled,undefined);
});
test('a QR approval for another account is rejected before cookie injection',async t=>{
 const f=await fixture(t);await f.renewal.start(SELF);const session=f.sessions.at(-1);session.owner=OTHER;session.emit('authenticated');await waitFor(()=>f.renewal.snapshot(SELF).status==='needs-approval');await f.renewal.serial;assert.equal(f.writes.length,0);assert.match(f.renewal.snapshot(SELF).error,/same Steam account/);assert.equal(JSON.parse(await fs.readFile(f.file,'utf8')).secret,null);
});
test('all response cookies are validated before any are installed',async t=>{
 const f=await fixture(t);f.exchange=async()=>[...cookies(SELF),'sessionid=bad; Domain=example.com'];await f.renewal.start(SELF);f.sessions.at(-1).emit('authenticated');await waitFor(()=>f.renewal.snapshot(SELF).status==='needs-approval');assert.equal(f.writes.length,0);assert.throws(()=>cookiePlan(cookies(OTHER),SELF),/same Steam account/);
});
test('concurrent renewal requests share one exchange',async t=>{
 const f=await fixture(t);await f.enroll();let release;const gate=new Promise(resolve=>{release=resolve;});f.exchange=async()=>{await gate;return cookies(SELF);};const before=f.sessions.length,p1=f.renewal.renew(SELF,{force:true}),p2=f.renewal.renew(SELF,{force:true});await waitFor(()=>f.sessions.length>before);assert.equal(f.sessions.length,before+1);release();assert.deepEqual(await Promise.all([p1,p2]),[true,true]);
});
test('turning the option off during renewal cannot recreate the credential or install late cookies',async t=>{
 const f=await fixture(t);await f.enroll();let release;const gate=new Promise(resolve=>{release=resolve;});f.exchange=async()=>{await gate;return cookies(SELF);};const before=f.writes.length,pending=f.renewal.renew(SELF,{force:true});await waitFor(()=>f.renewal.snapshot(SELF).status==='renewing');await f.renewal.disable();release();assert.equal(await pending,false);await assert.rejects(fs.access(f.file));assert.equal(f.writes.length,before);assert.equal(f.renewal.snapshot(SELF).enabled,false);
});
test('canceling QR setup ignores an approval that arrives later',async t=>{
 const f=await fixture(t);await f.renewal.start(SELF);const session=f.sessions.at(-1);f.renewal.cancel();session.emit('authenticated');await new Promise(resolve=>setImmediate(resolve));assert.equal(f.writes.length,0);assert.equal(f.renewal.snapshot(SELF).configured,false);assert.equal(f.renewal.snapshot(SELF).status,'needs-approval');
});
test('a revoked credential requires approval and stops automatic retries',async t=>{
 const f=await fixture(t);await f.enroll();f.exchange=async()=>{throw Object.assign(new Error('private server detail '+TOKEN),{eresult:26});};assert.equal(await f.renewal.renew(SELF,{force:true}),false);const info=f.renewal.snapshot(SELF);assert.equal(info.status,'needs-approval');assert.equal(info.configured,false);assert.equal(JSON.stringify(info).includes(TOKEN),false);assert.equal(JSON.parse(await fs.readFile(f.file,'utf8')).secret,null);const before=f.sessions.length;assert.equal(await f.renewal.renew(SELF,{force:true}),false);assert.equal(f.sessions.length,before);
});
test('temporary failures retain the encrypted credential and back off before automatic retry',async t=>{
 const f=await fixture(t);await f.enroll();f.exchange=async()=>{throw new Error('Network failure with private detail '+TOKEN);};assert.equal(await f.renewal.renew(SELF,{force:true}),false);assert.equal(f.renewal.snapshot(SELF).status,'retrying');assert.equal(f.renewal.snapshot(SELF).configured,true);assert.equal(JSON.stringify(f.renewal.snapshot(SELF)).includes(TOKEN),false);const before=f.sessions.length;assert.equal(await f.renewal.renew(SELF,{force:true}),false);assert.equal(f.sessions.length,before);f.clock+=5*60000+1;f.exchange=null;assert.equal(await f.renewal.renew(SELF),true);
});
test('account switches discard the previous account credential',async t=>{
 const f=await fixture(t);await f.enroll();const fresh=new SteamRenewal(f.options);await fresh.load(OTHER);assert.equal(fresh.snapshot(OTHER).enabled,false);await assert.rejects(fs.access(f.file));assert.equal(await fresh.renew(OTHER),false);
});
test('protected storage is required for enabling a reusable login',async t=>{
 const f=await fixture(t);f.storage.isAsyncEncryptionAvailable=async()=>false;await assert.rejects(f.renewal.start(SELF),/protected storage/);assert.equal(f.sessions.length,0);await assert.rejects(fs.access(f.file));
});
test('expired QR codes become a new-approval state without writes',async t=>{
 const f=await fixture(t);await f.renewal.start(SELF);f.sessions.at(-1).emit('timeout');await waitFor(()=>f.renewal.snapshot(SELF).status==='needs-approval');assert.equal(f.writes.length,0);assert.equal(f.renewal.snapshot(SELF).qrImage,null);
});
