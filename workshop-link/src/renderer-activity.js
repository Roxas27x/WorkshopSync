let activityFilter='away',activityAllGames=true;
const messageSettings={hideRoutine:true,hideRecurring:false,level:'all',category:'all'};
const localDate=value=>value?new Date(value).toLocaleString([], {year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Unknown';
function sourceNames(sources){return [...new Set((sources||[]).map(s=>s.kind==='friend'?s.name:s.kind==='self'?'You':'Unknown'))].join(', ')||'Unknown / outside companion';}
function downloadMeta(row,g){
 const h=g.itemHistory?.[row.id];
 if(!h)return row.addedBy?`<span class="install-meta">List source: ${esc(sourceNames(row.addedBy))}</span>`:'';
 const date=h.downloadedAt?(h.downloadTimeSource==='folder-created'?'Files since '+localDate(h.downloadedAt)+' (estimate)':'Files detected '+localDate(h.downloadedAt)):h.pending?'Waiting for downloaded files':'Download date unknown';
 return `<span class="install-meta">${esc(date)}</span><button class="history-link" data-action="itemHistory" data-id="${esc(row.id)}">Added by ${esc(sourceNames(h.sources))} · History</button>`;
}
function showItemHistory(g,id){
 const h=g.itemHistory?.[id];if(!h){toast('This item has no local download history yet.');return;}
 const events=(state.modActivity||[]).filter(e=>e.appid===g.id&&e.id===id);
 modal('Download history',`<button class="mod-title" data-action="modDetails" data-id="${esc(id)}"><strong>${esc(h.title)}</strong></button><div class="callout"><strong>Added by:</strong> ${esc(sourceNames(h.sources))}<br><strong>Subscription requested:</strong> ${esc(localDate(h.requestedAt))}<br><strong>Files ${h.downloadTimeSource==='folder-created'?'created (estimate)':'detected'}:</strong> ${esc(localDate(h.downloadedAt))}<br><strong>Last update detected:</strong> ${esc(localDate(h.lastUpdateDetectedAt))}</div><p class="hint">Folder creation dates are estimates and can change after copying or restoring files. Detected dates record when this app first found files; actual download times can differ. A friend's name identifies the shared list that caused the request, not the mod's creator.</p>${events.slice(0,15).map(e=>`<p>${esc(localDate(e.at))} · ${e.type==='requested'?'Subscription requested':e.type==='updated'?'Steam version change detected':'Local files detected'}</p>`).join('')}`,'<button data-action="close">Close</button>');
}
function activityView(){
 const games=new Map(state.games.map(g=>[g.id,g]));
 const away=state.games.flatMap(g=>Object.values(g.itemHistory||{}).filter(h=>h.automatic&&h.sources?.some(s=>s.kind==='friend')&&Math.max(h.requestedAt||0,h.firstDetectedAt||0)>(g.activityReviewedAt||state.activityReviewedAt||0)).map(h=>({appid:g.id,gameName:g.name,id:h.id,title:h.title,type:h.pending?'requested':'downloaded',at:Math.max(h.requestedAt||0,h.firstDetectedAt||0),observedAt:Math.max(h.requestedAt||0,h.firstDetectedAt||0),sources:h.sources,automatic:true}))).sort((a,b)=>b.at-a.at);
 const events=(activityFilter==='away'?away:state.modActivity||[]).filter(e=>{
  const g=games.get(e.appid);if(!g||(!activityAllGames&&e.appid!==game))return false;
  return true;
 });
 const controls=`<div class="activity-tools ${activityFilter==='log'?'log-mode':''}"><select id="activity-filter" aria-label="Activity filter">${[['away','While away · friend additions'],['mods','All mod activity'],['log','App messages']].map(([v,label])=>`<option value="${v}" ${activityFilter===v?'selected':''}>${label}</option>`).join('')}</select><label><input type="checkbox" id="activity-all-games" ${activityAllGames?'checked':''}> All games</label><button class="small" data-action="reviewActivity">Mark ${activityAllGames?'all games':'this game'} reviewed</button></div>`;
 if(activityFilter==='log')return controls+appMessages();
 return controls+`<p class="view-hint">${activityFilter==='away'?'Automatic additions from followed friends stay here until marked reviewed.':'Download requests and detected files are recorded separately. Updates keep their original install source.'}</p>`+(events.length?`<div class="mod-activity">${events.map(e=>{
  const row=state.games.find(g=>g.id===e.appid)?.subscriptions.find(r=>r.id===e.id);const title=row?.title||e.title;
  const action=e.type==='requested'?'Subscription requested':e.type==='updated'?'Steam mod update detected':'Downloaded files detected';
  const from=e.type==='updated'?'Steam updated an existing mod':`Added by ${sourceNames(e.sources)}${e.automatic?' · automatic sync':e.sources.some(s=>s.kind==='friend')?' · selected by you':''}`;
  return `<article class="mod-event"><time>${esc(localDate(e.observedAt||e.at))}</time><div><button class="mod-title" data-action="modDetails" data-id="${esc(e.id)}"><strong>${esc(title)}</strong></button><span>${esc(e.gameName)} · ${action}</span><span>${esc(from)}</span></div><button class="text-button" data-action="open" data-id="${esc(e.id)}">View</button></article>`;
 }).join('')}</div>`:empty(activityFilter==='away'?'No new friend additions':'No mod activity recorded yet',activityFilter==='away'?'New requests and files from followed friends will appear here. The companion must be open to request new downloads.':'Tracking starts with this version. Older files remain visible in Downloaded with estimated dates and unknown sources.'));
}

function appMessages(){
 const categories=[['all','All sources'],['scan','Library scans'],['catalog','Game verification'],['sync','Synchronization'],['download','Downloads'],['sharing','Friend sharing'],['update','App updates'],['lists','Chosen lists'],['other','Other']];
 const levels=[['all','All message types'],['error','Errors only'],['problems','Warnings & errors'],['warning','Warnings only'],['success','Successes only'],['info','Information only']];
 const entries=AppLog.filtered(state.log,messageSettings);
 const filters=`<div class="message-filters"><select id="message-level" aria-label="Message severity">${levels.map(([v,label])=>`<option value="${v}" ${messageSettings.level===v?'selected':''}>${label}</option>`).join('')}</select><select id="message-category" aria-label="Message source">${categories.map(([v,label])=>`<option value="${v}" ${messageSettings.category===v?'selected':''}>${label}</option>`).join('')}</select><label><input type="checkbox" id="hide-routine" ${messageSettings.hideRoutine?'checked':''}> Hide routine checks</label><label><input type="checkbox" id="hide-recurring" ${messageSettings.hideRecurring?'checked':''}> Hide recurring messages</label></div><p class="view-hint">Identical messages are grouped. Counts and first/last times stay available; routine checks with no changes are hidden by default.</p>`;
 return filters+(entries.length?`<div class="activity">${entries.map(e=>{const category=categories.find(([key])=>key===e.category)?.[1]||'Other';const game=e.game?(state.games.find(g=>g.id===e.game)?.name||'Game '+e.game):'';return `<div class="event ${esc(e.kind)}"><time>${esc(localDate(e.at))}</time><div class="log-message"><span>${esc(e.message.replace(/(?:^|\s)Steam (?:manages|handles) (?:the )?downloads?(?: already queued)?\.?/g,''))}</span><small>${esc(category)}${game?' · '+esc(game):''}</small>${e.repeatCount>1?`<span class="log-repeat" title="First: ${esc(localDate(e.firstAt))}; Last: ${esc(localDate(e.at))}">Repeated ${e.repeatCount} times · First ${esc(localDate(e.firstAt))} · Last ${esc(localDate(e.at))}</span>`:''}</div></div>`;}).join('')}</div>`:empty('No messages match these filters','Change the message type, source, or routine-check filters to inspect other activity.'));
}
