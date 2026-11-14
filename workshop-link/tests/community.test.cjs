const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {parseSubscriptions,parseFriends,ownSubscriptions,ownFriends}=require('../src/community.cjs');
const {readSubscriptionCache,resolveLibraryRoot,Steam}=require('../src/steam.cjs');
const {migrate,sharingPayload,resetAccount,newGame,connectSharing,applySharingDefaults,disconnectSharing}=require('../src/state.cjs');
const SELF='76561198000000001',OTHER='76561198000000002';
const row=(id,app='311210')=>`<div class="workshopItemSubscription" id="Subscription${id}"><a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${id}"><div class="workshopItemTitle">Map &amp; More ${id}</div></a><div class="workshopItemApp">Black Ops III</div><span onclick="ToggleSubscribed(${id}, ${app});"></span></div><div class="workshopItemSubscription" id="Unsubscribed${id}" style="display:none"><div class="workshopItemTitle">Hidden duplicate</div></div>`;
const page=(items,total=items.length,next=null)=>`<script>var g_steamID = '${SELF}';</script><div id="leftContents">${items.map(x=>row(...x)).join('')}<div class="workshopBrowsePagingInfo">Showing 1-${items.length} of ${total} entries</div><div class="workshopBrowsePagingControls">${next?`<a href="?p=${next}&browsefilter=mysubscriptions">Next</a>`:''}</div></div>`;
const friendPage=(owner=SELF,publicProfile=true)=>`<script>${publicProfile?`g_rgProfileData = {"steamid":"${owner}"};`:`g_steamID='${owner}';`}</script><div class="profile_friends"><div class="friend_block_v2" data-steamid="${OTHER}"><div class="friend_block_content">Alex</div></div></div>`;
const response=(html,status=200)=>({ok:status===200,status,text:async()=>html});

