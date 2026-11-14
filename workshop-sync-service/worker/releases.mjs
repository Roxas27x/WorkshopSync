import {validateRelease,releaseText,compareReleaseVersions} from './release-format.mjs';
class ReleaseError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const releaseJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function decodeRelease64(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
async function validReleaseSignature(envelope,publicKey){
 if(!envelope||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature||''))return false;
 const key=await crypto.subtle.importKey('spki',decodeRelease64(publicKey),{name:'Ed25519'},false,['verify']);
 return crypto.subtle.verify('Ed25519',key,decodeRelease64(envelope.signature),new TextEncoder().encode(releaseText(envelope.manifest)));
}
function releaseYaml(manifest){const m=validateRelease(manifest);return`version: ${m.version}\nfiles:\n  - url: ${m.file}\n    sha512: ${m.sha512}\n    size: ${m.size}\npath: ${m.file}\nsha512: ${m.sha512}\nreleaseDate: '${m.publishedAt}'\n`;}
export async function releaseRoute(request,env,{authenticate}){
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
export {validReleaseSignature,releaseYaml};
