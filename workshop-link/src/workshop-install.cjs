const {id}=require('./core.cjs');
const Privacy=require('./item-privacy.js');
async function installWorkshop(g,p,{details,subscribe,save,emit=()=>{},publish,sharingConnected,maxItems=100}){
 if(!['private','shared'].includes(p.privacy)||!Array.isArray(p.ids)||!p.ids.length||p.ids.length>maxItems)throw new Error('Choose Workshop items and how to share them.');
 const ids=[...new Set(p.ids.map(id))],rows=await details(ids);
 if(rows.length!==ids.length||rows.some(row=>!ids.includes(row.id)||row.appid!==g.id||row.type===2||row.unavailable))throw new Error('Choose available mods belonging to this game.');
 if(p.privacy==='shared'&&(!sharingConnected||!g.shareSubscriptions||g.sharingAudience.mode==='private'))throw new Error('Enable subscription sharing for this game first. Your other games and list audiences stay separate.');
 if(p.privacy==='private'){
  Privacy.set(g,ids,true);await save();emit();
  if(sharingConnected){try{await publish();}catch(error){throw new Error('Your private choice was saved, but friend sharing could not be refreshed. No new subscription was requested. '+error.message);}}
 }
 const result=await subscribe(rows);
 if(p.privacy==='shared'){Privacy.set(g,ids.filter(pid=>g.subscribedIds.includes(pid)),false);await save();await publish();}
 return result;
}
module.exports={installWorkshop};
