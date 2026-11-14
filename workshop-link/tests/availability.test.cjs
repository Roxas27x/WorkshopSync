const test=require('node:test'),assert=require('node:assert/strict');
const {unresolved,visible}=require('../src/availability.js');
const item={id:'123',appid:'550',title:'A real mod',type:0};
test('unavailable and unresolved Workshop entries are hidden by default without removing saved data',()=>{const rows=[item,{...item,id:'2',unavailable:true},{...item,id:'3',placeholder:true},{id:'4',title:'Workshop item 4'}];assert.deepEqual(visible(rows),[item]);assert.equal(rows.length,4);assert.equal(visible(rows,true).length,4);});
test('available mods are not hidden just because their names contain Unknown or Unavailable',()=>{assert.equal(unresolved({...item,title:'Unknown Worlds'}),false);assert.equal(unresolved({...item,title:'Unavailable Resource Pack'}),false);assert.equal(unresolved({...item,image:''}),false);});
