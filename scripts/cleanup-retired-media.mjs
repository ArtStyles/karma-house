import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
// No paths supplied by the caller; only server-leased jobs may be deleted.
export async function cleanupRetiredMedia(port,{commit=false}={}) {
 if(!commit) return port.rpc('kh_pending_media_cleanup',{});
 const jobs=await port.rpc('kh_claim_media_cleanup',{p_limit:25});
 let done=0,failed=0;
 for(const job of jobs){
  let success=false;
  try{await port.remove(job.path);success=true;done++;}catch{failed++;}
  await port.rpc('kh_finish_media_cleanup',{p_path:job.path,p_lease_id:job.leaseId,p_success:success,p_error:success?null:'STORAGE_FAILED'});
 }
 return {done,failed};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const base=process.env.KH_ASSISTED_URL,key=process.env.KH_ASSISTED_SERVICE_KEY;
 if(!base||!key)throw Error('Explicit KH_ASSISTED_URL and KH_ASSISTED_SERVICE_KEY required');
 const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
 const port={async rpc(name,body){const r=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body)});if(!r.ok)throw Error(`RPC failed (${r.status})`);return r.status===204?null:r.json();},async remove(path){const r=await fetch(`${base}/storage/v1/object/property-photos`,{method:'DELETE',headers,body:JSON.stringify({prefixes:[path]})});if(!r.ok&&r.status!==404)throw Error('STORAGE_FAILED');}};
 console.log(await cleanupRetiredMedia(port,{commit:process.argv.includes('--commit')}));
}
