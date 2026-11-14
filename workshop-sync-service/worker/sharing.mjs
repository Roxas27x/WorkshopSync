const SHARE_MAX_AGE=7*86400000,SHARE_ID=/^765\d{14}$/,SHARE_ITEM=/^[1-9]\d{0,19}$/;
function sharingAudience(value,friends,fail){
 if(!value||!['all','selected','private'].includes(value.mode)||!Array.isArray(value.friends)||value.friends.length>2000||value.friends.some(id=>!SHARE_ID.test(id)||!friends.includes(id)))fail('Invalid list audience.');
 return{mode:value.mode,friends:value.mode==='selected'?[...new Set(value.friends)]:[]};
}
function canViewSharing(audience,viewer){return audience.mode==='all'||audience.mode==='selected'&&audience.friends.includes(viewer);}
export function validateSharingProfile(input,fail){
 if(!Array.isArray(input.friends)||input.friends.length>2000||input.friends.some(id=>typeof id!=='string'||!SHARE_ID.test(id)))fail('Invalid Steam friends list.');
 if(!Array.isArray(input.games)||input.games.length>100)fail('Share at most 100 games.');
 if(input.sharingVersion!==undefined&&![1,2,3].includes(input.sharingVersion))fail('Unsupported sharing version.');
 const modern=input.sharingVersion>=2,friends=[...new Set(input.friends)],seen=new Set();let count=0;
 const items=value=>{if(!Array.isArray(value)||value.length>5000||value.some(id=>typeof id!=='string'||!SHARE_ITEM.test(id)))fail('Invalid Workshop item IDs.');return [...new Set(value)];};
 const games=input.games.map(g=>{
  if(typeof g.appid!=='string'||!/^[1-9]\d{0,9}$/.test(g.appid)||Number(g.appid)>4294967295||seen.has(g.appid))fail('Invalid or duplicate game.');seen.add(g.appid);
  if(typeof g.name!=='string'||!g.name.trim()||g.name.length>200)fail('Invalid game name.');
  if(typeof g.shareList!=='boolean'||typeof g.shareSubscriptions!=='boolean'||!g.shareList&&!g.shareSubscriptions)fail('Explicit game sharing preferences are required.');
  const curated=items(g.curated),subscriptions=items(g.subscriptions),audience=modern?sharingAudience(g.audience,friends,fail):{mode:'all',friends:[]};
  if(!g.shareList&&curated.length||!g.shareSubscriptions&&subscriptions.length)fail('Unshared items must not be uploaded.');
  let namedLists=null;
  if(modern){
   if(!Array.isArray(g.namedLists)||g.namedLists.length>50||!g.shareList&&g.namedLists.length||curated.length)fail('Invalid named lists.');
   const ids=new Set();namedLists=g.namedLists.map(list=>{
    if(typeof list.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(list.id)||ids.has(list.id))fail('Invalid or duplicate list.');ids.add(list.id);
    if(typeof list.name!=='string'||!list.name.trim()||list.name.trim().length>80)fail('Invalid list name.');
    const permission=sharingAudience(list.audience,friends,fail),values=items(list.items);if(permission.mode==='private')fail('Private lists must stay on the player’s PC.');
    count+=values.length;return{id:list.id,name:list.name.trim(),items:values,audience:permission};
   });
   if(new Set(namedLists.flatMap(list=>list.items)).size>5000)fail('Share up to 5,000 distinct Workshop items per game.');
   if(audience.mode==='private')fail('Private games must not be uploaded.');
  }
  count+=curated.length+subscriptions.length;if(count>50000)fail('Too many shared items.');
  return{...g,curated,subscriptions,namedLists,audience};
 });
 return{friends,games,sharingVersion:modern?input.sharingVersion:1};
}
function sharedGameView(row,viewer){
 if(!canViewSharing(JSON.parse(row.audience),viewer))return null;
 const stored=JSON.parse(row.named_lists),candidates=stored===null?[{id:'default',name:'Chosen list',items:JSON.parse(row.curated),audience:{mode:'all',friends:[]}}]:stored;
 const namedLists=row.share_list?candidates.filter(list=>canViewSharing(list.audience,viewer)).map(({id,name,items})=>({id,name,items})):[];
 if(!row.share_subscriptions&&!namedLists.length)return null;
 return{steamid:row.owner,appid:row.appid,name:row.name,shareList:namedLists.length>0,shareSubscriptions:!!row.share_subscriptions,curated:[...new Set(namedLists.flatMap(list=>list.items))],subscriptions:row.share_subscriptions?JSON.parse(row.subscriptions):[],namedLists,updated:row.updated};
}
const sharingSummaryCte=`WITH visible AS (
 SELECT l.*,MIN(l.updated,p.updated,?)+? AS expiresAt FROM lists l JOIN profiles p ON p.steamid=l.owner
 WHERE l.updated>? AND p.updated>? AND l.owner IN (SELECT value FROM json_each(?))
 AND (json_extract(audience,'$.mode')='all' OR (json_extract(audience,'$.mode')='selected' AND ? IN (SELECT value FROM json_each(audience,'$.friends'))))
), permitted_lists AS (
 SELECT v.owner,v.appid,json_extract(n.value,'$.items') AS items FROM visible v,
 json_each(CASE WHEN json_type(v.named_lists)='null' THEN json_array(json_object('items',json(v.curated),'audience',json_object('mode','all','friends',json('[]')))) ELSE v.named_lists END) n
 WHERE v.share_list=1 AND (json_extract(n.value,'$.audience.mode')='all' OR (json_extract(n.value,'$.audience.mode')='selected' AND ? IN (SELECT value FROM json_each(n.value,'$.audience.friends'))))
), list_items AS (SELECT DISTINCT owner,appid,i.value AS item FROM permitted_lists,json_each(items) i),
 allowed_games AS (SELECT v.*,EXISTS(SELECT 1 FROM permitted_lists n WHERE n.owner=v.owner AND n.appid=v.appid) AS has_lists FROM visible v
 WHERE v.share_subscriptions=1 OR EXISTS(SELECT 1 FROM permitted_lists n WHERE n.owner=v.owner AND n.appid=v.appid)),
 items AS (SELECT owner,appid,i.value AS item FROM allowed_games,json_each(subscriptions) i WHERE share_subscriptions=1 UNION SELECT owner,appid,item FROM list_items)`;
