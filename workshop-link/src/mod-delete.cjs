const {randomUUID}=require('node:crypto'),{id}=require('./core.cjs'),Blacklist=require('./auto-sync-blacklist.js');
const files=require('./workshop-files.cjs');
class ModDeletion{
 constructor({inspect=files.inspectCopies,remove=files.removeCopies}={}){this.inspect=inspect;this.remove=remove;this.tickets=new Map();}
 async prepare(g,ids,roots,account){
  if(!Array.isArray(ids)||!ids.length||ids.length>1000)throw Error('Select up to 1,000 of your mods to delete.');
  const owned=new Set([...g.subscribedIds,...g.installed]),chosen=[...new Set(ids.map(id))];if(chosen.some(pid=>!owned.has(pid)))throw Error('Only your subscribed or locally installed mods can be deleted.');
  const rows=[];for(const pid of chosen){const row=[...g.subscriptions,...(g.installedDetails||[])].find(row=>row.id===pid),copies=await this.inspect(roots,g.id,pid);rows.push({id:pid,title:row?.title||'Workshop item '+pid,bytes:copies.reduce((sum,copy)=>sum+copy.bytes,0),copies});}
  const token=randomUUID();this.tickets.set(token,{account,game:g.id,rows,roots:[...roots],expires:Date.now()+10*60000});if(this.tickets.size>8)this.tickets.delete(this.tickets.keys().next().value);
  return{token,game:g.id,items:rows.map(({copies,...row})=>row),bytes:rows.reduce((sum,row)=>sum+row.bytes,0)};
 }
 async confirm(g,{token,blacklist=true},account,{unsubscribe,save,publish=async()=>{},known={},onProgress=()=>{},pause=async()=>{},assertAccount=()=>{}}){
  const ticket=this.tickets.get(token);if(!ticket||ticket.account!==account||ticket.game!==g.id||ticket.expires<Date.now())throw Error('This deletion preview expired. Select the mods again.');
  const checkAccount=()=>{try{assertAccount();}catch{const error=Error('Steam account changed. The remaining deletion was stopped.');error.code='DELETE_ACCOUNT_CHANGED';throw error;}};
  checkAccount();if(blacklist!==true&&blacklist!==false)throw Error('Choose whether to block automatic reinstallation.');this.tickets.delete(token);
  if(blacklist)Blacklist.block(g,ticket.rows);else Blacklist.allow(g,ticket.rows.map(row=>row.id));await save();
  const result={deleted:[],failed:[],bytes:0,warnings:[]},skipRemaining=position=>{for(const row of ticket.rows.slice(position+1))result.failed.push({id:row.id,title:row.title,unsubscribed:false,error:'Not attempted after the previous request failed. Retry after resolving that error.'});};
  for(const [position,row]of ticket.rows.entries()){
   onProgress(row);let unsubscribed=false;
   try{
    checkAccount();if(g.subscribedIds.includes(row.id))await unsubscribe(row.id);unsubscribed=true;checkAccount();
    Blacklist.removed(g,row.id);delete known[row.id];await save();checkAccount();
   }catch(error){result.failed.push({id:row.id,title:row.title,unsubscribed,error:error.message});skipRemaining(position);break;}
   try{
    const copies=await this.inspect(ticket.roots,g.id,row.id);checkAccount();const bytes=await this.remove(copies,g.id,row.id);checkAccount();
    g.installed=g.installed.filter(pid=>pid!==row.id);g.installedDetails=(g.installedDetails||[]).filter(item=>item.id!==row.id);if(g.localSizes)delete g.localSizes[row.id];if(g.itemHistory?.[row.id])Object.assign(g.itemHistory[row.id],{installed:false,pending:false});
    await save();result.bytes+=bytes;result.deleted.push(row.id);
   }catch(error){result.failed.push({id:row.id,title:row.title,unsubscribed:true,error:'Unsubscribed, but local cleanup could not finish. Close the game and retry. '+error.message});if(error.code==='DELETE_ACCOUNT_CHANGED'){skipRemaining(position);break;}}
   if(position+1<ticket.rows.length)await pause();
  }
  try{checkAccount();await publish();}catch(error){result.warnings.push('Your local changes were saved, but friend sharing could not be refreshed. '+error.message);}return result;
 }
}
module.exports={ModDeletion};
