const {load}=require('cheerio');
const {id,normalizeDetail,safeImage}=require('./core.cjs');
const {workshopId,analyzeDescription}=require('./mod-relations.cjs');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const workshopLink=(itemId,label)=>`<span class="mod-workshop-link"><a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${itemId}" data-action="modDetails" data-id="${itemId}">${label}</a> <button class="mod-linked-install" data-action="modQuickInstall" data-id="${itemId}">Install…</button></span>`;
function linkedText(text){let output='',offset=0;const pattern=/https?:\/\/(?:www\.)?steamcommunity\.com\/(?:sharedfiles\/filedetails|workshop\/filedetails|linkfilter)\/?\?[^\s<>"\[\]]+/gi;for(const match of text.matchAll(pattern)){const url=match[0].replace(/[.,;!?)]+$/,''),itemId=workshopId(url);if(!itemId)continue;output+=escape(text.slice(offset,match.index))+workshopLink(itemId,escape(url));offset=match.index+url.length;}return output+escape(text.slice(offset));}
function externalUrl(value){try{if(typeof value!=='string'||value.length>4096)return '';const u=new URL(value);return['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function descriptionImage(value){const steam=safeImage(value);if(steam)return steam;try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='i.imgur.com'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function sanitizeDescription(html){
 const $=load(String(html||'').slice(0,180000)),allowed=new Set(['div','p','span','br','strong','b','em','i','u','s','strike','ul','ol','li','blockquote','pre','code','table','thead','tbody','tr','th','td','hr']);let nodes=0;
 function render(node,depth=0){
  if(++nodes>12000||depth>40)return '';if(node.type==='text'){let parent=node.parent;while(parent){if(['a','code','pre'].includes(parent.name))return escape(node.data);parent=parent.parent;}return linkedText(node.data);}if(node.type!=='tag')return '';
  const tag=node.name.toLowerCase();if(['script','style','iframe','object','embed','svg','math','form','input','button','video','audio'].includes(tag))return '';
  const children=()=>node.children?.map(child=>render(child,depth+1)).join('')||'';
  if(tag==='a'){const href=externalUrl($(node).attr('href')),itemId=workshopId(href);if(itemId)return workshopLink(itemId,children());return href?`<a href="${escape(href)}" data-action="modLink" data-url="${escape(href)}" title="${escape(href)}">${children()}</a>`:children();}
  if(tag==='img'){const src=descriptionImage($(node).attr('src'));return src?`<img src="${escape(src)}" alt="${escape(($(node).attr('alt')||'Image from the author’s description').slice(0,300))}" loading="lazy">`:'';}
  const classes=($(node).attr('class')||'').split(/\s+/),className=classes.filter(c=>['bb_strike','bb_u','bb_code','bb_table','bb_table_tr','bb_table_td','bb_table_th','bb_paragraph','bb_list'].includes(c)).join(' ');
  if(classes.includes('bb_spoiler'))return `<details class="mod-spoiler"><summary>Spoiler</summary>${children()}</details>`;
  const heading=/^h[1-6]$/.test(tag)||classes.some(c=>/^bb_h[1-3]$/.test(c));if(heading)return '<h3>'+children()+'</h3>';
  if(!allowed.has(tag))return children();if(tag==='br'||tag==='hr')return`<${tag}>`;
  return`<${tag}${className?` class="${className}"`:''}>${children()}</${tag}>`;
 }
 return $('body').contents().toArray().map(node=>render(node)).join('');
}
function bbcodeDescription(raw){
 let html=escape(String(raw||'').slice(0,100000));
 html=html.replace(/\[url=([^\]]{1,4096})\]([\s\S]*?)\[\/url\]/gi,'<a href="$1">$2</a>').replace(/\[url\]([^\[]+)\[\/url\]/gi,'<a href="$1">$1</a>').replace(/\[img\]([^\[]+)\[\/img\]/gi,'<img src="$1">');
 const tags={b:'strong',i:'em',u:'u',strike:'s',h1:'h3',h2:'h3',h3:'h3',list:'ul',olist:'ol',quote:'blockquote',code:'pre',table:'table',tr:'tr',td:'td',th:'th'};
 html=html.replace(/\[(\/?)(b|i|u|strike|h1|h2|h3|list|olist|quote|code|table|tr|td|th)\]/gi,(_,close,name)=>'<'+close+tags[name.toLowerCase()]+'>').replace(/\[\*\]/g,'<li>').replace(/\[hr\]/gi,'<hr>').replace(/\r?\n/g,'<br>');
 return sanitizeDescription(html);
}
function pageInformation(html,expected){
 if(typeof html!=='string'||html.length>6*1024*1024)return null;const $=load(html);
 if(!$('input[name=id]').toArray().some(node=>$(node).attr('value')===expected)||!$('.workshopItemTitle').length)return null;
 const authors=[];$('.creatorsBlock .friendBlock').each((_,node)=>{const block=$(node),name=block.find('.friendBlockContent').contents().filter((_,n)=>n.type==='text').text().trim().replace(/\s+/g,' ').slice(0,120),url=externalUrl(block.find('.friendBlockLinkOverlay').attr('href'));if(name)authors.push({name,url});});
 const images=[];$('.highlight_strip_item img, #previewImage, #previewImageMain').each((_,node)=>{const src=safeImage($(node).attr('src'));if(src){const u=new URL(src);if(u.hostname.endsWith('steamusercontent.com'))u.search='';images.push(u.href);}});
 const required=[];$('#RequiredItems a').each((_,node)=>{try{const u=new URL($(node).attr('href'));if(u.hostname!=='steamcommunity.com')return;const itemId=id(u.searchParams.get('id')),title=$(node).text().trim().replace(/\s+/g,' ').slice(0,500);if(title)required.push({id:itemId,title});}catch{}});
 const description=$('.workshopItemDescription').first(),size=$('.detailsStatsContainerRight .detailsStatRight').first().text().trim();return{sizeText:/^[\d,.]+\s*(?:B|KB|MB|GB|TB)$/i.test(size)?size:'',authors:authors.slice(0,20),images:[...new Set(images)].slice(0,16),required:[...new Map(required.map(row=>[row.id,row])).values()].slice(0,100),descriptionHtml:description.length?sanitizeDescription(description.html()):''};
}
class WorkshopDetails{
 constructor(request,fetchPage=fetch){this.request=request;this.fetchPage=fetchPage;this.cache=new Map();}
 async get(value){const itemId=id(value),cached=this.cache.get(itemId);if(cached&&Date.now()-cached.at<120000)return cached.value;
  const url=`https://steamcommunity.com/sharedfiles/filedetails/?id=${itemId}&l=english`;
  const [api,page]=await Promise.allSettled([this.request('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',{itemcount:'1','publishedfileids[0]':itemId}),this.fetchPage(url,{signal:AbortSignal.timeout(12000),redirect:'error'}).then(async response=>response.ok?pageInformation(await response.text(),itemId):null)]);
  if(api.status==='rejected')throw api.reason;const raw=api.value?.response?.publishedfiledetails?.find(row=>String(row.publishedfileid)===itemId);if(!raw)throw new Error('Steam did not return this Workshop item.');const row=normalizeDetail(raw),extra=page.status==='fulfilled'?page.value:null;
  const counter=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
  const result={...row,created:counter(raw.time_created),subscribers:counter(raw.subscriptions),favorites:counter(raw.favorited),views:counter(raw.views),tags:(raw.tags||[]).map(t=>String(t.tag||'').slice(0,100)).filter(Boolean).slice(0,30),authors:extra?.authors||[],images:[...new Set([row.image,...(extra?.images||[])].filter(Boolean))].slice(0,16),required:extra?.required||[],pageDetails:!!extra,descriptionHtml:extra?.descriptionHtml||bbcodeDescription(raw.description),url};
  result.sizeText=extra?.sizeText||'';Object.assign(result,analyzeDescription(result.descriptionHtml,itemId));this.cache.set(itemId,{at:Date.now(),value:result});if(this.cache.size>50)this.cache.delete(this.cache.keys().next().value);return result;
 }
 async inspectMany(values,progress=()=>{}){
  const ids=[...new Set(values.map(id))],output=[],pageDeadline=Date.now()+15000;this.reviewCache ||= new Map();let pages=0;progress(0,ids.length);
  for(let offset=0;offset<ids.length;offset+=100){
   const chunk=ids.slice(offset,offset+100),missing=chunk.filter(pid=>!this.reviewCache.has(pid)||Date.now()-this.reviewCache.get(pid).at>120000),raw=new Map();
   if(missing.length){const body={itemcount:String(missing.length)};missing.forEach((pid,index)=>body['publishedfileids['+index+']']=pid);const result=await this.request('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',body);for(const row of result.response?.publishedfiledetails||[])raw.set(String(row.publishedfileid),row);}
   for(const pid of chunk){
    const cached=this.cache.get(pid),prior=this.reviewCache.get(pid);let info;
    if(cached&&Date.now()-cached.at<120000)info=cached.value;
    else if(prior&&Date.now()-prior.at<120000)info=prior.value;
    else{const source=raw.get(pid);if(!source||Number(source.result)!==1)info={id:pid,title:'Unavailable Workshop item '+pid,unavailable:true,required:[],relatedItems:[],compatibilityNotes:[],pageDetails:false};
     else{const base=normalizeDetail(source);let extra=null;
      if(pages<20&&Date.now()<pageDeadline&&Date.now()>(this.reviewPageCooldown||0)){pages++;try{const response=await this.fetchPage(`https://steamcommunity.com/sharedfiles/filedetails/?id=${pid}&l=english`,{signal:AbortSignal.timeout(Math.max(1,Math.min(4000,pageDeadline-Date.now()))),redirect:'error'});if(response.status===429)this.reviewPageCooldown=Date.now()+60000;if(response.ok)extra=pageInformation(await response.text(),pid);}catch{}}
      info={...base,required:extra?.required||[],pageDetails:!!extra,...analyzeDescription(extra?.descriptionHtml||bbcodeDescription(source.description),pid)};
     }
    }
    const brief={id:info.id,title:info.title,appid:info.appid,type:info.type,unavailable:!!info.unavailable,required:info.required||[],relatedItems:info.relatedItems||[],compatibilityNotes:info.compatibilityNotes||[],pageDetails:!!info.pageDetails};
    this.reviewCache.set(pid,{at:Date.now(),value:brief});output.push(brief);if(output.length%25===0||output.length===ids.length)progress(output.length,ids.length);if(this.reviewCache.size>1000)this.reviewCache.delete(this.reviewCache.keys().next().value);
   }
  }
  return output;
 }
}
module.exports={WorkshopDetails,externalUrl,sanitizeDescription,bbcodeDescription,pageInformation};
