import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import {handle,sha} from '../worker/index.mjs';import {sqliteAdapter} from '../sqlite-adapter.mjs';
const A='76561198000000001',B='76561198000000002',C='76561198000000003',now=Date.parse('2026-11-13T17:00:00Z'),tokens=new Map([[A,'a'.repeat(64)],[B,'b'.repeat(64)],[C,'c'.repeat(64)]]),all={mode:'all',friends:[]};
async function setup(){const sqlite=new DatabaseSync(':memory:');for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));const db=sqliteAdapter(sqlite);for(const [id,token]of tokens)await db.prepare('INSERT INTO sessions(token_hash,steamid,expires) VALUES(?,?,?)').bind(await sha(token),id,now+86400000).run();return db;}
const call=(db,actor,path='/v1/friends',method='GET',body)=>handle(new Request('https://sync.test'+path,{method,headers:{Authorization:'Bearer '+tokens.get(actor)},...(body?{body:JSON.stringify(body)}:{})}),{DB:db,PUBLIC_ORIGIN:'https://sync.test'},{now});
const profile=(friends,games=[])=>({sharingVersion:2,friends,games});
const list=(id,name,items,recipients)=>({id,name,items,audience:recipients?{mode:'selected',friends:recipients}:all});
const game=(namedLists,extra={})=>({appid:'550',name:'Left 4 Dead 2',shareList:true,shareSubscriptions:false,curated:[],subscriptions:[],audience:all,namedLists,...extra});
test('named list audiences filter direct reads, legacy aggregates, game pages, names and library counts',async()=>{
 const db=await setup();await call(db,A,'/v1/profile','PUT',profile([B,C]));await call(db,C,'/v1/profile','PUT',profile([A,B]));
 const lists=[list('public','Everyone',['1']),list('party-a','Friday group',['2','3'],[A]),list('party-c','Other group',['4'],[C])];assert.equal((await call(db,B,'/v1/profile','PUT',profile([A,C],[game(lists)]))).status,200);
 const av=await(await call(db,A,`/v1/friends/${B}/550`)).json();assert.deepEqual(av.curated,['1','2','3']);assert.deepEqual(av.namedLists.map(l=>l.name),['Everyone','Friday group']);assert.ok(!JSON.stringify(av).includes('Other group'));assert.equal(av.namedLists[1].audience,undefined);
 const cv=await(await call(db,C,`/v1/friends/${B}/550`)).json();assert.deepEqual(cv.curated,['1','4']);
 const page=await(await call(db,A,'/v1/games/550/friends')).json();assert.deepEqual(page.friends[0].curated,['1','2','3']);
 const summary=await(await call(db,A)).json();assert.equal(summary.friends.find(f=>f.steamid===B).games[0].list_count,3);assert.equal(summary.sharedGameStats[0].itemCount,3);
});
test('game audiences restrict subscriptions and all list paths, including summary metadata',async()=>{
 const db=await setup();for(const actor of [A,C])await call(db,actor,'/v1/profile','PUT',profile([B]));
 await call(db,B,'/v1/profile','PUT',profile([A,C],[game([list('group','Private group',['5'])],{shareSubscriptions:true,subscriptions:['6'],audience:{mode:'selected',friends:[A]}})]));
 assert.equal((await call(db,C,`/v1/friends/${B}/550`)).status,404);assert.equal((await(await call(db,C,'/v1/games/550/friends')).json()).friends.length,0);const denied=await(await call(db,C)).json();assert.deepEqual(denied.sharedGameStats,[]);assert.deepEqual(denied.friends[0].games,[]);
 assert.deepEqual((await(await call(db,A,`/v1/friends/${B}/550`)).json()).subscriptions,['6']);
});
test('revoking a named-list recipient immediately removes its items and metadata without changing other lists',async()=>{
 const db=await setup();await call(db,A,'/v1/profile','PUT',profile([B]));
 const original=[list('base','Base',['1']),list('group','Group',['2'],[A])];await call(db,B,'/v1/profile','PUT',profile([A],[game(original)]));
 await call(db,B,'/v1/profile','PUT',profile([A],[game([original[0],list('group','Group',['2'],[])])]));
 const direct=await(await call(db,A,`/v1/friends/${B}/550`)).json();assert.deepEqual(direct.curated,['1']);assert.deepEqual(direct.namedLists.map(l=>l.id),['base']);assert.equal((await(await call(db,A)).json()).sharedGameStats[0].itemCount,1);
});
test('legacy uploads cannot overwrite an upgraded account’s audiences or lists',async()=>{
 const db=await setup();await call(db,B,'/v1/profile','PUT',profile([A],[game([list('private-group','Group',['2'],[A])])]));
 assert.equal((await call(db,B,'/v1/profile','PUT',{friends:[A],games:[]})).status,426);const row=await db.prepare('SELECT named_lists FROM lists WHERE owner=?').bind(B).first();assert.ok(row.named_lists.includes('private-group'));
});
test('private lists, invalid recipients, duplicate list IDs and excessive names fail before any data is stored',async()=>{
 const db=await setup();for(const lists of [[{...list('x','X',['1']),audience:{mode:'private',friends:[]}}],[list('x','X',['1'],[C])],[list('x','X',['1']),list('x','Y',['2'])],[list('x','x'.repeat(81),['1'])]])assert.equal((await call(db,B,'/v1/profile','PUT',profile([A],[game(lists)]))).status,400);
 assert.equal(await db.prepare('SELECT * FROM profiles WHERE steamid=?').bind(B).first(),null);
});

test('older companions cannot reintroduce items after an account enables private subscription choices',async()=>{
 const db=await setup();await call(db,A,'/v1/profile','PUT',profile([B]));
 const body={...profile([A],[game([list('base','Shared',['2'])],{shareSubscriptions:true,subscriptions:['2']})]),sharingVersion:3};
 assert.equal((await call(db,B,'/v1/profile','PUT',body)).status,200);
 const old=profile([A],[game([list('base','Shared',['1','2'])],{shareSubscriptions:true,subscriptions:['1','2']})]);
 assert.equal((await call(db,B,'/v1/profile','PUT',old)).status,426);
 const view=await(await call(db,A,`/v1/friends/${B}/550`)).json();assert.deepEqual(view.subscriptions,['2']);assert.deepEqual(view.curated,['2']);
 assert.equal((await call(db,B,'/v1/profile','PUT',{...body,sharingVersion:99})).status,400);
});
