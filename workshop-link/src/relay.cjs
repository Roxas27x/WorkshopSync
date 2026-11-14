const crypto=require('node:crypto');
const fs=require('node:fs/promises');
function origin(raw){
 let u;try{u=new URL(raw);}catch{throw new Error('Enter the companion sync service URL in Settings.');}
 if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))throw new Error('Use an HTTPS sync server origin, with no path or credentials.');
 return u.origin;
}
class Relay{
 constructor(url,{file,safeStorage,fetcher=fetch}){this.url=url;this.file=file;this.safeStorage=safeStorage;this.fetcher=fetcher;this.token=null;this.steamid=null;this.pending=null;this.verified=false;}
 async load(){
  try{const record=JSON.parse(await fs.readFile(this.file,'utf8'));if(record.url!==this.url||!this.safeStorage.isEncryptionAvailable())return;const token=this.safeStorage.decryptString(Buffer.from(record.secret,'base64'));if(!/^[a-f0-9]{64}$/.test(token))return;this.token=token;this.steamid=record.steamid;}catch{}
 }
 async forget(){this.token=null;this.steamid=null;this.pending=null;this.verified=false;try{await fs.unlink(this.file);}catch(e){if(e.code!=='ENOENT')throw e;}}
 async verifyIdentity(){if(!this.token)return null;this.verified=false;const result=await this.request('/v1/me');if(!/^765\d{14}$/.test(result.steamid||''))throw new Error('The sync service did not return a valid Steam identity.');this.steamid=result.steamid;this.verified=true;return this.steamid;}
 async request(path,{method='GET',body,token=this.token}={}){
  if(!this.url)throw new Error('Friend sharing is not connected to a sync server yet. Set its URL in Settings.');
  const base=origin(this.url);let response;
  try{response=await this.fetcher(base+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw new Error('Could not reach the companion sync service. Check its URL and internet connection.');}
  let data;try{data=await response.json();}catch{throw new Error('This URL did not return a companion sync service response.');}
  if(!response.ok){if(response.status===401&&token===this.token)this.verified=false;const error=new Error(data.error||`Sync service returned HTTP ${response.status}.`);error.status=response.status;throw error;}
  return data;
 }
 async begin(steamid=null){
  const health=await this.request('/v1/health',{token:null});if(health.service!=='workshop-link-sync'||!health.ready)throw new Error('The companion sync service is not ready.');
  const token=crypto.randomBytes(32).toString('hex');const device=crypto.randomUUID();
  const result=await this.request('/v1/device',{method:'POST',token:null,body:{device,steamid,tokenHash:crypto.createHash('sha256').update(token).digest('hex')}});
  if(new URL(result.loginUrl).origin!==origin(this.url)||new URL(result.loginUrl).pathname!=='/auth/steam')throw new Error('The sync service returned an invalid sign-in destination.');
  this.pending={token,device,steamid,expires:result.expires,loginUrl:result.loginUrl};return result.loginUrl;
 }
 async poll(){
  const p=this.pending;if(!p)return null;if(Date.now()>p.expires){this.pending=null;throw new Error('Companion sign-in expired. Connect again.');}
  const result=await this.request('/v1/device/status',{method:'POST',token:p.token,body:{device:p.device}});
  if(this.pending!==p)return null;
  if(result.status!=='connected')return null;
  if(!/^765\d{14}$/.test(result.steamid||'')||(p.steamid&&result.steamid!==p.steamid))throw new Error('The service connected a different Steam account.');
  this.token=p.token;this.steamid=result.steamid;this.pending=null;this.verified=true;
  if(this.safeStorage.isEncryptionAvailable())await fs.writeFile(this.file,JSON.stringify({url:this.url,steamid:this.steamid,secret:this.safeStorage.encryptString(this.token).toString('base64')}));
  return this.steamid;
 }
}
module.exports={Relay,origin};
