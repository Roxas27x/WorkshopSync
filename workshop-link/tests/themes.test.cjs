const test=require('node:test'),assert=require('node:assert/strict');
const Themes=require('../src/themes.js'),{migrate,resetAccount,sharingPayload}=require('../src/state.cjs');
function luminance(hex){const [r,g,b]=hex.slice(1).match(/../g).map(c=>{const x=parseInt(c,16)/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;}
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('appearance migration preserves valid settings and rejects unknown palettes and modes',()=>{
 assert.deepEqual(Themes.normalize(),{palette:'graphite',mode:'dark'});assert.deepEqual(Themes.normalize({palette:'url(evil)',mode:'custom'}),{palette:'graphite',mode:'dark'});
 const state=migrate({version:2,games:[],friends:[],appearance:{palette:'ocean',mode:'light'}});assert.deepEqual(migrate(JSON.parse(JSON.stringify(state))).appearance,{palette:'ocean',mode:'light'});resetAccount(state);assert.deepEqual(state.appearance,{palette:'ocean',mode:'light'});assert.equal(sharingPayload(state).appearance,undefined);
});
test('System mode follows the display, while explicit Light and Dark stay fixed',()=>{
 assert.equal(Themes.tokens({mode:'system',palette:'forest'},true).mode,'dark');assert.equal(Themes.tokens({mode:'system',palette:'forest'},false).mode,'light');assert.equal(Themes.tokens({mode:'light'},true).mode,'light');assert.equal(Themes.tokens({mode:'dark'},false).mode,'dark');
});
test('every palette keeps normal text, secondary text, and primary actions readable in both modes',()=>{
 for(const palette of Themes.palettes)for(const mode of ['light','dark']){
  const v=Themes.tokens({palette:palette.id,mode}).variables;
  for(const surface of ['bg','panel','raised','input-bg','hover']){
   assert.ok(contrast(v.text,v[surface])>=4.5,`${palette.id} ${mode} main text on ${surface}`);
   assert.ok(contrast(v.muted,v[surface])>=4.5,`${palette.id} ${mode} secondary text on ${surface}: ${contrast(v.muted,v[surface])}`);
  }
  assert.ok(contrast(v['accent-ink'],v.accent)>=4.5,`${palette.id} ${mode} primary action`);
 }
});
