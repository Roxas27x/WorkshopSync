const CompanionFriends=(()=>{
 function connected(friends,sharingConnected=true){
  if(!sharingConnected)return[];
  return [...new Map((friends||[]).filter(f=>f.companion===true).map(f=>[f.id,f])).values()].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 }
 function sharedGames(friend,games){const ids=new Set((friend?.games||[]).filter(g=>g.share_subscriptions===1||g.share_subscriptions===true||g.share_list===1||g.share_list===true).map(g=>g.appid));return games.filter(g=>ids.has(g.id));}
 return{connected,sharedGames};
})();
if(typeof module!=='undefined')module.exports=CompanionFriends;
