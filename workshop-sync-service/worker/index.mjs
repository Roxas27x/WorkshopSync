import {sharingRoute,validateSharingProfile} from './sharing.mjs';
import {releaseRoute} from './releases.mjs';
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
export async function handle(request,env,dependencies={}){
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
export {sha,validateProfile};
export default{fetch:handle};
