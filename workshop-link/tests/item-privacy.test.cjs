const test=require('node:test'),assert=require('node:assert/strict'),Privacy=require('../src/item-privacy.js'),Lists=require('../src/mod-lists.js'),{migrate,sharingPayload}=require('../src/state.cjs');
const row=id=>({id,appid:'550',title:'Mod '+id});
test('private subscriptions are excluded from every list, subscriptions and legacy item alias after refresh and restart',()=>{
 const state=migrate({version:3,friends:[],games:[{id:'550',name:'Game',workshop:true,shareList:true,shareSubscriptions:true,subscribedIds:['1','2'],items:[row('1'),row('2')]}]}),g=state.games[0];const extra=Lists.create(g,'extra','Another shared list');extra.audience={mode:'all',friends:[]};extra.items.push(row('1'));Privacy.set(g,['1'],true);
 for(const saved of [state,migrate(JSON.parse(JSON.stringify(state)))]){const payload=sharingPayload(saved);assert.equal(payload.sharingVersion,3);assert.deepEqual(payload.games[0].subscriptions,['2']);assert.deepEqual(payload.games[0].namedLists.flatMap(list=>list.items),['2']);assert.ok(!JSON.stringify(payload).includes('privateItemIds'));assert.equal(saved.games[0].subscribedIds.length,2);}
 assert.equal(Privacy.isPrivate(g,'1'),true);g.subscribedIds=['1','2','3'];assert.deepEqual(sharingPayload(state).games[0].subscriptions,['2','3']);assert.equal(state.version,5);
});
test('explicitly sharing an item clears only its private choice and preserves all audience and sync settings',()=>{
 const g={privateItemIds:['1','2'],sync:false,shareSubscriptions:false,sharingAudience:{mode:'selected',friends:['76561198000000001']}};Privacy.set(g,['1'],false);assert.deepEqual(g.privateItemIds,['2']);assert.deepEqual(Privacy.visible(g,[row('1'),row('2')]),[row('1')]);assert.equal(g.sync,false);assert.equal(g.shareSubscriptions,false);assert.equal(g.sharingAudience.mode,'selected');
});
