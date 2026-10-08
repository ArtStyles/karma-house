import test from 'node:test';
import assert from 'node:assert/strict';
import {startAgencyPoll,readIncomingAgencyMessages} from '../src/agencies/messaging/live.ts';
test('poll serializes reads and stops scheduling after disposal during delayed read',async()=>{
 let finish!:()=>void,calls=0;const jobs:(()=>void)[]=[];
 const stop=startAgencyPoll(async()=>{calls++;await new Promise<void>(r=>finish=r);},{schedule:fn=>{jobs.push(fn);return 1;},cancel:()=>{}});
 assert.equal(calls,1);assert.equal(jobs.length,0);stop();finish();await new Promise(r=>setImmediate(r));assert.equal(jobs.length,0);
});
test('incoming refresh fills multiple pages without losing loaded history or duplicates',async()=>{
 const message=(seq:number)=>({id:String(seq),conversationId:'chat',seq,clientMessageId:String(seq),senderId:null,body:String(seq),createdAt:'2026-10-08T00:00:00Z'});
 const previous=Array.from({length:60},(_,i)=>message(i+1));let reads=0;
 const repo={async history(_id:string,before:number|null){reads++;const top=before?before-1:125;return{items:Array.from({length:30},(_,i)=>message(top-29+i)),hasMore:true};}};
 const page=await readIncomingAgencyMessages(repo as any,'chat',previous,true,{checkpoint(){}} as any);
 assert.equal(reads,3);assert.deepEqual(page.items.map(m=>m.seq),Array.from({length:125},(_,i)=>i+1));assert.equal(page.hasMore,true);
});
test('scope change during incoming history never returns old private content',async()=>{
 let revoked=false;const repo={async history(){revoked=true;return{items:[],hasMore:false};}};
 await assert.rejects(readIncomingAgencyMessages(repo as any,'chat',[],false,{checkpoint(){if(revoked)throw Error('changed');}} as any),/changed/);
});
