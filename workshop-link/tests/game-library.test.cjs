const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const Library=require('../src/game-library.js');
const {readPlayHistory}=require('../src/steam.cjs');
const {migrate,resetAccount}=require('../src/state.cjs');

test('game order defaults to latest played, with missing history last and stable name ties',()=>{
 const games=[{id:'1',name:'Alpha'},{id:'2',name:'Beta',lastPlayedAt:1000},{id:'3',name:'Charlie',lastPlayedAt:2000},{id:'4',name:'Delta',lastPlayedAt:2000}];
 assert.deepEqual(Library.sorted(games).map(g=>g.id),['3','4','2','1']);
 assert.deepEqual(Library.sorted(games,'name').map(g=>g.id),['1','2','3','4']);
 assert.deepEqual(games.map(g=>g.id),['1','2','3','4']);
});

test('shared-item order uses complete game summaries without opening friend snapshots and ignores expired counts',()=>{
 const now=Date.now(),games=[{id:'1',name:'Alpha',lastPlayedAt:3000},{id:'2',name:'Beta',lastPlayedAt:1000},{id:'3',name:'Charlie',lastPlayedAt:2000}];
 const stats=[{appid:'1',itemCount:4,friendCount:2,expiresAt:now+10000},{appid:'2',itemCount:8,friendCount:1,expiresAt:now+10000},{appid:'3',itemCount:20,friendCount:2,expiresAt:now-1}];
 assert.deepEqual(Library.sorted(games,'shared',stats,now).map(g=>g.id),['2','1','3']);
 assert.equal(Library.sharedStats(stats,'3',now).itemCount,0);
 assert.equal(Library.sharedStats([{appid:'1',itemCount:-2,friendCount:1,expiresAt:now+1000}],'1',now).itemCount,0);
});

test('game sort migrates and persists while account changes clear play history and friends counts',()=>{
 assert.equal(migrate({version:2,games:[]}).gameSort,'played');
 assert.equal(migrate({version:2,games:[],gameSort:'invalid'}).gameSort,'played');
 const state=migrate({version:2,gameSort:'shared',games:[{id:'550',name:'Left 4 Dead 2',sync:true,lastPlayedAt:1234}],sharedGameStats:[{appid:'550',itemCount:4}]});
 assert.equal(state.gameSort,'shared');assert.equal(state.games[0].lastPlayedAt,1234);
 resetAccount(state);assert.equal(state.gameSort,'shared');assert.equal(state.games[0].lastPlayedAt,null);assert.deepEqual(state.sharedGameStats,[]);
});

test('Steam play history is account-specific, case-insensitive, merged across roots, and rejects invalid dates',async()=>{
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'workshop-link-play-'));
 try{
  const roots=[path.join(temporary,'one'),path.join(temporary,'two')],account='39734273',other='39734274';
  const write=async(root,user,apps)=>{const dir=path.join(root,'userdata',user,'config');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'localconfig.vdf'),`"UserLocalConfigStore" { "Software" { "valve" { "Steam" { "Apps" { ${apps} } } } } }`);};
  await write(roots[0],account,'"550" { "LastPlayed" "1700000000" } "108600" { "lastplayed" "0" } "294100" { "LastPlayed" "999999999999" } "bad" { "LastPlayed" "1700000000" }');
  await write(roots[1],account,'"550" { "LastPlayed" "1700000010" } "108600" { "LastPlayed" "1690000000" }');
  await write(roots[0],other,'"550" { "LastPlayed" "1750000000" }');
  const errors=[];assert.deepEqual(await readPlayHistory(roots,'76561198000000001',errors),{'550':1700000010000,'108600':1690000000000});assert.deepEqual(errors,[]);
  assert.deepEqual(await readPlayHistory(roots,'76561198000000002'),{'550':1750000000000});assert.equal(await readPlayHistory(roots,null),null);assert.equal(await readPlayHistory(roots,'76561198000000003'),null);
 }finally{
  assert.equal(path.dirname(path.resolve(temporary)),path.resolve(os.tmpdir()));assert.ok(path.basename(temporary).startsWith('workshop-link-play-'));
  await fs.rm(temporary,{recursive:true,force:true});
 }
});
