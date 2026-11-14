const GameLibrary=(()=>{
 const sorts=['played','shared','name'];
 const normalizeSort=value=>sorts.includes(value)?value:'played';
 const played=game=>Number.isFinite(game.lastPlayedAt)&&game.lastPlayedAt>0?game.lastPlayedAt:0;
 function sharedStats(stats,appid,now=Date.now()){
  const row=(stats||[]).find(s=>s.appid===appid&&Number.isFinite(s.expiresAt)&&s.expiresAt>now);
  return row&&Number.isSafeInteger(row.itemCount)&&row.itemCount>=0&&Number.isSafeInteger(row.friendCount)&&row.friendCount>=0?row:{itemCount:0,friendCount:0};
 }
 function sorted(games,sort='played',stats=[],now=Date.now()){
  const counts=new Map(games.map(g=>[g.id,sharedStats(stats,g.id,now)]));
  const name=(a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
  return [...games].sort((a,b)=>normalizeSort(sort)==='name'?name(a,b):normalizeSort(sort)==='shared'?counts.get(b.id).itemCount-counts.get(a.id).itemCount||counts.get(b.id).friendCount-counts.get(a.id).friendCount||played(b)-played(a)||name(a,b):played(b)-played(a)||name(a,b));
 }
 return{sorts,normalizeSort,played,sharedStats,sorted};
})();
if(typeof module!=='undefined')module.exports=GameLibrary;
