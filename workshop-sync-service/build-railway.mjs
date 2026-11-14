import fs from 'node:fs/promises';
const format=(await fs.readFile('../workshop-link/src/release-format.cjs','utf8')).replace(/module\.exports=.*;\s*$/,'');
await fs.writeFile('worker/release-format.mjs',format+'\nexport {validateRelease,releaseText,compareReleaseVersions};\n');
const releaseCore=(await fs.readFile('worker/releases.mjs','utf8')).replace(/^import[^\n]+\n/,'').replace('export async function releaseRoute','async function releaseRoute').replace('export {validReleaseSignature,releaseYaml};','');
const releaseStore=(await fs.readFile('release-store.mjs','utf8')).replace(/^import[^\n]+\n/gm,'').replace('export function fileReleaseStore','function fileReleaseStore');
const sharing=(await fs.readFile('worker/sharing.mjs','utf8')).replaceAll('export function ','function ').replaceAll('export async function ','async function ');
const core=(await fs.readFile('worker/index.mjs','utf8')).replace(/^import[^\n]+\n/gm,'').replace('export async function handle','async function handle').replace('export {sha,validateProfile};','').replace('export default{fetch:handle};','');
const adapter=(await fs.readFile('sqlite-adapter.mjs','utf8')).replace('export function sqliteAdapter','function sqliteAdapter');
const files=(await fs.readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort();
const migrations=[];for(const name of files)migrations.push({name,sql:await fs.readFile('drizzle/'+name,'utf8')});
const prefix=`import { Database } from 'bun:sqlite';\nimport { mkdirSync } from 'node:fs';\nimport fs from 'node:fs/promises';\nimport path from 'node:path';\n`;
const suffix=`
const mount=Bun.env.RAILWAY_VOLUME_MOUNT_PATH;
let DB=null;
if(mount){
 mkdirSync(mount,{recursive:true});
 const sqlite=new Database(mount+'/workshop-link.sqlite',{create:true,strict:true});
 sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS _schema (name TEXT PRIMARY KEY NOT NULL)');
 const migrations=${JSON.stringify(migrations)};
 for(const migration of migrations){if(!sqlite.prepare('SELECT name FROM _schema WHERE name=?').get(migration.name)){
  sqlite.exec('BEGIN IMMEDIATE');try{sqlite.exec(migration.sql);sqlite.prepare('INSERT INTO _schema(name) VALUES (?)').run(migration.name);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
 }}
 DB=sqliteAdapter(sqlite);
}
const publicOrigin=Bun.env.PUBLIC_ORIGIN || (Bun.env.RAILWAY_PUBLIC_DOMAIN?'https://'+Bun.env.RAILWAY_PUBLIC_DOMAIN:'');
const RELEASE_STORE=mount?fileReleaseStore(mount):null;
export default {
 port:Number(Bun.env.PORT||3000),
 maxRequestBodySize:201*1024*1024,
 fetch(request){
  if(!DB || !publicOrigin)return new Response(JSON.stringify({service:'workshop-link-sync',version:'0.2.0',ready:false,error:'Persistent storage or public origin is not configured.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const actual=new URL(request.url);const target=new URL(actual.pathname+actual.search,publicOrigin);
  const forwarded=new Request(target,request);
  return handle(forwarded,{DB,PUBLIC_ORIGIN:publicOrigin,RELEASE_STORE,UPDATE_PUBLIC_KEY:Bun.env.UPDATE_PUBLIC_KEY,RELEASE_PUBLISHER_STEAM_ID:Bun.env.RELEASE_PUBLISHER_STEAM_ID});
 }
};
`;
await fs.writeFile('railway-function.ts',prefix+format+'\n'+releaseCore+'\n'+releaseStore+'\n'+sharing+'\n'+core+'\n'+adapter+'\n'+suffix);
console.log('Built single-file Railway function with persistent SQLite migrations.');
