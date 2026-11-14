const {app,nativeImage}=require('electron'),path=require('node:path'),assert=require('node:assert/strict');
app.setPath('userData',path.resolve(__dirname,'../../qa-icons-v062'));
app.whenReady().then(()=>{
 const source=nativeImage.createFromPath(path.resolve(__dirname,'../src/assets/workshopsync.png'));
 const packaged=nativeImage.createFromPath(path.resolve(__dirname,'../installer/win-unpacked/resources/app.asar/src/assets/workshopsync.png'));
 assert.equal(source.isEmpty(),false);assert.equal(packaged.isEmpty(),false,'The native taskbar image loads from the packaged ASAR');
 const {width,height}=source.getSize();assert.equal(width,height);assert.ok(width>=1024);
 const pixels=source.toBitmap();assert.equal(pixels[3],0,'Outer corner is transparent');
 // Generated artwork can have negligible alpha variation in otherwise solid colors.
 assert.ok(pixels[4*(Math.floor(height/2)*width+Math.floor(width/2))+3]>=250,'The blue tile and internal artwork stay solid');
 assert.ok(packaged.toBitmap().equals(pixels),'The packaged native icon preserves the approved artwork and alpha');
 const windows=nativeImage.createFromPath(path.resolve(__dirname,'../src/assets/workshopsync.ico'));assert.equal(windows.isEmpty(),false,'Windows can decode the ICO');
 console.log('Icon image passed: transparent outer corners, solid central artwork, native PNG/ICO decoding, and identical packaged artwork.');app.exit(0);
}).catch(error=>{console.error(error.stack);app.exit(1);});
