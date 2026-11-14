import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {handle,sha} from '../worker/index.mjs';
import {sqliteAdapter} from '../sqlite-adapter.mjs';
const A='76561198000000001',B='76561198000000002',C='76561198000000003';
const TA='a'.repeat(64),TB='b'.repeat(64),TC='c'.repeat(64);const NOW=Date.parse('2026-11-13T03:00:00Z');
function database(){
 const sqlite=new DatabaseSync(':memory:');const files=fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql'));
 for(const file of files)sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const db=sqliteAdapter(sqlite);
 return{db,sqlite};
}
async function setup(){const{db,sqlite}=database();for(const [id,t] of [[A,TA],[B,TB],[C,TC]])await db.prepare('INSERT INTO sessions(token_hash,steamid,expires) VALUES(?,?,?)').bind(await sha(t),id,NOW+86400000).run();return{db,sqlite};}
async function request(db,path,method='GET',body,token=TA,extras={}){
 const r=new Request('https://sync.test'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return handle(r,{DB:db,PUBLIC_ORIGIN:'https://sync.test'},{now:NOW,...extras});
}
const game=(overrides={})=>({appid:'311210',name:'Black Ops III',shareList:true,shareSubscriptions:true,curated:['1'],subscriptions:['1','2'],...overrides});
test('anonymous callers cannot read profiles or friends',async()=>{const{db}=await setup();assert.equal((await request(db,'/v1/friends','GET',null,null)).status,401);});
test('identity belongs to the validated session, never a submitted Steam ID',async()=>{const{db}=await setup();await request(db,'/v1/profile','PUT',{steamid:B,friends:[B],games:[game()]});assert.ok(await db.prepare('SELECT steamid FROM profiles WHERE steamid=?').bind(A).first());assert.equal(await db.prepare('SELECT steamid FROM profiles WHERE steamid=?').bind(B).first(),null);});
test('mutual Steam-friend snapshots enable collection-free subscriptions and curated lists',async()=>{
 const{db}=await setup();await request(db,'/v1/profile','PUT',{friends:[B],games:[]},TA);await request(db,'/v1/profile','PUT',{friends:[A],games:[game()]},TB);
 const friends=await(await request(db,'/v1/friends')).json();assert.equal(friends.friends[0].steamid,B);
 const data=await(await request(db,`/v1/friends/${B}/311210`)).json();assert.deepEqual(data.subscriptions,['1','2']);assert.deepEqual(data.curated,['1']);
});

test('library counts deduplicate items across friends, subscriptions and chosen lists without exposing item payloads',async()=>{
 const{db}=await setup();await request(db,'/v1/profile','PUT',{friends:[B,C],games:[]},TA);
 await request(db,'/v1/profile','PUT',{friends:[A],games:[game({curated:['2','3'],subscriptions:['1','2']}),game({appid:'550',name:'Left 4 Dead 2',curated:['8','9'],subscriptions:['9']})]},TB);
 await request(db,'/v1/profile','PUT',{friends:[A],games:[game({curated:['4','5'],subscriptions:['2','4']})]},TC);
 const data=await(await request(db,'/v1/friends')).json();
 const shared=data.sharedGameStats.find(g=>g.appid==='311210');assert.equal(shared.itemCount,5);assert.equal(shared.friendCount,2);assert.equal(shared.expiresAt,NOW+7*86400000);
 assert.equal(data.sharedGameStats.find(g=>g.appid==='550').itemCount,2);
 assert.equal(data.friends[0].games[0].subscriptions,undefined);assert.equal(data.friends[0].games[0].curated,undefined);
 await request(db,'/v1/profile','PUT',{friends:[A],games:[]},TC);
 assert.equal((await(await request(db,'/v1/friends')).json()).sharedGameStats.find(g=>g.appid==='311210').itemCount,3);
 await request(db,'/v1/profile','PUT',{friends:[A],games:[game({shareSubscriptions:false,subscriptions:[],curated:['2','3']})]},TB);
 assert.equal((await(await request(db,'/v1/friends')).json()).sharedGameStats[0].itemCount,2);
 await request(db,'/v1/profile','PUT',{friends:[],games:[]},TA);
 assert.deepEqual((await(await request(db,'/v1/friends')).json()).sharedGameStats,[]);
});

test('library counts exclude expired lists and expired or one-sided friends',async()=>{
 const{db}=await setup();await request(db,'/v1/profile','PUT',{friends:[B,C],games:[]},TA);
 await request(db,'/v1/profile','PUT',{friends:[A],games:[game()]},TB);await request(db,'/v1/profile','PUT',{friends:[],games:[game({subscriptions:['9']})]},TC);
 assert.equal((await(await request(db,'/v1/friends')).json()).sharedGameStats[0].itemCount,2);
 await db.prepare('UPDATE lists SET updated=? WHERE owner=?').bind(NOW-8*86400000,B).run();assert.deepEqual((await(await request(db,'/v1/friends')).json()).sharedGameStats,[]);
 await request(db,'/v1/profile','PUT',{friends:[A],games:[game()]},TB);await db.prepare('UPDATE profiles SET updated=? WHERE steamid=?').bind(NOW-8*86400000,B).run();assert.deepEqual((await(await request(db,'/v1/friends')).json()).sharedGameStats,[]);
});

test('library counts cover more than one friend summary batch and deduplicate across batches',async()=>{
 const{db}=await setup();const peers=Array.from({length:101},(_,i)=>(76561198000010000n+BigInt(i)).toString());await request(db,'/v1/profile','PUT',{friends:peers,games:[]},TA);
 for(const [i,peer] of peers.entries()){
  await db.prepare('INSERT INTO profiles(steamid,friends,updated) VALUES(?,?,?)').bind(peer,JSON.stringify([A]),NOW).run();
  await db.prepare('INSERT INTO lists(owner,appid,name,curated,subscriptions,share_list,share_subscriptions,list_count,subscription_count,updated) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(peer,'311210','Game','[]',JSON.stringify(['1',String(i+2)]),0,1,0,2,NOW).run();
 }
 const data=await(await request(db,'/v1/friends')).json();assert.equal(data.friends.length,101);assert.equal(data.sharedGameStats[0].friendCount,101);assert.equal(data.sharedGameStats[0].itemCount,102);
});
test('one-sided and non-friend claims cannot read another account’s lists',async()=>{
 const{db}=await setup();await request(db,'/v1/profile','PUT',{friends:[B],games:[]},TA);await request(db,'/v1/profile','PUT',{friends:[C],games:[game()]},TB);
 assert.equal((await request(db,`/v1/friends/${B}/311210`)).status,403);assert.deepEqual((await(await request(db,'/v1/friends')).json()).friends,[]);
});
test('off-by-default games and unshared subscription IDs are rejected',async()=>{const{db}=await setup();assert.equal((await request(db,'/v1/profile','PUT',{friends:[B],games:[game({shareList:false,shareSubscriptions:false})]})).status,400);assert.equal((await request(db,'/v1/profile','PUT',{friends:[B],games:[game({shareSubscriptions:false})]})).status,400);});
test('changing sharing preferences revokes the previous snapshot',async()=>{
 const{db}=await setup();await request(db,'/v1/profile','PUT',{friends:[B],games:[]},TA);await request(db,'/v1/profile','PUT',{friends:[A],games:[game()]},TB);
 await request(db,'/v1/profile','PUT',{friends:[A],games:[]},TB);assert.equal((await request(db,`/v1/friends/${B}/311210`)).status,404);
});
test('unfriending on either companion revokes list access after refresh',async()=>{
 const{db}=await setup();await request(db,'/v1/profile','PUT',{friends:[B],games:[]},TA);await request(db,'/v1/profile','PUT',{friends:[A],games:[game()]},TB);
 await request(db,'/v1/profile','PUT',{friends:[],games:[game()]},TB);assert.equal((await request(db,`/v1/friends/${B}/311210`)).status,403);
});
test('snapshots older than seven days are inaccessible',async()=>{
 const{db}=await setup();await request(db,'/v1/profile','PUT',{friends:[B],games:[]},TA);await request(db,'/v1/profile','PUT',{friends:[A],games:[game()]},TB);
 await db.prepare('UPDATE profiles SET updated=? WHERE steamid=?').bind(NOW-8*86400000,B).run();assert.equal((await request(db,`/v1/friends/${B}/311210`)).status,403);
});
test('disconnecting deletes shared lists, friend profile and sessions',async()=>{
 const{db}=await setup();await request(db,'/v1/profile','PUT',{friends:[A],games:[game()]},TB);assert.equal((await request(db,'/v1/profile','DELETE',undefined,TB)).status,200);assert.equal((await request(db,'/v1/me','GET',undefined,TB)).status,401);assert.equal(await db.prepare('SELECT owner FROM lists WHERE owner=?').bind(B).first(),null);
});
test('invalid IDs and duplicate games are rejected before writing any list',async()=>{const{db}=await setup();assert.equal((await request(db,'/v1/profile','PUT',{friends:[B],games:[game({subscriptions:['https://evil.test/file.exe']})]})).status,400);assert.equal((await request(db,'/v1/profile','PUT',{friends:[B],games:[game(),game()]})).status,400);});
test('Steam OpenID is verified server-side, account-bound, signed and protected against replay',async()=>{
 const{db}=database();const device='12345678-1234-4234-8234-123456789abc';const token='d'.repeat(64);
 assert.equal((await request(db,'/v1/device','POST',{device,tokenHash:await sha(token),steamid:A},null)).status,200);
 const start=await request(db,'/auth/steam?device='+device,'GET',null,null);assert.equal(start.status,303);
 const op=new URL(start.headers.get('Location'));const back=new URL(op.searchParams.get('openid.return_to'));
 const fields={'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'id_res','openid.op_endpoint':'https://steamcommunity.com/openid/login','openid.return_to':back.href,'openid.claimed_id':`http://steamcommunity.com/openid/id/${A}`,'openid.identity':`http://steamcommunity.com/openid/id/${A}`,'openid.response_nonce':new Date(NOW).toISOString().replace('.000','')+'unique','openid.assoc_handle':'test','openid.signed':'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle','openid.sig':'test'};
 for(const[k,v]of Object.entries(fields))back.searchParams.set(k,v);
 let verified=0;const fetcher=async(url,options)=>{assert.equal(url,'https://steamcommunity.com/openid/login');assert.equal(new URLSearchParams(options.body).get('openid.mode'),'check_authentication');verified++;return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');};
 const response=await handle(new Request(back),{DB:db,PUBLIC_ORIGIN:'https://sync.test'},{now:NOW,fetch:fetcher});assert.equal(response.status,200);assert.equal(verified,1);
 assert.equal((await(await request(db,'/v1/device/status','POST',{device},token)).json()).steamid,A);
 assert.equal((await handle(new Request(back),{DB:db,PUBLIC_ORIGIN:'https://sync.test'},{now:NOW,fetch:fetcher})).status,410);
});
test('forged callbacks cannot authenticate without contacting Steam',async()=>{const{db}=database();const r=await request(db,'/auth/return?device=12345678-1234-4234-8234-123456789abc&state='+'e'.repeat(64),'GET',null,null,{fetch:()=>{throw new Error('Should not be called');}});assert.equal(r.status,410);});

async function browserApproval({expected=null,identity=A,valid=true}={}){
 const{db}=database();const device=crypto.randomUUID(),token='f'.repeat(64);
 const created=await request(db,'/v1/device','POST',{device,tokenHash:await sha(token),steamid:expected},null);assert.equal(created.status,200);
 const start=await request(db,'/auth/steam?device='+device,'GET',null,null);const op=new URL(start.headers.get('Location')),back=new URL(op.searchParams.get('openid.return_to'));
 const fields={'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'id_res','openid.op_endpoint':'https://steamcommunity.com/openid/login','openid.return_to':back.href,'openid.claimed_id':`https://steamcommunity.com/openid/id/${identity}`,'openid.identity':`https://steamcommunity.com/openid/id/${identity}`,'openid.response_nonce':new Date(NOW).toISOString().replace('.000','')+'browser','openid.assoc_handle':'test','openid.signed':'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle','openid.sig':'test'};
 for(const[k,v]of Object.entries(fields))back.searchParams.set(k,v);
 const response=await handle(new Request(back),{DB:db,PUBLIC_ORIGIN:'https://sync.test'},{now:NOW,fetch:async()=>new Response('is_valid:'+valid+'\n')});
 return{response,db,device,token};
}
test('first-time browser confirmation derives Steam identity from a verified assertion without prior companion login',async()=>{const{response,db,device,token}=await browserApproval();assert.equal(response.status,200);const result=await(await request(db,'/v1/device/status','POST',{device},token)).json();assert.equal(result.steamid,A);assert.equal((await(await request(db,'/v1/me','GET',null,token)).json()).steamid,A);});
test('browser-first authentication still rejects forged assertions and wrong returning accounts',async()=>{const forged=await browserApproval({valid:false});assert.equal(forged.response.status,401);assert.equal((await request(forged.db,'/v1/me','GET',null,forged.token)).status,401);const wrong=await browserApproval({expected:A,identity:B});assert.equal(wrong.response.status,403);});

test('per-game friend subscriptions include only fresh mutual friends and preserve per-list privacy',async()=>{
 const{db}=await setup();await request(db,'/v1/profile','PUT',{friends:[B],games:[]},TA);await request(db,'/v1/profile','PUT',{friends:[A],games:[game({shareSubscriptions:false,subscriptions:[]})]},TB);await request(db,'/v1/profile','PUT',{friends:[A],games:[game()]},TC);
 let r=await request(db,'/v1/games/311210/friends');assert.equal(r.status,200);let data=await r.json();assert.equal(data.friends.length,1);assert.equal(data.friends[0].steamid,B);assert.deepEqual(data.friends[0].subscriptions,[]);assert.deepEqual(data.friends[0].curated,['1']);
 assert.equal((await request(db,'/v1/games/311210/friends','GET',null,null)).status,401);
 assert.equal((await(await request(db,'/v1/games/550/friends')).json()).friends.length,0);
 await db.prepare('UPDATE profiles SET updated=? WHERE steamid=?').bind(NOW-8*86400000,B).run();assert.equal((await(await request(db,'/v1/games/311210/friends')).json()).friends.length,0);
});
test('game aggregation immediately honors unsharing and unfriending',async()=>{const{db}=await setup();await request(db,'/v1/profile','PUT',{friends:[B],games:[]},TA);await request(db,'/v1/profile','PUT',{friends:[A],games:[game()]},TB);assert.equal((await(await request(db,'/v1/games/311210/friends')).json()).friends.length,1);await request(db,'/v1/profile','PUT',{friends:[],games:[game()]},TB);assert.equal((await(await request(db,'/v1/games/311210/friends')).json()).friends.length,0);await request(db,'/v1/profile','PUT',{friends:[A],games:[]},TB);assert.equal((await(await request(db,'/v1/games/311210/friends')).json()).friends.length,0);});
test('game friend snapshots paginate beyond 50 friends without losing or duplicating an owner',async()=>{
 const{db}=await setup();const ids=Array.from({length:51},(_,i)=>(76561198000001000n+BigInt(i)).toString());await request(db,'/v1/profile','PUT',{friends:ids,games:[]},TA);
 for(const peer of ids){await db.prepare('INSERT INTO profiles(steamid,friends,updated) VALUES(?,?,?)').bind(peer,JSON.stringify([A]),NOW).run();await db.prepare('INSERT INTO lists(owner,appid,name,curated,subscriptions,share_list,share_subscriptions,list_count,subscription_count,updated) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(peer,'311210','Game','[]','["1"]',0,1,0,1,NOW).run();}
 const first=await(await request(db,'/v1/games/311210/friends')).json();assert.equal(first.friends.length,50);assert.ok(first.next);const last=await(await request(db,'/v1/games/311210/friends?after='+first.next)).json();assert.equal(last.friends.length,1);assert.equal(last.next,null);assert.deepEqual([...first.friends,...last.friends].map(f=>f.steamid),ids);
});
