(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AutoSyncBlacklist=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const valid=value=>typeof value==='string'&&/^[1-9]\d{0,19}$/.test(value);
 function ensure(g){g.autoSyncBlacklist=(Array.isArray(g.autoSyncBlacklist)?g.autoSyncBlacklist:[]).filter(row=>row&&valid(row.id));g.modRemovals||={};return g.autoSyncBlacklist;}
 function has(g,pid){return ensure(g).some(row=>row.id===pid);}
 function block(g,rows,now=Date.now()){const map=new Map(ensure(g).map(row=>[row.id,row]));for(const row of rows){if(!valid(row.id))throw Error('Invalid Workshop item.');map.set(row.id,{...map.get(row.id),id:row.id,title:row.title||'Workshop item '+row.id,blockedAt:now,priorSubscriptionAt:Number(g.subscriptionTimes?.[row.id])||0,absentObservedAt:0});}g.autoSyncBlacklist=[...map.values()];g.pendingReviewIds=(g.pendingReviewIds||[]).filter(pid=>!map.has(pid));}
 function allow(g,ids){const chosen=new Set(ids);g.autoSyncBlacklist=ensure(g).filter(row=>!chosen.has(row.id));for(const pid of chosen)delete g.modRemovals[pid];}
 function removed(g,pid,now=Date.now()){ensure(g);const entry=g.autoSyncBlacklist.find(row=>row.id===pid);if(entry)entry.absentObservedAt=0;g.modRemovals[pid]={unsubscribedAt:now,priorSubscriptionAt:Number(g.subscriptionTimes?.[pid])||0,cacheCheckedAt:0};g.subscribedIds=g.subscribedIds.filter(id=>id!==pid);g.subscriptions=g.subscriptions.filter(row=>row.id!==pid);g.pendingReviewIds=(g.pendingReviewIds||[]).filter(id=>id!==pid);}
 function observe(g,ids,{checkedAt=Date.now(),authoritative=false,subscriptionTimes={}}={}){
  ensure(g);const present=new Set(ids),released=[];
  for(const entry of [...g.autoSyncBlacklist]){if(checkedAt<=entry.blockedAt)continue;const removal=g.modRemovals[entry.id],subscribedAt=Number(subscriptionTimes[entry.id]);if(present.has(entry.id)&&subscribedAt>0&&subscribedAt>entry.priorSubscriptionAt&&subscribedAt+1000>entry.blockedAt){released.push(entry.id);continue;}if(!present.has(entry.id)){entry.absentObservedAt=Math.max(entry.absentObservedAt||0,checkedAt);continue;}
   if(removal){if(authoritative&&entry.blockedAt<=removal.unsubscribedAt&&checkedAt>removal.unsubscribedAt+2000)released.push(entry.id);else if(!authoritative&&entry.absentObservedAt&&checkedAt>Math.max(removal.unsubscribedAt,entry.absentObservedAt))released.push(entry.id);}
   else if(entry.absentObservedAt&&checkedAt>entry.absentObservedAt)released.push(entry.id);
  }
  if(released.length)allow(g,released);
  for(const [pid,entry]of Object.entries(g.modRemovals)){if(checkedAt<=Math.max(entry.unsubscribedAt,g.autoSyncBlacklist.find(row=>row.id===pid)?.blockedAt||0))continue;const subscribedAt=Number(subscriptionTimes[pid]);if(present.has(pid)&&subscribedAt>0&&subscribedAt>entry.priorSubscriptionAt&&subscribedAt+1000>entry.unsubscribedAt){allow(g,[pid]);continue;}if(authoritative){entry.cacheCheckedAt=checkedAt;if(present.has(pid)&&checkedAt>entry.unsubscribedAt+2000)delete g.modRemovals[pid];else if(!present.has(pid))entry.absentObservedAt=Math.max(entry.absentObservedAt||0,checkedAt);}else if(!present.has(pid))entry.absentObservedAt=Math.max(entry.absentObservedAt||0,checkedAt);else if(entry.absentObservedAt&&checkedAt>entry.absentObservedAt){delete g.modRemovals[pid];allow(g,[pid]);}}
  return ids.filter(pid=>!g.modRemovals[pid]);
 }
 function needsVerification(g,ids,checkedAt){ensure(g);return ids.some(pid=>{const entry=g.modRemovals[pid];return entry&&Date.now()>entry.unsubscribedAt+2000&&checkedAt>entry.unsubscribedAt&&checkedAt>(entry.cacheCheckedAt||0);});}
 return{ensure,has,block,allow,removed,observe,needsVerification};
});
