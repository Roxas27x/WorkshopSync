import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
const RELEASE_VERSION=/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const MAX_RELEASE_SIZE=200*1024*1024;
function compareReleaseVersions(a,b){
 if(!RELEASE_VERSION.test(a)||!RELEASE_VERSION.test(b))throw new Error('Invalid release version.');
 const aa=a.split('.').map(Number),bb=b.split('.').map(Number);for(let i=0;i<3;i++)if(aa[i]!==bb[i])return aa[i]>bb[i]?1:-1;return 0;
}
function validateRelease(value){
 if(!value||value.schema!==1||!RELEASE_VERSION.test(value.version))throw new Error('Invalid update manifest.');
 if(value.platform!=='win32'||value.arch!=='x64'||value.file!==`Workshop-Link-Setup-${value.version}.exe`)throw new Error('Unsupported update package.');
 if(!Number.isSafeInteger(value.size)||value.size<1||value.size>MAX_RELEASE_SIZE)throw new Error('Invalid installer size.');
 if(!/^[a-f0-9]{64}$/.test(value.sha256)||!/^[A-Za-z0-9+/]{86}==$/.test(value.sha512))throw new Error('Invalid installer checksum.');
 if(typeof value.publishedAt!=='string'||!Number.isFinite(Date.parse(value.publishedAt)))throw new Error('Invalid release date.');
 if(typeof value.notes!=='string'||value.notes.length>4000)throw new Error('Release notes must be at most 4,000 characters.');
 return{schema:1,version:value.version,platform:'win32',arch:'x64',file:value.file,size:value.size,sha256:value.sha256,sha512:value.sha512,publishedAt:value.publishedAt,notes:value.notes};
}
function releaseText(value){return JSON.stringify(validateRelease(value));}

class ReleaseError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const releaseJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function decodeRelease64(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
async function validReleaseSignature(envelope,publicKey){
 if(!envelope||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature||''))return false;
 const key=await crypto.subtle.importKey('spki',decodeRelease64(publicKey),{name:'Ed25519'},false,['verify']);
 return crypto.subtle.verify('Ed25519',key,decodeRelease64(envelope.signature),new TextEncoder().encode(releaseText(envelope.manifest)));
}
function releaseYaml(manifest){const m=validateRelease(manifest);return`version: ${m.version}\nfiles:\n  - url: ${m.file}\n    sha512: ${m.sha512}\n    size: ${m.size}\npath: ${m.file}\nsha512: ${m.sha512}\nreleaseDate: '${m.publishedAt}'\n`;}
async function releaseRoute(request,env,{authenticate}){
 const url=new URL(request.url),p=url.pathname,store=env.RELEASE_STORE;
 if(p!=='/download'&&!p.startsWith('/v1/releases/')&&!p.startsWith('/updates/'))return null;
 try{
  if(!store||!env.UPDATE_PUBLIC_KEY)throw new ReleaseError('App updates are not configured.',503);
  if(p==='/v1/releases/latest'&&request.method==='GET'){const latest=await store.latest();return latest?releaseJson(latest):new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});}
  if(p==='/download'&&request.method==='GET'){const latest=await store.latest();if(!latest)throw new ReleaseError('No app release is published yet.',404);return new Response(null,{status:302,headers:{Location:`/updates/${latest.manifest.version}/${latest.manifest.file}`,'Cache-Control':'no-store'}});}
  if(p==='/v1/releases/publisher'&&request.method==='GET'){const actor=await authenticate();return releaseJson({allowed:!!env.RELEASE_PUBLISHER_STEAM_ID&&actor.steamid===env.RELEASE_PUBLISHER_STEAM_ID});}
  if(p==='/v1/releases/publish'&&request.method==='POST'){
   const actor=await authenticate();if(!env.RELEASE_PUBLISHER_STEAM_ID||actor.steamid!==env.RELEASE_PUBLISHER_STEAM_ID)throw new ReleaseError('Only the app publisher can ship releases.',403);
   const header=request.headers.get('X-Workshop-Release');if(!header||header.length>20000)throw new ReleaseError('A signed release manifest is required.');
   let envelope;try{envelope=JSON.parse(new TextDecoder().decode(decodeRelease64(header)));}catch{throw new ReleaseError('Invalid release manifest.');}
   const manifest=validateRelease(envelope.manifest);if(!await validReleaseSignature(envelope,env.UPDATE_PUBLIC_KEY))throw new ReleaseError('The release signature is not trusted.',403);
   const declared=request.headers.get('Content-Length');if(declared&&Number(declared)!==manifest.size)throw new ReleaseError('Installer length does not match its manifest.');
   if(store.busy)throw new ReleaseError('Another release is being published.',409);store.busy=true;
   try{
    const latest=await store.latest();if(latest&&compareReleaseVersions(manifest.version,latest.manifest.version)<=0)throw new ReleaseError('Publish a version newer than the current release.',409);
    await store.publish({manifest,signature:envelope.signature},request.body);
    return releaseJson({ok:true,version:manifest.version});
   }finally{store.busy=false;}
  }
  const match=p.match(/^\/updates\/((?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5}))\/(latest\.yml|Workshop-Link-Setup-[\d.]+\.exe)$/);
  if(match&&request.method==='GET'){
   const envelope=await store.get(match[1]);if(!envelope)throw new ReleaseError('Release not found.',404);
   if(match[2]==='latest.yml')return new Response(releaseYaml(envelope.manifest),{headers:{'Content-Type':'application/yaml','Cache-Control':'no-store'}});
   if(match[2]!==envelope.manifest.file)throw new ReleaseError('Installer not found.',404);
   return store.download(envelope.manifest,request);
  }
  if(p==='/updates/latest.yml'&&request.method==='GET'){const latest=await store.latest();if(!latest)throw new ReleaseError('No app release is published yet.',404);return new Response(releaseYaml(latest.manifest),{headers:{'Content-Type':'application/yaml','Cache-Control':'no-store'}});}
  throw new ReleaseError('Not found.',404);
 }catch(e){return releaseJson({error:e instanceof ReleaseError?e.message:e.status?e.message:'The release request could not be completed.'},e.status||400);}
}


