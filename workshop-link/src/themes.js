const Themes=(()=>{
 const modes=['dark','light','system'];
 const keys=['bg','panel','raised','input-bg','hover','line','text','muted','accent','accent-ink','accent-wash'];
 const palettes=[
  {id:'graphite',name:'Graphite',dark:['#121619','#1b2024','#22292d','#151c20','#283235','#343d40','#e4ebe7','#a0afa6','#b1dc99','#172a15','#293b29'],light:['#ffffff','#f1f3f4','#ffffff','#ffffff','#e6ece8','#d7dfda','#24302b','#596960','#345e31','#ffffff','#e9f3e5']},
  {id:'forest',name:'Forest',dark:['#111b15','#19271e','#203025','#132017','#2a3c2e','#354b3b','#e5eee4','#a2b5a4','#bcdb83','#21300d','#324226'],light:['#fbfcf8','#eff3e8','#ffffff','#ffffff','#e4ebdb','#d5dfcc','#293229','#5c6b55','#486525','#ffffff','#e7efd9']},
  {id:'ocean',name:'Ocean',dark:['#101923','#172534','#1f3041','#132131','#293e51','#354b60','#e4edf5','#9db1c5','#83c8eb','#112b3a','#203c50'],light:['#fbfdff','#edf3f9','#ffffff','#ffffff','#e0ebf5','#cdddea','#20354b','#50687d','#22688f','#ffffff','#e0eff9']},
  {id:'plum',name:'Plum',dark:['#1a1520','#251e2e','#302638','#201926','#3b3044','#4a3b53','#efe8f2','#b7a7bf','#d2a8e3','#30143e','#402d4b'],light:['#fffaff','#f6eef8','#ffffff','#ffffff','#eddfef','#e0cee4','#392c40','#745b7e','#805098','#ffffff','#f0e1f5']},
  {id:'sand',name:'Sand',dark:['#201b14','#2b241c','#352d23','#241e17','#44382a','#544533','#f1e9dd','#c2b19b','#e3c28b','#34240d','#453820'],light:['#fffdf8','#f5f0e5','#fffefb','#fffefb','#eee5d6','#ded2bd','#3d3428','#70614c','#826024','#ffffff','#f0e5cf']}
 ];
 function normalize(value){return{palette:palettes.some(p=>p.id===value?.palette)?value.palette:'graphite',mode:modes.includes(value?.mode)?value.mode:'dark'};}
 function tokens(value,systemDark=false){
  const appearance=normalize(value),mode=appearance.mode==='system'?(systemDark?'dark':'light'):appearance.mode;
  const palette=palettes.find(p=>p.id===appearance.palette),result=Object.fromEntries(keys.map((key,i)=>[key,palette[mode][i]]));
  Object.assign(result,mode==='dark'?{'green':'#9fdbb5','success-bg':'#1c3326','warning':'#edc68b','warning-bg':'#3b2d17','danger':'#f1aaaa','danger-bg':'#3d2429'}:{'green':'#25663d','success-bg':'#e6f3e9','warning':'#795315','warning-bg':'#fbefd5','danger':'#9c3535','danger-bg':'#fbe8e8'});
  result.purple=result.accent;return{mode,palette:palette.id,variables:result};
 }
 return{palettes,modes,normalize,tokens};
})();
if(typeof module!=='undefined')module.exports=Themes;
