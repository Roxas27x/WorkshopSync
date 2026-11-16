const test=require('node:test'),assert=require('node:assert/strict'),{Steam}=require('../src/steam.cjs');
const SELF='76561198000000001',OTHER='76561198000000002';
const response=(html,status=200)=>({ok:status===200,status,text:async()=>html});
const profile=`<script>g_steamID='${SELF}';</script>`;
function fixture(fetcher){const steam=new Steam({fetch:fetcher});steam.auth=async()=>({steamid:SELF,sessionid:'test-csrf'});return steam;}
test('a surviving cookie cannot authorize subscriptions when Steam returns a login page',async()=>{
 const steam=fixture(async()=>response('<script>g_steamID=false;</script>'));let writes=0;steam.request=async()=>{writes++;};
 await assert.rejects(steam.mutate('subscribe',{id:'1',appid:'550'},SELF),error=>error.code==='STEAM_WEB_AUTH_REQUIRED');assert.equal(writes,0);assert.equal(steam.authorizationFailure,SELF);
});
test('a current session is verified once, while explicit confirmation checks it again',async()=>{
 let reads=0;const steam=fixture(async()=>{reads++;return response(profile);});await steam.ensureAuthorized(SELF);await steam.ensureAuthorized(SELF);assert.equal(reads,1);await steam.ensureAuthorized(SELF,{fresh:true});assert.equal(reads,2);
});
test('a 401 during a subscription requests reconnection without silently retrying the write',async()=>{
 let posts=0;const steam=fixture(async(_url,options)=>{if(options.method==='POST'){posts++;return response('',401);}return response(profile);});
 await assert.rejects(steam.mutate('subscribe',{id:'1',appid:'550'},SELF),error=>error.code==='STEAM_WEB_AUTH_REQUIRED'&&!/Try again later/.test(error.message));assert.equal(posts,1);assert.equal(steam.authorizationFailure,SELF);assert.equal(steam.authorization,null);
});
test('reconnecting the same account restores authorization, but a different returned account is rejected',async()=>{
 let valid=false;const steam=fixture(async()=>response(valid?profile:'<div>Sign in</div>'));await assert.rejects(steam.ensureAuthorized(SELF),error=>error.code==='STEAM_WEB_AUTH_REQUIRED');valid=true;await steam.ensureAuthorized(SELF,{fresh:true});assert.equal(steam.authorizationFailure,null);
 const wrong=fixture(async()=>response(`<script>g_steamID='${OTHER}'</script>`));await assert.rejects(wrong.ensureAuthorized(SELF),error=>error.code==='STEAM_WEB_AUTH_REQUIRED');
});
test('temporary Steam errors are not misreported as an expired sign-in',async()=>{
 const steam=fixture(async()=>response('',503));await assert.rejects(steam.ensureAuthorized(SELF),error=>/HTTP 503/.test(error.message)&&error.code!=='STEAM_WEB_AUTH_REQUIRED');assert.equal(steam.authorizationFailure,undefined);
});
test('account changes during the preflight cannot send a subscription for the previous account',async()=>{
 let switched=false,writes=0;const steam=fixture(async()=>{switched=true;return response(profile);});steam.auth=async()=>({steamid:switched?OTHER:SELF,sessionid:'test'});steam.request=async()=>{writes++;};await assert.rejects(steam.mutate('subscribe',{id:'1',appid:'550'},SELF),error=>error.code==='STEAM_WEB_AUTH_REQUIRED');assert.equal(writes,0);
});
