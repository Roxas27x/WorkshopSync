// Read-only check of the deployed service using this PC's existing protected session.
const {app,safeStorage}=require('electron'),path=require('node:path'),assert=require('node:assert/strict');
const {Relay}=require('../src/relay.cjs');
app.setName('Workshop Link');app.setPath('userData',path.join(app.getPath('appData'),'Workshop Link'));
app.whenReady().then(async()=>{
 const relay=new Relay(require('../src/service-config.json').url,{file:path.join(app.getPath('userData'),'companion-session.json'),safeStorage});await relay.load();await relay.verifyIdentity();
 const health=await relay.request('/v1/health',{token:null});assert.equal(health.sharingVersion,2);
 const roster=await relay.request('/v1/friends');assert.ok(Array.isArray(roster.friends));const game=roster.friends.flatMap(friend=>friend.games).find(game=>game.share_list||game.share_subscriptions);
 let count=0;if(game){const page=await relay.request(`/v1/games/${game.appid}/friends`);assert.ok(Array.isArray(page.friends));for(const snapshot of page.friends){assert.ok(Array.isArray(snapshot.namedLists));assert.deepEqual([...new Set(snapshot.namedLists.flatMap(list=>list.items))].sort(),snapshot.curated.slice().sort());for(const list of snapshot.namedLists){assert.equal(typeof list.name,'string');assert.ok(Array.isArray(list.items));assert.equal(list.audience,undefined);}count+=snapshot.namedLists.length;}}
 console.log(`Live service passed: verified account, ${roster.friends.length} connected friends, and ${count} permitted named lists. No sharing settings were changed.`);app.exit(0);
}).catch(error=>{console.error(error.message);app.exit(1);});
