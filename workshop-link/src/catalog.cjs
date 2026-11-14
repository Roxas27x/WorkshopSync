const fs=require('node:fs/promises');
const path=require('node:path');
const {gameId,safeImage}=require('./core.cjs');
async function storeInfo(appid,fetcher=fetch){
  gameId(appid);
  const response=await fetcher(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic,categories`,{signal:AbortSignal.timeout(15000)});
  if(response.status===429)throw new Error('Steam Store is rate limiting game verification. Try scanning again later.');
  if(!response.ok)throw new Error(`Steam Store game verification returned HTTP ${response.status}.`);
  const record=(await response.json())[appid];
  if(!record?.success || !record.data)throw new Error(`Steam could not verify Workshop support for game ${appid}. It stays hidden until verified.`);
  const data=record.data;
  return {name:String(data.name || `Game ${appid}`).slice(0,200),kind:data.type,workshop:Array.isArray(data.categories) && data.categories.some(c=>Number(c.id)===30),checkedAt:Date.now()};
}
async function localIcon(appid,roots){
  for(const root of roots){
    const base=path.join(root,'appcache','librarycache');
    let names=[];try{names=await fs.readdir(path.join(base,appid));}catch{}
    const candidates=[path.join(base,`${appid}_icon.jpg`),...names.filter(n=>/^[a-f0-9]{40}\.jpg$/i.test(n)).map(n=>path.join(base,appid,n))];
    for(const file of candidates){
      try{const stat=await fs.stat(file);if(stat.size>0 && stat.size<262144){const bytes=await fs.readFile(file);if(bytes[0]===255&&bytes[1]===216)return`data:image/jpeg;base64,${bytes.toString('base64')}`;}}catch{}
    }
  }
  return '';
}
function parseHubIcon(html,appid){
  gameId(appid);
  const block=html.match(/apphub_AppIcon[\s\S]{0,600}?<img[^>]+src="([^"]+)"/i);
  const url=block?.[1]?.replace(/&amp;/g,'&');
  if(!safeImage(url))return '';
  const parsed=new URL(url);
  return new RegExp(`/images/apps/${appid}/[a-f0-9]{40}\\.(jpg|png)$`,'i').test(parsed.pathname)?url:'';
}
async function gameIcon(appid,roots,fetcher=fetch){
  const local=await localIcon(appid,roots);if(local)return local;
  // Steam's actual square game icon, rather than a cropped store capsule or a letter tile.
  const hub=await fetcher(`https://steamcommunity.com/app/${gameId(appid)}`,{signal:AbortSignal.timeout(15000)});
  if(!hub.ok)throw new Error(`Could not retrieve the Steam icon for game ${appid} (HTTP ${hub.status}).`);
  const url=parseHubIcon(await hub.text(),appid);if(!url)throw new Error(`Steam did not provide a game icon for ${appid}.`);
  const image=await fetcher(url,{signal:AbortSignal.timeout(15000)});
  if(!image.ok)throw new Error(`Could not download the Steam icon for ${appid}.`);
  const type=image.headers.get('content-type')?.split(';')[0];
  if(!['image/jpeg','image/png'].includes(type))throw new Error('Steam returned an unexpected game-icon format.');
  const buffer=Buffer.from(await image.arrayBuffer());if(buffer.length>262144)throw new Error('Game icon exceeded the size limit.');
  return `data:${type};base64,${buffer.toString('base64')}`;
}
function visibleGames(games){return games.filter(g=>g.workshop===true);}
function confirmedWorkshop(info,proof,appid){return info.workshop===true || (info.kind==='game' && proof?.appid===appid && proof?.type===0);}
module.exports={storeInfo,localIcon,parseHubIcon,gameIcon,visibleGames,confirmedWorkshop};
