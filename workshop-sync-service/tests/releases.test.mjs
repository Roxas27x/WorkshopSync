import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {releaseRoute} from '../worker/releases.mjs';
import {releaseText} from '../worker/release-format.mjs';
const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
const bytes=Buffer.from('verified installer');
const manifest={schema:1,version:'0.3.0',platform:'win32',arch:'x64',file:'Workshop-Link-Setup-0.3.0.exe',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sha512:createHash('sha512').update(bytes).digest('base64'),publishedAt:'2026-11-13T03:00:00Z',notes:'Release'};
const signed=()=>({manifest:{...manifest},signature:sign(null,Buffer.from(releaseText(manifest)),pair.privateKey).toString('base64')});
function setup(){
 let current=null;const files=new Map();const store={busy:false,latest:async()=>current,get:async version=>files.get(version),publish:async(envelope,body)=>{const got=Buffer.from(await new Response(body).arrayBuffer());assert.equal(createHash('sha256').update(got).digest('hex'),envelope.manifest.sha256);current=envelope;files.set(envelope.manifest.version,envelope);},download:async()=>new Response(bytes)};
 const env={RELEASE_STORE:store,UPDATE_PUBLIC_KEY:publicKey,RELEASE_PUBLISHER_STEAM_ID:'owner'};
 const request=(p,{actor='owner',method='GET',envelope,body}={})=>releaseRoute(new Request('https://sync.test'+p,{method,headers:envelope?{'X-Workshop-Release':Buffer.from(JSON.stringify(envelope)).toString('base64'),'Content-Length':String(body?.length||0)}:{},...(body?{body}:{})}),env,{authenticate:async()=>{if(!actor)throw Object.assign(new Error('Authentication required.'),{status:401});return{steamid:actor};}});
 return{request,store};
}
test('release role and publishing require the authenticated owner',async()=>{
 const{request}=setup();assert.equal((await request('/v1/releases/publisher',{actor:null})).status,401);assert.deepEqual(await(await request('/v1/releases/publisher',{actor:'friend'})).json(),{allowed:false});assert.deepEqual(await(await request('/v1/releases/publisher')).json(),{allowed:true});
 for(const[actor,status]of [[null,401],['friend',403]])assert.equal((await request('/v1/releases/publish',{actor,method:'POST',envelope:signed(),body:bytes})).status,status);
});
test('signed releases provide public catalogs, versioned installers and a stable download link',async()=>{
 const{request}=setup();assert.equal((await request('/v1/releases/latest')).status,204);
 assert.equal((await request('/v1/releases/publish',{method:'POST',envelope:signed(),body:bytes})).status,200);
 assert.deepEqual((await(await request('/v1/releases/latest',{actor:null})).json()).manifest,manifest);
 const yaml=await(await request('/updates/0.3.0/latest.yml')).text();assert.ok(yaml.includes(manifest.sha512));assert.ok(yaml.includes(manifest.file));
 assert.equal((await request('/download')).headers.get('Location'),'/updates/0.3.0/'+manifest.file);
 assert.deepEqual(Buffer.from(await(await request('/updates/0.3.0/'+manifest.file)).arrayBuffer()),bytes);
 assert.equal((await request('/updates/0.3.0/Workshop-Link-Setup-9.9.9.exe')).status,404);
});
test('tampered, duplicate, concurrent and wrong-size publication fails without replacing current',async()=>{
 const{request,store}=setup();const bad=signed();bad.manifest.notes='Tampered';assert.equal((await request('/v1/releases/publish',{method:'POST',envelope:bad,body:bytes})).status,403);
 assert.equal((await request('/v1/releases/publish',{method:'POST',envelope:signed(),body:Buffer.from('short')})).status,400);
 store.busy=true;assert.equal((await request('/v1/releases/publish',{method:'POST',envelope:signed(),body:bytes})).status,409);store.busy=false;
 assert.equal((await request('/v1/releases/publish',{method:'POST',envelope:signed(),body:bytes})).status,200);
 assert.equal((await request('/v1/releases/publish',{method:'POST',envelope:signed(),body:bytes})).status,409);
 assert.equal((await(await request('/v1/releases/latest')).json()).manifest.version,'0.3.0');
});
