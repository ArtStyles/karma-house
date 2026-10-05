import test from 'node:test';import assert from 'node:assert/strict';import {createTransferPreviewHandler} from '../supabase/functions/listing-transfer-preview/handler.ts';import {transferRow,recipient,requestId} from './helpers/transferFixtures.ts';
import {createServer} from 'node:http';
test('preview signs only a current recipient pending batch for 300 seconds',async()=>{
 let current=true;const signs:unknown[]=[];const handler=createTransferPreviewHandler({user:async()=>recipient,request:async()=>({...transferRow,effectiveState:current?'pending':'cancelled'}),sign:async(paths,seconds)=>{signs.push([paths,seconds]);return paths.map(path=>({path,signedUrl:'https://signed.invalid/'+path}));}});
 const req=()=>new Request('http://local/preview',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({requestId})});
 assert.equal((await handler(req())).status,200);assert.equal((signs[0] as unknown[])[1],300);current=false;assert.equal((await handler(req())).status,403);assert.equal(signs.length,1);
 const stranger=createTransferPreviewHandler({user:async()=>requestId,request:async()=>transferRow,sign:async()=>{throw Error('must not sign');}});assert.equal((await stranger(req())).status,403);
 assert.equal((await handler(new Request('http://local',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({requestId,paths:['arbitrary']})}))).status,400);
});
test('cancellation while signing prevents delivery of the old private response',async()=>{
 let count=0;const h=createTransferPreviewHandler({user:async()=>recipient,request:async()=>({...transferRow,effectiveState:++count===1?'pending':'cancelled'}),sign:async paths=>paths.map(path=>({path,signedUrl:'https://private.invalid'}))});
 assert.equal((await h(new Request('http://local',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({requestId})}))).status,403);
});
test('loopback HTTP fixture rejects a third actor and delivers only scoped preview URLs',async()=>{
 const handler=createTransferPreviewHandler({user:async token=>token==='recipient'?recipient:requestId,request:async()=>transferRow,sign:async paths=>paths.map(path=>({path,signedUrl:'https://signed.invalid/'+path}))});
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const response=await handler(new Request('http://127.0.0.1/preview',{method:req.method,headers:req.headers as Record<string,string>,body:Buffer.concat(chunks).toString()}));res.writeHead(response.status,Object.fromEntries(response.headers.entries()));res.end(await response.text());});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const address=server.address() as {port:number};const call=(token:string)=>fetch(`http://127.0.0.1:${address.port}/preview`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({requestId})});assert.equal((await call('third')).status,403);const response=await call('recipient');assert.equal(response.status,200);assert.equal((await response.json()).expiresIn,300);}
 finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
