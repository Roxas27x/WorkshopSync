const {contextBridge}=require('electron');
const {parseInput}=require('../src/core.cjs');
const FriendItems=require('../src/friend-items.js');
const Themes=require('../src/themes.js');
const ModLists=require('../src/mod-lists.js');
const Privacy=require('../src/item-privacy.js');
const Blacklist=require('../src/auto-sync-blacklist.js'),{ModDeletion}=require('../src/mod-delete.cjs');
const fixtureDelete=new ModDeletion({inspect:async()=>[{bytes:1024}],remove:async()=>1024});
const {newGame,connectSharing}=require('../src/state.cjs');
const icons=require('./fixtures/icons.json');
const SELF='76561198000000001',FRIEND='76561198000000002',SECOND='76561198000000003';
const rows=[{id:'2710538886',appid:'108600',title:'Authentic Z',type:0},{id:'2169435993',appid:'108600',title:'Mod Options',type:0},{id:'2613146550',appid:'108600',title:'Better Sorting',type:0}];
const extra={id:'123456789',appid:'108600',title:'Friend’s extra map',type:0};
const secondExtra={id:'987654321',appid:'108600',title:'Another friend map',type:0};
const games=[{...newGame('108600','Project Zomboid'),workshop:true,subscribedIds:rows.map(x=>x.id),subscriptions:rows,items:[rows[0]],installed:rows.slice(0,2).map(x=>x.id),installedDetails:rows.slice(0,2),subscriptionSource:'Steam account cache',friendSnapshots:{[FRIEND]:{subscriptions:[rows[0],extra],curated:[extra],shareSubscriptions:true,shareList:true,updated:Date.now()}}},{...newGame('294100','RimWorld'),workshop:true}];
games[0].localSizes={[rows[0].id]:536870912,[rows[1].id]:2147483648};rows[2].size=65536;
const unavailable={id:'991',appid:'108600',title:'Unavailable Workshop item 991',type:0,unavailable:true};
const unresolved={id:'992',appid:'108600',title:'Workshop item 992',type:0,placeholder:true};
games[0].subscriptions=[...games[0].subscriptions,unavailable,unresolved];games[0].subscribedIds.push('991','992');games[0].installed.push('991','992');games[0].installedDetails.push(unavailable,unresolved);games[0].friendSnapshots[FRIEND].subscriptions.push(unavailable,unresolved);
for(const g of games)g.icon=icons[g.id];
games[0].friendSnapshots[SECOND]={subscriptions:[rows[0],secondExtra],curated:[],shareSubscriptions:true,shareList:true,updated:Date.now()};
const state={version:2,account:SELF,connected:true,steamAccount:SELF,busy:false,known:{},log:[],games,friends:[{id:FRIEND,name:'Workshop Friend',companion:true,games:[{appid:'108600',share_subscriptions:1,share_list:1,subscription_count:2,list_count:1}]},{id:SECOND,name:'Alex Companion',companion:true,games:[{appid:'108600',share_subscriptions:1,share_list:1,subscription_count:2,list_count:0}]}],relay:{url:'https://sync.test',connected:true,pending:false},detectedRoots:['C:\\Steam'],scanErrors:[],lastScan:new Date().toISOString()};
state.log=[
 {message:'All selected items are already subscribed.',kind:'info',at:new Date().toISOString()},
 {message:'Steam could not verify Workshop support for game 228980. It stays hidden until verified.',kind:'error',at:new Date().toISOString()},
 {message:'Sync service returned HTTP 502.',kind:'error',at:new Date(Date.now()-5000).toISOString()},
 {message:'Sync service returned HTTP 502.',kind:'error',at:new Date().toISOString()},
 {message:'Steam declined a download request.',kind:'error',at:new Date().toISOString()}
];
connectSharing(state);
state.gameSort='played';games[0].lastPlayedAt=Date.now()-86400000;games[1].lastPlayedAt=Date.now()-2*86400000;
state.sharedGameStats=[{appid:'108600',itemCount:3,friendCount:2,expiresAt:Date.now()+86400000},{appid:'294100',itemCount:8,friendCount:1,expiresAt:Date.now()+86400000}];
state.steamWebAuthorized=true;
state.appearance=Themes.normalize();
const now=Date.now(),friendSource=[{kind:'friend',id:FRIEND,name:'Workshop Friend',mode:'curated'}];
games[0].itemHistory={
 [rows[0].id]:{id:rows[0].id,title:rows[0].title,downloadedAt:now-86400000,downloadTimeSource:'folder-created',sources:[],installed:true},
 [rows[1].id]:{id:rows[1].id,title:rows[1].title,requestedAt:now-700000,downloadedAt:now-600000,downloadTimeSource:'observed',sources:friendSource,installed:true,automatic:true}
};
state.activityReviewedAt=now-86400000;state.unreviewedMods=1;
state.modActivity=[{appid:'108600',gameName:'Project Zomboid',id:rows[1].id,title:rows[1].title,type:'downloaded',at:now-600000,observedAt:now-600000,sources:friendSource,automatic:true}];

