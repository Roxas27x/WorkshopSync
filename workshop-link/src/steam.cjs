const fs = require('node:fs/promises');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {id, gameId, normalizeDetail, parseVdf} = require('./core.cjs');
const Legacy=require('./legacy-workshop.cjs');
const {signedIn}=require('./community.cjs');
function steamAuthorizationRequired(){const error=new Error('Steam download authorization expired. Reconnect Steam, then retry your saved selection.');error.code='STEAM_WEB_AUTH_REQUIRED';return error;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
class Steam {
  constructor(ses) { this.ses=ses; this.cache=new Map(); }
  async request(url, body, authenticated=false) {
    const options={method:body?'POST':'GET',signal:AbortSignal.timeout(30000)};
    if(body) { options.body=new URLSearchParams(body).toString(); options.headers={'Content-Type':'application/x-www-form-urlencoded','Origin':'https://steamcommunity.com','Referer':'https://steamcommunity.com/'}; }
    const response = authenticated ? await this.ses.fetch(url,options) : await fetch(url,options);
    if(response.status===429) throw new Error('Steam is rate limiting requests. Wait a few minutes before trying again.');
    if(authenticated&&response.status===401){this.authorizationFailure=(await this.auth())?.steamid;this.authorization=null;throw steamAuthorizationRequired();}
    if(!response.ok) throw new Error(`Steam returned HTTP ${response.status}. Try again later.`);
    try { return await response.json(); } catch { throw new Error('Steam returned an unexpected response. Sign in again or use Open in Steam.'); }
  }
  async details(ids, fresh=false, tolerant=false) {
    ids=[...new Set(ids.map(id))];
    const missing=ids.filter(x=>fresh || !this.cache.has(x) || Date.now()-this.cache.get(x).at>120000);
    for(let i=0;i<missing.length;i+=100) {
      const chunk=missing.slice(i,i+100); const body={itemcount:String(chunk.length)};
      chunk.forEach((x,j)=>body[`publishedfileids[${j}]`]=x);
      const data=await this.request('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',body);
      const rows=data.response?.publishedfiledetails;
      if(!Array.isArray(rows)) throw new Error('Steam did not return Workshop details.');
      for(const row of rows) {
        if(tolerant && Number(row.result)!==1){const itemId=id(String(row.publishedfileid));this.cache.set(itemId,{at:Date.now(),item:{id:itemId,appid:'0',title:`Unavailable Workshop item ${itemId}`,type:0,unavailable:true}});continue;}
        const item=normalizeDetail(row); this.cache.set(item.id,{item,at:Date.now()});
      }
      for(const x of chunk) if(!this.cache.has(x)) throw new Error(`Steam omitted Workshop item ${x}.`);
      if(i+100<missing.length) await delay(600);
    }
    const result=ids.map(x=>this.cache.get(x).item);
    if(!tolerant && result.some(x=>x.unavailable))throw new Error('A selected Workshop item is unavailable or private.');
    return result;
  }
  async auth() {
    const cookies=await this.ses.cookies.get({url:'https://steamcommunity.com/'});
    const login=cookies.find(x=>x.name==='steamLoginSecure');
    let decoded=''; try { decoded=decodeURIComponent(login?.value || ''); } catch {}
    const steamid=decoded.match(/^(\d{17})\|\|/)?.[1];
    const sessionid=cookies.find(x=>x.name==='sessionid')?.value;
    // Steam's login cookie can survive restart while the CSRF cookie does not.
    // Reading the account's local cache requires identity, not a CSRF token.
    if(!steamid) return null;
    return {steamid,sessionid};
  }
  async ensureAuthorized(expectedAccount,{fresh=false}={}) {
    let auth=await this.auth();
    const expired=()=>{this.authorizationFailure=expectedAccount;this.authorization=null;return steamAuthorizationRequired();};
    if(!auth||auth.steamid!==expectedAccount)throw expired();
    if(!fresh&&auth.sessionid&&this.authorization?.steamid===expectedAccount&&this.authorization.sessionid===auth.sessionid&&Date.now()-this.authorization.at<30000&&!this.authorizationFailure)return auth;
    const response=await this.ses.fetch('https://steamcommunity.com/my/?l=english',{signal:AbortSignal.timeout(30000)});
    if(response.status===401)throw expired();
    if(!response.ok)throw new Error(`Steam could not check download authorization (HTTP ${response.status}). Try again shortly.`);
    try{signedIn(await response.text(),expectedAccount);}catch{throw expired();}
    auth=await this.auth();if(auth?.steamid!==expectedAccount||!auth.sessionid)throw expired();
    this.authorizationFailure=null;this.authorization={steamid:auth.steamid,sessionid:auth.sessionid,at:Date.now()};return auth;
  }
  async mutate(kind, params, expectedAccount) {
    if(!['subscribe','unsubscribe'].includes(kind)) throw new Error('Unsupported Steam action.');
    id(params.id);gameId(params.appid);
    let auth=await this.auth();
    if(!auth) throw steamAuthorizationRequired();
    if(expectedAccount && auth.steamid!==expectedAccount) throw new Error('The Steam account changed. Review your game sync choices again.');
    auth=await this.ensureAuthorized(expectedAccount||auth.steamid);
    const data=await this.request(`https://steamcommunity.com/sharedfiles/${kind}/`,{...params,sessionid:auth.sessionid},true);
    if(Number(data.success)!==1) throw new Error(`Steam declined this action (${data.success ?? 'unknown response'}). Check sign-in, ownership, and Workshop availability.`);
    return true;
  }
}
async function resolveLibraryRoot(selected){
  let current=path.resolve(selected);
  try{if((await fs.stat(current)).isFile())current=path.dirname(current);}catch(e){throw new Error(`Cannot read the selected path (${e.code}).`);}
  for(let n=0;n<10;n++){
    const candidate=path.basename(current).toLowerCase()==='steamapps'?path.dirname(current):current;
    try{if((await fs.stat(path.join(candidate,'steamapps'))).isDirectory())return candidate;}catch(e){if(['EACCES','EPERM'].includes(e.code))throw new Error(`Access denied while checking ${candidate}. Select a readable Steam library folder.`);}
    const parent=path.dirname(current);if(parent===current)break;current=parent;
  }
  throw new Error('No Steam library was found above this folder. Select Steam, steamapps, common, a game folder, or a Workshop content folder.');
}
async function readSubscriptionCache(roots,steamid,errors=[]){
  if(!/^765\d{14}$/.test(steamid || ''))return [];
  const account=(BigInt(steamid)-76561197960265728n).toString();const games=new Map();
  for(const root of roots){
    const dir=path.join(root,'userdata',account,'ugc');let files;
    try{files=await fs.readdir(dir);}catch(e){if(['EACCES','EPERM'].includes(e.code))errors.push(`Access denied: ${dir}`);continue;}
    for(const file of files.filter(x=>/^[1-9]\d*_subscriptions\.vdf$/.test(x))){
      try{
        const appid=file.match(/^(\d+)/)[1];const vdf=parseVdf(await fs.readFile(path.join(dir,file),'utf8'));
        const ids=Object.values(vdf.subscribedfiles || {}).filter(x=>x && typeof x==='object' && /^[1-9]\d{0,19}$/.test(x.publishedfileid || '')).map(x=>({id:x.publishedfileid,disabled:x.disabled_locally==='1',subscribedAt:Number(x.time_subscribed)*1000}));
        const stat=await fs.stat(path.join(dir,file));const previous=games.get(appid);
        if(!previous || stat.mtimeMs>previous.cachedAt)games.set(appid,{id:appid,subscribed:ids.map(x=>x.id),subscriptionTimes:Object.fromEntries(ids.filter(x=>Number.isSafeInteger(x.subscribedAt)&&x.subscribedAt>0&&x.subscribedAt<=Date.now()+86400000).map(x=>[x.id,x.subscribedAt])),disabled:ids.filter(x=>x.disabled).map(x=>x.id),cachedAt:stat.mtimeMs});
      }catch(e){errors.push(`Could not read subscription cache ${file} (${e.code || e.message}).`);}
    }
  }
  return [...games.values()];
}
async function readPlayHistory(roots,steamid,errors=[]) {
  if(!/^765\d{14}$/.test(steamid||''))return null;
  const account=(BigInt(steamid)-76561197960265728n).toString();let history=null;
  const field=(object,key)=>object?.[Object.keys(object||{}).find(k=>k.toLowerCase()===key.toLowerCase())];
  for(const root of roots){
    const file=path.join(root,'userdata',account,'config','localconfig.vdf');
    try{
      let node=parseVdf(await fs.readFile(file,'utf8'));
      for(const key of ['UserLocalConfigStore','Software','Valve','Steam','apps'])node=field(node,key);
      if(!node||typeof node!=='object')continue;
      history ||= {};
      for(const [appid,info] of Object.entries(node)){
        const seconds=Number(field(info,'LastPlayed'));
        if(/^[1-9]\d{0,9}$/.test(appid)&&Number(appid)<=4294967295&&Number.isSafeInteger(seconds)&&seconds>0&&seconds*1000<=Date.now()+86400000)history[appid]=Math.max(history[appid]||0,seconds*1000);
      }
    }catch(e){if(e.code!=='ENOENT')errors.push(`Cannot read Steam play history (${e.code||'invalid format'}).`);}
  }
  return history;
}
async function scanLibraries(extra=[],steamid=null) {
  const roots=new Set(extra);
  for(const p of [process.env['ProgramFiles(x86)'],process.env.ProgramFiles]) if(p) roots.add(path.join(p,'Steam'));
  try {
    const {stdout}=await promisify(execFile)('reg.exe',['query','HKCU\\Software\\Valve\\Steam','/v','SteamPath'],{windowsHide:true,timeout:5000});
    const p=stdout.match(/SteamPath\s+REG_SZ\s+([^\r\n]+)/)?.[1]; if(p) roots.add(p.trim());
  } catch {}
  for(const root of [...roots]) {
    try {
      const vdf=parseVdf(await fs.readFile(path.join(root,'steamapps','libraryfolders.vdf'),'utf8'));
      for(const lib of Object.values(vdf.libraryfolders || vdf.LibraryFolders || {})) {
        const p=typeof lib==='object'?lib.path:lib; if(typeof p==='string' && path.isAbsolute(p)) roots.add(p);
      }
    } catch {}
  }
  const games=new Map(); const found=[]; const errors=[];
  const libraryRoots=[...new Map([...roots].map(root=>[path.resolve(root).toLowerCase(),root])).values()];
  for(const root of libraryRoots) {
    let entries; try { entries=await fs.readdir(path.join(root,'steamapps')); found.push(root); } catch(e) { if(['EACCES','EPERM'].includes(e.code))errors.push(`Access denied: ${path.join(root,'steamapps')}`);continue; }
    for(const entry of entries.filter(x=>/^appmanifest_\d+\.acf$/.test(x))) {
      try {
        const data=parseVdf(await fs.readFile(path.join(root,'steamapps',entry),'utf8')).AppState;
        if(data?.appid && !games.has(data.appid)) games.set(data.appid,{id:data.appid,name:data.name || `Game ${data.appid}`,installed:[]});
      } catch { errors.push(`Could not read ${entry}.`); }
    }
    const base=path.join(root,'steamapps','workshop','content');
    let apps=[]; try { apps=await fs.readdir(base,{withFileTypes:true}); } catch(e) {if(['EACCES','EPERM'].includes(e.code))errors.push(`Access denied: ${base}`);}
    for(const dir of apps.filter(x=>x.isDirectory() && /^[1-9]\d*$/.test(x.name))) {
      const game=games.get(dir.name) || {id:dir.name,name:`Game ${dir.name}`,installed:[]};
      let manifest={};try{manifest=parseVdf(await fs.readFile(path.join(root,'steamapps','workshop',`appworkshop_${dir.name}.acf`),'utf8')).AppWorkshop?.WorkshopItemsInstalled||{};}catch(e){if(e.code!=='ENOENT')errors.push(`Cannot read Workshop installation manifest for ${dir.name} (${e.code||'invalid format'}).`);}
      game.localFiles||=[];
      let mods;try{mods=await fs.readdir(path.join(base,dir.name),{withFileTypes:true});}catch(e){errors.push(`Cannot read ${path.join(base,dir.name)} (${e.code}).`);continue;}
      for(const mod of mods.filter(x=>x.isDirectory() && /^[1-9]\d{0,19}$/.test(x.name))) {
        // Empty directories can remain after Steam unsubscribes. They are not installed items.
        try { const folder=path.join(base,dir.name,mod.name);if((await fs.readdir(folder)).length){game.installed.push(mod.name);const stat=await fs.stat(folder),rawSize=Number(manifest[mod.name]?.size);game.localFiles.push({id:mod.name,fileCreatedAt:stat.birthtimeMs||null,manifest:manifest[mod.name]?.manifest||null,bytes:Number.isSafeInteger(rawSize)&&rawSize>=0?rawSize:null});} } catch(e) {errors.push(`Cannot read Workshop item ${mod.name} (${e.code}).`);}
      }
      game.installed=[...new Set(game.installed)]; games.set(dir.name,game);
    }
    if(games.has('550')){try{const local=await Legacy.scan(root),g=games.get('550');g.localFiles||=[];g.localFiles.push(...local);g.installed=[...new Set([...g.installed,...local.map(row=>row.id)])];}catch(error){errors.push('Cannot read the Left 4 Dead 2 Workshop cache: '+error.message);}}
  }
  const subscriptions=await readSubscriptionCache([...new Set([...found,...libraryRoots])],steamid,errors);
  for(const sub of subscriptions){const game=games.get(sub.id)||{id:sub.id,name:`Game ${sub.id}`,installed:[]};Object.assign(game,{subscribed:sub.subscribed,subscriptionTimes:sub.subscriptionTimes,disabled:sub.disabled,cachedAt:sub.cachedAt});games.set(sub.id,game);}
  const playHistory=await readPlayHistory(libraryRoots,steamid,errors);
  return {games:[...games.values()],roots:found,errors,cacheGames:subscriptions.length,playHistory};
}
module.exports={Steam,scanLibraries,readSubscriptionCache,readPlayHistory,resolveLibraryRoot,delay};