test('an expired saved Steam cookie falls back to the verified public friend profile',async()=>{
 let publicReads=0;const steam={auth:async()=>({steamid:SELF}),ses:{fetch:async()=>response('<div>Sign in to Steam</div>')}};
 const friends=await ownFriends(steam,SELF,{publicFetch:async url=>{assert.equal(url,`https://steamcommunity.com/profiles/${SELF}/friends/?l=english`);publicReads++;return response(friendPage());}});
 assert.equal(publicReads,1);assert.deepEqual(friends.map(friend=>friend.id),[OTHER]);
});
test('valid private friend access does not make a public profile request',async()=>{
 const steam={auth:async()=>({steamid:SELF}),ses:{fetch:async()=>response(friendPage(SELF,false))}};
 const friends=await ownFriends(steam,SELF,{publicFetch:async()=>{assert.fail('Private access already succeeded');}});assert.equal(friends.length,1);
});
test('public fallback rejects the wrong profile and never turns a private profile into an empty roster',async()=>{
 const steam={auth:async()=>({steamid:SELF}),ses:{fetch:async()=>response('<div>Sign in</div>')}};
 for(const html of [friendPage(OTHER),'<div>This profile is private</div>'])await assert.rejects(()=>ownFriends(steam,SELF,{publicFetch:async()=>response(html)}),error=>error.code==='STEAM_WEB_AUTH_REQUIRED'&&/Previous friends were kept/.test(error.message));
});
test('a failed private friend request can recover through the public profile',async()=>{
 const steam={auth:async()=>({steamid:SELF}),ses:{fetch:async()=>response('',503)}};
 assert.equal((await ownFriends(steam,SELF,{publicFetch:async()=>response(friendPage())})).length,1);
});
test('a different Steam Community account is not used to read the connected account friends',async()=>{
 const steam={auth:async()=>({steamid:OTHER}),ses:{fetch:async()=>{assert.fail('Must not read the other account friends');}}};
 assert.equal((await ownFriends(steam,SELF,{publicFetch:async()=>response(friendPage())})).length,1);
});
test('public friends are bound to the requested profile without a companion sign-in',()=>{const html=`<script>g_rgProfileData = {"steamid":"${SELF}"};</script><div class="profile_friends"><div class="friend_block_v2" data-steamid="${OTHER}"><div class="friend_block_content">Alex</div></div></div>`;assert.equal(parseFriends(html,SELF,{publicProfile:true})[0].name,'Alex');assert.throws(()=>parseFriends(html,OTHER,{publicProfile:true}),/requested public friend profile/);assert.throws(()=>parseFriends('<div>This profile is private</div>',SELF,{publicProfile:true}),/Previous friends were kept/);});
test('direct subscriptions are parsed without a collection and hidden unsubscribe templates are ignored',()=>{const result=parseSubscriptions(page([['1'],['2','2567870']]),SELF);assert.equal(result.rows.length,2);assert.equal(result.rows[0].title,'Map & More 1');assert.equal(result.rows[1].appid,'2567870');});
test('pagination is followed, all pages are counted and subscriptions remain grouped by game',async()=>{const pages=[page([['1']],2,2),page([['2','2567870']],2)];const steam={auth:async()=>({steamid:SELF}),ses:{fetch:async()=>({ok:true,text:async()=>pages.shift()})}};const result=await ownSubscriptions(steam,SELF);assert.equal(result.length,2);assert.deepEqual(result.map(x=>x.appid),['311210','2567870']);});
test('sign-in errors, changed markup and incomplete snapshots never become an empty list',()=>{assert.throws(()=>parseSubscriptions(page([['1']]),OTHER),/account changed/);assert.throws(()=>parseSubscriptions(`<script>var g_steamID='${SELF}'</script><div>Unexpected page</div>`,SELF),/recognizable/);assert.throws(()=>parseSubscriptions(page([['1']],2),SELF),/pagination/);});
test('friend parsing uses the owner account and excludes friend-game text from display names',()=>{const html=`<script>g_steamID='${SELF}'</script><div id="search_results"><div class="friend_block_v2" data-steamid="${OTHER}"><div class="friend_block_content">A Friend<br><span class="friend_small_text">A game</span></div></div></div>`;assert.deepEqual(parseFriends(html,SELF).map(x=>({id:x.id,name:x.name})),[{id:OTHER,name:'A Friend'}]);assert.throws(()=>parseFriends(html,OTHER));});
test('subscription caches are read only for the signed-in account, including games not installed',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'workshop-cache-test-'));try{const account=(BigInt(SELF)-76561197960265728n).toString();const dir=path.join(root,'userdata',account,'ugc');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'311210_subscriptions.vdf'),'"subscribedfiles" { "0" { "publishedfileid" "123" "disabled_locally" "0" } "1" { "publishedfileid" "456" "disabled_locally" "1" } "time_last_updated" "1234" "appid" "311210" }');const result=await readSubscriptionCache([root],SELF);assert.deepEqual(result[0].subscribed,['123','456']);assert.deepEqual(result[0].disabled,['456']);assert.deepEqual(await readSubscriptionCache([root],OTHER),[]);assert.deepEqual(await readSubscriptionCache([root],null),[]);}finally{await fs.rm(root,{recursive:true,force:true});}});
test('the folder picker accepts Steam, steamapps, common and game subfolders',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'workshop-path-test-'));try{const nested=path.join(root,'steamapps','common','My Game');await fs.mkdir(nested,{recursive:true});for(const p of [root,path.join(root,'steamapps'),path.join(root,'steamapps','common'),nested])assert.equal(await resolveLibraryRoot(p),root);}finally{await fs.rm(root,{recursive:true,force:true});}});
test('v1 migration preserves chosen items, removes collection sources and opts every game out',()=>{const s=migrate({version:1,games:[{id:'311210',name:'Game',items:[{id:'1'}],installed:['1'],sync:true,sources:[{id:'999'}],autoShare:true,publishId:'999'}]});const g=s.games[0];assert.equal(g.items.length,1);assert.equal(g.sync,false);assert.equal(g.shareList,false);assert.equal(g.shareSubscriptions,false);assert.equal(g.sources,undefined);assert.equal(g.publishId,undefined);});
test('only explicitly shared game lists and subscription IDs are uploaded',()=>{const a={...newGame('311210','Game'),workshop:true,items:[{id:'1'}],subscribedIds:['2']},b={...newGame('2567870','Other'),workshop:true};const s={friends:[{id:OTHER}],games:[a,b]};assert.deepEqual(sharingPayload(s).games,[]);a.shareSubscriptions=true;assert.deepEqual(sharingPayload(s).games[0].curated,[]);assert.deepEqual(sharingPayload(s).games[0].subscriptions,['2']);a.shareSubscriptions=false;a.shareList=true;assert.deepEqual(sharingPayload(s).games[0].subscriptions,[]);assert.deepEqual(sharingPayload(s).games[0].namedLists[0].items,['1']);});
test('switching accounts clears subscription data, friend snapshots, follows, sharing and sync',()=>{const g={...newGame('311210'),sync:true,shareList:true,shareSubscriptions:true,subscribedIds:['1'],subscriptions:[{id:'1'}],following:[{id:OTHER}],friendSnapshots:{[OTHER]:{}}};const s={games:[g],friends:[{id:OTHER}],known:{}};resetAccount(s);assert.deepEqual(g.subscribedIds,[]);assert.deepEqual(g.following,[]);assert.equal(g.sync,false);assert.equal(g.shareSubscriptions,false);assert.deepEqual(s.friends,[]);});
test('connecting friends enables both sharing choices for every Workshop game without enabling downloads',()=>{
 const first={...newGame('311210'),workshop:true,subscribedIds:['1']},second={...newGame('2567870'),workshop:true},unsupported=newGame('999');const s={games:[first,second,unsupported],friends:[]};
 connectSharing(s);assert.equal(s.sharingDefaultsActive,true);
 for(const g of [first,second]){assert.equal(g.shareList,true);assert.equal(g.shareSubscriptions,true);assert.equal(g.sync,false);}
 assert.equal(unsupported.shareSubscriptions,false);assert.equal(sharingPayload(s).games.length,2);
});
test('games verified after connection inherit sharing defaults; unconnected games do not',()=>{
 const s={games:[],friends:[]};const before={...newGame('311210'),workshop:true};s.games.push(before);applySharingDefaults(s);assert.equal(before.shareSubscriptions,false);
 connectSharing(s);const later={...newGame('2567870'),workshop:true};s.games.push(later);applySharingDefaults(s);assert.equal(later.shareSubscriptions,true);assert.equal(later.shareList,true);assert.equal(later.sync,false);
});
test('manual per-game sharing opt-outs survive subsequent refreshes and restarts',()=>{
 const g={...newGame('311210'),workshop:true};const s={version:2,games:[g],friends:[]};connectSharing(s);g.shareList=false;g.shareSubscriptions=false;g.sharingConfigured=true;
 connectSharing(s);assert.equal(g.shareSubscriptions,false);const restored=migrate(JSON.parse(JSON.stringify(s)));applySharingDefaults(restored);assert.equal(restored.games[0].shareList,false);assert.equal(restored.games[0].shareSubscriptions,false);
});
test('disconnecting and account changes clear sharing activation until another successful friend connection',()=>{
 const s={games:[{...newGame('311210'),workshop:true}],friends:[],known:{}};connectSharing(s);disconnectSharing(s);assert.equal(s.sharingDefaultsActive,false);assert.equal(s.games[0].shareSubscriptions,false);applySharingDefaults(s);assert.equal(s.games[0].shareList,false);
 connectSharing(s);resetAccount(s);assert.equal(s.sharingDefaultsActive,false);assert.equal(s.games[0].shareSubscriptions,false);
});
test('one unavailable item does not hide the remaining subscription inventory',async()=>{const steam=new Steam({});steam.request=async()=>({response:{publishedfiledetails:[{result:1,publishedfileid:'1',consumer_app_id:311210,title:'Map'},{result:9,publishedfileid:'2'}]}});const result=await steam.details(['1','2'],false,true);assert.equal(result.length,2);assert.equal(result[1].unavailable,true);await assert.rejects(()=>steam.details(['2']),/unavailable/);});
test('a persistent Steam login identifies the account after restart even when the CSRF cookie is absent',async()=>{
 const steam=new Steam({cookies:{get:async()=>[{name:'steamLoginSecure',value:SELF+'%7C%7Ctest-only'}]}});
 const auth=await steam.auth();assert.equal(auth.steamid,SELF);assert.equal(auth.sessionid,undefined);
});
test('subscription writes refresh a missing CSRF cookie and recheck the account before writing',async()=>{
 let reads=0,writes=0;const steam=new Steam({fetch:async()=>({ok:true})});steam.auth=async()=>({steamid:SELF,sessionid:++reads===1?undefined:'new-test-csrf'});steam.request=async()=>{writes++;return{success:1};};
 await steam.mutate('subscribe',{id:'1',appid:'311210'},SELF);assert.equal(writes,1);
 const changed=new Steam({fetch:async()=>({ok:true})});let calls=0;changed.auth=async()=>++calls===1?{steamid:SELF}:{steamid:OTHER,sessionid:'test'};changed.request=async()=>{throw new Error('Must not write');};await assert.rejects(()=>changed.mutate('subscribe',{id:'1',appid:'311210'},SELF),/account changed/);
});
