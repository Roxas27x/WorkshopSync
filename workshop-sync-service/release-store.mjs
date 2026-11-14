import fs from 'node:fs/promises';
import path from 'node:path';
export function fileReleaseStore(root){
 const releases=path.join(root,'releases');
 const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 const store={
  busy:false,
  latest:()=>read(path.join(releases,'latest.json')),
  get:version=>read(path.join(releases,version,'release.json')),
  async publish(envelope,stream){
   const m=envelope.manifest;await fs.mkdir(releases,{recursive:true});const current=await store.latest();
   // Keep the current installer available while receiving the next one; discard older release files.
   for(const name of await fs.readdir(releases))if(/^\d+\.\d+\.\d+$/.test(name)&&name!==current?.manifest.version){const target=path.resolve(releases,name);if(path.dirname(target)!==path.resolve(releases))throw new Error('Invalid release directory.');await fs.rm(target,{recursive:true,force:true});}
   const directory=path.join(releases,m.version);await fs.mkdir(directory,{recursive:true});const temporary=path.join(directory,'installer.part');
   const writer=Bun.file(temporary).writer({highWaterMark:1024*1024});const sha256=new Bun.CryptoHasher('sha256'),sha512=new Bun.CryptoHasher('sha512');let size=0;
   try{
    if(!stream)throw new Error('Installer body is missing.');const reader=stream.getReader();
    try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>m.size)throw new Error('Installer exceeds its signed size.');sha256.update(value);sha512.update(value);writer.write(value);await writer.flush();}}finally{reader.releaseLock();}
    await writer.end();
    if(size!==m.size||sha256.digest('hex')!==m.sha256||sha512.digest('base64')!==m.sha512)throw new Error('Installer checksum does not match the signed release.');
    await fs.rename(temporary,path.join(directory,m.file));await fs.writeFile(path.join(directory,'release.json'),JSON.stringify(envelope));
    const pointer=path.join(releases,'latest-'+crypto.randomUUID()+'.tmp');await fs.writeFile(pointer,JSON.stringify(envelope));await fs.rename(pointer,path.join(releases,'latest.json'));
   }catch(e){try{await writer.end();}catch{}await fs.unlink(temporary).catch(()=>{});throw e;}
  },
  async download(manifest,request){
   const file=Bun.file(path.join(releases,manifest.version,manifest.file));if(!await file.exists())return new Response('Installer not found.',{status:404});
   const headers={'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${manifest.file}"`,'Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'};
   const range=request.headers.get('Range');if(range){const r=range.match(/^bytes=(\d+)-(\d*)$/);const start=r?Number(r[1]):-1,end=r&&r[2]?Number(r[2]):file.size-1;if(start<0||start>end||end>=file.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${file.size}`}});return new Response(file.slice(start,end+1),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${file.size}`}});}
   return new Response(file,{headers:{...headers,'Content-Length':String(file.size)}});
  }
 };return store;
}
