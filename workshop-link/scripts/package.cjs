const fs=require('node:fs/promises');
const path=require('node:path');
async function run(){
  const root=path.resolve(__dirname,'..');
  const sourcePackage=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const out=path.join(root,'release',`Workshop Link ${sourcePackage.version}`);
  try{await fs.access(out);throw new Error('Release folder already exists. Use a fresh release location.');}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.mkdir(out,{recursive:true});
  await fs.cp(path.join(root,'node_modules','electron','dist'),out,{recursive:true});
  await fs.rename(path.join(out,'electron.exe'),path.join(out,'Workshop Link.exe'));
  try{await fs.rename(path.join(out,'electron_wer.dll'),path.join(out,'Workshop Link_wer.dll'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const dest=path.join(out,'resources','app');await fs.mkdir(dest,{recursive:true});
  await fs.cp(path.join(root,'src'),path.join(dest,'src'),{recursive:true});
  const pkg=sourcePackage;delete pkg.devDependencies;delete pkg.scripts;
  await fs.writeFile(path.join(dest,'package.json'),JSON.stringify(pkg,null,2));
  const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
  const copied=[];
  for(const [relative,meta] of Object.entries(lock.packages||{}).sort(([a],[b])=>a.length-b.length)){
    if(!relative.startsWith('node_modules/')||meta.dev||copied.some(p=>relative.startsWith(p+'/')))continue;
    await fs.cp(path.join(root,relative),path.join(dest,relative),{recursive:true});copied.push(relative);
  }
  await fs.copyFile(path.join(root,'README.md'),path.join(out,'START HERE.md'));
  console.log(out);
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
