// Verify the complete public installer stream, not just its headers or first bytes.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {verifyRelease}=require('../src/release-crypto.cjs'),config=require('../src/update-config.json');
(async()=>{
 const response=await fetch('https://workshopsync.pages.dev/api/release',{redirect:'error'});assert.equal(response.status,200);
 const manifest=verifyRelease(await response.json(),config.publicKey);assert.equal(manifest.version,require('../package.json').version);
 const installer=await fetch('https://workshopsync.pages.dev/download',{redirect:'error',signal:AbortSignal.timeout(180000)});assert.equal(installer.status,200);assert.ok(installer.headers.get('Content-Disposition').includes(`WorkshopSync-Setup-${manifest.version}.exe`));
 const temporary=path.resolve(__dirname,'../../v050-website-download.part'),output=path.resolve(__dirname,`../../releases/WorkshopSync-Setup-${manifest.version}.exe`);
 const file=await fs.open(temporary,'w'),hash=crypto.createHash('sha256');let size=0;
 try{for await(const chunk of installer.body){size+=chunk.length;hash.update(chunk);await file.write(chunk);}}finally{await file.close();}
 assert.equal(size,manifest.size);assert.equal(hash.digest('hex'),manifest.sha256);await fs.mkdir(path.dirname(output),{recursive:true});await fs.copyFile(temporary,output);await fs.unlink(temporary);
 console.log(JSON.stringify({publicDownload:'passed',version:manifest.version,bytes:size,sha256:'verified',filename:path.basename(output)}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
