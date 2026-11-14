const FriendItems=(()=>{
 const availability=typeof module!=='undefined'?require('./availability.js'):WorkshopAvailability;
 function compatible(friends,appid){return friends.filter(f=>f.companion&&f.games?.some(g=>g.appid===appid));}
 function shares(friend,appid,mode){const g=friend.games?.find(g=>g.appid===appid);if(!g)return false;const flag=g[mode==='subscriptions'?'share_subscriptions':'share_list'];return flag===undefined||flag===true||flag===1;}
 function merged(game,friends,{peer='all',peers,sourceList=null,mode='subscriptions',now=Date.now()}={}){
  if(!['subscriptions','curated'].includes(mode))throw new Error('Choose a valid friend list type.');const items=new Map();
  for(const friend of compatible(friends,game.id)){
   if((Array.isArray(peers)?!peers.includes(friend.id):peer!=='all'&&friend.id!==peer)||sourceList&&sourceList.friendId!==friend.id||!shares(friend,game.id,mode))continue;
   const snapshot=game.friendSnapshots?.[friend.id];if(!snapshot||!Number.isFinite(Number(snapshot.updated))||now-Number(snapshot.updated)>7*86400000||snapshot[mode==='subscriptions'?'shareSubscriptions':'shareList']===false)continue;
   const sources=mode==='curated'&&Array.isArray(snapshot.namedLists)?snapshot.namedLists.filter(list=>!sourceList||sourceList.listId===list.id).flatMap(list=>list.items.map(row=>({row,listId:list.id,listName:list.name}))):sourceList?[]:(snapshot[mode]||[]).map(row=>({row}));
   for(const {row,listId,listName} of sources){
    if(row.appid!==game.id||row.type===2)continue;
    let item=items.get(row.id);if(!item){item={...row,friendSources:[]};items.set(row.id,item);}
    if(!item.friendSources.some(s=>s.id===friend.id&&s.listId===listId))item.friendSources.push({kind:'friend',id:friend.id,name:friend.name,mode,...(listId?{listId,listName}:{})});
   }
  }
  for(const item of items.values())item.friendSources.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  return [...items.values()];
 }
 function sorted(items,game,sort='missing'){
  const friendCount=row=>new Set(row.friendSources.map(friend=>friend.id)).size;const name=(a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id);const subscribed=new Set(game.subscribedIds||[]);
  return [...items].sort((a,b)=>sort==='shared'?friendCount(b)-friendCount(a)||name(a,b):sort==='friend'?(a.friendSources[0]?.name||'').localeCompare(b.friendSources[0]?.name||'')||name(a,b):sort==='updated'?(b.updated||0)-(a.updated||0)||name(a,b):sort==='missing'?Number(subscribed.has(a.id))-Number(subscribed.has(b.id))||name(a,b):name(a,b));
 }
 function selected(game,friends,{peer='all',peers,sourceList,mode='subscriptions',ids}={}){
  if(!Array.isArray(ids)||!ids.length||ids.length>5000||ids.some(id=>typeof id!=='string'||!/^[1-9]\d{0,19}$/.test(id)))throw new Error('Select up to 5,000 valid Workshop items.');
  const wanted=new Set(ids),available=merged(game,friends,{peer,peers,sourceList,mode}).filter(row=>wanted.has(row.id));
  if(available.length!==wanted.size)throw new Error('A selected mod is no longer in this shared view. Refresh the friend list first.');
  return available.map(row=>({...row,installSources:row.friendSources}));
 }
 function installable(game,friends,options={}){return availability.visible(merged(game,friends,options)).map(row=>({...row,installSources:row.friendSources}));}
 return{compatible,shares,merged,sorted,selected,installable};
})();
if(typeof module!=='undefined')module.exports=FriendItems;
