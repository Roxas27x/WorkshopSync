const WorkshopAvailability=(()=>{
 function unresolved(row){return !row||row.unavailable===true||row.placeholder===true||!row.appid||row.appid==='0'||typeof row.title!=='string'||!row.title.trim();}
 function visible(rows,showUnavailable=false){return showUnavailable?[...rows]:rows.filter(row=>!unresolved(row));}
 return{unresolved,visible};
})();
if(typeof module!=='undefined')module.exports=WorkshopAvailability;
