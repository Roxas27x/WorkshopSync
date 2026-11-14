const {app,BrowserWindow,ipcMain,session,dialog,Menu,safeStorage,clipboard,shell}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {parseInput,id,gameId,eligible}=require('./core.cjs');
const {Steam,scanLibraries,resolveLibraryRoot,delay}=require('./steam.cjs');
const {ownSubscriptions,ownFriends}=require('./community.cjs');
const {storeInfo,gameIcon,visibleGames,confirmedWorkshop}=require('./catalog.cjs');
const {newGame,migrate,sharingPayload,resetAccount,applySharingDefaults,connectSharing,disconnectSharing}=require('./state.cjs');
const {Relay,origin}=require('./relay.cjs');
const {selectIdentity,assertSameAccount}=require('./identity.cjs');
const FriendItems=require('./friend-items.js');
const AppLog=require('./app-log.js');
const GameLibrary=require('./game-library.js');
const Themes=require('./themes.js');
const ModLists=require('./mod-lists.js');
const ItemPrivacy=require('./item-privacy.js');
const {WorkshopSearch,searchOptions,searchUrl}=require('./workshop-search.cjs');
const workshopSearch=new WorkshopSearch();
const Blacklist=require('./auto-sync-blacklist.js'),{ModDeletion}=require('./mod-delete.cjs');
const modDeletion=new ModDeletion();
const {WorkshopDetails,externalUrl}=require('./workshop-details.cjs');
const workshopDetails=new WorkshopDetails((url,body)=>steam.request(url,body),(url,options)=>steamWebAccount&&steamWebAccount===steamAccount?steam.ses.fetch(url,options):fetch(url,options));
const {installWorkshop}=require('./workshop-install.cjs');
const {InstallReviews,reviewRequired}=require('./install-review.cjs');
const installReviews=new InstallReviews((ids,progress)=>workshopDetails.inspectMany(ids,progress));
const reviewProgress=(count,total)=>{state.progress=`Checking mod notes: ${count} / ${total}`;emit();};
async function prepareInstallReview(g,rows,privacy='existing',automatic=false){const candidates=rows.filter(row=>!g.subscribedIds.includes(row.id));if(!candidates.length)return null;return installReviews.createIfNeeded({game:g.id,account:state.account,rows:candidates,privacy,automatic,subscribed:g.subscribedIds},reviewProgress);}
const {randomUUID}=require('node:crypto');
const {sourcesFor,mergeSources,recordRequest,observeDownloads,pendingFriendItems}=require('./activity.cjs');
const {AppUpdates}=require('./app-updates.cjs');
const updateConfig=require('./update-config.json');
const brand=require('./brand-config.json');
const appIcon=path.join(__dirname,'assets','workshopsync.png');
const installerUrl=brand.websiteUrl;
const serviceConfig=require('./service-config.json');
// Preserve the protected-storage identity and existing profile through the visible rebrand.
app.setName('Workshop Link');
if(process.platform==='win32')app.setAppUserModelId('com.workshoplink.companion');
app.setPath('userData',process.env.WORKSHOP_LINK_TEST_DATA||path.join(app.getPath('appData'),'Workshop Link'));
app.setPath('sessionData',app.getPath('userData'));
let localPlayHistory={},state,steam,relay,updates,main,steamWindow,installBatch=null,steamAccount=null,steamWebAccount=null,connectionError='',busy=false,tickDue=false,saving=Promise.resolve(),scanAt=0,polling=false;
const file=()=>path.join(app.getPath('userData'),'lists.json');
function save(){const value=JSON.stringify(state,null,2);saving=saving.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(file()),{recursive:true});await fs.writeFile(file()+'.tmp',value);await fs.rename(file()+'.tmp',file());});return saving;}
function log(message,kind='info',details={}){state.log=AppLog.append(state.log,{message,kind,at:new Date().toISOString(),...details});}
function game(value){const g=state.games.find(g=>g.id===gameId(value)&&g.workshop);if(!g)throw new Error('Choose a Workshop-enabled game.');return g;}
function ensureGame(value,name){const gid=gameId(value);let g=state.games.find(x=>x.id===gid);if(!g){g={...newGame(gid,name),lastPlayedAt:localPlayHistory[gid]||null};state.games.push(g);}return g;}
function snapshot(){
 const linked=!!(steamAccount&&relay.verified&&relay.token&&relay.steamid===steamAccount);
 return {...state,installBatch:installBatch?{...installBatch}:null,games:visibleGames(state.games).map(g=>steamAccount?g:{...g,lastPlayedAt:null,subscriptions:[],subscribedIds:[],friendSnapshots:{},itemHistory:{},items:g.items.map(({addedBy,...item})=>item)}),sharedGameStats:linked?state.sharedGameStats:[],modActivity:steamAccount?state.modActivity:[],unreviewedMods:steamAccount?pendingFriendItems(state):0,friends:steamAccount?state.friends:[],connected:!!steamAccount,steamAccount,steamWebAuthorized:!!steamAccount&&steamWebAccount===steamAccount,connection:{phase:relay.pending?'waiting':linked?'connected':'idle',error:connectionError},busy,relay:{...state.relay,connected:linked,pending:!!relay.pending},appUpdates:updates?.snapshot()||{},appVersion:app.getVersion(),installerUrl,version:5};
}
function emit(){if(main&&!main.isDestroyed())main.webContents.send('state',snapshot());}
async function account(){
 const auth=await steam.auth();const selected=selectIdentity(auth,relay);steamWebAccount=auth?.steamid||null;steamAccount=selected?.steamid||null;
 if(steamAccount&&state.account!==steamAccount){resetAccount(state);localPlayHistory={};if(relay.steamid&&relay.steamid!==steamAccount)await relay.forget();state.account=steamAccount;log('Steam account changed. Sharing and synchronization are off for every game.');await save();}
 return selected;
}
async function verifyGame(g){
 if(g.id==='241100'){g.workshop=false;g.sync=false;g.shareList=false;g.shareSubscriptions=false;return false;}
 if(!g.catalogAt||Date.now()-g.catalogAt>7*86400000||(!g.workshop&&!g.catalogV2&&(g.subscribedIds.length||g.items.length))){
  const info=await storeInfo(g.id);let proof;const proofId=g.subscribedIds[0]||g.installed[0]||g.items[0]?.id||g.workshopProof;
  if(!info.workshop&&info.kind==='game'&&proofId){try{[proof]=await steam.details([proofId]);}catch(e){log(e.message,'error');}}
  g.workshop=confirmedWorkshop(info,proof,g.id);g.name=info.name;g.catalogAt=info.checkedAt;g.catalogV2=true;
  if(!g.workshop){g.sync=false;g.shareList=false;g.shareSubscriptions=false;}
 }
 if(g.workshop&&!g.icon){try{g.icon=await gameIcon(g.id,state.detectedRoots);}catch(e){log(e.message,'error');}}
 applySharingDefaults(state);
 return g.workshop;
}
async function hydrate(g,force=false){
 const all=[...new Set([...g.subscribedIds,...g.installed,...ModLists.allItems(g).map(x=>x.id)])];const existing=new Map([...(g.subscriptions||[]),...(g.installedDetails||[]),...ModLists.allItems(g)].map(x=>[x.id,x]));
 const missing=all.filter(x=>force||!existing.has(x)||existing.get(x).placeholder);
 if(missing.length){for(const row of await steam.details(missing,force,true))existing.set(row.id,row.unavailable?{...row,appid:g.id}:row);}
 const rowFor=pid=>existing.get(pid)||{id:pid,appid:g.id,title:`Workshop item ${pid}`,type:0,placeholder:true};
 g.subscriptions=g.subscribedIds.map(rowFor).filter(x=>x.appid===g.id);g.installedDetails=g.installed.map(rowFor).filter(x=>x.appid===g.id);
 for(const list of ModLists.ensure(g))list.items=list.items.map(item=>({...item,...rowFor(item.id),addedBy:item.addedBy,addedAt:item.addedAt}));ModLists.legacy(g);
}
async function scan({quiet=false}={}){
 const before=AppLog.scanFingerprint(state.games);
 const auth=await account();const result=await scanLibraries(state.extraRoots,auth?.steamid);
 if(auth&&result.playHistory)localPlayHistory=result.playHistory;else if(!auth)localPlayHistory={};
 state.detectedRoots=result.roots;state.scanErrors=result.errors;state.lastScan=new Date().toISOString();scanAt=Date.now();
 if(result.roots.length){
  for(const g of state.games){g.installed=[];g.localSizes={};}
  for(const found of result.games){
   const g=ensureGame(found.id,found.name);g.installed=found.installed;g.localSizes={};for(const local of found.localFiles||[]){if(local.bytes===null)g.localSizes[local.id]=null;else if(g.localSizes[local.id]!==null)g.localSizes[local.id]=(g.localSizes[local.id]||0)+local.bytes;}
   if(auth&&Array.isArray(found.subscribed)&&(!g.webObservedAt||found.cachedAt>=g.webObservedAt)){
    g.subscribedIds=Blacklist.observe(g,found.subscribed,{checkedAt:found.cachedAt,subscriptionTimes:found.subscriptionTimes||{}});g.blacklistNeedsVerification=Blacklist.needsVerification(g,found.subscribed,found.cachedAt);g.subscriptionTimes=found.subscriptionTimes||{};g.disabledIds=found.disabled;g.subscriptionSource='Steam account cache';g.subscriptionsObservedAt=found.cachedAt;
   }
  }
 }
 for(const g of state.games)g.lastPlayedAt=auth?(localPlayHistory[g.id]||g.lastPlayedAt||null):null;
 state.verifyingGames=true;emit();
 try{for(const g of state.games){const stale=!g.catalogAt;try{await verifyGame(g);}catch(e){log(e.message,'error');}emit();if(stale)await delay(200);}}
 finally{state.verifyingGames=false;}
 for(const g of visibleGames(state.games)){
  try{await hydrate(g);}catch(e){log(`${g.name}: ${e.message}`,'error');g.subscriptions=g.subscribedIds.map(pid=>g.subscriptions.find(x=>x.id===pid)||{id:pid,appid:g.id,title:`Workshop item ${pid}`,type:0,placeholder:true});}
 }
 for(const g of state.games){const local=result.games.find(x=>x.id===g.id);if(local)observeDownloads(state,g,local.localFiles||[],{baseline:!state.historyStartedAt,reliable:!result.errors.length});}
 if(result.roots.length&&!result.errors.length)state.historyStartedAt ||= Date.now();
 const changed=before!==AppLog.scanFingerprint(state.games);
 if(!quiet||changed)log(`Found ${visibleGames(state.games).reduce((n,g)=>n+g.subscribedIds.length,0)} account subscriptions and ${visibleGames(state.games).reduce((n,g)=>n+g.installed.length,0)} downloaded items across ${result.roots.length} Steam libraries.`,'success',{category:'scan',routine:!changed});
 result.errors.forEach(e=>log(e,'error',{category:'scan',routine:false}));await save();emit();return result;
}
async function refreshWeb(){
 const startedAt=Date.now();
 const before=AppLog.scanFingerprint(state.games);
 const auth=await account();if(!auth)throw new Error('Connect Steam first.');requireCommunity();
 const rows=(await ownSubscriptions(steam,auth.steamid,(count,total)=>{state.progress=`Reading subscriptions: ${count}${total===null?'':` / ${total}`}`;emit();})).map(row=>({...row,placeholder:true}));
 const grouped=new Map();for(const row of rows){if(!grouped.has(row.appid))grouped.set(row.appid,[]);grouped.get(row.appid).push(row);}
 for(const row of rows){const g=ensureGame(row.appid,row.gameName);if(!g.workshop){g.items ||= [];g.subscribedIds=grouped.get(row.appid).map(x=>x.id);g.catalogAt=0;await verifyGame(g);}}
 const now=Date.now();
 for(const g of state.games){const observed=grouped.get(g.id)||[];g.subscribedIds=Blacklist.observe(g,observed.map(row=>row.id),{checkedAt:startedAt,authoritative:true});g.subscriptions=observed.filter(row=>g.subscribedIds.includes(row.id));g.blacklistNeedsVerification=false;g.webObservedAt=now;g.subscriptionsObservedAt=now;g.subscriptionSource='Signed-in Steam';}
 log(`Read ${rows.length} subscriptions directly from Steam. Collections and favorites were not used.`,'success',{category:'scan',routine:before===AppLog.scanFingerprint(state.games)});state.progress='';await save();
}
async function refreshLibrary(){
 await scan({quiet:true});
 const auth=await account();if(!auth){const error=new Error('Connect Steam & friends to reload live Steam subscriptions. The local scan has completed.');error.code='STEAM_IDENTITY_REQUIRED';throw error;}
 await refreshWeb();
 for(const g of visibleGames(state.games)){state.progress=`Refreshing Steam details: ${g.name}`;emit();await hydrate(g,true);const metadata=new Map([...g.subscriptions,...g.installedDetails,...g.items].map(row=>[row.id,row]));for(const snapshot of Object.values(g.friendSnapshots))for(const mode of ['curated','subscriptions'])snapshot[mode]=snapshot[mode].map(row=>metadata.get(row.id)||row);}
 await save();emit();
}
function allowed(raw){try{const u=new URL(raw);return u.protocol==='https:'&&['steamcommunity.com','store.steampowered.com','login.steampowered.com','help.steampowered.com'].includes(u.hostname)||(relay.url&&u.origin===origin(relay.url));}catch{return false;}}
function openSteam(url='https://steamcommunity.com/login/home/'){
 if(!allowed(url))throw new Error('Unsupported sign-in destination.');
 if(steamWindow&&!steamWindow.isDestroyed()){steamWindow.loadURL(url);steamWindow.show();return;}
 steamWindow=new BrowserWindow({title:'Steam — WorkshopSync',icon:appIcon,width:1080,height:820,autoHideMenuBar:true,webPreferences:{partition:'persist:steam',nodeIntegration:false,contextIsolation:true,sandbox:true}});
 steamWindow.webContents.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault();});steamWindow.webContents.on('will-redirect',(e,url)=>{if(!allowed(url))e.preventDefault();});
 steamWindow.webContents.setWindowOpenHandler(({url})=>{if(allowed(url))steamWindow.loadURL(url);return{action:'deny'};});
 steamWindow.webContents.on('did-finish-load',()=>account().then(emit).catch(()=>{}));steamWindow.on('closed',()=>{steamWindow=null;account().then(emit).catch(()=>{});});steamWindow.loadURL(url);
}
function requireCommunity(){if(!steamAccount||steamWebAccount!==steamAccount){const error=new Error('Authorize Steam Community access to read private subscriptions or subscribe to Workshop items.');error.code='STEAM_WEB_AUTH_REQUIRED';throw error;}}
async function beginConnection(){
 connectionError='';
 if(relay.token&&!relay.verified){try{await relay.verifyIdentity();}catch(error){if(error.status===401)await relay.forget();else throw error;}}
 await account();if(relay.verified&&relay.steamid===steamAccount){emit();return;}
 const url=relay.pending&&relay.pending.expires>Date.now()?relay.pending.loginUrl:await relay.begin(steamAccount||state.account||null);
 const target=new URL(url);if(target.origin!==origin(relay.url)||target.pathname!=='/auth/steam')throw new Error('Invalid Steam confirmation destination.');
 await shell.openExternal(url);log('Confirm Steam in your browser. Friend sharing will connect automatically afterward.');emit();
}
async function refreshPeer(g,peer){
 if(!/^765\d{14}$/.test(peer))throw new Error('Invalid Steam friend.');
 try{
  const data=await relay.request(`/v1/friends/${peer}/${g.id}`);const ids=[...new Set([...data.curated,...data.subscriptions,...(data.namedLists||[]).flatMap(list=>list.items)])];
  const details=await steam.details(ids,false,true);const valid=new Map(details.filter(x=>x.appid===g.id||x.unavailable).map(x=>[x.id,{...x,appid:g.id}]));
  const snap={...data,curated:data.curated.map(x=>valid.get(x)).filter(Boolean),subscriptions:data.subscriptions.map(x=>valid.get(x)).filter(Boolean),namedLists:data.namedLists?.map(list=>({...list,items:list.items.map(pid=>valid.get(pid)).filter(Boolean)})),checkedAt:Date.now()};g.friendSnapshots[peer]=snap;return snap;
 }catch(e){if(e.status===403||e.status===404)delete g.friendSnapshots[peer];throw e;}
}
async function refreshGameFriends(g,{refreshSteamFriends=false}={}){
 try{
  g.friendItemsError='';await updateService({refreshSteamFriends});
  const snapshots={};let after=null;const visited=new Set();
  do{
   const page=await relay.request(`/v1/games/${g.id}/friends${after?'?after='+after:''}`);
   if(!Array.isArray(page.friends)||page.friends.length>50)throw new Error('The service returned an invalid friend page.');
   for(const snapshot of page.friends){if(snapshot.appid!==g.id||!state.friends.some(f=>f.id===snapshot.steamid))throw new Error('A shared list belongs to an unexpected game or friend.');snapshots[snapshot.steamid]=snapshot;}
   after=page.next;if(after&&(!/^765\d{14}$/.test(after)||visited.has(after)))throw new Error('The service returned an invalid friend cursor.');if(after)visited.add(after);
  }while(after);
  const known=new Map([...g.subscriptions,...(g.installedDetails||[]),...ModLists.allItems(g),...Object.values(g.friendSnapshots).flatMap(s=>[...s.curated,...s.subscriptions])].map(row=>[row.id,row]));
  const allIds=new Set();for(const snapshot of Object.values(snapshots))for(const mode of ['curated','subscriptions']){if(!Array.isArray(snapshot[mode])||snapshot[mode].length>5000)throw new Error('A shared list is invalid.');for(const item of snapshot[mode])allIds.add(id(item));}
  g.friendSnapshots=Object.fromEntries(Object.entries(snapshots).map(([peer,snapshot])=>[peer,{...snapshot,checkedAt:Date.now(),curated:snapshot.curated.map(pid=>known.get(pid)||{id:pid,appid:g.id,title:`Workshop item ${pid}`,type:0,placeholder:true}),subscriptions:snapshot.subscriptions.map(pid=>known.get(pid)||{id:pid,appid:g.id,title:`Workshop item ${pid}`,type:0,placeholder:true}),namedLists:snapshot.namedLists?.map(list=>({...list,items:list.items.map(pid=>known.get(pid)||{id:pid,appid:g.id,title:`Workshop item ${pid}`,type:0,placeholder:true})}))}]));
  g.friendItemsCheckedAt=Date.now();emit();
  const ids=[...allIds].filter(pid=>refreshSteamFriends||!known.has(pid)||known.get(pid).placeholder);for(let offset=0;offset<ids.length;offset+=100){
   state.progress=`Reading friends’ mod names: ${Math.min(offset+100,ids.length)} / ${ids.length}`;emit();
   try{const rows=await steam.details(ids.slice(offset,offset+100),refreshSteamFriends,true);for(const row of rows)known.set(row.id,row.unavailable?{...row,appid:g.id}:row);}
   catch(error){g.friendItemsError=`Some mod names could not be refreshed: ${error.message}`;break;}
   for(const snapshot of Object.values(g.friendSnapshots)){for(const mode of ['curated','subscriptions'])snapshot[mode]=snapshot[mode].map(row=>known.get(row.id)||row).filter(row=>row.appid===g.id&&row.type!==2);for(const list of snapshot.namedLists||[])list.items=list.items.map(row=>known.get(row.id)||row).filter(row=>row.appid===g.id&&row.type!==2);}
   emit();if(offset+100<ids.length)await delay(600);
  }
  await save();return snapshot();
 }catch(error){g.friendItemsError=error.message;throw error;}finally{state.progress='';}
}
async function updateService({refreshSteamFriends=false}={}){
 const auth=await account();if(!auth||!relay.token||relay.steamid!==auth.steamid)throw new Error('Connect companion friend sharing first.');
 connectSharing(state);
 let refreshable=true;
 if(refreshSteamFriends||!state.friendsCheckedAt||Date.now()-state.friendsCheckedAt>10*60000){try{state.friends=await ownFriends(steam,auth.steamid);state.friendsCheckedAt=Date.now();state.friendReadError='';}catch(error){state.friendReadError=error.message;refreshable=!state.friends.length;}}
 const capabilities=await relay.request('/v1/health',{token:null});if(capabilities.sharingVersion!==2||capabilities.privateItemsVersion!==1)throw new Error('The sync service needs an update before private subscriptions can be protected.');
 const payload=sharingPayload(state);if(!refreshable){payload.friends=[];payload.games=[];}
 await relay.request('/v1/profile',{method:'PUT',body:payload});
 const registered=await relay.request('/v1/friends');state.sharedGameStats=Array.isArray(registered.sharedGameStats)?registered.sharedGameStats:[];const lookup=new Map(registered.friends.map(x=>[x.steamid,x]));
 state.friends=state.friends.map(f=>({...f,companion:lookup.has(f.id),games:lookup.get(f.id)?.games||[]}));
 for(const friend of registered.friends)for(const shared of friend.games){
  const g=ensureGame(shared.appid,shared.name);
  if(!g.workshop){
   try{
    if(!await verifyGame(g)&&(shared.list_count||shared.subscription_count)){
     const bundle=await relay.request(`/v1/friends/${friend.steamid}/${g.id}`);g.workshopProof=bundle.curated[0]||bundle.subscriptions[0];g.catalogAt=0;await verifyGame(g);
    }
   }catch(e){log(e.message,'error');}
  }
 }
 for(const g of state.games)for(const peer of Object.keys(g.friendSnapshots))if(!lookup.has(peer))delete g.friendSnapshots[peer];
 state.relay.lastUpdated=Date.now();await save();return registered;
}
async function subscribe(g,rows,{automatic=false,reviewedIds=null}={}){
 if(automatic&&!g.sync)throw new Error('Enable synchronization for this game first.');const expectedAccount=state.account;const auth=await account();if(!auth)throw new Error('Connect Steam first.');assertSameAccount(expectedAccount,auth.steamid);requireCommunity();if(automatic&&!g.sync)throw new Error('Account changed. Enable this game again.');
 const ids=[...new Set(rows.map(x=>id(x.id)))];const details=await steam.details(ids,true,true);
 if(details.some(x=>!x.unavailable&&(x.appid!==g.id||x.type===2)))throw new Error('A selected item does not belong to this game. No subscriptions were changed.');
 const verified=details.filter(x=>!x.unavailable);g.pendingReviewIds=(g.pendingReviewIds||[]).filter(pid=>!ids.includes(pid)||verified.some(row=>row.id===pid));if(verified.length!==details.length)log(`Skipped ${details.length-verified.length} unavailable Workshop items.`,'warning',{category:'download',game:g.id,routine:false});
 const pending=state.known[auth.steamid]||{};const known=Object.fromEntries(Object.entries(pending).filter(([,at])=>Date.now()-Number(at)<10*60000));for(const pid of g.subscribedIds)known[pid]=true;
 const todo=eligible(verified,automatic?g:{...g,sync:true,autoSyncBlacklist:[]},known,[]);let count=0,canceled=false;
 if(todo.length&&(!reviewedIds||todo.some(row=>!reviewedIds.has(row.id)))){
  if(automatic&&g.pendingReviewIds?.length){g.pendingReviewIds=[...new Set([...g.pendingReviewIds,...todo.map(row=>row.id)])];await save();emit();return{requested:0,reviewPending:true};}
  let review;try{review=await prepareInstallReview(g,todo.map(row=>({...row,installSources:mergeSources(rows.filter(candidate=>candidate.id===row.id))})),'existing',automatic);}catch(error){if(!automatic)throw error;g.pendingReviewIds=todo.map(row=>row.id);await save();emit();return{requested:0,reviewPending:true};}
  if(automatic){if(review?.requiresReview){installReviews.consume(review.token);g.pendingReviewIds=todo.map(row=>row.id);await save();emit();return{requested:0,reviewPending:true};}if(review)installReviews.consume(review.token);}
  else if(review)throw reviewRequired(review);
 }
 if(todo.length)installBatch={game:g.id,total:todo.length,completed:0,stopping:false};
 try{for(const row of todo){if(installBatch?.stopping){canceled=true;break;}if(automatic&&!g.sync)break;state.progress=`Installing mods: ${count+1} / ${todo.length}`;emit();await steam.mutate('subscribe',{id:row.id,appid:g.id},auth.steamid);if(!automatic)Blacklist.allow(g,[row.id]);recordRequest(state,g,row,{sources:mergeSources(rows.filter(x=>x.id===row.id)).length?mergeSources(rows.filter(x=>x.id===row.id)):sourcesFor(state),automatic});state.known[auth.steamid]||={};state.known[auth.steamid][row.id]=Date.now();if(!g.subscribedIds.includes(row.id))g.subscribedIds.push(row.id);if(!g.subscriptions.some(x=>x.id===row.id))g.subscriptions.push(row);count++;g.pendingReviewIds=(g.pendingReviewIds||[]).filter(pid=>pid!==row.id);installBatch.completed=count;log(`Subscribed: ${row.title}.`,'success');await save();emit();await delay(1000);}}
 finally{if(installBatch?.stopping)canceled=count<todo.length;installBatch=null;state.progress='';emit();}
 if(canceled)log('Stopped the remaining Workshop requests in this batch.','info',{category:'download',game:g.id,routine:false});
 if(!automatic)Blacklist.allow(g,verified.filter(row=>g.subscribedIds.includes(row.id)).map(row=>row.id));if(!todo.length&&verified.length)log('All selected items are already subscribed.','info',{category:'sync',game:g.id,routine:true});
 return{requested:count,available:verified.length,skipped:details.length-verified.length,alreadySubscribed:verified.length-todo.length,canceled};
}
async function syncGame(g,{manualReview=false}={}){
 if(!g.sync&&!manualReview)throw new Error('Enable synchronization for this game first.');const all=ModLists.automatic(g);
 for(const followed of [...g.following]){try{const snap=await refreshPeer(g,followed.id);all.push(...(followed.mode==='subscriptions'?snap.subscriptions:followed.listId?(snap.namedLists?.find(list=>list.id===followed.listId)?.items||[]):snap.curated).map(row=>({...row,installSources:[{...sourcesFor(state,followed.id,followed.mode)[0],...(followed.listId?{listId:followed.listId,listName:snap.namedLists?.find(list=>list.id===followed.listId)?.name||'Shared list'}:{})}]})));}catch(error){if(error.status===403||error.status===404){g.following=g.following.filter(f=>!(f.id===followed.id&&f.mode===followed.mode&&f.listId===followed.listId));log('A followed friend list is no longer shared.','warning',{category:'sharing',game:g.id});}else throw error;}}
 g.pendingReviewIds=(g.pendingReviewIds||[]).filter(pid=>!Blacklist.has(g,pid)&&!g.subscribedIds.includes(pid)&&all.some(row=>row.id===pid));const candidates=manualReview?all.filter(row=>(g.pendingReviewIds||[]).includes(row.id)):all;if(candidates.length)await subscribe(g,candidates,{automatic:!manualReview});else if(manualReview)g.pendingReviewIds=[];else log('No items in this game’s list or followed lists.');
}
function resumeTick(){if(tickDue&&!busy){tickDue=false;setTimeout(()=>tick(),0);}}
async function tick(){
 if(busy){tickDue=true;return;}busy=true;emit();
 try{await scan({quiet:true});if(steamWebAccount===steamAccount&&state.games.some(g=>g.blacklistNeedsVerification))await refreshWeb();if(relay.token&&relay.steamid===steamAccount){await updateService();for(const g of visibleGames(state.games).filter(g=>g.sync))await syncGame(g);}else for(const g of visibleGames(state.games).filter(g=>g.sync&&ModLists.automatic(g).length))await subscribe(g,ModLists.automatic(g),{automatic:true});await save();}
 catch(e){log(e.message,'error');}finally{state.progress='';busy=false;emit();resumeTick();}
}
async function action(type,p={}){
 if(type==='state'){await account();return snapshot();}
 if(type==='stopInstallBatch'){if(installBatch&&installBatch.completed<installBatch.total){installBatch.stopping=true;state.progress='Stopping after the current request…';emit();}return snapshot();}
 if(type==='reviewActivity'){const reviewed=p.game?[game(p.game)]:state.games;for(const g of reviewed)g.activityReviewedAt=Date.now();await save();emit();return snapshot();}
 if(type==='gameSort'){if(!GameLibrary.sorts.includes(p.value))throw new Error('Choose a valid game sort.');state.gameSort=p.value;await save();emit();return snapshot();}
 if(type==='appearance'){if(!Themes.palettes.some(theme=>theme.id===p.palette)||!Themes.modes.includes(p.mode))throw new Error('Choose a valid appearance.');state.appearance=Themes.normalize(p);await save();emit();return snapshot();}
 if(type==='copyInstallerLink'){clipboard.writeText(installerUrl);return{url:installerUrl};}
 if(type==='login'){await beginConnection();return snapshot();}
 if(type==='authorizeSteam'){openSteam();return;}
 if(type==='cancelConnection'){relay.pending=null;connectionError='';emit();return snapshot();}
 if(type==='itemDetails')return workshopDetails.get(id(p.id));
 if(type==='openItemPage'){await shell.openExternal('https://steamcommunity.com/sharedfiles/filedetails/?id='+id(p.id));return;}
 if(type==='openModLink'){const url=externalUrl(p.url);if(!url)throw new Error('This link is not a supported web address.');await shell.openExternal(url);return;}
 if(type==='workshopSearch'){game(p.game);return workshopSearch.search(p);}
 if(type==='openWorkshop'){game(p.game);openSteam(searchUrl(searchOptions(p)));return;}
 if(type==='open'){openSteam(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id(p.id)}`);return;}
 if(type==='toggle'){await account();if(p.value===true)requireCommunity();const g=game(p.game);g.sync=p.value===true;await save();emit();return;}
 if(busy)throw new Error('Another operation is in progress. Wait for it to finish.');busy=true;emit();
 try{
  let result;
  if(type==='prepareDeleteMods'){await account();requireCommunity();const expected=state.account,g=game(p.game),scan=await scanLibraries(state.extraRoots,expected);assertSameAccount(expected,state.account);result=await modDeletion.prepare(g,p.ids,scan.roots,expected);assertSameAccount(expected,state.account);}
  else if(type==='deleteMods'){await account();requireCommunity();const expected=state.account,g=game(p.game);state.known[expected]||={};result=await modDeletion.confirm(g,p,expected,{assertAccount:()=>assertSameAccount(expected,state.account),unsubscribe:pid=>steam.mutate('unsubscribe',{id:pid,appid:g.id},expected),save,known:state.known[state.account],publish:()=>relay.token?updateService():Promise.resolve(),pause:()=>delay(750),onProgress:row=>{state.progress='Deleting '+row.title;emit();}});log('Deleted '+result.deleted.length+' mods'+(result.failed.length?'; '+result.failed.length+' need attention.':'.'),'info',{category:'download',game:g.id,routine:false});}
  else if(type==='blacklistMods'){await account();if(!state.account)throw Error('Connect Steam first.');const g=game(p.game),ids=(p.ids||[]).map(id);if(!ids.length||ids.length>1000)throw Error('Select mods to blacklist.');const rows=await steam.details(ids,true,true);if(rows.some(row=>row.appid!==g.id&&!row.unavailable))throw Error('Choose mods for this game.');Blacklist.block(g,rows);}
  else if(type==='allowAutoSync'){await account();if(!state.account)throw Error('Connect Steam first.');const g=game(p.game);Blacklist.allow(g,(p.ids||[]).map(id));}
  else if(type==='refreshLibrary')await refreshLibrary();
  else if(type==='scan')await scan();
  else if(type==='updateCheck')result=await updates.check();
  else if(type==='updateDownload')result=await updates.download();
  else if(type==='updateInstall')await updates.install(save);
  else if(type==='webSubscriptions')await refreshWeb();
  else if(type==='folder'){
   const selected=await dialog.showOpenDialog(main,{title:'Select Steam, steamapps, common, or a game folder',properties:['openDirectory']});
   if(!selected.canceled){const root=await resolveLibraryRoot(selected.filePaths[0]);if(!state.extraRoots.some(x=>path.resolve(x).toLowerCase()===root.toLowerCase()))state.extraRoots.push(root);await scan();}
  }
  else if(type==='addGame'){const g=ensureGame(gameId(p.id));if(!await verifyGame(g))throw new Error('Steam did not confirm Workshop support for this game.');}
  else if(type==='metadata')await hydrate(game(p.game),true);
  else if(type==='import'){
   const rows=await steam.details(parseInput(p.text));for(const row of rows){const g=ensureGame(gameId(row.appid));if(!g.workshop){g.subscribedIds ||= [];g.workshopProof=row.id;g.catalogAt=0;await verifyGame(g);}if(!g.workshop)throw new Error('An item belongs to a game without confirmed Workshop support.');}
   for(const row of rows){const g=game(row.appid),list=ModLists.get(g,g.id===p.game?p.targetListId:undefined);if(!list.items.some(x=>x.id===row.id))list.items.push({...row,addedAt:Date.now()});ModLists.legacy(g);}log(`Added ${rows.length} items to companion lists.`,'success');
  }
  else if(type==='confirmModReview'){
   await account();requireCommunity();const checked=await installReviews.confirm(p,state.account,reviewProgress);if(checked.review)throw reviewRequired(checked.review);
   const g=game(checked.ticket.game),approved=new Set(checked.ids);
   if(checked.ticket.privacy==='existing')result=await subscribe(g,checked.rows,{reviewedIds:approved});
   else result=await installWorkshop(g,{ids:checked.ids,privacy:checked.ticket.privacy},{details:ids=>steam.details(ids,true),subscribe:rows=>subscribe(g,rows,{reviewedIds:approved}),maxItems:5200,save,emit,publish:()=>updateService(),sharingConnected:!!relay.token&&relay.steamid===steamAccount});
   installReviews.consume(p.token);
  }
  else if(type==='reviewPendingMods'){await syncGame(game(p.game),{manualReview:true});}
  else if(type==='installModFromDetails'){
   await account();requireCommunity();const detail=await workshopDetails.get(id(p.id)),g=ensureGame(detail.appid);if(!await verifyGame(g))throw new Error('This item does not belong to a Workshop-enabled game.');
   result=await installWorkshop(g,{ids:[detail.id],privacy:p.privacy},{details:async ids=>{const rows=await steam.details(ids,true),review=await prepareInstallReview(g,rows,p.privacy);if(review)throw reviewRequired(review);return rows;},subscribe:rows=>subscribe(g,rows),save,emit,publish:()=>updateService(),sharingConnected:!!relay.token&&relay.steamid===steamAccount});
  }
  else if(type==='workshopInstall'){
   await account();requireCommunity();const g=game(p.game);
   result=await installWorkshop(g,p,{details:async ids=>{const rows=await steam.details(ids,true),review=await prepareInstallReview(g,rows,p.privacy);if(review)throw reviewRequired(review);return rows;},subscribe:rows=>subscribe(g,rows),save,emit,publish:()=>updateService(),sharingConnected:!!relay.token&&relay.steamid===steamAccount});
  }
  else if(type==='adopt'){
   const g=game(p.game),ids=new Set((p.ids||[]).map(id)),destination=p.newListName?ModLists.create(g,randomUUID(),p.newListName):ModLists.get(g,p.targetListId);const available=p.workshop?await steam.details([...ids],true):p.peer?FriendItems.selected(g,state.friends,p):[...g.subscriptions,...(g.installedDetails||[]),...Object.values(g.friendSnapshots).flatMap(s=>[...s.curated,...s.subscriptions])];
   for(const row of available)if(ids.has(row.id)&&row.appid===g.id&&!destination.items.some(x=>x.id===row.id))destination.items.push({...row,addedBy:row.installSources||sourcesFor(state,p.peer,p.mode),addedAt:Date.now()});ModLists.legacy(g);
  }
  else if(type==='remove'){const g=game(p.game),ids=new Set((p.ids||[]).map(id));const list=ModLists.get(g,p.targetListId);list.items=list.items.filter(x=>!ids.has(x.id));ModLists.legacy(g);}
  else if(type==='subscribe'){const g=game(p.game);if(p.peer)await refreshGameFriends(g);const ids=new Set((p.ids||[]).map(id));const rows=(p.peer?FriendItems.selected(g,state.friends,p):[...ModLists.allItems(g),...g.subscriptions]).filter(x=>ids.has(x.id)).map(row=>({...row,installSources:row.installSources||row.addedBy||sourcesFor(state)}));if(!rows.length)throw new Error('Select items first.');await subscribe(g,rows);}
  else if(type==='installFriendMods'){
   await account();requireCommunity();const g=game(p.game);if(!['subscriptions','curated'].includes(p.mode)||!(p.peer==='all'||p.peer==='selected'&&Array.isArray(p.peers)&&p.peers.length>0&&p.peers.length<=2000&&p.peers.every(pid=>/^765\d{14}$/.test(pid))||/^765\d{14}$/.test(p.peer)))throw new Error('Choose a valid friend filter and list.');
   if(p.peer==='all'||p.peer==='selected')await refreshGameFriends(g);else{await updateService();await refreshPeer(g,p.peer);}
   const rows=FriendItems.installable(g,state.friends,{peer:p.peer,peers:p.peers,sourceList:p.sourceList,mode:p.mode}),already=new Set(g.subscribedIds),candidates=rows.filter(row=>!already.has(row.id));if(candidates.length>5000)throw new Error('This view exceeds the 5,000-item batch limit. Select a smaller group or choose one friend.');
   result=candidates.length?await subscribe(g,candidates):{requested:0,available:rows.length,skipped:0,alreadySubscribed:rows.length,canceled:false};
  }
  else if(type==='installOwnList'){const g=game(p.game),list=ModLists.get(g,p.listId);result=await subscribe(g,list.items.map(row=>({...row,installSources:[{kind:'self',name:'You',listId:list.id,listName:list.name}]})));}
  else if(type==='listCreate'){const list=ModLists.create(game(p.game),randomUUID(),p.name);result={listId:list.id};}
  else if(type==='listRename')ModLists.rename(game(p.game),p.listId,p.name);
  else if(type==='listDelete'){ModLists.remove(game(p.game),p.listId);if(relay.token)await updateService();}
  else if(type==='listSync'){const g=game(p.game),list=ModLists.get(g,p.listId);if(p.value)requireCommunity();list.sync=p.value===true;}
  else if(type==='listShare'){const g=game(p.game),list=ModLists.get(g,p.listId),audience=ModLists.validateAudience(p.audience,state.friends);if(audience.mode!=='private'&&(!g.shareList||g.sharingAudience.mode==='private'))throw new Error('Enable list sharing in this game’s Sharing menu first.');list.audience=audience;if(audience.mode!=='private'){g.shareList=true;g.sharingConfigured=true;}await updateService();}
  else if(type==='followFriends'){
   const g=game(p.game);if(!['subscriptions','curated'].includes(p.mode)||!Array.isArray(p.friendIds)||p.friendIds.length>2000||p.friendIds.some(pid=>!/^765\d{14}$/.test(pid)))throw new Error('Choose valid connected friends.');
   await refreshGameFriends(g);for(const pid of p.friendIds){const friend=FriendItems.compatible(state.friends,g.id).find(f=>f.id===pid);if(!friend||!FriendItems.shares(friend,g.id,p.mode)||p.sourceList&&(p.sourceList.friendId!==pid||!g.friendSnapshots[pid]?.namedLists?.some(list=>list.id===p.sourceList.listId)))throw new Error('A friend or list is no longer shared. Refresh and choose again.');}
   g.following=g.following.filter(f=>p.sourceList?!(f.id===p.sourceList.friendId&&f.mode===p.mode&&f.listId===p.sourceList.listId):f.mode!==p.mode||f.listId);
   for(const pid of [...new Set(p.friendIds)])g.following.push({id:pid,mode:p.mode,...(p.sourceList?{listId:p.sourceList.listId}:{})});
  }
  else if(type==='sync')await syncGame(game(p.game));
  else if(type==='share'){
   const g=game(p.game);if((p.shareList||p.shareSubscriptions)&&(!relay.token||relay.steamid!==steamAccount))throw new Error('Connect companion friend sharing first.');
   g.shareList=p.shareList===true;g.shareSubscriptions=p.shareSubscriptions===true;g.sharingConfigured=true;if(p.audience)g.sharingAudience=ModLists.validateAudience(p.audience,state.friends);await updateService();log(`${g.name}: sharing preferences updated.`,'success');
  }
  else if(type==='connect'){
   await beginConnection();
  }
  else if(type==='refreshFriends')await updateService({refreshSteamFriends:true});
  else if(type==='friendItems')result=await refreshGameFriends(game(p.game),{refreshSteamFriends:p.refreshSteamFriends===true});
  else if(type==='peer')result=await refreshPeer(game(p.game),p.id);
  else if(type==='follow'){
   const g=game(p.game);if(!['curated','subscriptions'].includes(p.mode)||!/^765\d{14}$/.test(p.id))throw new Error('Invalid friend list selection.');
   if(p.value===true){await refreshPeer(g,p.id);g.following=g.following.filter(x=>!(x.id===p.id&&x.mode===p.mode&&!x.listId));g.following.push({id:p.id,mode:p.mode});}else g.following=g.following.filter(x=>x.id!==p.id);
  }
  else if(type==='server'){
   const url=origin(p.url.trim());if((relay.token||relay.pending)&&url!==relay.url)throw new Error('Disconnect friend sharing before changing sync servers.');const previous=relay.url;relay.url=url;
   try{const check=await relay.request('/v1/health',{token:null});if(check.service!=='workshop-link-sync'||!check.ready)throw new Error('The sync service is not ready.');state.relay.url=url;}catch(e){relay.url=previous;throw e;}
  }
  else if(type==='disconnect'){
   if(relay.token)await relay.request('/v1/profile',{method:'DELETE'});await relay.forget();disconnectSharing(state);for(const g of state.games){g.following=[];g.friendSnapshots={};}log('Companion sharing disconnected and hosted snapshots removed.');
  }
  else if(type==='logout'){
   if(relay.token)await relay.request('/v1/profile',{method:'DELETE'});await relay.forget();resetAccount(state);await steam.ses.clearStorageData();steamAccount=null;steamWebAccount=null;state.account=null;if(steamWindow&&!steamWindow.isDestroyed())steamWindow.close();
  }
  else if(type==='export'){
   const selected=await dialog.showSaveDialog(main,{defaultPath:'workshop-link-backup.json',filters:[{name:'JSON',extensions:['json']}]});
   if(!selected.canceled)await fs.writeFile(selected.filePath,JSON.stringify({version:5,games:visibleGames(state.games).map(g=>({id:g.id,name:g.name,privateItemIds:g.privateItemIds||[],autoSyncBlacklist:(g.autoSyncBlacklist||[]).map(({id,title})=>({id,title})),lists:ModLists.ensure(g).map(list=>({name:list.name,items:list.items.map(row=>row.id)}))}))},null,2));
  }
  else if(type==='importBackup'){
   const selected=await dialog.showOpenDialog(main,{filters:[{name:'JSON',extensions:['json']}],properties:['openFile']});if(!selected.canceled){
    const raw=await fs.readFile(selected.filePaths[0],'utf8');if(raw.length>2000000)throw new Error('Backup is too large.');const backup=JSON.parse(raw);if(![1,2,3,4,5].includes(backup.version)||!Array.isArray(backup.games)||backup.games.length>100)throw new Error('Invalid backup.');let total=0;const plans=[];
    for(const b of backup.games){gameId(b.id);if(b.privateItemIds&&(!Array.isArray(b.privateItemIds)||b.privateItemIds.length>50000))throw new Error('Invalid backup privacy choices.');const privateIds=(b.privateItemIds||[]).map(id);if(b.autoSyncBlacklist&&(!Array.isArray(b.autoSyncBlacklist)||b.autoSyncBlacklist.length>50000))throw Error('Invalid backup blacklist.');const blacklist=(b.autoSyncBlacklist||[]).map(row=>({id:id(row.id),title:String(row.title||('Workshop item '+row.id)).slice(0,500)}));const lists=backup.version>=3?b.lists:[{name:'My mods',items:b.items}];if(!Array.isArray(lists)||lists.length>50)throw new Error('Invalid backup lists.');for(const list of lists){const name=ModLists.name(list.name);if(!Array.isArray(list.items)||list.items.length>5000)throw new Error('Invalid backup items.');const ids=list.items.map(id);total+=ids.length;if(total>50000)throw new Error('Backup contains too many items.');plans.push({game:b.id,gameName:b.name,name,ids,privateIds,blacklist});}}
    for(const plan of plans){plan.rows=await steam.details(plan.ids);if(plan.rows.some(row=>row.appid!==plan.game||row.type===2))throw new Error('A backup item belongs to another game.');}
    for(const plan of plans){const g=ensureGame(plan.game,plan.gameName);ItemPrivacy.set(g,plan.privateIds,true);Blacklist.block(g,plan.blacklist);let list=ModLists.ensure(g).find(list=>list.name.toLowerCase()===plan.name.toLowerCase());if(!list)list=ModLists.create(g,randomUUID(),plan.name);list.items=[...new Map([...list.items,...plan.rows].map(row=>[row.id,row])).values()];ModLists.legacy(g);g.catalogAt=0;await verifyGame(g);}
   }
  }
  else throw new Error('Unknown action.');
  await save();return result||snapshot();
 }finally{state.progress='';busy=false;emit();resumeTick();}
}
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>{if(main){if(main.isMinimized())main.restore();main.show();main.focus();}});
 app.whenReady().then(async()=>{
  let old;try{old=JSON.parse(await fs.readFile(file(),'utf8'));if(![1,2,3,4,5].includes(old.version)||!Array.isArray(old.games))throw new Error('Unsupported saved state.');if(old.version===1)await fs.copyFile(file(),file()+'.v1-backup');if(old.version===2&&!await fs.access(file()+'.v2-backup').then(()=>true,()=>false))await fs.copyFile(file(),file()+'.v2-backup');}catch(e){if(e.code!=='ENOENT'&&old)throw e;}
  if(old?.version===3&&!await fs.access(file()+'.v3-backup').then(()=>true,()=>false))await fs.copyFile(file(),file()+'.v3-backup');
  if(old?.version===4&&!await fs.access(file()+'.v4-backup').then(()=>true,()=>false))await fs.copyFile(file(),file()+'.v4-backup');
  state=migrate(old,serviceConfig.url);
  steam=new Steam(session.fromPartition('persist:steam'));relay=new Relay(state.relay.url,{file:path.join(app.getPath('userData'),'companion-session.json'),safeStorage});await relay.load();if(relay.token)try{await relay.verifyIdentity();}catch(error){connectionError=error.message;}
  const {autoUpdater}=require('electron-updater');
  const installed=app.isPackaged&&await fs.access(path.join(process.resourcesPath,'app-update.yml')).then(()=>true,()=>false);
  updates=new AppUpdates({currentVersion:app.getVersion(),config:updateConfig,nativeUpdater:autoUpdater,installed});updates.on('state',emit);
  steam.ses.setPermissionRequestHandler((_w,_p,callback)=>callback(false));steam.ses.setPermissionCheckHandler(()=>false);steam.ses.on('will-download',e=>e.preventDefault());
  main=new BrowserWindow({title:'WorkshopSync',icon:appIcon,width:1420,height:940,minWidth:1000,minHeight:690,backgroundColor:'#0d1119',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});Menu.setApplicationMenu(null);
  const appUrl=pathToFileURL(path.join(__dirname,'index.html')).href;
  main.webContents.on('will-navigate',e=>e.preventDefault());main.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  ipcMain.handle('action',async(event,type,payload)=>{
   if(event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame||event.senderFrame.url!==appUrl)throw new Error('Untrusted request.');if(typeof type!=='string'||JSON.stringify(payload||{}).length>300000)throw new Error('Invalid request.');
   try{return{ok:true,data:await action(type,payload)};}catch(e){if(e.code==='MOD_REVIEW_REQUIRED'){await save();emit();return{ok:false,error:e.message,code:e.code,review:e.review};}const needsAuth=['STEAM_WEB_AUTH_REQUIRED','STEAM_IDENTITY_REQUIRED'].includes(e.code);log(e.message,needsAuth?'info':'error',{category:needsAuth?'sharing':undefined});await save();emit();return{ok:false,error:e.message,code:e.code};}
  });
  await main.loadURL(appUrl);main.show();busy=true;emit();try{await account();await scan();if(relay.token&&relay.steamid===steamAccount){await updateService();}}catch(e){log(e.message,'error');}finally{busy=false;emit();}
  setTimeout(()=>updates.check().catch(()=>{}),5000);setInterval(()=>updates.check().catch(()=>{}),60*60000);
  setInterval(tick,60000);
  setInterval(async()=>{if(polling||!relay.pending||busy)return;polling=true;busy=true;emit();try{const peer=await relay.poll();if(peer){await account();connectSharing(state);connectionError='';log('Steam and friend sharing connected. Workshop games are shared by default; downloads remain opt-in.','success');await scan({quiet:true});await updateService({refreshSteamFriends:true});await save();}}catch(e){connectionError=e.message;relay.pending=null;log(e.message,'error');}finally{polling=false;busy=false;emit();}},2500);
  setInterval(()=>{if(!busy)account().then(emit).catch(()=>{});},15000);
 }).catch(e=>{dialog.showErrorBox('WorkshopSync',e.message);app.quit();});
 app.on('window-all-closed',()=>app.quit());
}