function fileReleaseStore(root){
 const releases=path.join(root,'releases');
 const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 const store={
  busy:false,
  latest:()=>read(path.join(releases,'latest.json')),
  get:version=>read(path.join(releases,version,'release.json')),
  async publish(envelope,stream){
   const m=envelope.manifest;await fs.mkdir(releases,{recursive:true});const current=await store.latest();
   // Keep the current installer available while receiving the next one; discard older release files.
   for(const name of await fs.readdir(releases))if(/^\d+\.\d+\.\d+$/.test(name)&&name!==current?.manifest.version){const target=path.resolve(releases,name);if(path.dirname(target)!==path.resolve(releases))throw new Error('Invalid release directory.');await fs.rm(target,{recursive:true,force:true});}
   const directory=path.join(releases,m.version);await fs.mkdir(directory,{recursive:true});const temporary=path.join(directory,'installer.part');
   const writer=Bun.file(temporary).writer({highWaterMark:1024*1024});const sha256=new Bun.CryptoHasher('sha256'),sha512=new Bun.CryptoHasher('sha512');let size=0;
   try{
    if(!stream)throw new Error('Installer body is missing.');const reader=stream.getReader();
    try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>m.size)throw new Error('Installer exceeds its signed size.');sha256.update(value);sha512.update(value);writer.write(value);await writer.flush();}}finally{reader.releaseLock();}
    await writer.end();
    if(size!==m.size||sha256.digest('hex')!==m.sha256||sha512.digest('base64')!==m.sha512)throw new Error('Installer checksum does not match the signed release.');
    await fs.rename(temporary,path.join(directory,m.file));await fs.writeFile(path.join(directory,'release.json'),JSON.stringify(envelope));
    const pointer=path.join(releases,'latest-'+crypto.randomUUID()+'.tmp');await fs.writeFile(pointer,JSON.stringify(envelope));await fs.rename(pointer,path.join(releases,'latest.json'));
   }catch(e){try{await writer.end();}catch{}await fs.unlink(temporary).catch(()=>{});throw e;}
  },
  async download(manifest,request){
   const file=Bun.file(path.join(releases,manifest.version,manifest.file));if(!await file.exists())return new Response('Installer not found.',{status:404});
   const headers={'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${manifest.file}"`,'Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'};
   const range=request.headers.get('Range');if(range){const r=range.match(/^bytes=(\d+)-(\d*)$/);const start=r?Number(r[1]):-1,end=r&&r[2]?Number(r[2]):file.size-1;if(start<0||start>end||end>=file.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${file.size}`}});return new Response(file.slice(start,end+1),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${file.size}`}});}
   return new Response(file,{headers:{...headers,'Content-Length':String(file.size)}});
  }
 };return store;
}

