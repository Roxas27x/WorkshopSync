const ItemPrivacy=(()=>{
 function isPrivate(g,id){return(g.privateItemIds||[]).includes(id);}
 function set(g,values,privateValue){const blocked=new Set(g.privateItemIds||[]);for(const value of values)privateValue?blocked.add(value):blocked.delete(value);g.privateItemIds=[...blocked];}
 function visible(g,values){const blocked=new Set(g.privateItemIds||[]);return values.filter(value=>!blocked.has(typeof value==='string'?value:value.id));}
 return{isPrivate,set,visible};
})();
if(typeof module!=='undefined')module.exports=ItemPrivacy;
