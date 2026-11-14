const ModLists=require('./mod-lists.js');
const ItemPrivacy=require('./item-privacy.js');
const AppLog=require('./app-log.js');
const GameLibrary=require('./game-library.js');
const Themes=require('./themes.js');
const Blacklist=require('./auto-sync-blacklist.js');
function newGame(id,name){return{id,name:name||`Game ${id}`,sync:false,shareList:false,shareSubscriptions:false,sharingConfigured:false,items:[],autoSyncBlacklist:[],modRemovals:{},subscriptionTimes:{},localSizes:{},pendingReviewIds:[],privateItemIds:[],installed:[],subscribedIds:[],subscriptions:[],following:[],friendSnapshots:{},itemHistory:{},workshop:false};}
function migrate(old,serviceUrl=''){
 const base=old||{};
 const result={version:5,appearance:Themes.normalize(base.appearance),gameSort:GameLibrary.normalizeSort(base.gameSort),sharedGameStats:base.version>=2?(base.sharedGameStats||[]):[],account:base.account||null,modActivity:base.version>=2?(base.modActivity||[]):[],historyStartedAt:base.historyStartedAt||null,activityReviewedAt:base.activityReviewedAt||Date.now(),games:(base.games||[]).map(g=>({
  ...newGame(g.id,g.name),...g,lastPlayedAt:base.version>=2?(g.lastPlayedAt||null):null,
  sync:base.version>=2 && g.sync===true,
  shareList:base.version>=2 && g.shareList===true,
  shareSubscriptions:base.version>=2 && g.shareSubscriptions===true,
  subscribedIds:base.version>=2?(g.subscribedIds||[]):[],subscriptions:base.version>=2?(g.subscriptions||[]):[],
  following:base.version>=2?(g.following||[]):[],friendSnapshots:base.version>=2?(g.friendSnapshots||{}):{},
  sources:undefined,publishId:undefined,autoShare:undefined
 })),sharingDefaultsActive:base.version>=2&&base.sharingDefaultsActive===true,extraRoots:base.extraRoots||[],known:base.version>=2?(base.known||{}):{},log:AppLog.grouped(base.log||[]).slice(0,500),friends:base.version>=2?(base.friends||[]):[],lastScan:base.lastScan||null,relay:{url:base.relay?.url||serviceUrl,lastUpdated:base.relay?.lastUpdated||null},detectedRoots:base.detectedRoots||[],scanErrors:base.scanErrors||[]};
 for(const g of result.games){ModLists.ensure(g);Blacklist.ensure(g);}return result;
}
function applySharingDefaults(state){
 if(!state.sharingDefaultsActive)return;
 for(const g of state.games)if(g.workshop===true&&g.sharingConfigured!==true){g.shareList=true;g.shareSubscriptions=true;}
}
function connectSharing(state){state.sharingDefaultsActive=true;applySharingDefaults(state);}
function disconnectSharing(state){state.sharingDefaultsActive=false;state.sharedGameStats=[];for(const g of state.games){g.shareList=false;g.shareSubscriptions=false;g.sharingConfigured=false;}}
function sharingPayload(state){
 for(const g of state.games)ModLists.ensure(g);
 const allowed=new Set(state.friends.map(friend=>friend.id)),clean=a=>({...a,friends:a.friends.filter(id=>allowed.has(id))});
 return{sharingVersion:3,friends:state.friends.map(f=>f.id),games:state.games.filter(g=>g.workshop===true&&(g.shareList||g.shareSubscriptions)&&g.sharingAudience.mode!=='private').map(g=>({appid:g.id,name:g.name,shareList:g.shareList===true,shareSubscriptions:g.shareSubscriptions===true,audience:clean(g.sharingAudience),curated:[],namedLists:g.shareList?ModLists.shared(g).map(list=>({...list,items:ItemPrivacy.visible(g,list.items),audience:clean(list.audience)})):[],subscriptions:g.shareSubscriptions?ItemPrivacy.visible(g,g.subscribedIds):[]}))};
}
function resetAccount(state){
 disconnectSharing(state);
 for(const g of state.games){g.sync=false;g.pendingReviewIds=[];g.autoSyncBlacklist=[];g.modRemovals={};g.subscriptionTimes={};g.lastPlayedAt=null;g.subscribedIds=[];g.subscriptions=[];g.following=[];g.friendSnapshots={};g.friendItemsCheckedAt=null;g.friendItemsError='';g.itemHistory={};g.activityReviewedAt=null;g.items=g.items.map(({addedBy,...item})=>item);}
 state.modActivity=[];state.historyStartedAt=null;state.activityReviewedAt=Date.now();
 state.friends=[];state.known={};
}
module.exports={newGame,migrate,sharingPayload,resetAccount,applySharingDefaults,connectSharing,disconnectSharing};
