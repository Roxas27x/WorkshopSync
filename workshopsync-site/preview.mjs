import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import worker from './dist/_worker.js';
const directory=path.resolve('dist');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
 try{
  const request=new Request('http://127.0.0.1:8788'+req.url,{method:req.method,headers:req.headers});
  const response=await worker.fetch(request,{ASSETS:{fetch:async request=>{
   const url=new URL(request.url);const file=path.resolve(directory,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
   if(!file.startsWith(directory+path.sep))return new Response('Not found',{status:404});
   try{return new Response(await fs.readFile(file),{headers:{'Content-Type':types[path.extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}
  }}});
  res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)for await(const chunk of response.body)res.write(chunk);res.end();
 }catch{res.writeHead(500);res.end('Preview error.');}
});
server.listen(8788,'127.0.0.1',()=>console.log('WorkshopSync preview: http://127.0.0.1:8788'));
