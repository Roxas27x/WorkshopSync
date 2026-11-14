function sourcesFor(state,peer,mode='curated'){
 const friend=state.friends.find(f=>f.id===peer);
 return friend?[{kind:'friend',id:friend.id,name:friend.name,mode}]:peer?[{kind:'unknown',id:peer,name:'Unknown Steam friend',mode}]:[{kind:'self',name:'You',mode:'curated'}];
}
function mergeSources(rows){
 const result=[];for(const source of rows.flatMap(r=>r.installSources||[]))if(!result.some(s=>s.kind===source.kind&&s.id===source.id&&s.mode===source.mode&&s.listId===source.listId))result.push({...source});return result;
}
function addEvent(state,g,item,type,at,sources=[],extra={}){
 state.modActivity||=[];state.modActivity.unshift({appid:g.id,gameName:g.name,id:item.id,title:item.title||`Workshop item ${item.id}`,type,at,observedAt:at,sources:structuredClone(sources),...extra});state.modActivity=state.modActivity.slice(0,3000);
}
function recordRequest(state,g,item,{sources=[{kind:'self',name:'You'}],automatic=false,now=Date.now()}={}){
 g.itemHistory||={};const previous=g.itemHistory[item.id]||{};
 const installed=g.installed.includes(item.id);
 g.itemHistory[item.id]={...previous,id:item.id,title:item.title,requestedAt:now,requestSources:structuredClone(sources),pending:!installed,installed,automatic};
 if(!installed)g.itemHistory[item.id].sources=structuredClone(sources);
 addEvent(state,g,item,'requested',now,sources,{automatic});
}
function observeDownloads(state,g,files,{now=Date.now(),baseline=false,reliable=true}={}){
 g.itemHistory||={};const present=new Set(files.map(x=>x.id));
 for(const file of files){
  const old=g.itemHistory[file.id];const row=[...(g.subscriptions||[]),...(g.items||[])].find(x=>x.id===file.id)||{id:file.id,title:`Workshop item ${file.id}`};
  const created=Number(file.fileCreatedAt);const folderDate=Number.isFinite(created)&&created>0&&created<=now?created:null;
  const history=g.itemHistory[file.id]||{id:file.id,title:row.title,sources:[],installed:false};
  history.title=row.title;history.lastObservedAt=now;
  if(!old||!old.installed){
   const trackedRequest=history.pending===true&&!!history.requestedAt;
   history.downloadedAt=trackedRequest?now:folderDate;history.downloadTimeSource=trackedRequest?'observed':folderDate?'folder-created':'unknown';history.firstDetectedAt=now;history.pending=false;
   if(!baseline)addEvent(state,g,row,'downloaded',now,history.sources||[],{downloadedAt:history.downloadedAt,downloadTimeSource:history.downloadTimeSource,automatic:history.automatic===true});
  }else if(old.manifest&&file.manifest&&old.manifest!==file.manifest){
   history.lastUpdateDetectedAt=now;if(!baseline)addEvent(state,g,row,'updated',now,[],{downloadTimeSource:'observed'});
  }
  history.manifest=file.manifest||history.manifest||null;history.installed=true;g.itemHistory[file.id]=history;
 }
 if(reliable)for(const [id,item]of Object.entries(g.itemHistory))if(!present.has(id))item.installed=false;
}
function pendingFriendItems(state,appid=null){
 let count=0;for(const g of state.games){if(appid&&g.id!==appid)continue;const cutoff=g.activityReviewedAt||state.activityReviewedAt||0;
  for(const item of Object.values(g.itemHistory||{}))if(item.automatic&&item.sources?.some(s=>s.kind==='friend')&&Math.max(item.requestedAt||0,item.firstDetectedAt||0)>cutoff)count++;
 }return count;
}
module.exports={sourcesFor,mergeSources,recordRequest,observeDownloads,pendingFriendItems};
