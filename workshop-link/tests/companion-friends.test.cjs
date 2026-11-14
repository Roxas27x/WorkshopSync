const test=require('node:test'),assert=require('node:assert/strict');
const Friends=require('../src/companion-friends.js');
test('the sidebar shows only connected app friends, deduplicates them and sorts by name',()=>{
 const friends=[{id:'1',name:'Zoe',companion:true},{id:'2',name:'Alex',companion:true},{id:'3',name:'Steam only',companion:false},{id:'4',name:'Unverified',companion:1}];
 assert.deepEqual(Friends.connected([...friends,friends[0]]).map(f=>f.id),['2','1']);assert.deepEqual(Friends.connected(friends,false),[]);assert.equal(friends[0].name,'Zoe');
});
test('a friend profile offers only visible games explicitly shared by that friend',()=>{
 const friend={games:[{appid:'550',share_subscriptions:1},{appid:'294100',share_list:1},{appid:'108600',share_list:0,share_subscriptions:0},{appid:'123',share_list:1}]};
 assert.deepEqual(Friends.sharedGames(friend,[{id:'550'},{id:'294100'},{id:'108600'}]).map(g=>g.id),['550','294100']);assert.deepEqual(Friends.sharedGames(null,[]),[]);
});
