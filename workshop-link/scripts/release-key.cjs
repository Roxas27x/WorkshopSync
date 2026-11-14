const crypto=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
async function protectedStorage(storage){if(!await storage.isAsyncEncryptionAvailable())throw new Error('Windows protected storage is unavailable. Release signing is disabled.');}
async function initializeReleaseKey(storage,userData){
 await protectedStorage(storage);const file=path.join(userData,'release-signing-key.json');
 try{const record=JSON.parse(await fs.readFile(file,'utf8'));if(!record.publicKey||!record.secret)throw new Error('Invalid release signing key.');return record.publicKey;}catch(e){if(e.code!=='ENOENT')throw e;}
 const pair=crypto.generateKeyPairSync('ed25519');const publicKey=pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
 const plain=pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64');const protectedKey=await storage.encryptStringAsync(plain);
 await fs.mkdir(userData,{recursive:true});await fs.writeFile(file,JSON.stringify({schema:1,publicKey,secret:protectedKey.toString('base64')}),{flag:'wx'});return publicKey;
}
async function loadReleaseKey(storage,userData,expectedPublicKey){
 await protectedStorage(storage);const record=JSON.parse(await fs.readFile(path.join(userData,'release-signing-key.json'),'utf8'));
 if(record.publicKey!==expectedPublicKey)throw new Error('This computer does not have the signing key trusted by the companion.');
 const decrypted=await storage.decryptStringAsync(Buffer.from(record.secret,'base64'));
 return crypto.createPrivateKey({key:Buffer.from(decrypted.result,'base64'),format:'der',type:'pkcs8'});
}
module.exports={initializeReleaseKey,loadReleaseKey};
