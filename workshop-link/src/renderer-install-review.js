const modalFrames=[],reviewContexts=new Map(),installReviewActionNames=new Set(['confirmModReview','pendingModReviews','reviewPendingGame']);
function suspendCurrentModal(){
 const backdrop=$('#modal-root')?.firstElementChild;if(!backdrop)return;
 const dialog=backdrop.querySelector('.modal');modalFrames.push({element:backdrop,scroll:dialog.scrollTop,focus:document.activeElement,previousFocus,details:typeof activeModDetails==='undefined'?null:activeModDetails});backdrop.remove();
}
function restoreParentModal(){
 const frame=modalFrames.pop();if(!frame)return false;$('#modal-root').replaceChildren(frame.element);activeModDetails=frame.details;previousFocus=frame.previousFocus;
 const dialog=$('.modal');dialog.scrollTop=frame.scroll;
 for(const button of dialog.querySelectorAll('[data-action=modDetails],[data-action=modQuickInstall]'))button.disabled=false;
 refreshReviewSubscriptions();refreshModInstallButtons();frame.focus?.focus({preventScroll:true});
 if(dialog.dataset.blacklistGame){const position=dialog.scrollTop;showBlacklist();$('.modal').scrollTop=position;}
 if(dialog.dataset.modLoading==='true')showModDetails(dialog.dataset.modDetails);
 return true;
}
function allSubscribed(){return new Set((state?.games||[]).flatMap(g=>g.subscribedIds));}
function refreshReviewSubscriptions(){const subscribed=allSubscribed();for(const input of document.querySelectorAll('[data-review-item]'))if(subscribed.has(input.dataset.reviewItem)){input.checked=false;input.disabled=true;const status=input.closest('.review-choice')?.querySelector('.review-subscription');if(status)status.textContent='Subscribed';}updateReviewButton();}
function updateReviewButton(){
 const dialog=$('.modal');if(!dialog?.dataset.reviewToken)return;
 const selected=dialog.querySelectorAll('[data-review-item]:checked').length,button=dialog.querySelector('[data-action=confirmModReview]');
 if(button){button.textContent='Install selected ('+selected+')';button.disabled=!selected||state.busy;}
}
function selectReviewRequirements(input){
 if(!input.checked)return;const plan=reviewContexts.get($('.modal')?.dataset.reviewToken);if(!plan)return;
 const queue=[input.dataset.reviewItem],visited=new Set(),inputs=new Map([...document.querySelectorAll('[data-review-item]')].map(node=>[node.dataset.reviewItem,node]));
 while(queue.length){const id=queue.shift();if(visited.has(id))continue;visited.add(id);for(const item of plan.items)if(!item.blocked&&item.parents?.some(parent=>parent.id===id&&parent.kind==='required')){const control=inputs.get(item.id);if(control&&!control.disabled)control.checked=true;queue.push(item.id);}}
}
function showInstallReview(plan){
 const old=$('.modal'),same=old?.dataset.reviewToken===plan.token,choices=new Map(same?[...old.querySelectorAll('[data-review-item]')].map(input=>[input.dataset.reviewItem,input.checked]):[]),scroll=same?old.scrollTop:0;
 if(old&&!same)suspendCurrentModal();reviewContexts.set(plan.token,plan);if(reviewContexts.size>20)reviewContexts.delete(reviewContexts.keys().next().value);
 const subscribed=allSubscribed(),kindLabel={primary:'Selected mod',required:'Required on Steam','author-required':'Author requirement — review the instructions',optional:'Optional / recommended',compatibility:'Compatibility / patch',conflict:'Possible conflict — see author note'};
 const choice=item=>{
  const present=subscribed.has(item.id)||item.subscribed,blocked=!!item.blocked,checked=choices.has(item.id)?choices.get(item.id):plan.selected.includes(item.id);
  return `<section data-review-node="${esc(item.id)}" data-review-kind="${esc(item.kind)}" data-review-depth="${Math.min(item.depth||0,4)}"><div class="review-choice"><label><input type="checkbox" data-review-item="${esc(item.id)}" ${!present&&!blocked&&checked?'checked':''} ${present||blocked?'disabled':''}><span><strong>${esc(item.title)}</strong><small>${esc(kindLabel[item.kind]||'Linked mod')}</small>${(item.parents||[]).map(parent=>`<small>${esc(kindLabel[parent.kind]||'Linked mod')} · ${esc(parent.title)}${parent.context?'<br>'+esc(parent.context):''}</small>`).join('')}<small class="review-subscription">${blocked?'Unavailable or different game':present?'Subscribed':''}</small></span></label><button class="small" data-action="modDetails" data-id="${esc(item.id)}">Details</button></div>${item.notes.length?`<div class="review-author-notes"><strong>Author’s notes</strong>${item.notes.map(note=>`<blockquote>${esc(note)}</blockquote>`).join('')}</div>`:''}</section>`;
 };
 const body=`<p>Review the mods, their requirements, and linked recommendations together before installing.</p><div class="callout">${plan.privacy==='private'?'Every selected item will stay private in WorkshopSync.':plan.privacy==='shared'?'Every selected item will use this game’s subscription-sharing audience.':'Existing sharing choices apply to the selected items.'}</div><p class="hint">Each mod appears once, with the mods that link to it shown underneath its name. Required Steam items are selected with their parent. Optional recommendations stay off until you choose them. These are author notes, not a compatibility test.</p>${plan.unknown?`<p class="review-warning">Steam’s full required-items page could not be verified for ${plan.unknown} ${plan.unknown===1?'item':'items'}. Available descriptions and links are included. Open Details to inspect them.</p>`:''}<h3>Mods and dependency tree</h3><div class="review-items review-tree">${plan.items.map(choice).join('')}</div>${plan.requiresReview?'<label class="checkline review-ack"><input type="checkbox" id="review-ack"><span>I have read the notes and selected the items I want to install, including any required items I choose to include.</span></label>':''}`;
 modal('Review mod compatibility · '+esc(state.games.find(g=>g.id===plan.game)?.name||plan.game),body,`<button data-action="close">${modalFrames.length?'Back':'Cancel'}</button><button class="primary" data-action="confirmModReview">Install selected</button>`,true);$('.modal').classList.add('install-review');$('.modal').dataset.reviewToken=plan.token;$('.modal').scrollTop=scroll;updateReviewButton();
}

