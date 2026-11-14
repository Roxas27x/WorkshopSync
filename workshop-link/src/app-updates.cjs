const {EventEmitter}=require('node:events');
const {verifyRelease,verifyInstaller}=require('./release-crypto.cjs');
const {compareReleaseVersions}=require('./release-format.cjs');
class AppUpdates extends EventEmitter{
 constructor({currentVersion,config,nativeUpdater,installed=true,fetcher=fetch}){
  super();this.currentVersion=currentVersion;this.config=config;this.native=nativeUpdater;this.fetcher=fetcher;this.installed=installed;this.release=null;this.downloaded=null;this.checking=false;
  this.state={status:'idle',currentVersion,availableVersion:null,notes:'',progress:0,error:'',installed,lastChecked:null};
  if(this.native){
   this.native.autoDownload=false;this.native.autoInstallOnAppQuit=false;this.native.allowDowngrade=false;this.native.disableDifferentialDownload=true;this.native.disableWebInstaller=true;
   this.native.on('error',error=>this.change({status:'error',error:error.message}));
   this.native.on('download-progress',info=>this.change({status:'downloading',progress:Math.max(0,Math.min(100,info.percent||0))}));
  }
 }
 snapshot(){return{...this.state};}
 change(value){Object.assign(this.state,value);this.emit('state',this.snapshot());}
 async check(){
  if(this.checking||['downloading','ready','installing'].includes(this.state.status))return this.snapshot();this.checking=true;this.change({status:'checking',error:''});
  try{
   const response=await this.fetcher(this.config.serviceUrl+'/v1/releases/latest',{redirect:'error',signal:AbortSignal.timeout(20000),cache:'no-store'});
   if(response.status===204){this.release=null;this.change({status:'current',availableVersion:null,lastChecked:Date.now()});return this.snapshot();}
   if(!response.ok)throw new Error(`Update service returned HTTP ${response.status}.`);
   const release=verifyRelease(await response.json(),this.config.publicKey);
   if(compareReleaseVersions(release.version,this.currentVersion)<=0){this.release=null;this.change({status:'current',availableVersion:null,lastChecked:Date.now()});return this.snapshot();}
   this.release=release;this.change({status:'available',availableVersion:release.version,notes:release.notes,progress:0,lastChecked:Date.now()});return this.snapshot();
  }catch(error){this.release=null;this.change({status:'error',error:error.message});throw error;}finally{this.checking=false;}
 }
 async download(){
  if(!this.installed||!this.native)throw new Error('Install the Windows Setup version once to enable in-app updates.');
  if(this.state.status!=='available'||!this.release)throw new Error('Check for an available update first.');
  const release=this.release;this.downloaded=null;this.change({status:'downloading',progress:0,error:''});
  try{
   this.native.setFeedURL({provider:'generic',url:`${this.config.serviceUrl}/updates/${release.version}/`,useMultipleRangeRequest:false});
   const checked=await this.native.checkForUpdates();if(checked?.updateInfo?.version!==release.version)throw new Error('The update feed does not match the signed release.');
   const paths=await this.native.downloadUpdate();if(!Array.isArray(paths)||!paths[0])throw new Error('The installer download did not complete.');
   await verifyInstaller(paths[0],release);this.downloaded=paths[0];this.change({status:'ready',progress:100});return this.snapshot();
  }catch(error){this.downloaded=null;this.change({status:'error',error:error.message});throw error;}
 }
 async install(beforeQuit=async()=>{}){
  if(this.state.status!=='ready'||!this.downloaded||!this.release)throw new Error('Download and verify the update first.');
  try{await verifyInstaller(this.downloaded,this.release);await beforeQuit();this.change({status:'installing'});this.native.quitAndInstall(true,true);}
  catch(error){this.downloaded=null;this.change({status:'error',error:error.message});throw error;}
 }
}
module.exports={AppUpdates};
