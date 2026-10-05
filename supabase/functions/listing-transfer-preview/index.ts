import {createClient} from '@supabase/supabase-js';
import {createTransferPreviewHandler} from './handler.ts';
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const options={auth:{persistSession:false,autoRefreshToken:false}};
const auth=createClient(url,key,options),storage=createClient(url,serviceKey,options).storage.from('property-photos');
Deno.serve(createTransferPreviewHandler({
 async user(token){const {data,error}=await auth.auth.getUser(token);return error?null:data.user?.id??null;},
 async request(actor,id,token){const scoped=createClient(url,key,{...options,global:{headers:{Authorization:`Bearer ${token}`}}});const {data,error}=await scoped.rpc('kh_get_listing_transfer',{p_actor_id:actor,p_request_id:id});if(error)throw error;return data;},
 async sign(paths,seconds){const {data,error}=await storage.createSignedUrls(paths,seconds);if(error||!data||data.some(x=>x.error||!x.path||!x.signedUrl))throw Error('PREVIEW_UNAVAILABLE');return data.map(x=>({path:x.path!,signedUrl:x.signedUrl!}));},
}));
