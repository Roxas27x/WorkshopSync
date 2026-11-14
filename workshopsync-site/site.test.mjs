import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './dist/_worker.js';
const origin='https://workshop-sync-production.up.railway.app';
test('site serves assets with security headers and verifies release metadata before streaming branded downloads',async()=>{
 const realFetch=globalThis.fetch;
 const envelope=await(await realFetch(origin+'/v1/releases/latest')).json();
 let requested=[];
 try{
  globalThis.fetch=async(url,options)=>{
   assert.equal(options.redirect,'manual','Cloudflare edge fetch must reject redirects without unsupported redirect:error');requested.push({url,options});if(url.endsWith('/v1/releases/latest'))return Response.json(envelope);
   assert.equal(url,origin+'/updates/'+envelope.manifest.version+'/'+envelope.manifest.file);
   return new Response(new Uint8Array([77,90]),{status:options.headers.Range?206:200,headers:{'Content-Length':'2','Content-Range':`bytes 0-1/${envelope.manifest.size}`}});
  };
  let response=await worker.fetch(new Request('https://workshopsync.pages.dev/'),{ASSETS:{fetch:async()=>new Response('<h1>WorkshopSync</h1>')}});assert.equal(response.status,200);assert.ok(response.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));
  response=await worker.fetch(new Request('https://workshopsync.pages.dev/api/release'),{});assert.equal(response.status,200);assert.deepEqual(await response.json(),envelope);
  response=await worker.fetch(new Request('https://workshopsync.pages.dev/download',{method:'HEAD'}),{});assert.equal(response.status,200);assert.equal(Number(response.headers.get('Content-Length')),envelope.manifest.size);assert.ok(response.headers.get('Content-Disposition').includes('WorkshopSync-Setup-'));
  response=await worker.fetch(new Request('https://workshopsync.pages.dev/download',{headers:{Range:'bytes=0-1'}}),{});assert.equal(response.status,206);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[77,90]);assert.equal(requested.at(-1).options.headers.Range,'bytes=0-1');
  response=await worker.fetch(new Request('https://workshopsync.pages.dev/download',{method:'POST'}),{});assert.equal(response.status,405);
  globalThis.fetch=async()=>Response.json({...envelope,manifest:{...envelope.manifest,notes:'Tampered release'}});
  response=await worker.fetch(new Request('https://workshopsync.pages.dev/download'),{});assert.equal(response.status,503);
 }finally{globalThis.fetch=realFetch;}
});
