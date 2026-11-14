const AppLog=(()=>{
 function describe(entry){
  const message=String(entry.message||''),catalog=message.match(/^Steam could not verify Workshop support for game (\d+)\. It stays hidden until verified\.$/);
  const failed=/\b(?:failed?|failure|error|denied|unauthori[sz]ed|forbidden|timeout|timed out|unreachable|HTTP [45]\d\d)\b/i.test(message);
  const noChange=/^All selected items are already subscribed\.$|^No items in this game[’']s list or followed lists\.$/.test(message)||(!failed&&/\b(?:scan|check|sync|activity)\b/i.test(message)&&/\b(?:no new (?:activity|items|mods|changes)|no changes found|nothing new|nothing changed)\b/i.test(message));
  const scan=/^Found \d+ account subscriptions and \d+ downloaded items across \d+ Steam librar(?:y|ies)\.$/.test(message);
  let kind=entry.kind||'info';if(noChange)kind='info';else if(catalog||/^Skipped \d+ unavailable Workshop items\.$/.test(message))kind='warning';
  const category=entry.category||(catalog?'catalog':scan||/^Read \d+ subscriptions directly from Steam/.test(message)?'scan':noChange?'sync':/^Subscribed:|^Skipped \d+ unavailable/.test(message)?'download':/Published companion|installer|release|app update/i.test(message)?'update':/sharing|Sync service|Confirm Steam in your browser/i.test(message)?'sharing':/^Added \d+ items to companion lists/.test(message)?'lists':'other');
  return{...entry,message,kind,category,game:entry.game||catalog?.[1]||null,routine:typeof entry.routine==='boolean'?entry.routine:!!(noChange||catalog||scan),repeatCount:Math.max(1,Number(entry.repeatCount)||1),firstAt:entry.firstAt||entry.at};
 }
 function grouped(entries){
  const groups=new Map();for(const raw of entries){const entry=describe(raw),key=JSON.stringify([entry.message,entry.kind,entry.category,entry.game,entry.routine]);const previous=groups.get(key);
   if(!previous){groups.set(key,{...entry});continue;}
   previous.repeatCount+=entry.repeatCount;
   if(Date.parse(entry.at)>Date.parse(previous.at))previous.at=entry.at;
   if(Date.parse(entry.firstAt)<Date.parse(previous.firstAt))previous.firstAt=entry.firstAt;
  }return [...groups.values()].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 }
 function append(entries,entry){return grouped([entry,...entries]).slice(0,500);}
 function filtered(entries,{hideRoutine=true,hideRecurring=false,level='all',category='all'}={}){
  return grouped(entries).filter(entry=>{const matchesLevel=level==='all'||(level==='problems'?['error','warning'].includes(entry.kind):entry.kind===level);return matchesLevel&&(!hideRoutine||!entry.routine)&&(!hideRecurring||entry.repeatCount===1)&&(category==='all'||entry.category===category);});
 }
 function scanFingerprint(games){return JSON.stringify(games.filter(g=>g.workshop).map(g=>[g.id,[...(g.subscribedIds||[])].sort(),[...(g.installed||[])].sort()]).sort((a,b)=>a[0].localeCompare(b[0])));}
 return{describe,grouped,append,filtered,scanFingerprint};
})();
if(typeof module!=='undefined')module.exports=AppLog;
