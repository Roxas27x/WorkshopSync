const test=require('node:test'),assert=require('node:assert/strict');
const {selectIdentity,assertSameAccount}=require('../src/identity.cjs');
const A='76561198000000001',B='76561198000000002';
test('a manual install cannot cross an account change between selecting and requesting a mod',()=>{assert.doesNotThrow(()=>assertSameAccount(A,A));assert.throws(()=>assertSameAccount(A,B),/account changed/);assert.throws(()=>assertSameAccount(null,A),/account changed/);});
test('verified browser identity reads local account data without an embedded Steam session',()=>{assert.deepEqual(selectIdentity(null,{verified:true,steamid:A}),{steamid:A,communityAuthorized:false});});
test('a different embedded account cannot authorize downloads for the verified browser identity',()=>{assert.deepEqual(selectIdentity({steamid:B},{verified:true,steamid:A}),{steamid:A,communityAuthorized:false});assert.deepEqual(selectIdentity({steamid:A},{verified:true,steamid:A}),{steamid:A,communityAuthorized:true});});
test('an unverified saved ID cannot select a local Steam account; existing Community sessions remain usable',()=>{assert.equal(selectIdentity(null,{verified:false,steamid:A}),null);assert.deepEqual(selectIdentity({steamid:B},{verified:false,steamid:A}),{steamid:B,communityAuthorized:true});});