export async function sharingRoute(request,db,actor,now,{json,fail,mutual}){
 const url=new URL(request.url);
 if(url.pathname==='/v1/profile'&&request.method==='PUT'){
  if(Number(request.headers.get('content-length')||0)>1000000)fail('Request is too large.',413);
  const raw=await request.text();if(raw.length>1000000)fail('Request is too large.',413);let input;try{input=validateSharingProfile(JSON.parse(raw),fail);}catch(error){if(error instanceof SyntaxError)fail('Invalid JSON.');throw error;}
  const previous=await db.prepare('SELECT sharing_version FROM profiles WHERE steamid=?').bind(actor.steamid).first();
  if(previous?.sharing_version>input.sharingVersion)fail('Update WorkshopSync to keep your list audiences and private subscription choices.',426);
  const statements=[db.prepare('INSERT INTO profiles(steamid,friends,updated,sharing_version) VALUES(?,?,?,?) ON CONFLICT(steamid) DO UPDATE SET friends=excluded.friends,updated=excluded.updated,sharing_version=excluded.sharing_version').bind(actor.steamid,JSON.stringify(input.friends),now,input.sharingVersion),db.prepare('DELETE FROM lists WHERE owner=?').bind(actor.steamid)];
  for(const g of input.games)statements.push(db.prepare('INSERT INTO lists(owner,appid,name,curated,subscriptions,share_list,share_subscriptions,list_count,subscription_count,updated,named_lists,audience) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(actor.steamid,g.appid,g.name,JSON.stringify(g.curated),JSON.stringify(g.subscriptions),Number(g.shareList),Number(g.shareSubscriptions),g.namedLists?[...new Set(g.namedLists.flatMap(list=>list.items))].length:g.curated.length,g.subscriptions.length,now,JSON.stringify(g.namedLists),JSON.stringify(g.audience)));
  await db.batch(statements);return json({ok:true,sharedGames:input.games.length,updated:now});
 }
 if(url.pathname==='/v1/friends'&&request.method==='GET'){
  const own=await db.prepare('SELECT friends,updated FROM profiles WHERE steamid=?').bind(actor.steamid).first();if(!own||own.updated<now-SHARE_MAX_AGE)return json({friends:[],sharedGameStats:[]});
  const ids=JSON.parse(own.friends),allowed=[];
  for(let i=0;i<ids.length;i+=100){const chunk=ids.slice(i,i+100),peers=(await db.prepare(`SELECT steamid,friends,updated FROM profiles WHERE steamid IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk).all()).results;allowed.push(...peers.filter(p=>p.updated>now-SHARE_MAX_AGE&&JSON.parse(p.friends).includes(actor.steamid)).map(p=>p.steamid));}
  const values=[own.updated,SHARE_MAX_AGE,now-SHARE_MAX_AGE,now-SHARE_MAX_AGE,JSON.stringify(allowed),actor.steamid,actor.steamid];
  const summaries=(await db.prepare(sharingSummaryCte+` SELECT owner,appid,name,has_lists AS share_list,share_subscriptions,(SELECT COUNT(*) FROM list_items i WHERE i.owner=g.owner AND i.appid=g.appid) AS list_count,CASE WHEN share_subscriptions=1 THEN subscription_count ELSE 0 END AS subscription_count,updated FROM allowed_games g`).bind(...values).all()).results;
  const sharedGameStats=(await db.prepare(sharingSummaryCte+` SELECT g.appid,(SELECT COUNT(DISTINCT item) FROM items i WHERE i.appid=g.appid) AS itemCount,COUNT(DISTINCT owner) AS friendCount,MIN(expiresAt) AS expiresAt FROM allowed_games g GROUP BY g.appid ORDER BY g.appid`).bind(...values).all()).results;
  return json({friends:allowed.map(steamid=>({steamid,games:summaries.filter(g=>g.owner===steamid).map(({owner,...g})=>g)})),sharedGameStats});
 }
 const gameMatch=url.pathname.match(/^\/v1\/games\/([1-9]\d{0,9})\/friends$/);
 if(gameMatch&&request.method==='GET'){
  const appid=gameMatch[1],after=url.searchParams.get('after');if(Number(appid)>4294967295||after&&!SHARE_ID.test(after))fail('Invalid game or friend cursor.');
  const own=await db.prepare('SELECT friends,updated FROM profiles WHERE steamid=?').bind(actor.steamid).first();if(!own||own.updated<now-SHARE_MAX_AGE)return json({friends:[],next:null});
  const ids=JSON.parse(own.friends).filter(id=>!after||id>after).sort(),result=[];
  for(let i=0;i<ids.length&&result.length<51;i+=100){const chunk=ids.slice(i,i+100),peers=(await db.prepare(`SELECT steamid,friends,updated FROM profiles WHERE steamid IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk).all()).results,allowed=peers.filter(p=>p.updated>now-SHARE_MAX_AGE&&JSON.parse(p.friends).includes(actor.steamid)).map(p=>p.steamid);if(!allowed.length)continue;
   const rows=(await db.prepare(`SELECT * FROM lists WHERE appid=? AND updated>? AND owner IN (${allowed.map(()=>'?').join(',')}) ORDER BY owner`).bind(appid,now-SHARE_MAX_AGE,...allowed).all()).results;
   result.push(...rows.map(row=>sharedGameView(row,actor.steamid)).filter(Boolean));
  }
  result.sort((a,b)=>a.steamid.localeCompare(b.steamid));const friends=result.slice(0,50);return json({friends,next:result.length>50?friends.at(-1).steamid:null});
 }
 const match=url.pathname.match(/^\/v1\/friends\/(765\d{14})\/([1-9]\d{0,9})$/);
 if(match&&request.method==='GET'){
  const [,peer,appid]=match;if(!await mutual(db,actor.steamid,peer,now))fail('This Steam friend is not sharing with your companion account.',403);
  const row=await db.prepare('SELECT * FROM lists WHERE owner=? AND appid=?').bind(peer,appid).first(),view=row&&row.updated>now-SHARE_MAX_AGE?sharedGameView(row,actor.steamid):null;if(!view)fail('This game is not shared or the snapshot expired.',404);return json(view);
 }
 return null;
}
