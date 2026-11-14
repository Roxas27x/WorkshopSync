const path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),desktop=path.join(root,'workshop-link'),electron=require(path.join(desktop,'node_modules/electron'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(electron,[path.join(desktop,'tests/ui-check.cjs')],{cwd:desktop,env,stdio:'inherit',windowsHide:true});child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
