function renderGameLibrary(){
 const syncFocus=document.activeElement?.dataset.action==='quickSync'?document.activeElement.dataset.id:null;
 const order=GameLibrary.normalizeSort(state.gameSort),games=GameLibrary.sorted(state.games,order,state.sharedGameStats);
 if(!current())game=games[0]?.id;
 $('#game-sort').value=order;
 $('#game-sort').title=order==='shared'?'Unique Workshop items shared by connected friends across subscriptions and chosen lists. Duplicate items count once.':order==='name'?'Game names in alphabetical order.':'Latest played uses this Steam account’s local play history. Games without history appear last.';
 $('#games').innerHTML=games.map(g=>{
  const stats=GameLibrary.sharedStats(state.sharedGameStats,g.id),played=GameLibrary.played(g);
  const detail=order==='shared'?`${stats.itemCount} shared ${stats.itemCount===1?'item':'items'} · ${stats.friendCount} ${stats.friendCount===1?'friend':'friends'}`:played?`Last played ${new Date(played).toLocaleDateString(undefined,{month:'short',day:'numeric'})}`:'No play history';
  const title=order==='shared'?`${stats.itemCount} unique Workshop items shared by ${stats.friendCount} connected friends`:played?`Last played ${new Date(played).toLocaleString()}`:'Steam has no local play history for this account';
  return `<div class="game-entry ${g.id===game?'chosen':''}"><button class="game-nav ${g.id===game?'chosen':''}" data-action="game" data-id="${g.id}"><span class="game-avatar">${g.icon?`<img src="${esc(g.icon)}" width="32" height="32" alt="">`:'▧'}</span><span class="game-label"><span class="game-name">${esc(g.name)}</span><span class="game-counts">${g.subscribedIds.length} subscribed · ${g.installed.length} downloaded</span>${order!=='name'?`<span class="game-sort-meta" title="${esc(title)}">${esc(detail)}</span>`:''}</span></button><button class="switch quick-sync" role="switch" aria-label="Automatically synchronize ${esc(g.name)}" aria-checked="${!!g.sync}" title="Turn automatic downloads ${g.sync?'off':'on'} for ${esc(g.name)}" data-action="quickSync" data-id="${g.id}"></button></div>`;
 }).join('');
 if(syncFocus)document.querySelector('[data-action="quickSync"][data-id="'+syncFocus+'"]')?.focus();
}
