const PUBLIC_KEY="MCowBQYDK2VwAyEAW2L19NFuTwChp1ocMCzkmDIe7uLMaMEcGqakpMGPPpU=";
const RELEASE_VERSION=/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const MAX_RELEASE_SIZE=200*1024*1024;
function compareReleaseVersions(a,b){
 if(!RELEASE_VERSION.test(a)||!RELEASE_VERSION.test(b))throw new Error('Invalid release version.');
 const aa=a.split('.').map(Number),bb=b.split('.').map(Number);for(let i=0;i<3;i++)if(aa[i]!==bb[i])return aa[i]>bb[i]?1:-1;return 0;
}
function validateRelease(value){
 if(!value||value.schema!==1||!RELEASE_VERSION.test(value.version))throw new Error('Invalid update manifest.');
 if(value.platform!=='win32'||value.arch!=='x64'||value.file!==`Workshop-Link-Setup-${value.version}.exe`)throw new Error('Unsupported update package.');
 if(!Number.isSafeInteger(value.size)||value.size<1||value.size>MAX_RELEASE_SIZE)throw new Error('Invalid installer size.');
 if(!/^[a-f0-9]{64}$/.test(value.sha256)||!/^[A-Za-z0-9+/]{86}==$/.test(value.sha512))throw new Error('Invalid installer checksum.');
 if(typeof value.publishedAt!=='string'||!Number.isFinite(Date.parse(value.publishedAt)))throw new Error('Invalid release date.');
 if(typeof value.notes!=='string'||value.notes.length>4000)throw new Error('Release notes must be at most 4,000 characters.');
 return{schema:1,version:value.version,platform:'win32',arch:'x64',file:value.file,size:value.size,sha256:value.sha256,sha512:value.sha512,publishedAt:value.publishedAt,notes:value.notes};
}
function releaseText(value){return JSON.stringify(validateRelease(value));}


const decode64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function verifiedRelease(envelope){const manifest=validateRelease(envelope?.manifest);if(!/^[A-Za-z0-9+/]{86}==$/.test(envelope?.signature||''))throw new Error('Missing release signature.');const key=await crypto.subtle.importKey('spki',decode64(PUBLIC_KEY),{name:'Ed25519'},false,['verify']);if(!await crypto.subtle.verify('Ed25519',key,decode64(envelope.signature),new TextEncoder().encode(releaseText(manifest))))throw new Error('Release signature could not be verified.');return manifest;}

let currentRelease;
async function loadRelease(){
 const status=document.querySelector('#release-status');
 try{const response=await fetch('/api/release',{cache:'no-store'});if(!response.ok)throw new Error('Release details are temporarily unavailable.');const release=await verifiedRelease(await response.json());currentRelease=release;document.querySelector('#release-line').textContent=`Version ${release.version} · ${(release.size/1024/1024).toFixed(1)} MB · Windows 10 / 11`;document.querySelector('#release-version').textContent='v'+release.version;document.querySelectorAll('[data-release-version]').forEach(node=>node.textContent=release.version);document.querySelector('#release-notes').textContent=release.notes;document.querySelector('#release-size').textContent=(release.size/1024/1024).toFixed(1)+' MB';document.querySelector('#release-date').textContent=new Date(release.publishedAt).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});document.querySelector('#release-checksum').textContent=release.sha256;document.querySelector('#copy-checksum').disabled=false;status.textContent='Release signature verified. The checksum above identifies the current installer.';}
 catch(error){document.querySelector('#release-line').textContent='Download the latest available installer';status.textContent=error.message+' Try refreshing this page.';document.querySelector('#release-checksum').textContent='No verified checksum available.';document.querySelector('#release-size').textContent='Unavailable';document.querySelector('#release-date').textContent='Unavailable';}
}
document.querySelector('#copy-checksum').addEventListener('click',async()=>{if(!currentRelease)return;try{await navigator.clipboard.writeText(currentRelease.sha256);document.querySelector('#copy-status').textContent='Checksum copied.';}catch{document.querySelector('#copy-status').textContent='Select and copy the checksum above.';}});
loadRelease();

const previews={
 lists:{src:'/screens/lists.png',alt:'WorkshopSync My lists view showing Friday co-op, two selected rows and selection actions above the mod table.',caption:'A separate list for every group. Select a whole row, then add those mods to the list you choose.'},
 friends:{src:'/screens/friends.png',alt:'WorkshopSync Friends view with two selected friends, shared Workshop items and one-time install controls.',caption:'Choose several friends at once. Browse their items together, pick individual mods, or install all available.'},
 sharing:{src:'/screens/sharing.png',alt:'The Share Friday co-op dialog with Selected friends as its audience and Alex and Jamie selected.',caption:'Each list has its own audience. Keep it private, share it with everyone connected, or choose specific friends.'},
 light:{src:'/screens/light.png',alt:'WorkshopSync My lists view using the Sand palette in light mode.',caption:'Five palettes, with dark, light, or system mode. Shown here: Sand in light mode.'}
};
const previewTabs=[...document.querySelectorAll('[data-preview]')];
function showPreview(tab,focus=false){
 const preview=previews[tab.dataset.preview];if(!preview)return;
 for(const item of previewTabs){item.setAttribute('aria-selected',String(item===tab));item.tabIndex=item===tab?0:-1;}
 document.querySelector('#preview-image').src=preview.src;document.querySelector('#preview-image').alt=preview.alt;
 document.querySelector('#preview-caption').textContent=preview.caption;
 document.querySelector('#app-preview').setAttribute('aria-labelledby',tab.id);
 for(const id of ['#preview-full','#preview-expand'])document.querySelector(id).href=preview.src;
 if(focus)tab.focus();
}
for(const tab of previewTabs){
 tab.addEventListener('click',()=>showPreview(tab));
 tab.addEventListener('keydown',event=>{let index=previewTabs.indexOf(tab);if(event.key==='ArrowRight')index=(index+1)%previewTabs.length;else if(event.key==='ArrowLeft')index=(index+previewTabs.length-1)%previewTabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=previewTabs.length-1;else return;event.preventDefault();showPreview(previewTabs[index],true);});
}
document.querySelector('#copy-download').addEventListener('click',async()=>{const status=document.querySelector('#download-copy-status');try{await navigator.clipboard.writeText('https://workshopsync.pages.dev/download');status.textContent='Download link copied.';}catch{status.textContent='workshopsync.pages.dev/download';}});
