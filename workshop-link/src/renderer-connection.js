function showConnection(){
 const waiting=state.connection?.phase==='waiting'||state.relay.pending,complete=state.connected&&state.relay.connected;
 modal(complete?'Steam & friends connected':'Connect Steam & friends',`<ol class="connection-steps"><li class="${state.connected?'done':''}"><strong>Confirm Steam in your browser</strong><span>${state.connected?'Steam identity confirmed.':'Use your existing browser sign-in and approve Steam’s confirmation.'}</span></li><li class="${state.relay.connected?'done':''}"><strong>Connect friend sharing automatically</strong><span>${state.relay.connected?'Friend sharing is connected.':'The companion finishes this step when Steam confirms your account.'}</span></li></ol>${waiting?'<div class="callout">Waiting for Steam confirmation in your browser. Return here after approving.</div>':''}${state.connection?.error?`<p class="bad">${esc(state.connection.error)}</p>`:''}${state.friendReadError?`<div class="callout">${esc(state.friendReadError)}<br><button data-action="authorizeSteam">Authorize private Steam data</button></div>`:''}<p class="hint">Connecting shares subscriptions for every Workshop game by default. Named lists use the sharing audiences you choose. Downloads remain opt-in. Steam may request sign-in if your browser session has expired.</p>${complete&&!state.steamWebAuthorized?'<p class="hint">Local subscriptions and public friends work with browser confirmation. To subscribe to items or read private Steam pages, authorize Steam Community access once.</p>':''}`,complete?'<button data-action="close">Close</button><button data-action="refreshFriends">Refresh friends</button>':`<button data-action="${waiting?'cancelConnection':'close'}">${waiting?'Cancel connection':'Cancel'}</button><button class="primary" data-action="connect">${waiting?'Reopen Steam confirmation':'Continue in my browser ↗'}</button>`);
 $('.modal').dataset.connectionSheet='true';
}
function showSteamAuthorization(){
 const review=Boolean($('.modal')?.dataset.reviewToken);if($('.modal'))suspendCurrentModal();
 modal('Reconnect Steam downloads',`<p>Steam needs a valid Community sign-in before this companion can subscribe to Workshop items or read private pages.</p><label class="checkline"><input type="checkbox" id="keep-steam-signed-in" ${state.steamRenewal?.enabled?'checked':''}><span><strong>Keep me signed in on this PC</strong><br>Automatically renew download access. Your sign-in is saved encrypted on this PC.</span></label><p>Approve the same account you connected to WorkshopSync. Steam Guard QR approval is available when keeping your sign-in.</p>${review?'<p>Your reviewed mods and checkboxes are saved here. After reconnecting, return to this review and press Install selected again.</p>':''}`,'<button data-action="close">'+(review?'Back to review':'Later')+'</button><button class="primary" data-action="authorizeSteam">Reconnect Steam ↗</button>');$('.modal').dataset.steamAuthorization='true';
}
let steamRenewalViewKey='';
function showSteamRenewal(info=state.steamRenewal){
 const old=$('.modal');if(old&&!old.dataset.steamRenewal&&!old.dataset.steamAuthorization)suspendCurrentModal();
 const waiting=info.status==='waiting',working=info.status==='renewing';
 const body=waiting?`<p>Open Steam on your phone, choose Steam Guard, and scan this code. Approve the same Steam account connected to WorkshopSync.</p>${info.qrImage?`<div class="steam-renewal-qr"><img src="${esc(info.qrImage)}" alt="Steam Guard sign-in QR code"></div>`:'<p>Preparing your Steam QR code…</p>'}<p class="hint">This code expires after two minutes. WorkshopSync will save your sign-in encrypted on this PC and renew it automatically.</p>`:working?'<p role="status">Steam approved the sign-in. Finishing your connection…</p>':`<p role="status">${esc(info.error||'Approve Steam to finish keeping your sign-in.')}</p>`;
 modal('Keep Steam signed in',body,`<button data-action="close">${waiting?'Cancel':'Close'}</button>${!waiting&&!working&&info.status!=='retrying'?'<button class="primary" data-action="setupSteamRenewal">Get a new QR code</button>':''}`);$('.modal').dataset.steamRenewal='true';steamRenewalViewKey=JSON.stringify(info);
}
async function beginSteamRenewal(){
 const parent=$('.modal'),info=await call('startSteamRenewal');
 if(parent&&$('.modal')!==parent){await call('cancelSteamRenewal');return;}
 showSteamRenewal(info);
}
function refreshSteamRenewal(){
 if(!$('.modal')?.dataset.steamRenewal)return;const info=state.steamRenewal;if(!info)return;
 if(info.status==='ready'&&info.configured){close();render();toast('Steam will stay signed in on this PC.');return;}
 if(info.status==='off'){close();return;}
 if(JSON.stringify(info)!==steamRenewalViewKey)showSteamRenewal(info);
}
function steamRenewalSettings(){
 const info=state.steamRenewal||{},label=info.status==='ready'?'Automatic renewal is active.':info.status==='renewing'?'Renewing your Steam sign-in…':info.status==='waiting'?'Waiting for Steam Guard approval.':info.status==='retrying'?'Steam is unavailable. Renewal will retry automatically.':info.enabled?'Steam approval is needed to finish setup.':'';
 return `<section class="settings-group"><label class="checkline"><input type="checkbox" data-action="keepSteam" ${info.enabled?'checked':''} ${!state.connected||state.busy?'disabled':''}><span><strong>Keep me signed in on this PC</strong><br>Automatically renew Steam download access. Your sign-in is saved encrypted on this PC.</span></label>${label?`<p role="status">${esc(label)}</p>`:''}${info.enabled&&!info.configured?'<div class="settings-actions"><button data-action="setupSteamRenewal">Finish Steam approval</button></div>':''}</section>`;
}
