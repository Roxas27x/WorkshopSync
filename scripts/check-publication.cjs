const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),ignored=new Set(['.git','node_modules','.wrangler','.railway','installer','portable','ui-artifacts','releases']);
let files=[];
if(fs.existsSync(path.join(root,'.git'))){const result=spawnSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8'});if(result.status||path.resolve(result.stdout.trim())!==root)throw Error('Publication check must run inside this repository.');const tracked=spawnSync('git',['-C',root,'ls-files','-z'],{encoding:'utf8'});if(tracked.status)throw Error('Cannot enumerate repository files.');files=tracked.stdout.split('\0').filter(Boolean);}
if(!files.length){function walk(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const relative=path.join(dir,entry.name);if(entry.isDirectory()){if(!ignored.has(entry.name)&&!entry.name.startsWith('qa-')&&relative!==path.join('workshop-sync-service','dist'))walk(relative);}else files.push(relative);}}walk('');}
const problems=[];
const rules=[['private key',/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],['GitHub credential',/\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})\b/],['AWS access key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],['Google API key',/\bAIza[A-Za-z0-9_-]{35}\b/],['personal workstation path',/C:[\\/]+Users[\\/]+Roxas(?:[\\/]|\b)/i]];
for(const relative of files){const parts=relative.replaceAll('\\','/').split('/'),name=parts.at(-1),absolute=path.resolve(root,relative);if(!absolute.startsWith(root+path.sep))throw Error('File escaped the repository.');
 if(parts.some(part=>ignored.has(part)||part.startsWith('qa-'))||/^(?:companion-session|release-signing-key|steam-renewal|deployment)\.json$/i.test(name)||/^(?:Cookies|Local State)$/.test(name)||/\.(?:sqlite(?:-wal|-shm)?|db|pem|key|pfx|p12|log|exe|blockmap)$/i.test(name)||/^lists\.json/.test(name)||name.startsWith('.env')&&name!=='.env.example')problems.push({file:relative,issue:'private, generated, or runtime file'});
 if(/\.(?:png|ico)$/.test(name))continue;
 const text=fs.readFileSync(absolute,'utf8');if(text.includes('\0'))problems.push({file:relative,issue:'corrupted text file'});for(const[label,pattern]of rules)if(pattern.test(text))problems.push({file:relative,issue:label});
}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/runtime-source-v0.10.0.json'),'utf8'));let matched=0;
for(const item of manifest.files){const file=path.resolve(root,item.path);if(!file.startsWith(root+path.sep))throw Error('Runtime manifest path escaped the repository.');if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')===item.sha256)matched++;}
const license=fs.readFileSync(path.join(root,'LICENSE'),'utf8');if(!license.includes('GNU GENERAL PUBLIC LICENSE')||!license.includes('Version 3, 29 June 2007'))problems.push({file:'LICENSE',issue:'GPLv3 license text is missing'});
for(const component of ['','workshop-link','workshop-sync-service','workshopsync-site']){const pkg=JSON.parse(fs.readFileSync(path.join(root,component,'package.json'),'utf8'));if(pkg.license!=='GPL-3.0-only')problems.push({file:path.join(component,'package.json'),issue:'GPL-3.0-only license metadata is missing'});}
if(problems.length){for(const problem of problems)console.error(problem.file+': '+problem.issue);process.exit(1);}
console.log('Publication check passed: '+files.length+' source/documentation files, GPLv3 notices, no detected credentials or private runtime data.');
console.log(matched+' / '+manifest.files.length+' runtime files match the official v0.10.0 snapshot. Future code changes may intentionally differ from that historical snapshot.');
