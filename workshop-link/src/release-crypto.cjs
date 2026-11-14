const crypto=require('node:crypto');
const fs=require('node:fs');
const {validateRelease,releaseText}=require('./release-format.cjs');
function verifyRelease(envelope,publicKey){
 if(!envelope||typeof envelope.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature))throw new Error('The release is not signed.');
 const manifest=validateRelease(envelope.manifest);const key=crypto.createPublicKey({key:Buffer.from(publicKey,'base64'),format:'der',type:'spki'});
 if(!crypto.verify(null,Buffer.from(releaseText(manifest)),key,Buffer.from(envelope.signature,'base64')))throw new Error('The update signature could not be verified.');
 return manifest;
}
async function hashInstaller(file){
 const sha256=crypto.createHash('sha256'),sha512=crypto.createHash('sha512');let size=0;
 for await(const part of fs.createReadStream(file)){size+=part.length;sha256.update(part);sha512.update(part);}
 return{size,sha256:sha256.digest('hex'),sha512:sha512.digest('base64')};
}
async function verifyInstaller(file,manifest){const got=await hashInstaller(file);if(got.size!==manifest.size||got.sha256!==manifest.sha256||got.sha512!==manifest.sha512)throw new Error('The downloaded installer does not match the signed release.');return true;}
module.exports={verifyRelease,hashInstaller,verifyInstaller};
