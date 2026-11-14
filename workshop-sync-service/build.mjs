import fs from 'node:fs/promises';
await fs.mkdir('dist/server',{recursive:true});
for(const name of await fs.readdir('worker'))if(name.endsWith('.mjs'))await fs.copyFile('worker/'+name,'dist/server/'+(name==='index.mjs'?'index.js':name));
console.log('Built WorkshopSync portable worker modules.');
