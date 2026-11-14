const test=require('node:test'),assert=require('node:assert/strict');
const {Relay}=require('../src/relay.cjs');
const SELF='76561198000000001',OTHER='76561198000000002';
const relay=()=>new Relay('https://sync.test',{file:'unused',safeStorage:{isEncryptionAvailable:()=>false}});
test('browser-first sign-in has no guessed identity and accepts only a verified Steam ID',async()=>{
 const r=relay();r.request=async(p,options)=>{if(p==='/v1/health')return{service:'workshop-link-sync',ready:true};if(p==='/v1/device'){assert.equal(options.body.steamid,null);return{loginUrl:'https://sync.test/auth/steam?device=test',expires:Date.now()+10000};}return{status:'connected',steamid:SELF};};
 assert.match(await r.begin(),/^https:\/\/sync.test\/auth\/steam/);assert.equal(r.verified,false);assert.equal(await r.poll(),SELF);assert.equal(r.verified,true);assert.equal(r.steamid,SELF);
});
test('returning-account sign-in rejects a different account and forged destinations',async()=>{
 const r=relay();r.pending={token:'test',steamid:SELF,expires:Date.now()+10000};r.request=async()=>({status:'connected',steamid:OTHER});await assert.rejects(r.poll(),/different Steam account/);assert.equal(r.token,null);assert.equal(r.verified,false);
 r.request=async p=>p==='/v1/health'?{service:'workshop-link-sync',ready:true}:{loginUrl:'https://evil.test/auth/steam',expires:Date.now()+10000};await assert.rejects(r.begin(),/invalid sign-in destination/);
});
test('saved device identity is validated against the server before it can read local account subscriptions',async()=>{
 const r=relay();r.token='token';r.steamid=OTHER;r.request=async()=>({steamid:SELF});assert.equal(await r.verifyIdentity(),SELF);assert.equal(r.verified,true);assert.equal(r.steamid,SELF);
 r.request=async()=>({steamid:'spoofed'});await assert.rejects(r.verifyIdentity(),/valid Steam identity/);assert.equal(r.verified,false);
});
test('canceling a browser request prevents an in-flight approval from saving a session',async()=>{const r=relay();let finish;r.pending={token:'test',steamid:SELF,expires:Date.now()+10000};r.request=()=>new Promise(resolve=>{finish=resolve;});const polling=r.poll();r.pending=null;finish({status:'connected',steamid:SELF});assert.equal(await polling,null);assert.equal(r.verified,false);assert.equal(r.token,null);});
