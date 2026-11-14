const test=require('node:test'),assert=require('node:assert/strict');
const {refreshFriendRoster}=require('../src/friend-sharing.cjs');
const {migrate,newGame}=require('../src/state.cjs');
const FRIEND='76561198000000002',NOW=2000000000000;
function fixture(){
 const state=migrate({version:5,games:[{...newGame('550','Left 4 Dead 2'),workshop:true,shareSubscriptions:true,sharingConfigured:true,subscribedIds:['123']}],friends:[{id:FRIEND,name:'Alex',companion:true,games:[{appid:'550'}]}]});
 return state;
}
function server(friends=[{steamid:FRIEND,games:[{appid:'550',share_subscriptions:1}]}]){
 const writes=[];return{writes,request:async(route,options)=>{
  if(route==='/v1/health')return{sharingVersion:2,privateItemsVersion:1};
  if(route==='/v1/profile'){writes.push(options.body);return{ok:true};}
  if(route==='/v1/friends')return{friends,sharedGameStats:[]};
  assert.fail('Unexpected route '+route);
 }};
}
test('a failed Steam friend refresh preserves the published profile and permitted connected friends',async()=>{
 const state=fixture(),remote=server(),games=structuredClone(state.games);
 await refreshFriendRoster(state,{readFriends:async()=>{throw Error('Steam sign-in expired');},request:remote.request,now:NOW});
 assert.equal(remote.writes.length,0);assert.equal(state.friends[0].companion,true);assert.deepEqual(state.games,games);assert.equal(state.friendReadError,'Steam sign-in expired');assert.equal(state.friendsCheckedAt,undefined);
});
test('failure without a cached roster never publishes a fake empty profile',async()=>{
 const state=fixture(),remote=server([]);state.friends=[];
 await refreshFriendRoster(state,{readFriends:async()=>{throw Error('Steam returned HTTP 503');},request:remote.request,now:NOW});
 assert.equal(remote.writes.length,0);assert.deepEqual(state.friends,[]);
});
test('a verified empty Steam roster publishes actual removals',async()=>{
 const state=fixture(),remote=server([]);
 await refreshFriendRoster(state,{readFriends:async()=>[],request:remote.request,now:NOW});
 assert.equal(remote.writes.length,1);assert.deepEqual(remote.writes[0].friends,[]);assert.deepEqual(state.friends,[]);assert.equal(state.friendsCheckedAt,NOW);assert.equal(state.friendReadError,'');
});
test('failed reads cannot keep expired or revoked server connections visible',async()=>{
 const state=fixture(),remote=server([]);
 await refreshFriendRoster(state,{readFriends:async()=>{throw Error('Steam unavailable');},request:remote.request,now:NOW});
 assert.equal(remote.writes.length,0);assert.equal(state.friends[0].companion,false);assert.deepEqual(state.friends[0].games,[]);
});
test('a successful refresh restores the roster and publishes current subscriptions',async()=>{
 const state=fixture(),remote=server();state.friendReadError='Steam sign-in expired';
 await refreshFriendRoster(state,{readFriends:async()=>[{id:FRIEND,name:'Alex'}],request:remote.request,now:NOW});
 assert.equal(remote.writes.length,1);assert.deepEqual(remote.writes[0].friends,[FRIEND]);assert.deepEqual(remote.writes[0].games[0].subscriptions,['123']);assert.equal(state.friendReadError,'');assert.equal(state.friends[0].companion,true);
});
test('a server failure leaves the previous local connection badges intact',async()=>{
 const state=fixture(),before=structuredClone(state.friends);
 await assert.rejects(()=>refreshFriendRoster(state,{readFriends:async()=>[{id:FRIEND,name:'Updated name'}],request:async route=>{if(route==='/v1/health')return{sharingVersion:2,privateItemsVersion:1};throw Error('Sync service unavailable');},now:NOW}),/unavailable/);
 assert.deepEqual(state.friends,before);assert.equal(state.friendsCheckedAt,undefined);
});
test('a fresh cached roster still publishes changes without unnecessarily rereading Steam',async()=>{
 const state=fixture(),remote=server();state.friendsCheckedAt=NOW-1000;
 await refreshFriendRoster(state,{readFriends:async()=>assert.fail('The cache is still fresh'),request:remote.request,now:NOW});
 assert.equal(remote.writes.length,1);assert.equal(state.friends[0].companion,true);
});
