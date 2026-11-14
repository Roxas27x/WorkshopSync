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

export {validateRelease,releaseText,compareReleaseVersions};
