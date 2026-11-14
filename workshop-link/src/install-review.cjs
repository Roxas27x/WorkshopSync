const {randomUUID}=require('node:crypto');
const {id}=require('./core.cjs');
class InstallReviews{
 constructor(inspect){this.inspect=inspect;this.pending=new Map();}
 async createIfNeeded(options,progress){const review=await this.create(options,progress);if(review&&!review.requiresReview){this.consume(review.token);return null;}return review;}
 async create({game,account,rows,privacy='existing',automatic=false,subscribed=[]},progress=()=>{}){
  if(!rows.length)return null;const ticket={token:randomUUID(),game,account,privacy,automatic,subscribed:new Set(subscribed),rows:new Map(rows.map(row=>[row.id,row])),primary:rows.map(row=>row.id),metadata:new Map(),selected:new Set(rows.map(row=>row.id)),expires:Date.now()+15*60000};
  await this.inspectSelected(ticket,ticket.primary,progress);this.pending.set(ticket.token,ticket);if(this.pending.size>12)this.pending.delete(this.pending.keys().next().value);return this.view(ticket);
 }
 async inspectSelected(ticket,values,progress){
  const missing=values.filter(id=>!ticket.metadata.has(id));if(!missing.length)return;
  const found=await this.inspect(missing,progress);for(const item of found){ticket.metadata.set(item.id,item);if(item.appid===ticket.game&&item.type!==2&&!item.unavailable&&!ticket.rows.has(item.id))ticket.rows.set(item.id,{id:item.id,appid:item.appid,title:item.title,type:item.type,installSources:[{kind:'self',name:'You'}]});}
  for(const pid of missing)if(!ticket.metadata.has(pid))ticket.metadata.set(pid,{id:pid,title:'Workshop item '+pid,unavailable:true,compatibilityNotes:['Steam did not return information for this item.'],relatedItems:[],required:[],pageDetails:false});
 }
 view(ticket){
  const candidates=new Map(),items=[],warnings=[];
  for(const pid of new Set([...ticket.primary,...ticket.selected])){const m=ticket.metadata.get(pid);if(!m)continue;
   const blocked=m.unavailable||m.appid!==ticket.game||m.type===2;
   items.push({id:pid,title:m.title,notes:m.compatibilityNotes||[],pageDetails:!!m.pageDetails,blocked:!!blocked,selected:ticket.selected.has(pid)});
   if(blocked&&ticket.selected.has(pid))warnings.push(m.title+' is unavailable or belongs to another game.');
   if(!ticket.selected.has(pid))continue;
   for(const row of m.required||[])if(row.id!==pid)candidates.set(row.id,{...row,kind:'required',from:m.title});
   for(const row of m.relatedItems||[])if(!candidates.has(row.id)&&row.kind!=='related'&&row.id!==pid)candidates.set(row.id,{...row,from:m.title});
  }
  const suggestions=[...candidates.values()].slice(0,200).map(row=>{const m=ticket.metadata.get(row.id),subscribed=ticket.subscribed.has(row.id);return{...row,title:m?.title||row.title,subscribed,checked:!subscribed&&(ticket.selected.has(row.id)||row.kind==='required'),inspected:!!m,blocked:!!m&&(m.unavailable||m.appid!==ticket.game||m.type===2)};});
  const unknown=items.filter(item=>item.selected&&!item.pageDetails).length,hasNotes=items.some(item=>item.selected&&item.notes.length),hasRequirements=suggestions.some(row=>row.kind==='conflict'||!row.subscribed);
  return{token:ticket.token,game:ticket.game,privacy:ticket.privacy,primary:ticket.primary,selected:[...ticket.selected],items,suggestions,warnings,unknown,requiresReview:hasNotes||hasRequirements||unknown>0||warnings.length>0,checkedAt:Date.now(),truncated:candidates.size>200};
 }
 get(token,account){const ticket=this.pending.get(token);if(!ticket||ticket.account!==account||ticket.expires<Date.now()){this.pending.delete(token);throw new Error('This install review expired. Select the mods again.');}return ticket;}
 async confirm({token,ids,acknowledged},account,progress=()=>{}){
  const ticket=this.get(token,account),view=this.view(ticket),allowed=new Set([...ticket.primary,...view.suggestions.map(row=>row.id),...ticket.metadata.keys()]);
  if(!Array.isArray(ids)||!ids.length||ids.length>5200)throw new Error('Select the mods you want to install.');const chosen=[...new Set(ids.map(id))];if(chosen.some(id=>!allowed.has(id)))throw new Error('An item was not part of this install review.');
  const missing=chosen.filter(id=>!ticket.metadata.has(id));ticket.selected=new Set(chosen);
  if(missing.length){if(ticket.metadata.size+missing.length>5200)throw new Error('Review a smaller group of mods.');await this.inspectSelected(ticket,missing,progress);ticket.expires=Date.now()+15*60000;return{review:this.view(ticket)};}
  const current=this.view(ticket);if(current.warnings.length)throw new Error('Remove unavailable or different-game items before continuing.');
  const omitted=current.suggestions.some(row=>row.kind==='required'&&!row.subscribed&&!ticket.selected.has(row.id));if((current.requiresReview||omitted)&&acknowledged!==true)throw new Error('Read the author notes and confirm your selection before installing.');
  return{ticket,rows:chosen.map(id=>ticket.rows.get(id)),ids:chosen};
 }
 consume(token){this.pending.delete(token);}
}
function reviewRequired(review){const error=new Error('Review the mod requirements before installing.');error.code='MOD_REVIEW_REQUIRED';error.review=review;return error;}
module.exports={InstallReviews,reviewRequired};
