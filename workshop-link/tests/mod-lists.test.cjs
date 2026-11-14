const test=require('node:test'),assert=require('node:assert/strict'),Lists=require('../src/mod-lists.js'),Friends=require('../src/friend-items.js'),{migrate,sharingPayload}=require('../src/state.cjs');
const A='76561198000000001',B='76561198000000002',C='76561198000000003',row=id=>({id,appid:'550',title:'Mod '+id,type:0});
test('legacy chosen lists migrate without changing sharing, sync or item provenance and survive restart',()=>{
 const state=migrate({version:2,games:[{id:'550',workshop:true,sync:true,shareList:true,items:[{...row('1'),addedBy:[{id:A,kind:'friend'}]}]}]});const g=state.games[0];assert.equal(g.modLists[0].id,'default');assert.deepEqual(g.modLists[0].items,g.items);assert.equal(g.modLists[0].sync,true);assert.equal(g.sync,true);assert.equal(g.shareList,true);assert.equal(g.modLists[0].items[0].addedBy[0].id,A);
 assert.deepEqual(migrate(JSON.parse(JSON.stringify(state))).games[0].modLists,g.modLists);
});
test('new lists stay private and excluded from auto-installs, while names, contents, and deletion remain separate',()=>{
 const g={id:'550',items:[row('1')],sync:true};const branch=Lists.create(g,'branch','Friday group');branch.items.push(row('2'));assert.deepEqual(Lists.automatic(g).map(row=>row.id),['1']);assert.equal(branch.audience.mode,'private');assert.deepEqual(g.items.map(row=>row.id),['1']);Lists.rename(g,'branch','Weekend group');assert.equal(branch.name,'Weekend group');assert.throws(()=>Lists.rename(g,'branch','My mods'));Lists.remove(g,'branch');assert.deepEqual(g.items.map(row=>row.id),['1']);
});
test('sharing omits private list items, metadata, local attribution and disabled game data',()=>{
 const g={id:'550',name:'Game',items:[row('1')],workshop:true,shareList:true,shareSubscriptions:true,subscribedIds:['7']};const privateList=Lists.create(g,'private','Private branch');privateList.items.push(row('2'));const team=Lists.create(g,'team','Group A');team.items.push({...row('3'),addedBy:[{kind:'friend',id:B}],addedAt:123});team.audience={mode:'selected',friends:[A]};
 const payload=sharingPayload({friends:[{id:A},{id:B}],games:[g]});assert.equal(payload.sharingVersion,3);assert.deepEqual(payload.games[0].namedLists.map(l=>l.id),['default','team']);assert.deepEqual(payload.games[0].namedLists[1].items,['3']);assert.ok(!JSON.stringify(payload).includes('Private branch'));assert.ok(!JSON.stringify(payload).includes('addedBy'));
});
test('custom friend subsets and a specific named list merge only those rows and retain per-list sources',()=>{
 const friends=[A,B,C].map(id=>({id,name:id,companion:true,games:[{appid:'550',share_list:1,share_subscriptions:1}]})),g={id:'550',friendSnapshots:Object.fromEntries([A,B,C].map((id,i)=>[id,{updated:Date.now(),shareList:true,shareSubscriptions:true,subscriptions:[row(String(i+1))],curated:[row(String(i+11))],namedLists:[{id:'one',name:'One',items:[row(String(i+11))]},{id:'two',name:'Two',items:[row(String(i+21))]}]}]))};
 assert.deepEqual(Friends.merged(g,friends,{peer:'selected',peers:[A,C]}).map(row=>row.id),['1','3']);assert.deepEqual(Friends.merged(g,friends,{peer:'selected',peers:[]}),[]);
 const named=Friends.merged(g,friends,{peer:'selected',peers:[A,C],mode:'curated',sourceList:{friendId:C,listId:'two'}});assert.deepEqual(named.map(row=>row.id),['23']);assert.equal(named[0].friendSources[0].listId,'two');assert.throws(()=>Friends.selected(g,friends,{peer:'selected',peers:[A,C],ids:['2']}));
});
test('unfriending removes obsolete recipients from uploads without broadening a selected audience',()=>{
 const g={id:'550',name:'Game',items:[row('1')],workshop:true,shareList:true,shareSubscriptions:true,subscribedIds:['2']};Lists.ensure(g);g.sharingAudience={mode:'selected',friends:[A,B]};g.modLists[0].audience={mode:'selected',friends:[B]};
 const payload=sharingPayload({games:[g],friends:[{id:A}]});assert.deepEqual(payload.games[0].audience,{mode:'selected',friends:[A]});assert.deepEqual(payload.games[0].namedLists[0].audience,{mode:'selected',friends:[]});
});
test('version-three restarts preserve private lists, per-list opt-ins, selected audiences and theme',()=>{
 const state=migrate({version:2,appearance:{mode:'light',palette:'ocean'},games:[{id:'550',items:[row('1')],sync:true,shareList:true}]});assert.equal(state.version,5);const g=state.games[0],list=Lists.create(g,'group','Group');list.items.push(row('2'));list.sync=true;list.audience={mode:'selected',friends:[A]};g.sharingAudience={mode:'selected',friends:[A,B]};
 const restored=migrate(JSON.parse(JSON.stringify(state)));assert.deepEqual(restored.games[0].modLists,g.modLists);assert.deepEqual(restored.games[0].sharingAudience,g.sharingAudience);assert.equal(restored.games[0].sync,true);assert.deepEqual(restored.appearance,state.appearance);
});
