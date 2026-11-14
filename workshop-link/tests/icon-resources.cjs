// Verify the first icon Windows sees in both the app and installer executables.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const PE=require('pe-library'),ResEdit=require('resedit');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
const bytes=item=>Buffer.from(item.isRaw()?item.bin:item.generate());
const digest=item=>createHash('sha256').update(bytes(item)).digest('hex');
const expected=ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root,'src/assets/workshopsync.ico'))).icons.map(icon=>digest(icon.data)).sort();
assert.equal(expected.length,7,'ICO supplies seven Windows display sizes');
const targets=process.argv.slice(2);
for(const file of targets.length?targets:[path.join(root,'installer/win-unpacked/WorkshopSync.exe'),path.join(root,`installer/Workshop-Link-Setup-${pkg.version}.exe`)]){
 const resource=PE.NtExecutableResource.from(PE.NtExecutable.from(fs.readFileSync(file),{ignoreCert:true}));
 const groups=ResEdit.Resource.IconGroupEntry.fromEntries(resource.entries);assert.ok(groups.length,'Executable includes a Windows icon');
 const actual=groups[0].getIconItemsFromEntries(resource.entries).map(digest).sort();
 assert.deepEqual(actual,expected,'Windows primary icon matches every selected Mod Stack icon frame in '+path.basename(file));
 console.log(path.basename(file)+': primary Windows icon matches all seven Mod Stack frames.');
}
