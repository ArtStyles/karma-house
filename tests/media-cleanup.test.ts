import test from 'node:test';import assert from 'node:assert/strict';
import {cleanupRetiredMedia} from '../scripts/cleanup-retired-media.mjs';
test('dry run never leases or deletes; commit records each failed/successful lease',async()=>{
 const calls:unknown[]=[];const port={async rpc(name:string,payload:unknown){calls.push([name,payload]);return name==='kh_claim_media_cleanup'?[{path:'leased/a',leaseId:'a'},{path:'leased/b',leaseId:'b'}]:{pending:2};},async remove(path:string){calls.push(path);if(path.endsWith('a'))throw Error('private provider text');}};
 await cleanupRetiredMedia(port);assert.deepEqual(calls,[['kh_pending_media_cleanup',{}]]);calls.length=0;
 assert.deepEqual(await cleanupRetiredMedia(port,{commit:true}),{done:1,failed:1});
 assert.deepEqual(calls[2],['kh_finish_media_cleanup',{p_path:'leased/a',p_lease_id:'a',p_success:false,p_error:'STORAGE_FAILED'}]);
});