state.appVersion='0.2.1';state.appUpdates={status:'available',currentVersion:'0.2.1',availableVersion:'0.3.0',notes:'Updates arrive here.',installed:true,publisherAllowed:true};
state.installerUrl='https://workshop-sync-production.up.railway.app/download';
state.installerUrl='https://workshopsync.pages.dev/';
state.friends.push({id:'76561198000000009',name:'Not connected to the app',companion:false,games:[]});
for(const g of games)ModLists.ensure(g);let listNumber=0;
const {InstallReviews,reviewRequired}=require('../src/install-review.cjs');
 const fixtureReviews=new InstallReviews(async ids=>{if(state.qaSlowNextInspection){state.qaSlowNextInspection=false;await new Promise(r=>setTimeout(r,300));}return ids.map(id=>({id,appid:'108600',title:'Reviewed mod '+id,type:0,pageDetails:true,required:id==='772'?[{id:'774',title:'Required library'}]:id==='774'?[{id:'776',title:'Nested required library'}]:id==='775'?[{id:'777',title:'Optional dependency'}]:[],relatedItems:id==='772'?[{id:'775',title:'Optional visuals',kind:'optional'}]:[],compatibilityNotes:id==='776'?['Nested library instructions.']:id==='777'?['Optional dependency instructions.']:id==='772'?['Optional visuals are recommended. Check compatibility with other addons.']:id==='779'?['Do not use this mod with another texture overhaul.']:[],...(id==='781'?require('../src/mod-relations.cjs').analyzeDescription(require('../src/workshop-details.cjs').bbcodeDescription('---Recommended Mods---\nNew Screen Blood Effects:\nhttps://steamcommunity.com/sharedfiles/filedetails/?id=710194284\n\nDynamic Lights:\nhttps://steamcommunity.com/sharedfiles/filedetails/?id=2261165699'),id):{})}));});
 const listeners=[];
