const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises'),path=require('node:path');
const {LoginSession,EAuthTokenPlatformType}=require('steam-session');
const qrcode=require('qrcode-generator');
const validAccount=value=>typeof value==='string'&&/^765\d{14}$/.test(value);
const cancelled=()=>Object.assign(new Error('Steam setup was cancelled.'),{cancelled:true});
const accountError=()=>Object.assign(new Error('Approve the same Steam account connected to WorkshopSync.'),{permanent:true,accountMismatch:true});
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Steam request timed out.')),30000);})]);}finally{clearTimeout(timer);}}
function cookiePlan(values,expected){
 if(!Array.isArray(values)||values.length>100)throw accountError();
 const allowed=new Set(['steamcommunity.com','steampowered.com','store.steampowered.com','help.steampowered.com','login.steampowered.com']),plan=[];
 let communityLogin=false;
 for(const value of values){
  if(typeof value!=='string'||value.length>20000)throw accountError();
  const [pair,...attributes]=value.split(';'),index=pair.indexOf('=');if(index<1)throw accountError();
  const name=pair.slice(0,index).trim(),content=pair.slice(index+1),attrs=new Map(attributes.map(part=>{const at=part.indexOf('=');return at<0?[part.trim().toLowerCase(),true]:[part.slice(0,at).trim().toLowerCase(),part.slice(at+1).trim()];}));
  const domain=String(attrs.get('domain')||'steamcommunity.com').toLowerCase().replace(/^\./,'');
  if(!allowed.has(domain))throw accountError();
  if(name==='steamLoginSecure'){
   let decoded;try{decoded=decodeURIComponent(content);}catch{throw accountError();}
   if(decoded.split('||')[0]!==expected)throw accountError();if(domain==='steamcommunity.com')communityLogin=true;
  }
  const cookie={url:'https://'+domain,name,value:content,path:String(attrs.get('path')||'/'),secure:true,httpOnly:attrs.has('httponly')||name==='steamLoginSecure'||name==='steamRefresh_steam'};
  if(attrs.has('domain'))cookie.domain=String(attrs.get('domain'));
  const expiry=Date.parse(attrs.get('expires'));if(Number.isFinite(expiry))cookie.expirationDate=expiry/1000;
  const sameSite={none:'no_restriction',lax:'lax',strict:'strict'}[String(attrs.get('samesite')).toLowerCase()];if(sameSite)cookie.sameSite=sameSite;
  plan.push(cookie);
 }
 if(!communityLogin)throw accountError();return plan;
}
class SteamRenewal extends EventEmitter{
 #refreshToken=null;
 constructor({file,storage,cookies,verify,userAgent,createSession=()=>new LoginSession(EAuthTokenPlatformType.WebBrowser,userAgent?{userAgent}:{}),makeQR=url=>{const qr=qrcode(0,'M');qr.addData(url);qr.make();return qr.createDataURL(5,12);},now=Date.now}){
  super();Object.assign(this,{file,storage,cookies,verify,createSession,makeQR,now});this.enabled=false;this.owner=null;this.status='off';this.error='';this.generation=0;this.serial=Promise.resolve();this.loadedFor=null;this.lastRenewedAt=null;this.nextRenewalAt=0;this.retryAt=0;this.pending=null;this.inflight=null;this.qrImage=null;
 }
 snapshot(expected){if(this.owner!==expected)return{enabled:false,configured:false,status:'off'};return{enabled:this.enabled,configured:!!this.#refreshToken,status:this.status,error:this.error,lastRenewedAt:this.lastRenewedAt,qrImage:this.qrImage,qrExpiresAt:this.pending?.expires||null};}
 changed(){this.emit('state');}
 current(generation){if(generation!==this.generation||!this.enabled)throw cancelled();}
 async protectedStorage(){if(!await this.storage.isAsyncEncryptionAvailable())throw new Error('Windows protected storage is unavailable. Keep me signed in cannot be enabled.');}
 async load(expected){
  if(!validAccount(expected)||this.loadedFor===expected)return;this.loadedFor=expected;
  try{
   const record=JSON.parse(await fs.readFile(this.file,'utf8'));if(record.schema!==1||record.steamid!==expected||record.enabled!==true){await this.disable();this.loadedFor=expected;return;}
   this.owner=expected;this.enabled=true;this.status='needs-approval';this.lastRenewedAt=record.lastRenewedAt||null;this.nextRenewalAt=this.lastRenewedAt?this.lastRenewedAt+6*60*60000:0;
   if(record.secret){await this.protectedStorage();const result=await this.storage.decryptStringAsync(Buffer.from(record.secret,'base64'));if(typeof result.result!=='string'||!result.result||result.result.length>20000)throw new Error('Invalid saved credential.');this.#refreshToken=result.result;this.status='ready';}
  }catch(error){if(error.code!=='ENOENT'){this.error='Windows could not unlock the saved Steam sign-in. Approve Steam again on this PC.';if(this.enabled)this.status='needs-approval';}}
  this.changed();
 }
 persist(generation){
  const write=async()=>{this.current(generation);let secret=null;if(this.#refreshToken){await this.protectedStorage();secret=(await this.storage.encryptStringAsync(this.#refreshToken)).toString('base64');}this.current(generation);await fs.mkdir(path.dirname(this.file),{recursive:true});const temporary=this.file+'.tmp';await fs.writeFile(temporary,JSON.stringify({schema:1,enabled:true,steamid:this.owner,secret,lastRenewedAt:this.lastRenewedAt}),{mode:0o600});try{this.current(generation);await fs.rename(temporary,this.file);}catch(error){await fs.rm(temporary,{force:true});throw error;}};
  this.serial=this.serial.catch(()=>{}).then(write);return this.serial;
 }
 cancel(){this.generation++;try{this.pending?.session.cancelLoginAttempt();}catch{}this.pending=null;this.qrImage=null;if(this.enabled)this.status=this.#refreshToken?'ready':'needs-approval';this.changed();}
 async disable(){
  this.cancel();this.enabled=false;this.owner=null;this.#refreshToken=null;this.status='off';this.error='';this.lastRenewedAt=null;this.nextRenewalAt=0;this.retryAt=0;this.changed();
  this.serial=this.serial.catch(()=>{}).then(async()=>{await fs.rm(this.file,{force:true});await fs.rm(this.file+'.tmp',{force:true});});await this.serial;
 }
 async start(expected){
  if(!validAccount(expected))throw new Error('Connect your Steam account before enabling Keep me signed in.');await this.protectedStorage();this.cancel();const generation=this.generation;
  this.owner=expected;this.loadedFor=expected;this.enabled=true;this.#refreshToken=null;this.error='';this.status='waiting';this.retryAt=0;await this.persist(generation);this.current(generation);
  const session=this.createSession();session.loginTimeout=120000;const pending={session,generation,expires:this.now()+120000};this.pending=pending;this.changed();
  const failed=error=>this.failed(error,generation).catch(()=>{});
  session.on('error',()=>failed(new Error('Steam approval failed.')));session.on('timeout',()=>failed(new Error('Steam approval timed out.')));
  session.on('authenticated',()=>{const task=this.accept(session,expected,generation).catch(error=>this.failed(error,generation));this.inflight=task;task.finally(()=>{if(this.inflight===task)this.inflight=null;}).catch(()=>{});});
  try{const result=await bounded(session.startWithQR());this.current(generation);if(this.pending!==pending)return this.snapshot(expected);const url=new URL(result.qrChallengeUrl);if(url.protocol!=='https:'||!['s.team','steamcommunity.com','login.steampowered.com'].includes(url.hostname))throw accountError();this.qrImage=this.makeQR(url.href);this.changed();return this.snapshot(expected);}
  catch(error){await this.failed(error,generation);if(error.cancelled)return this.snapshot(expected);throw new Error('Steam could not start approval. Check your connection and try again.');}
 }
 async accept(session,expected,generation){
  this.current(generation);if(session.steamID?.getSteamID64()!==expected)throw accountError();if(typeof session.refreshToken!=='string'||!session.refreshToken||session.refreshToken.length>20000)throw accountError();
  this.#refreshToken=session.refreshToken;this.pending=null;this.qrImage=null;this.status='renewing';this.changed();await this.persist(generation);return this.exchange(session,expected,generation);
 }
 async exchange(session,expected,generation){
  const values=await bounded(session.getWebCookies());this.current(generation);if(session.steamID?.getSteamID64()!==expected)throw accountError();const plan=cookiePlan(values,expected);
  for(const cookie of plan){this.current(generation);await this.cookies.set(cookie);}
  this.current(generation);await this.cookies.flushStore();await this.verify(expected);this.current(generation);
  this.lastRenewedAt=this.now();this.nextRenewalAt=this.now()+6*60*60000;this.retryAt=0;await this.persist(generation);this.current(generation);this.status='ready';this.error='';this.changed();this.emit('connected');return true;
 }
 async failed(error,generation){
  if(generation!==this.generation||!this.enabled||error.cancelled)return false;
  try{this.pending?.session.cancelLoginAttempt();}catch{}this.pending=null;this.qrImage=null;
  const permanent=error.permanent||[5,15,26,27,63,74,85,121].includes(error.eresult);
  if(permanent||!this.#refreshToken){this.#refreshToken=null;this.status='needs-approval';this.error=error.accountMismatch?'Approve the same Steam account connected to WorkshopSync.':'Steam needs your approval again. Scan a new QR code to reconnect.';await this.persist(generation).catch(()=>{});}
  else{this.status='retrying';this.error='Steam could not renew the sign-in yet. WorkshopSync will retry automatically.';this.retryAt=this.now()+5*60000;this.nextRenewalAt=this.retryAt;}
  this.changed();return false;
 }
 async renew(expected,{force=false}={}){
  await this.load(expected);if(!this.enabled||this.owner!==expected||!this.#refreshToken||this.pending)return false;
  if(this.inflight)return this.inflight;if(this.now()<this.retryAt||!force&&this.now()<this.nextRenewalAt)return false;
  const generation=this.generation;this.status='renewing';this.changed();
  const task=(async()=>{try{const session=this.createSession();try{session.refreshToken=this.#refreshToken;}catch{throw Object.assign(new Error('Saved Steam sign-in is no longer valid.'),{permanent:true});}if(session.steamID?.getSteamID64()!==expected)throw accountError();return await this.exchange(session,expected,generation);}catch(error){return this.failed(error,generation);}})();
  this.inflight=task;try{return await task;}finally{if(this.inflight===task)this.inflight=null;}
 }
}
module.exports={SteamRenewal,cookiePlan};
