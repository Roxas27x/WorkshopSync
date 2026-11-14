const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('workshop',{
  action:(type,payload)=>ipcRenderer.invoke('action',type,payload),
  onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('state',listener);return ()=>ipcRenderer.removeListener('state',listener);}
});
