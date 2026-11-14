const test=require('node:test');
const assert=require('node:assert/strict');
const {storeInfo,parseHubIcon,visibleGames,confirmedWorkshop}=require('../src/catalog.cjs');
test('only confirmed Workshop-enabled games are visible',()=>{
  const games=[{id:'1',workshop:true},{id:'2',workshop:false},{id:'3'},{id:'4',workshop:'true'}];
  assert.deepEqual(visibleGames(games).map(g=>g.id),['1']);
});
test('Steam Workshop category 30 determines support; achievements and ordinary modding do not',async()=>{
  const mock=categories=>async()=>({ok:true,status:200,json:async()=>({'108600':{success:true,data:{name:'Project Zomboid',categories}}})});
  assert.equal((await storeInfo('108600',mock([{id:30,description:'Steam Workshop'}]))).workshop,true);
  assert.equal((await storeInfo('108600',mock([{id:22,description:'Steam Achievements'}]))).workshop,false);
});
test('unavailable Store metadata is not treated as proof of Workshop support',async()=>{
  await assert.rejects(()=>storeInfo('108600',async()=>({ok:true,json:async()=>({'108600':{success:false}})})),/could not verify/);
  await assert.rejects(()=>storeInfo('108600',async()=>({ok:false,status:429})),/rate limiting/);
});
test('a verified game with actual matching Workshop content is supported even without a Store badge',()=>{
  assert.equal(confirmedWorkshop({kind:'game',workshop:false},{appid:'2567870',type:0},'2567870'),true);
  assert.equal(confirmedWorkshop({kind:'game',workshop:false},{appid:'241100',type:0},'2567870'),false);
  assert.equal(confirmedWorkshop({kind:'tool',workshop:false},{appid:'241100',type:0},'241100'),false);
  assert.equal(confirmedWorkshop({kind:'game',workshop:false},undefined,'2567870'),false);
});
test('actual square Steam game icons are extracted only from the matching app hub',()=>{
  const url='https://shared.akamai.steamstatic.com/community_assets/images/apps/294100/addbe3b704b267060b4d5d7649cfb292de61bd70.jpg';
  assert.equal(parseHubIcon(`<div class="apphub_AppIcon"><img src="${url}"></div>`,'294100'),url);
  assert.equal(parseHubIcon(`<div class="apphub_AppIcon"><img src="${url}"></div>`,'108600'),'');
  assert.equal(parseHubIcon('<div class="apphub_AppIcon"><img src="https://evil.test/icon.jpg"></div>','294100'),'');
});
