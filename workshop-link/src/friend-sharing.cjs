const {sharingPayload}=require('./state.cjs');

async function refreshFriendRoster(state,{readFriends,request,refreshSteamFriends=false,now=Date.now()}){
 let friends=state.friends,refreshed=false,canPublish=!state.friendReadError;
 if(refreshSteamFriends||!state.friendsCheckedAt||now-state.friendsCheckedAt>10*60000){
  try{friends=await readFriends();refreshed=true;canPublish=true;state.friendReadError='';}
  catch(error){state.friendReadError=error.message;canPublish=false;}
 }
 const capabilities=await request('/v1/health',{token:null});
 if(capabilities.sharingVersion!==2||capabilities.privateItemsVersion!==1)throw new Error('The sync service needs an update before private subscriptions can be protected.');
 // A failed Steam read is not an authoritative empty roster. Leave the last
 // server snapshot to expire normally; do not renew it or erase its lists.
 if(canPublish)await request('/v1/profile',{method:'PUT',body:sharingPayload({...state,friends})});
 const registered=await request('/v1/friends');
 const lookup=new Map(registered.friends.map(friend=>[friend.steamid,friend]));
 state.friends=friends.map(friend=>({...friend,companion:lookup.has(friend.id),games:lookup.get(friend.id)?.games||[]}));
 if(refreshed)state.friendsCheckedAt=now;
 state.sharedGameStats=Array.isArray(registered.sharedGameStats)?registered.sharedGameStats:[];
 return registered;
}

module.exports={refreshFriendRoster};
