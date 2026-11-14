const ORIGIN="https://workshop-sync-production.up.railway.app";
const PUBLIC_KEY="MCowBQYDK2VwAyEAW2L19NFuTwChp1ocMCzkmDIe7uLMaMEcGqakpMGPPpU=";
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


const decode64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function verifiedRelease(envelope){const manifest=validateRelease(envelope?.manifest);if(!/^[A-Za-z0-9+/]{86}==$/.test(envelope?.signature||''))throw new Error('Missing release signature.');const key=await crypto.subtle.importKey('spki',decode64(PUBLIC_KEY),{name:'Ed25519'},false,['verify']);if(!await crypto.subtle.verify('Ed25519',key,decode64(envelope.signature),new TextEncoder().encode(releaseText(manifest))))throw new Error('Release signature could not be verified.');return manifest;}

const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'none'"};
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed.',{status:405,headers:{Allow:'GET, HEAD',...security}});
 try{
  if(url.pathname==='/api/release'||url.pathname==='/download'){
   const response=await fetch(ORIGIN+'/v1/releases/latest',{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});if(!response.ok)throw new Error('The release service is temporarily unavailable.');const envelope=await response.json(),release=await verifiedRelease(envelope);
   if(url.pathname==='/api/release')return new Response(request.method==='HEAD'?null:JSON.stringify(envelope),{headers:{'Content-Type':'application/json','Cache-Control':'no-store',...security}});
   const headers={'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="WorkshopSync-Setup-${release.version}.exe"`,'Content-Length':String(release.size),'Cache-Control':'no-store','Accept-Ranges':'bytes',...security};
   if(request.method==='HEAD')return new Response(null,{headers});
   const range=request.headers.get('Range');if(range&&!/^bytes=\d+-\d*$/.test(range))return new Response(null,{status:416,headers:security});
   const file=await fetch(ORIGIN+'/updates/'+release.version+'/'+release.file,{redirect:'manual',signal:AbortSignal.timeout(120000),headers:range?{Range:range}:{}});if(!file.ok)throw new Error('The installer is temporarily unavailable.');
   if(range){headers['Content-Length']=file.headers.get('Content-Length');headers['Content-Range']=file.headers.get('Content-Range');}
   return new Response(file.body,{status:file.status,headers});
  }
  const asset=await env.ASSETS.fetch(request);return new Response(asset.body,{status:asset.status,headers:new Headers([...asset.headers.entries(),...Object.entries(security)])});
 }catch(error){console.error('WorkshopSync release request:',error.message);return new Response('WorkshopSync could not complete this download. Please try again shortly.',{status:503,headers:{'Content-Type':'text/plain','Cache-Control':'no-store',...security}});}
}};
