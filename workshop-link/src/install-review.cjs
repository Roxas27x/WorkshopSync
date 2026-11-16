const {randomUUID}=require('node:crypto');
const {id}=require('./core.cjs');
class InstallReviews{
 constructor(inspect,{maxDependencies=200}={}){this.inspect=inspect;this.maxDependencies=maxDependencies;this.pending=new Map();}
 async createIfNeeded(options,progress){const review=await this.create(options,progress);if(review&&!review.requiresReview){this.consume(review.token);return null;}return review;}
 async create({game,account,rows,privacy='existing',automatic=false,subscribed=[]},progress=()=>{}){
  if(!rows.length)return null;
  const ticket={token:randomUUID(),game,account,privacy,automatic,subscribed:new Set(subscribed),rows:new Map(rows.map(row=>[row.id,row])),primary:[...new Set(rows.map(row=>row.id))],metadata:new Map(),edges:new Map(),selected:new Set(rows.map(row=>row.id))};
  await this.inspectTree(ticket,progress);
  const queue=[...ticket.selected],visited=new Set();
  while(queue.length){const pid=queue.shift();if(visited.has(pid))continue;visited.add(pid);for(const link of ticket.edges.get(pid)||[])if(link.kind==='required'){const item=ticket.metadata.get(link.id);if(item&&!this.blocked(ticket,item)){if(!ticket.subscribed.has(link.id))ticket.selected.add(link.id);queue.push(link.id);}}}
  ticket.expires=Date.now()+15*60000;this.pending.set(ticket.token,ticket);if(this.pending.size>12)this.pending.delete(this.pending.keys().next().value);return this.view(ticket);
 }
 blocked(ticket,item){return !!(item.unavailable||item.appid!==ticket.game||item.type===2);}
 async inspectTree(ticket,progress){
  let frontier=ticket.primary.map(id=>({id,expand:true}));const expanded=new Set(),discovered=new Set(ticket.primary),budget={pageDeadline:Date.now()+45000,pages:0,maxPages:60};
  while(frontier.length){
   const missing=[...new Set(frontier.map(row=>row.id))].filter(pid=>!ticket.metadata.has(pid));
   if(missing.length){
    const found=await this.inspect(missing,()=>progress(ticket.metadata.size,discovered.size),budget),requested=new Set(missing);
    for(const item of found){if(!requested.has(item.id))continue;ticket.metadata.set(item.id,item);if(!this.blocked(ticket,item)&&!ticket.rows.has(item.id))ticket.rows.set(item.id,{id:item.id,appid:item.appid,title:item.title,type:item.type,installSources:[{kind:'self',name:'You'}]});}
    for(const pid of missing)if(!ticket.metadata.has(pid))ticket.metadata.set(pid,{id:pid,title:'Workshop item '+pid,unavailable:true,compatibilityNotes:['Steam did not return information for this item.'],required:[],relatedItems:[],pageDetails:false});
   }
   const next=new Map();
   for(const current of frontier){
    const item=ticket.metadata.get(current.id);if(!current.expand||expanded.has(current.id)||this.blocked(ticket,item))continue;expanded.add(current.id);
    const links=new Map();
    for(const row of item.relatedItems||[])if(row.kind!=='related'&&row.id!==item.id)links.set(row.id,row);
    for(const row of item.required||[])if(row.id!==item.id)links.set(row.id,{...row,kind:'required'});
    const rank={required:0,'author-required':1,compatibility:2,optional:3,conflict:4};ticket.edges.set(item.id,[...links.values()].sort((a,b)=>(rank[a.kind]??5)-(rank[b.kind]??5)));
    for(const link of links.values()){
     discovered.add(link.id);if(discovered.size>Math.min(5200,ticket.primary.length+this.maxDependencies))throw new Error('This dependency tree is too large to review in one install. Select fewer mods and try again.');
     const expand=true;if(!ticket.metadata.has(link.id)||expand&&!expanded.has(link.id))next.set(link.id,{id:link.id,expand:expand||next.get(link.id)?.expand===true});
    }
   }
   progress(ticket.metadata.size,discovered.size);frontier=[...next.values()];
  }
 }
 view(ticket){
  const parents=new Map();for(const [source,links]of ticket.edges)for(const link of links){if(!parents.has(link.id))parents.set(link.id,[]);parents.get(link.id).push({...link,id:source,title:ticket.metadata.get(source)?.title||'Workshop item '+source});}
  const primary=new Set(ticket.primary),items=[],visited=new Set(),suggestions=[],warnings=[];
  const visit=(pid,depth)=>{if(visited.has(pid))return;visited.add(pid);const m=ticket.metadata.get(pid);if(!m)return;const from=parents.get(pid)||[],blocked=this.blocked(ticket,m),subscribed=ticket.subscribed.has(pid),kind=primary.has(pid)?'primary':from.some(row=>row.kind==='required')?'required':from[0]?.kind||'related';
   const item={id:pid,title:m.title,notes:m.compatibilityNotes||[],pageDetails:!!m.pageDetails,blocked,subscribed,selected:ticket.selected.has(pid)&&!subscribed,primary:primary.has(pid),kind,parents:from,depth:primary.has(pid)?0:depth};items.push(item);
   if(blocked&&ticket.selected.has(pid))warnings.push(m.title+' is unavailable or belongs to another game.');
   if(!item.primary)suggestions.push({...item,from:from.map(row=>row.title).join(', '),context:from[0]?.context,checked:item.selected,inspected:true});
   for(const link of ticket.edges.get(pid)||[])visit(link.id,depth+1);
  };for(const pid of ticket.primary)visit(pid,0);
  const unknown=items.filter(item=>!item.blocked&&!item.subscribed&&!item.pageDetails).length,hasNotes=items.some(item=>item.selected&&item.notes.length),hasRequirements=suggestions.some(row=>row.kind==='conflict'||!row.subscribed);
  return{token:ticket.token,game:ticket.game,privacy:ticket.privacy,primary:ticket.primary,selected:[...ticket.selected],items,suggestions,warnings,unknown,requiresReview:hasNotes||hasRequirements||unknown>0||warnings.length>0,checkedAt:Date.now(),truncated:false,treeComplete:true};
 }
 get(token,account){const ticket=this.pending.get(token);if(!ticket||ticket.account!==account||ticket.expires<Date.now()){this.pending.delete(token);throw new Error('This install review expired. Select the mods again.');}return ticket;}
 async confirm({token,ids,acknowledged},account){
  const ticket=this.get(token,account);
  if(!Array.isArray(ids)||!ids.length||ids.length>5200)throw new Error('Select the mods you want to install.');const chosen=[...new Set(ids.map(id))];if(chosen.some(pid=>!ticket.metadata.has(pid)))throw new Error('An item was not part of this install review.');
  ticket.selected=new Set(chosen);const current=this.view(ticket);if(current.warnings.length)throw new Error('Remove unavailable or different-game items before continuing.');
  const omitted=chosen.some(pid=>(ticket.edges.get(pid)||[]).some(row=>row.kind==='required'&&!ticket.subscribed.has(row.id)&&!ticket.selected.has(row.id)));
  if((current.requiresReview||omitted)&&acknowledged!==true)throw new Error('Read the author notes and confirm your selection before installing.');
  return{ticket,rows:chosen.map(pid=>ticket.rows.get(pid)),ids:chosen};
 }
 consume(token){this.pending.delete(token);}
}
function reviewRequired(review){const error=new Error('Review the mod requirements before installing.');error.code='MOD_REVIEW_REQUIRED';error.review=review;return error;}
module.exports={InstallReviews,reviewRequired};
