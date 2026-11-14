const {load}=require('cheerio');
const {gameId,normalizeDetail}=require('./core.cjs');
const sorts={relevance:'textsearch',popular:'totaluniquesubscribers',newest:'mostrecent',updated:'lastupdated'};
function searchOptions(input){
 const appid=gameId(input.game);if(typeof input.query!=='string'||input.query.length>160)throw new Error('Search with up to 160 characters.');
 const query=input.query.trim(),sort=input.sort||'popular',page=input.page??1,tag=input.tag??'';
 if(typeof tag!=='string'||tag.length>120||/[\x00-\x1f]/.test(tag))throw new Error('Choose a valid Workshop type.');
 if(!Object.hasOwn(sorts,sort)||!Number.isInteger(page)||page<1||page>1000)throw new Error('Choose a valid Workshop search page and sort.');
 return{appid,query,sort,page,tag};
}
function searchUrl(options){const p=new URLSearchParams({appid:options.appid,searchtext:options.query,browsesort:sorts[options.sort],actualsort:sorts[options.sort],section:'readytouseitems',p:String(options.page),numperpage:'30',l:'english'});if(options.tag)p.append('requiredtags[]',options.tag);return'https://steamcommunity.com/workshop/browse/?'+p;}
function parseSearch(html,options){
 if(typeof html!=='string'||html.length>8*1024*1024)throw new Error('Steam returned an oversized search page.');
 let ssr,queries;try{ssr=JSON.parse(load(html)('#valve-ssr-data').text());queries=JSON.parse(ssr.renderContext.queryData).queries;}catch{throw new Error('Steam did not return a recognizable Workshop search. Try again or open the Workshop in Steam.');}
 const match=queries?.find(q=>q.queryKey?.[0]==='workshop_browse'),scope=match?.queryKey?.[1],data=match?.state?.data;
 if(JSON.stringify(scope?.required_tags||[])!==JSON.stringify(options.tag?[options.tag]:[]))throw new Error('Steam returned results for an unexpected Workshop type. Try again.');
 if(String(scope?.appid)!==options.appid||scope.search_text!==options.query||scope.page!==options.page||scope.browse_sort!==sorts[options.sort]||scope.section!=='readytouseitems'||match.state.status!=='success'||Number(data?.eresult)!==1||!Array.isArray(data.results)||data.results.length>100||!Number.isSafeInteger(data.total_count)||data.total_count<0||data.current_page!==options.page||!Number.isInteger(data.total_pages)||data.total_pages<0)throw new Error('Steam returned search results for an unexpected game or query. Try again.');
 const rows=data.results.map(raw=>{
  const row=normalizeDetail({...raw,result:1,consumer_app_id:raw.consumer_appid??raw.consumer_app_id});
  if(row.appid!==options.appid)throw new Error('Steam returned a mod for a different game. Try again.');
  const description=load('<div>'+String(raw.short_description||'').slice(0,5000)+'</div>')('div').first().text().trim().slice(0,420);
  return{...row,description,subscribers:Math.max(0,Number(raw.subscriptions)||0)};
 }).filter(row=>row.type!==2);
 if(!rows.length&&data.total_count>0&&data.current_page<=data.total_pages)throw new Error('Steam omitted the Workshop search items. Try again.');
 const declared=queries.find(q=>q.queryKey?.[0]==='declared_tags_v6'&&String(q.queryKey[1])===options.appid)?.state?.data?.readytouse_tags;
 const categoryGroups=(Array.isArray(declared)?declared:[]).slice(0,40).map(group=>({name:String(group.name||'Types').slice(0,120),tags:(Array.isArray(group.tags)?group.tags:[]).filter(tag=>!tag.admin_only&&typeof tag.name==='string'&&tag.name.length<=120).slice(0,150).map(tag=>({value:tag.name,label:String(tag.display_name||tag.name).slice(0,160)}))})).filter(group=>group.tags.length);
 return{...options,categoryGroups,rows:[...new Map(rows.map(row=>[row.id,row])).values()],total:data.total_count,pages:Math.min(data.total_pages,1000),url:searchUrl(options)};
}
class WorkshopSearch{
 constructor(fetcher=fetch){this.fetch=fetcher;this.cache=new Map();}
 async search(input){const options=searchOptions(input),url=searchUrl(options),cached=this.cache.get(url);if(cached&&Date.now()-cached.at<60000)return cached.value;
  const response=await this.fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error',headers:{'Accept-Language':'en-US,en;q=0.8'}});
  if(response.status===429)throw new Error('Steam is limiting searches. Wait a moment before searching again.');if(!response.ok)throw new Error(`Steam search returned HTTP ${response.status}. Try again later.`);
  const value=parseSearch(await response.text(),options);this.cache.set(url,{at:Date.now(),value});if(this.cache.size>30)this.cache.delete(this.cache.keys().next().value);return value;
 }
}
module.exports={WorkshopSearch,searchOptions,searchUrl,parseSearch};
