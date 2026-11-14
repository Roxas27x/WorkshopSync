const fs=require('node:fs/promises'),path=require('node:path');
const {hashInstaller}=require('../src/release-crypto.cjs');
const {validateRelease}=require('../src/release-format.cjs');
(async()=>{
 const pkg=require('../package.json'),file=`Workshop-Link-Setup-${pkg.version}.exe`;const installer=path.resolve(__dirname,'../installer',file);
 const hashes=await hashInstaller(installer);const manifest=validateRelease({schema:1,version:pkg.version,platform:'win32',arch:'x64',file,...hashes,publishedAt:new Date().toISOString(),notes:process.argv.slice(2).join(' ')||`WorkshopSync ${pkg.version}`});
 const output=path.resolve(__dirname,'../installer',`Workshop-Link-${pkg.version}.release.json`);await fs.writeFile(output,JSON.stringify(manifest,null,2));console.log(output);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
