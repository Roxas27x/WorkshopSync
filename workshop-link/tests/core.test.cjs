const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {parseInput,eligible,normalizeDetail,parseVdf,safeImage}=require('../src/core.cjs');
const {Steam,scanLibraries}=require('../src/steam.cjs');
test('mixed-author Workshop URLs and uint64 IDs are deduplicated without precision loss',()=>{
  assert.deepEqual(parseInput('https://steamcommunity.com/sharedfiles/filedetails/?id=2009463077\nhttps://steamcommunity.com/workshop/filedetails/?id=818773962&searchtext=a\n18446744073709551615\n2009463077'),['2009463077','818773962','18446744073709551615']);
});
test('untrusted URLs, invalid IDs, and unbounded imports fail closed',()=>{
  for(const text of ['https://steamcommunity.com.evil.test/sharedfiles/filedetails/?id=123','https://steamcommunity.com@evil.test/sharedfiles/filedetails/?id=123','http://steamcommunity.com/sharedfiles/filedetails/?id=123','https://steamcommunity.com:555/sharedfiles/filedetails/?id=123','https://steamcommunity.com/id/me?id=123','0','-1','https://steamcommunity.com/sharedfiles/filedetails/?id=','a'.repeat(250001)])assert.throws(()=>parseInput(text));
});
const items=[{id:'1',appid:'108600',type:0},{id:'2',appid:'294100',type:0},{id:'3',appid:'108600',type:2},{id:'4',appid:'108600',type:0},{id:'1',appid:'108600',type:0}];
test('off by default prevents every subscription, including after importing a friend list',()=>{
  for(const game of [undefined,{id:'108600'},{id:'108600',sync:false},{id:'108600',sync:'true'}])assert.deepEqual(eligible(items,game),[]);
});
test('enabling one game never enables another game or subscribes a collection',()=>{
  assert.deepEqual(eligible(items,{id:'108600',sync:true}).map(x=>x.id),['1','4']);
  assert.deepEqual(eligible(items,{id:'294100',sync:true}).map(x=>x.id),['2']);
});
test('downloaded and successfully subscribed items are skipped; duplicates are skipped',()=>{
  assert.deepEqual(eligible(items,{id:'108600',sync:true},{'1':true},['4']),[]);
  assert.deepEqual(eligible(items,{id:'108600',sync:true},{'1':false},['4']).map(x=>x.id),['1']);
});
test('metadata normalizes Steam fields and fails on unavailable items',()=>{
  const row=normalizeDetail({result:1,publishedfileid:'818773962',consumer_app_id:294100,title:'HugsLib',creator:'76561198000000000'});
  assert.equal(row.appid,'294100'); assert.equal(row.title,'HugsLib');
  assert.throws(()=>normalizeDetail({result:9,publishedfileid:'1'}));
  assert.equal(safeImage('javascript:alert(1)'),''); assert.equal(safeImage('https://steamusercontent.com.evil.test/img.jpg'),'');
});
test('Steam VDF reader preserves Windows library paths and nested manifests',()=>{
  const vdf=parseVdf('"libraryfolders" { "0" { "path" "D:\\\\SteamLibrary" "apps" { "108600" "1234" } } }');
  assert.equal(vdf.libraryfolders['0'].path,'D:\\SteamLibrary'); assert.equal(vdf.libraryfolders['0'].apps['108600'],'1234');
});
test('library scan discovers non-default libraries and ignores empty Workshop folders',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'workshop-link-test-'));
  try {
    const lib=path.join(root,'secondary'); const workshop=path.join(lib,'steamapps','workshop','content','108600');
    await fs.mkdir(path.join(root,'steamapps'),{recursive:true});await fs.mkdir(path.join(workshop,'123'),{recursive:true});await fs.mkdir(path.join(workshop,'456'),{recursive:true});
    await fs.writeFile(path.join(workshop,'123','mod.txt'),'mod');
    await fs.writeFile(path.join(root,'steamapps','libraryfolders.vdf'),`"libraryfolders" { "1" { "path" "${lib.replace(/\\/g,'\\\\')}" } }`);
    await fs.writeFile(path.join(lib,'steamapps','appmanifest_108600.acf'),'"AppState" { "appid" "108600" "name" "Project Zomboid" }');
    await fs.writeFile(path.join(lib,'steamapps','workshop','appworkshop_108600.acf'),'"AppWorkshop" { "WorkshopItemsInstalled" { "123" { "manifest" "version-one" "timeupdated" "1498245226" } } }');
    const result=await scanLibraries([root]);const game=result.games.find(x=>x.id==='108600');
    assert.ok(game);assert.equal(game.name,'Project Zomboid');assert.ok(game.installed.includes('123'));assert.ok(!game.installed.includes('456'));assert.ok(result.roots.includes(lib));
    assert.equal(game.localFiles.find(x=>x.id==='123').manifest,'version-one');assert.ok(game.localFiles.find(x=>x.id==='123').fileCreatedAt>0);assert.notEqual(game.localFiles.find(x=>x.id==='123').fileCreatedAt,1498245226000,'mod publication timestamps are not used as download dates');
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('signed-out and switched-account mutations fail before any network request',async()=>{
  let calls=0;const steam=new Steam({});steam.request=async()=>{calls++;return{success:1};};
  steam.auth=async()=>null;await assert.rejects(()=>steam.mutate('subscribe',{id:'1',appid:'108600'},'76561198000000000'),/Sign in/);
  steam.auth=async()=>({steamid:'76561198000000001',sessionid:'test'});await assert.rejects(()=>steam.mutate('subscribe',{id:'1',appid:'108600'},'76561198000000000'),/account changed/);
  assert.equal(calls,0);
});
test('Steam action failure is not reported as a successful subscription',async()=>{
  const steam=new Steam({});steam.auth=async()=>({steamid:'76561198000000000',sessionid:'test'});steam.request=async()=>({success:15});
  await assert.rejects(()=>steam.mutate('subscribe',{id:'1',appid:'108600'}),/declined/);
});
test('network throttling is surfaced instead of retrying or bypassing limits',async()=>{
  const steam=new Steam({fetch:async()=>({status:429,ok:false})});
  await assert.rejects(()=>steam.request('https://steamcommunity.com/sharedfiles/subscribe/',{id:'1'},true),/rate limiting/);
});