function renderInstallReviews(){const banner=$('#review-banner');if(!banner)return;const count=(state.games||[]).reduce((sum,g)=>sum+(g.pendingReviewIds?.length||0),0);banner.hidden=!count;if(count)banner.innerHTML=`<div><strong>${count} ${count===1?'mod is':'mods are'} waiting for compatibility review</strong><span>Automatic installs are held until you review the author’s notes.</span></div><button class="small" data-action="pendingModReviews">Review mods</button>`;}
async function handleInstallReviewAction(action,e){
 if(action==='pendingModReviews'){if($('.modal'))suspendCurrentModal();const games=state.games.filter(g=>g.pendingReviewIds?.length);modal('Mods waiting for review',`<p>These additions were held during automatic synchronization.</p>${games.map(g=>`<div class="review-pending-game"><span>${esc(g.name)} · ${g.pendingReviewIds.length} items</span><button data-action="reviewPendingGame" data-id="${g.id}">Review</button></div>`).join('')}`,'<button data-action="close">Close</button>');$('.modal').dataset.pendingReviews='true';return;}
 if(action==='reviewPendingGame'){await call('reviewPendingMods',{game:e.dataset.id});close();toast('No pending items remain in the current shared lists.');return;}
 const dialog=$('.modal'),token=dialog.dataset.reviewToken,ids=[...dialog.querySelectorAll('[data-review-item]:checked')].map(input=>input.dataset.reviewItem),ack=dialog.querySelector('#review-ack');if(ack&&!ack.checked)throw new Error('Read the author notes and confirm your selection before installing.');
 let result;try{result=await call('confirmModReview',{token,ids,acknowledged:!ack||ack.checked});}catch(error){if(error.code==='MOD_REVIEW_REQUIRED'&&$('.modal')!==dialog)return;throw error;}
 reviewContexts.delete(token);if($('.modal')===dialog){close();if($('.modal')?.dataset.workshopIds||$('.modal')?.dataset.pendingReviews)close();}selected.clear();refreshModInstallButtons();render();toast(result.requested?`Requested ${result.requested} subscriptions.`:'The selected items are already subscribed.');
}
document.addEventListener('change',event=>{if(event.target.dataset.reviewItem){selectReviewRequirements(event.target);updateReviewButton();}});