contextBridge.exposeInMainWorld('workshop',{
 onState:cb=>listeners.push(cb),
 action:async(type,p={})=>{
  try{
   const g=games.find(x=>x.id===p.game);let data;
   if(type==='prepareDeleteMods')data=await fixtureDelete.prepare(g,p.ids,[],SELF);
   else if(type==='deleteMods')data=await fixtureDelete.confirm(g,p,SELF,{unsubscribe:async pid=>{state.deletedIds||=[];state.deletedIds.push(pid);},save:async()=>{}});
   else if(type==='blacklistMods')Blacklist.block(g,p.ids.map(id=>g.subscriptions.find(row=>row.id===id)||{id,title:'Sample blocked mod'}));
   else if(type==='allowAutoSync')Blacklist.allow(g,p.ids);
   else if(type==='qaSteamResubscribe'){g.subscribedIds=Blacklist.observe(g,[...g.subscribedIds,p.id],{authoritative:true,checkedAt:Date.now()+3000});g.subscriptions.push({id:p.id,appid:g.id,title:'Reinstalled mod',type:0});}
   else if(type==='qaAutomaticCandidates')data=require('../src/core.cjs').eligible(p.ids.map(id=>({id,appid:g.id,type:0})),{...g,sync:true});
   else if(type==='qaEnableInstallReviews')state.qaInstallReviews=true;
   else if(type==='qaExpireNextInstall')state.qaExpireNextInstall=true;
   else if(type==='authorizeSteam')state.steamWebAuthorized=true;
   else if(type==='qaSlowNextInspection')state.qaSlowNextInspection=true;
   else if(type==='qaQueueReview'){games[0].pendingReviewIds=['779'];}
   else if(type==='installModFromDetails'){const review=await fixtureReviews.createIfNeeded({game:'108600',account:SELF,rows:[{id:p.id,appid:'108600',title:'Reviewed mod '+p.id,type:0}],privacy:p.privacy,subscribed:games[0].subscribedIds});if(review)throw reviewRequired(review);const g=games[0];g.subscribedIds.push(p.id);g.subscriptions.push({id:p.id,appid:g.id,title:'Reviewed mod '+p.id,type:0});Privacy.set(g,[p.id],p.privacy==='private');data={requested:1};}
   else if(type==='reviewPendingMods'){const review=await fixtureReviews.create({game:'108600',account:SELF,rows:[{id:'779',appid:'108600',title:'Queued mod',type:0}],subscribed:games[0].subscribedIds});throw reviewRequired(review);}
   else if(type==='confirmModReview'){if(state.qaExpireNextInstall){state.qaExpireNextInstall=false;state.steamWebAuthorized=false;const error=Error('Steam download authorization expired.');error.code='STEAM_WEB_AUTH_REQUIRED';throw error;}const checked=await fixtureReviews.confirm(p,SELF);if(checked.review)throw reviewRequired(checked.review);const g=games[0];for(const row of checked.rows)if(!g.subscribedIds.includes(row.id)){g.subscribedIds.push(row.id);g.subscriptions.push(row);}if(checked.ticket.privacy==='private')Privacy.set(g,checked.ids,true);g.pendingReviewIds=(g.pendingReviewIds||[]).filter(id=>!checked.ids.includes(id));state.lastReviewedInstall={ids:checked.ids,privacy:checked.ticket.privacy};fixtureReviews.consume(p.token);data={requested:checked.ids.length};}
   else if(type==='itemDetails'){state.lastDetailRequest=p.id;await new Promise(r=>setTimeout(r,p.id==='991191'?300:10));data={id:p.id,appid:'108600',title:rows.find(row=>row.id===p.id)?.title||'Workshop mod details',creator:SELF,authors:[{name:'Sample mod author',url:'https://steamcommunity.com/id/sample'}],images:[icons['108600'],icons['294100']],descriptionHtml:require('../src/workshop-details.cjs').sanitizeDescription('<h1>About this mod</h1><p>Complete mod description with setup instructions.</p><a href="https://example.com/instructions">Read the instructions</a><p>Optional addons: <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=772">Optional linked mod</a></p><p>Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. Long description text. </p>'),created:1700000000,updated:1700000010,size:100000,subscribers:100,favorites:20,tags:['Map','Multiplayer'],required:[{id:'991191',title:'Required sample mod'}],pageDetails:true,url:'https://steamcommunity.com/sharedfiles/filedetails/?id='+p.id};}
   else if(type==='openItemPage')state.lastOpenedItemPage=p.id;
   else if(type==='openModLink')state.lastOpenedModLink=p.url;
   else if(type==='workshopSearch'){state.workshopRequests||=[];state.workshopRequests.push({...p});await new Promise(r=>setTimeout(r,p.query==='slow'||p.game==='294100'&&!p.query?250:10));data={appid:p.game,query:p.query,sort:p.sort,tag:p.tag||'',categoryGroups:[{name:'Types',tags:(p.game==='108600'?['Map','Mod','Skin']:['Scenario','Building']).map(value=>({value,label:value}))}],page:p.page,pages:2,total:31,rows:[{id:p.page===2?'772':'771',appid:p.game,title:'Workshop result '+p.query,description:'A sample Workshop mod.',image:'',subscribers:100,type:0}]};}
   else if(type==='workshopInstall'){Blacklist.allow(g,p.ids);if(p.privacy==='shared'&&(!g.shareSubscriptions||g.sharingAudience.mode==='private'))throw Error('Sharing is off');Privacy.set(g,p.ids,p.privacy==='private');for(const id of p.ids)if(!g.subscribedIds.includes(id)){g.subscribedIds.push(id);g.subscriptions.push({id,appid:g.id,title:'Workshop result',type:0});}state.lastWorkshopInstall={privacy:p.privacy,ids:p.ids};data={requested:1};}
   else if(type==='appearance')state.appearance=Themes.normalize(p);
   else if(type==='gameSort')state.gameSort=p.value;
   else if(type==='toggle'){if(p.value&&!state.steamWebAuthorized)throw Object.assign(new Error('Authorize downloads first.'),{code:'STEAM_WEB_AUTH_REQUIRED'});g.sync=p.value;}
   else if(type==='reviewActivity'){state.unreviewedMods=0;for(const g of games)g.activityReviewedAt=Date.now();}
   else if(type==='qaDisconnect'){state.connected=false;state.relay.connected=false;}
   else if(type==='connect'){state.relay.pending=true;state.connection={phase:'waiting'};setTimeout(()=>{state.connected=true;state.relay.connected=true;state.relay.pending=false;state.steamWebAuthorized=false;state.connection={phase:'connected'};for(const listener of listeners)listener(structuredClone(state));},150);}
   else if(type==='qaAuthorize')state.steamWebAuthorized=true;
   else if(type==='copyInstallerLink')data={url:state.installerUrl};
   else if(type==='updateCheck')state.appUpdates.status='available';
   else if(type==='updateDownload')state.appUpdates.status='ready';
   else if(type==='updateInstall')state.appUpdates.status='installing';
   else if(type==='qaUpdateCurrent')state.appUpdates.status='current';
   else if(type==='import')parseInput(p.text);
   else if(type==='listCreate'){data={listId:'list-'+(++listNumber)};ModLists.create(g,data.listId,p.name);}
   else if(type==='listRename')ModLists.rename(g,p.listId,p.name);
   else if(type==='listDelete')ModLists.remove(g,p.listId);
   else if(type==='listShare'){ModLists.get(g,p.listId).audience=p.audience;g.shareList=true;}
   else if(type==='listSync')ModLists.get(g,p.listId).sync=p.value;
   else if(type==='followFriends')g.following=[...g.following.filter(f=>f.mode!==p.mode),...p.friendIds.map(id=>({id,mode:p.mode,...(p.sourceList?{listId:p.sourceList.listId}:{})}))];
   else if(type==='share'){if(p.audience)g.sharingAudience=p.audience;g.shareList=p.shareList;g.shareSubscriptions=p.shareSubscriptions;g.sharingConfigured=true;}
   else if(type==='follow')g.following=p.value?[{id:p.id,mode:p.mode}]:[];
   else if(type==='friendItems')g.friendItemsCheckedAt=Date.now();
   else if(type==='refreshLibrary')state.refreshStages=['local-cache','steam-subscriptions','steam-metadata'];
   else if(type==='installFriendMods'){const rows=FriendItems.installable(g,state.friends,p).filter(row=>!g.subscribedIds.includes(row.id));state.lastBatch={peer:p.peer,mode:p.mode,ids:rows.map(r=>r.id)};for(const row of rows){g.subscribedIds.push(row.id);g.subscriptions.push(row);}data={requested:rows.length,canceled:false};}
   else if(type==='qaStartBatch'){state.busy=true;state.installBatch={game:'108600',total:10,completed:2,stopping:false};}
   else if(type==='stopInstallBatch')state.installBatch.stopping=true;
   else if(type==='qaThirdFriend'){g.friendSnapshots[FRIEND].subscriptions.push({id:'88990011',appid:g.id,title:'Group A fresh mod',type:0});g.friendSnapshots[SECOND].subscriptions.push({id:'88990022',appid:g.id,title:'Group B fresh mod',type:0});const id='76561198000000004';state.friends.push({id,name:'Third Companion',companion:true,games:[{appid:'108600',share_subscriptions:1,share_list:1,subscription_count:1,list_count:1}]});g.friendSnapshots[id]={updated:Date.now(),subscriptions:[{id:'99887766',appid:g.id,title:'Third friend exclusive',type:0}],curated:[],shareSubscriptions:true,shareList:true,namedLists:[]};for(const snapshot of Object.values(g.friendSnapshots))if(!snapshot.namedLists)snapshot.namedLists=[{id:'default',name:'Friday mods',items:snapshot.curated}];}
   else if(type==='qaFinishBatch'){state.busy=false;state.installBatch=null;}

   else if(type==='subscribe'){for(const row of Object.values(g.friendSnapshots).flatMap(s=>s.subscriptions))if(p.ids.includes(row.id)&&!g.subscribedIds.includes(row.id)){g.subscribedIds.push(row.id);g.subscriptions.push(row);}}
   else if(type==='peer')data=g.friendSnapshots[p.id];
   else if(type==='adopt'){const destination=p.newListName?ModLists.create(g,'list-'+(++listNumber),p.newListName):ModLists.get(g,p.targetListId);const available=p.workshop?p.ids.map(id=>({id,appid:g.id,title:'Workshop result',type:0})):p.peer?FriendItems.selected(g,state.friends,p):[...g.subscriptions,...g.installedDetails];for(const row of available)if(p.ids.includes(row.id)&&!destination.items.some(x=>x.id===row.id))destination.items.push(row);ModLists.legacy(g);}
   
   if(type!=='state')for(const listener of listeners)listener(structuredClone(state));
   return{ok:true,data:data||structuredClone(state)};
  }catch(e){return{ok:false,error:e.message,code:e.code,review:e.review};}
 }
});
