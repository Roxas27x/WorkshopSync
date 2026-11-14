const ModLists=(()=>{
 const modes=['all','selected','private'],friendId=/^765\d{14}$/;
 function audience(value,fallback='all'){const mode=modes.includes(value?.mode)?value.mode:fallback;return{mode,friends:mode==='selected'?[...new Set((value?.friends||[]).filter(id=>typeof id==='string'&&friendId.test(id)))]:[]};}
 function validateAudience(value,friends){if(!value||!modes.includes(value.mode)||!Array.isArray(value.friends)||value.friends.length>2000||value.friends.some(id=>!friendId.test(id)))throw new Error('Choose who can see this list.');const result=audience(value);if(result.mode==='selected'&&result.friends.some(id=>!friends.some(friend=>friend.id===id&&friend.companion)))throw new Error('Choose friends connected to WorkshopSync.');return result;}
 function ensure(g){
  if(!Array.isArray(g.modLists))g.modLists=[{id:'default',name:'My mods',items:g.items||[],audience:audience(null),sync:true}];
  for(const list of g.modLists){list.audience=audience(list.audience,list.id==='default'?'all':'private');list.items ||= [];list.sync=list.sync===true;}
  g.sharingAudience=audience(g.sharingAudience);legacy(g);return g.modLists;
 }
 function legacy(g){g.items=g.modLists?.find(list=>list.id==='default')?.items||[];}
 function get(g,id){const lists=ensure(g),list=lists.find(list=>list.id===(id||'default'));if(!list)throw new Error('This list no longer exists. Choose another list.');return list;}
 function name(value){if(typeof value!=='string'||!value.trim()||value.trim().length>80)throw new Error('Give your list a name of 1–80 characters.');return value.trim();}
 function create(g,id,title){const lists=ensure(g),label=name(title);if(lists.length>=50)throw new Error('You can keep up to 50 lists per game.');if(lists.some(list=>list.name.toLowerCase()===label.toLowerCase()))throw new Error('A list with that name already exists.');const list={id,name:label,items:[],audience:audience(null,'private'),sync:false};lists.push(list);return list;}
 function rename(g,id,title){const list=get(g,id),label=name(title);if(g.modLists.some(other=>other.id!==list.id&&other.name.toLowerCase()===label.toLowerCase()))throw new Error('A list with that name already exists.');list.name=label;return list;}
 function remove(g,id){get(g,id);g.modLists=g.modLists.filter(list=>list.id!==id);legacy(g);}
 function allItems(g){return [...new Map(ensure(g).flatMap(list=>list.items).map(row=>[row.id,row])).values()];}
 function automatic(g){return ensure(g).filter(list=>list.sync).flatMap(list=>list.items.map(row=>({...row,installSources:[{kind:'self',name:'You',listId:list.id,listName:list.name}]})));}
 function shared(g){return ensure(g).filter(list=>list.audience.mode!=='private').map(list=>({id:list.id,name:list.name,items:list.items.map(row=>row.id),audience:list.audience}));}
 return{audience,validateAudience,ensure,legacy,get,name,create,rename,remove,allItems,automatic,shared};
})();
if(typeof module!=='undefined')module.exports=ModLists;
