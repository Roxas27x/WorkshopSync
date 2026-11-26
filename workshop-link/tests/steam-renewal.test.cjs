const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{EventEmitter,once}=require('node:events');
const {SteamRenewal,cookiePlan,installCommunityCookies}=require('../src/steam-renewal.cjs');
const SELF='76561198000000001',OTHER='76561198000000002',TOKEN='test-only-refresh-credential';
const cookies=owner=>[`steamLoginSecure=${encodeURIComponent(owner+'||test-only-web-token')}; Domain=.steamcommunity.com; Path=/; Secure; HttpOnly; SameSite=None`,'sessionid=test-only-csrf; Domain=.steamcommunity.com; Path=/; Secure'];
const waitFor=async predicate=>{for(let i=0;i<1000;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,2));}assert.fail('Expected state transition did not complete');};
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'workshopsync-renewal-'));assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));t.after(async()=>{await value.renewal.serial.catch(()=>{});await fs.rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:50});});
 const value={file:path.join(dir,'steam-renewal.json'),sessions:[],writes:[],clock:2000000000000,verifyCount:0};
 const storage={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async plain=>Buffer.from('sealed:'+Buffer.from(plain).toString('base64')),decryptStringAsync:async bytes=>({result:Buffer.from(bytes.toString().slice(7),'base64').toString()})};value.storage=storage;
 const options={file:value.file,storage,cookies:{get:async()=>[],set:async cookie=>value.writes.push(cookie),flushStore:async()=>{}},verify:async expected=>{assert.equal(expected,SELF);value.verifyCount++;},now:()=>value.clock,makeQR:()=> 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///w==',createSession:()=>{
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
test('unrelated Steam website cookies do not reject an approved Community session',async t=>{
 const f=await fixture(t);f.exchange=async()=>[...cookies(SELF),'steamLoginSecure=store-only-value; Domain=checkout.steampowered.com','sessionid=store-session; Domain=store.steamchina.com','steamRefresh_steam=login-only; Domain=login.steampowered.com'];await f.enroll();assert.equal(f.renewal.snapshot(SELF).status,'ready');assert.equal(f.writes.length,2);assert.ok(f.writes.every(cookie=>cookie.url==='https://steamcommunity.com'));assert.throws(()=>cookiePlan(cookies(OTHER),SELF),error=>error.accountMismatch===true);
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
test('an incomplete Community session keeps the approved credential and can retry without another QR',async t=>{
 const f=await fixture(t),problems=[];f.renewal.on('problem',problem=>problems.push(problem));f.exchange=async()=>[cookies(SELF)[0]];
 await f.renewal.start(SELF);f.sessions.at(-1).emit('authenticated');await waitFor(()=>f.renewal.snapshot(SELF).status==='retrying');
 const info=f.renewal.snapshot(SELF);assert.equal(info.configured,true);assert.equal(info.errorCode,'STEAM_COMMUNITY_SESSION_INCOMPLETE');assert.doesNotMatch(info.error,/different account|same Steam account/);assert.equal(f.writes.length,0);assert.ok(JSON.parse(await fs.readFile(f.file,'utf8')).secret);assert.ok(!JSON.stringify(problems).includes(TOKEN));
 f.exchange=null;assert.equal(await f.renewal.renew(SELF,{force:true,retryNow:true}),true);assert.equal(f.renewal.snapshot(SELF).status,'ready');assert.equal(f.renewal.snapshot(SELF).errorCode,'');
});
test('malformed Community cookies report a session problem while valid different accounts remain rejected',()=>{
 for(const value of ['steamLoginSecure=%; Domain=steamcommunity.com','steamLoginSecure=missing-owner; Domain=steamcommunity.com'])assert.throws(()=>cookiePlan([value,cookies(SELF)[1]],SELF),error=>error.code==='STEAM_COMMUNITY_SESSION_INCOMPLETE'&&!error.accountMismatch);
 assert.throws(()=>cookiePlan([...cookies(SELF),cookies(OTHER)[0]],SELF),error=>error.accountMismatch===true);
});
test('an actually mismatched approved account is distinguished from cookie setup failures',async t=>{
 const f=await fixture(t);await f.renewal.start(SELF);f.sessions.at(-1).owner=OTHER;f.sessions.at(-1).emit('authenticated');await waitFor(()=>f.renewal.snapshot(SELF).status==='needs-approval');assert.equal(f.renewal.snapshot(SELF).errorCode,'STEAM_ACCOUNT_MISMATCH');assert.equal(f.renewal.snapshot(SELF).configured,false);assert.equal(f.writes.length,0);
});
test('renewal replaces both host-only and domain login scopes with the same fresh credentials',async()=>{
 const previous=['steamLoginSecure','sessionid'].flatMap(name=>[{name,domain:'steamcommunity.com',hostOnly:true,path:'/',value:'stale-host'},{name,domain:'.steamcommunity.com',hostOnly:false,path:'/',value:'stale-domain'}]);
 const writes=[],plan=cookiePlan(cookies(SELF),SELF),fresh=new Map(plan.map(cookie=>[cookie.name,cookie.value]));
 await installCommunityCookies({get:async options=>previous.filter(cookie=>cookie.name===options.name),set:async cookie=>writes.push(cookie)},plan);
 assert.equal(writes.length,4);for(const name of ['steamLoginSecure','sessionid']){const variants=writes.filter(cookie=>cookie.name===name);assert.equal(variants.length,2);assert.ok(variants.some(cookie=>!cookie.domain));assert.ok(variants.some(cookie=>cookie.domain));assert.ok(variants.every(cookie=>cookie.value===fresh.get(name)));}
});
test('cookie replacement leaves other Steam sites and unrelated cookies untouched',async()=>{
 const writes=[],previous=[{name:'steamLoginSecure',domain:'store.steampowered.com',hostOnly:true,path:'/'},{name:'steamCountry',domain:'steamcommunity.com',hostOnly:true,path:'/'}];
 await installCommunityCookies({get:async()=>previous,set:async cookie=>writes.push(cookie)},cookiePlan(cookies(SELF),SELF));assert.equal(writes.length,2);assert.ok(writes.every(cookie=>cookie.url==='https://steamcommunity.com'&&['steamLoginSecure','sessionid'].includes(cookie.name)));
});
test('existing authentication paths are renewed as well as the root cookie',async()=>{
 const writes=[],previous=[{name:'steamLoginSecure',domain:'steamcommunity.com',hostOnly:true,path:'/my'},{name:'sessionid',domain:'.steamcommunity.com',hostOnly:false,path:'/sharedfiles'}];
 await installCommunityCookies({get:async options=>previous.filter(cookie=>cookie.name===options.name),set:async cookie=>writes.push(cookie)},cookiePlan(cookies(SELF),SELF));assert.ok(writes.some(cookie=>cookie.url==='https://steamcommunity.com/my'&&cookie.path==='/my'));assert.ok(writes.some(cookie=>cookie.url==='https://steamcommunity.com/sharedfiles'&&cookie.path==='/sharedfiles'));assert.equal(writes.length,4);
});
test('cancelled renewal does not overwrite any stored cookie scopes',async()=>{
 let writes=0;await assert.rejects(installCommunityCookies({get:async()=>[],set:async()=>{writes++;}},cookiePlan(cookies(SELF),SELF),()=>{throw Error('cancelled');}),/cancelled/);assert.equal(writes,0);
});
