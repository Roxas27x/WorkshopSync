const fs=require('node:fs/promises'),path=require('node:path');
async function resolvePackage(name,from){let current=from;for(;;){const candidate=path.join(current,'node_modules',name);try{await fs.access(path.join(candidate,'package.json'));return candidate;}catch{}const parent=path.dirname(current);if(parent===current)return null;current=parent;}}
module.exports=async function includeDependencyLicenses(context){
 const project=context.packager.projectDir||context.packager.info.projectDir,output=path.join(context.appOutDir,'THIRD_PARTY_LICENSES'),app=JSON.parse(await fs.readFile(path.join(project,'package.json'),'utf8')),queue=Object.keys(app.dependencies||{}).map(name=>({name,from:project})),seen=new Set(),report=[];
 await fs.mkdir(output,{recursive:true});
 while(queue.length){const item=queue.shift(),folder=await resolvePackage(item.name,item.from);if(!folder)continue;const real=await fs.realpath(folder);if(seen.has(real))continue;seen.add(real);const pkg=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8')),safeName=(pkg.name+'-'+pkg.version).replace(/[^a-zA-Z0-9._-]/g,'_'),target=path.join(output,safeName),notices=[];
  await fs.mkdir(target,{recursive:true});for(const file of await fs.readdir(folder,{withFileTypes:true})){if(file.isFile()&&/^(?:licen[cs]e|copying|notice|copyright)(?:[.-]|$)/i.test(file.name)){await fs.copyFile(path.join(folder,file.name),path.join(target,file.name));notices.push(file.name);}}
  if(!notices.length){const fallback=path.join(__dirname,'licenses',safeName+'.txt');await fs.copyFile(fallback,path.join(target,'LICENSE.packaging-notice.txt'));notices.push('LICENSE.packaging-notice.txt');}
  const record={name:pkg.name,version:pkg.version,license:pkg.license||null,repository:pkg.repository||null,notices};await fs.writeFile(path.join(target,'package-notice.json'),JSON.stringify(record,null,2)+'\n');report.push(record);
  for(const name of Object.keys({...pkg.dependencies,...pkg.optionalDependencies,...pkg.peerDependencies}))queue.push({name,from:folder});
 }
 await fs.writeFile(path.join(output,'index.json'),JSON.stringify(report,null,2)+'\n');console.log('Included license information for '+report.length+' production npm dependencies.');
};