const SHARE_MAX_AGE=7*86400000,SHARE_ID=/^765\d{14}$/,SHARE_ITEM=/^[1-9]\d{0,19}$/;
function sharingAudience(value,friends,fail){
 if(!value||!['all','selected','private'].includes(value.mode)||!Array.isArray(value.friends)||value.friends.length>2000||value.friends.some(id=>!SHARE_ID.test(id)||!friends.includes(id)))fail('Invalid list audience.');
 return{mode:value.mode,friends:value.mode==='selected'?[...new Set(value.friends)]:[]};
}
function canViewSharing(audience,viewer){return audience.mode==='all'||audience.mode==='selected'&&audience.friends.includes(viewer);}
function validateSharingProfile(input,fail){
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
async function sharingRoute(request,db,actor,now,{json,fail,mutual}){
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

const DAY=86400000,MAX_AGE=7*DAY;
const ID=/^765\d{14}$/,GAME=/^[1-9]\d{0,9}$/,ITEM=/^[1-9]\d{0,19}$/,TOKEN=/^[a-f0-9]{64}$/,DEVICE=/^[a-f0-9-]{36}$/;
class Failure extends Error{constructor(message,status=400){super(message);this.status=status;}}
const fail=(message,status)=>{throw new Failure(message,status);};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
const html=(title,message)=>new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="background:#101620;color:#eef1f8;font:16px system-ui;max-width:650px;margin:12vh auto;padding:30px"><p style="color:#baa5ff">WorkshopSync</p><h1>${title}</h1><p style="line-height:1.7">${message}</p></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function body(request){const length=Number(request.headers.get('content-length')||0);if(length>1000000)fail('Request is too large.',413);const raw=await request.text();if(raw.length>1000000)fail('Request is too large.',413);try{return JSON.parse(raw);}catch{fail('Invalid JSON.');}}
async function rate(db,key,limit,now){
 const bucket=Math.floor(now/60000);const hash=await sha(`${key}:${bucket}`);
 const row=await db.prepare('INSERT INTO rates (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(hash,now+DAY).first();
 if(row.count>limit)fail('Too many requests. Try again later.',429);
}
async function user(request,db,now){
 const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)fail('Connect your Steam account to companion sharing.',401);
 const hash=await sha(token);const row=await db.prepare('SELECT steamid,expires FROM sessions WHERE token_hash=?').bind(hash).first();
 if(!row || row.expires<now)fail('Companion sign-in expired. Reconnect Steam.',401);
 return {steamid:row.steamid,hash};
}
async function mutual(db,viewer,owner,now){
 const rows=(await db.prepare('SELECT steamid,friends,updated FROM profiles WHERE steamid IN (?,?)').bind(viewer,owner).all()).results;
 const a=rows.find(r=>r.steamid===viewer),b=rows.find(r=>r.steamid===owner);
 return !!(a&&b&&a.updated>now-MAX_AGE&&b.updated>now-MAX_AGE&&JSON.parse(a.friends).includes(owner)&&JSON.parse(b.friends).includes(viewer));
}
function validateProfile(input){
 if(!Array.isArray(input.friends)||input.friends.length>2000||input.friends.some(x=>!ID.test(x)))fail('Invalid Steam friends list.');
 if(!Array.isArray(input.games)||input.games.length>100)fail('Share at most 100 games.');
 const seen=new Set();let count=0;
 const games=input.games.map(g=>{
  if(typeof g.appid!=='string'||!GAME.test(g.appid)||Number(g.appid)>4294967295||seen.has(g.appid))fail('Invalid or duplicate game.');seen.add(g.appid);
  if(typeof g.name!=='string'||!g.name.trim()||g.name.length>200)fail('Invalid game name.');
  for(const key of ['curated','subscriptions'])if(!Array.isArray(g[key])||g[key].length>5000||g[key].some(x=>typeof x!=='string'||!ITEM.test(x)))fail('Invalid Workshop item IDs.');
  if(typeof g.shareList!=='boolean'||typeof g.shareSubscriptions!=='boolean')fail('Explicit game sharing preferences are required.');
  if(!g.shareList&&!g.shareSubscriptions)fail('Disabled games must not be uploaded.');
  if(!g.shareList&&g.curated.length || !g.shareSubscriptions&&g.subscriptions.length)fail('Unshared items must not be uploaded.');
  count+=g.curated.length+g.subscriptions.length;if(count>50000)fail('Too many shared items.');
  return {...g,curated:[...new Set(g.curated)],subscriptions:[...new Set(g.subscriptions)]};
 });
 return{friends:[...new Set(input.friends)],games};
}
async function callback(url,db,origin,now,fetcher){
 const device=url.searchParams.get('device'),state=url.searchParams.get('state');
 if(!DEVICE.test(device||'')||!TOKEN.test(state||''))fail('Invalid sign-in callback.');
 const pending=await db.prepare('SELECT * FROM devices WHERE id=?').bind(device).first();
 if(!pending || pending.completed || pending.expires<now || !same(pending.state_hash,await sha(state)))fail('Sign-in request expired or was already used.',410);
 const q=url.searchParams;const expectedReturn=`${origin}/auth/return?device=${device}&state=${state}`;
 if(q.get('openid.mode')!=='id_res'||q.get('openid.ns')!=='http://specs.openid.net/auth/2.0'||q.get('openid.op_endpoint')!=='https://steamcommunity.com/openid/login'||q.get('openid.return_to')!==expectedReturn)fail('Steam sign-in assertion was not valid.',401);
 const claimed=q.get('openid.claimed_id');const match=claimed?.match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(765\d{14})$/);
 if(!match||q.get('openid.identity')!==claimed||(pending.expected&&match[1]!==pending.expected))fail('Sign in with the same Steam account used in the companion.',403);
 const signed=new Set((q.get('openid.signed')||'').split(','));
 if(['op_endpoint','claimed_id','identity','return_to','response_nonce','assoc_handle'].some(k=>!signed.has(k)))fail('Steam assertion is missing signed fields.',401);
 const nonce=q.get('openid.response_nonce')||'';const when=Date.parse(nonce.slice(0,20));
 if(!Number.isFinite(when)||Math.abs(now-when)>5*60000)fail('Steam sign-in assertion expired.',401);
 const nonceHash=await sha(nonce);if(await db.prepare('SELECT hash FROM nonces WHERE hash=?').bind(nonceHash).first())fail('Steam sign-in assertion was already used.',401);
 const params=new URLSearchParams([...q.entries()].filter(([key])=>key.startsWith('openid.')));params.set('openid.mode','check_authentication');
 const verified=await fetcher('https://steamcommunity.com/openid/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString(),signal:AbortSignal.timeout(20000)});
 if(!verified.ok||!/^is_valid:true\s*$/m.test(await verified.text()))fail('Steam could not verify this sign-in.',401);
 await db.batch([
  db.prepare('INSERT INTO nonces (hash,expires) VALUES (?,?)').bind(nonceHash,now+DAY),
  db.prepare('INSERT INTO sessions (token_hash,steamid,expires) VALUES (?,?,?) ON CONFLICT(token_hash) DO UPDATE SET steamid=excluded.steamid,expires=excluded.expires').bind(pending.token_hash,match[1],now+30*DAY),
  db.prepare('UPDATE devices SET completed=1,state_hash=NULL WHERE id=?').bind(device)
 ]);
 return html('Steam and friend sharing connected','Return to WorkshopSync. The companion will finish connecting automatically. All Workshop games are shared with companion friends by default; downloads remain opt-in. You can close this tab.');
}
async function handle(request,env,dependencies={}){
 const now=dependencies.now ?? Date.now();const fetcher=dependencies.fetch || fetch;
 try{
  const url=new URL(request.url);const origin=env.PUBLIC_ORIGIN || url.origin;const db=env.DB;
  if(url.origin!==origin)fail('Incorrect service origin.',400);
  if(url.pathname==='/v1/health')return json({service:'workshop-link-sync',version:'0.8.0',sharingVersion:2,privateItemsVersion:1,ready:!!db});
  if(url.pathname==='/')return html('Companion friend sharing','A sync service for the WorkshopSync Windows companion. Connect from the companion using Steam. Mod lists are accessible only between authenticated accounts whose companions both report the other as a Steam friend, and only for games enabled for sharing. Lists expire after seven days without refresh. No Steam Collections are used.');
  if(!db)fail('Sync database is not configured.',503);
  const releaseResponse=await releaseRoute(request,env,{authenticate:()=>user(request,db,now)});if(releaseResponse)return releaseResponse;
  if(url.pathname==='/v1/device'&&request.method==='POST'){
   await rate(db,`device:${request.headers.get('CF-Connecting-IP')||'local'}`,12,now);const input=await body(request);
   if(!DEVICE.test(input.device||'')||!TOKEN.test(input.tokenHash||'')||(input.steamid!=null&&!ID.test(input.steamid)))fail('Invalid companion sign-in request.');
   await db.batch([db.prepare('DELETE FROM devices WHERE expires<?').bind(now),db.prepare('DELETE FROM sessions WHERE expires<?').bind(now),db.prepare('DELETE FROM nonces WHERE expires<?').bind(now),db.prepare('DELETE FROM rates WHERE expires<?').bind(now)]);
   await db.prepare('INSERT INTO devices (id,token_hash,expected,expires,completed) VALUES (?,?,?,?,0)').bind(input.device,input.tokenHash,input.steamid||'',now+10*60000).run();
   return json({loginUrl:`${origin}/auth/steam?device=${input.device}`,expires:now+10*60000});
  }
  if(url.pathname==='/auth/steam'&&request.method==='GET'){
   const device=url.searchParams.get('device');if(!DEVICE.test(device||''))fail('Invalid device request.');
   const pending=await db.prepare('SELECT * FROM devices WHERE id=?').bind(device).first();if(!pending||pending.completed||pending.expires<now)fail('Sign-in request expired.',410);
   const state=random();await db.prepare('UPDATE devices SET state_hash=? WHERE id=?').bind(await sha(state),device).run();
   const steam=new URL('https://steamcommunity.com/openid/login');
   steam.search=new URLSearchParams({'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'checkid_setup','openid.return_to':`${origin}/auth/return?device=${device}&state=${state}`,'openid.realm':`${origin}/`,'openid.identity':'http://specs.openid.net/auth/2.0/identifier_select','openid.claimed_id':'http://specs.openid.net/auth/2.0/identifier_select'}).toString();
   return Response.redirect(steam.href,303);
  }
  if(url.pathname==='/auth/return'&&request.method==='GET')return await callback(url,db,origin,now,fetcher);
  if(url.pathname==='/v1/device/status'&&request.method==='POST'){
   const input=await body(request);if(!DEVICE.test(input.device||''))fail('Invalid device.');
   const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)fail('Invalid device token.',401);
   const p=await db.prepare('SELECT * FROM devices WHERE id=?').bind(input.device).first();
   if(!p||p.expires<now||!same(p.token_hash,await sha(token)))fail('Device request expired.',410);
   if(!p.completed)return json({status:'pending'});
   const u=await user(request,db,now);return json({status:'connected',steamid:u.steamid});
  }
  const actor=await user(request,db,now);await rate(db,`user:${actor.steamid}`,60,now);
  if(url.pathname==='/v1/me'&&request.method==='GET')return json({steamid:actor.steamid});
  if(url.pathname==='/v1/profile'&&request.method==='DELETE'){
   await db.batch([db.prepare('DELETE FROM lists WHERE owner=?').bind(actor.steamid),db.prepare('DELETE FROM profiles WHERE steamid=?').bind(actor.steamid),db.prepare('DELETE FROM sessions WHERE steamid=?').bind(actor.steamid)]);return json({ok:true});
  }
  const shared=await sharingRoute(request,db,actor,now,{json,fail,mutual});if(shared)return shared;
  fail('Not found.',404);
 }catch(e){return json({error:e instanceof Failure?e.message:'The sync service could not complete this request.'},e instanceof Failure?e.status:500);}
}



function sqliteAdapter(sqlite){
 return{
  prepare(sql){let values=[];const statement={
   bind(...args){values=args;return statement;},
   first(){return sqlite.prepare(sql).get(...values)||null;},
   all(){return{results:sqlite.prepare(sql).all(...values)};},
   run(){return statement.execute();},
   execute(){return sqlite.prepare(sql).run(...values);}
  };return statement;},
  batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
 };
}


const mount=Bun.env.RAILWAY_VOLUME_MOUNT_PATH;
let DB=null;
if(mount){
 mkdirSync(mount,{recursive:true});
 const sqlite=new Database(mount+'/workshop-link.sqlite',{create:true,strict:true});
 sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS _schema (name TEXT PRIMARY KEY NOT NULL)');
 const migrations=[{"name":"0000_skinny_thundra.sql","sql":"CREATE TABLE `devices` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`token_hash` text NOT NULL,\n\t`expected` text NOT NULL,\n\t`state_hash` text,\n\t`expires` integer NOT NULL,\n\t`completed` integer DEFAULT 0 NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `lists` (\n\t`owner` text NOT NULL,\n\t`appid` text NOT NULL,\n\t`name` text NOT NULL,\n\t`curated` text NOT NULL,\n\t`subscriptions` text NOT NULL,\n\t`share_list` integer NOT NULL,\n\t`share_subscriptions` integer NOT NULL,\n\t`list_count` integer NOT NULL,\n\t`subscription_count` integer NOT NULL,\n\t`updated` integer NOT NULL,\n\tPRIMARY KEY(`owner`, `appid`)\n);\n--> statement-breakpoint\nCREATE TABLE `nonces` (\n\t`hash` text PRIMARY KEY NOT NULL,\n\t`expires` integer NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `profiles` (\n\t`steamid` text PRIMARY KEY NOT NULL,\n\t`friends` text NOT NULL,\n\t`updated` integer NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `rates` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`count` integer NOT NULL,\n\t`expires` integer NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `sessions` (\n\t`token_hash` text PRIMARY KEY NOT NULL,\n\t`steamid` text NOT NULL,\n\t`expires` integer NOT NULL\n);\n"},{"name":"0001_named_lists.sql","sql":"ALTER TABLE lists ADD COLUMN named_lists TEXT NOT NULL DEFAULT 'null';\nALTER TABLE lists ADD COLUMN audience TEXT NOT NULL DEFAULT '{\"mode\":\"all\",\"friends\":[]}';\nALTER TABLE profiles ADD COLUMN sharing_version INTEGER NOT NULL DEFAULT 1;\n"}];
 for(const migration of migrations){if(!sqlite.prepare('SELECT name FROM _schema WHERE name=?').get(migration.name)){
  sqlite.exec('BEGIN IMMEDIATE');try{sqlite.exec(migration.sql);sqlite.prepare('INSERT INTO _schema(name) VALUES (?)').run(migration.name);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
 }}
 DB=sqliteAdapter(sqlite);
}
const publicOrigin=Bun.env.PUBLIC_ORIGIN || (Bun.env.RAILWAY_PUBLIC_DOMAIN?'https://'+Bun.env.RAILWAY_PUBLIC_DOMAIN:'');
const RELEASE_STORE=mount?fileReleaseStore(mount):null;
export default {
 port:Number(Bun.env.PORT||3000),
 maxRequestBodySize:201*1024*1024,
 fetch(request){
  if(!DB || !publicOrigin)return new Response(JSON.stringify({service:'workshop-link-sync',version:'0.2.0',ready:false,error:'Persistent storage or public origin is not configured.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const actual=new URL(request.url);const target=new URL(actual.pathname+actual.search,publicOrigin);
  const forwarded=new Request(target,request);
  return handle(forwarded,{DB,PUBLIC_ORIGIN:publicOrigin,RELEASE_STORE,UPDATE_PUBLIC_KEY:Bun.env.UPDATE_PUBLIC_KEY,RELEASE_PUBLISHER_STEAM_ID:Bun.env.RELEASE_PUBLISHER_STEAM_ID});
 }
};
