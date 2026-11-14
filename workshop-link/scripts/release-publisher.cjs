const fs=require('node:fs/promises'),fileStreams=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream');
const {validateRelease,releaseText}=require('../src/release-format.cjs');
const {verifyInstaller}=require('../src/release-crypto.cjs');
const {loadReleaseKey}=require('./release-key.cjs');
class ReleasePublisher{
 constructor({config,relay,safeStorage,userData,fetcher=fetch,onProgress=()=>{}}){Object.assign(this,{config,relay,safeStorage,userData,fetcher,onProgress});this.pending=null;this.allowed=false;}
 async authorize(){
  this.allowed=false;if(!this.relay.token||this.relay.url!==this.config.serviceUrl)return false;
  const result=await this.relay.request('/v1/releases/publisher');this.allowed=result.allowed===true;return this.allowed;
 }
 async prepare(inputFile){
  if(!await this.authorize())throw new Error('This Steam account cannot publish companion updates.');
  const text=await fs.readFile(inputFile,'utf8');if(text.length>20000)throw new Error('Release manifest is too large.');const manifest=validateRelease(JSON.parse(text));
  const file=path.join(path.dirname(inputFile),manifest.file);await verifyInstaller(file,manifest);this.pending={manifest,file};
  return{version:manifest.version,size:manifest.size,notes:manifest.notes,file:manifest.file};
 }
 async publish(notes){
  if(!this.pending)throw new Error('Choose a prepared release first.');if(!await this.authorize())throw new Error('This account cannot publish updates.');
  const manifest=validateRelease({...this.pending.manifest,notes:notes??this.pending.manifest.notes,publishedAt:new Date().toISOString()});
  await verifyInstaller(this.pending.file,manifest);const key=await loadReleaseKey(this.safeStorage,this.userData,this.config.publicKey);
  const envelope={manifest,signature:crypto.sign(null,Buffer.from(releaseText(manifest)),key).toString('base64')};
  const progress=this.onProgress;let uploaded=0;const source=fileStreams.createReadStream(this.pending.file);const counter=new Transform({transform(chunk,_encoding,callback){uploaded+=chunk.length;progress(uploaded,manifest.size);callback(null,chunk);}});
  const response=await this.fetcher(this.config.serviceUrl+'/v1/releases/publish',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+this.relay.token,'Content-Type':'application/octet-stream','Content-Length':String(manifest.size),'X-Workshop-Release':Buffer.from(JSON.stringify(envelope)).toString('base64')},body:Readable.toWeb(source.pipe(counter)),duplex:'half',signal:AbortSignal.timeout(10*60000)});
  let data;try{data=await response.json();}catch{throw new Error('The update service did not return a valid publication result.');}
  if(!response.ok)throw new Error(data.error||`Publishing returned HTTP ${response.status}.`);this.pending=null;return data;
 }
}
module.exports={ReleasePublisher};
