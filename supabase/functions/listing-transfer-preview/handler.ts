interface PreviewRequest {id:string;requestVersion:number;effectiveState:string;recipient:{id:string};items:{propertyId:string;snapshot:{photo_paths:string[];cover_thumb_path?:string|null}}[]}
interface Port {user(token:string):Promise<string|null>;request(actor:string,id:string,token:string):Promise<PreviewRequest>;sign(paths:string[],seconds:number):Promise<{path:string;signedUrl:string}[]>}
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const answer=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createTransferPreviewHandler(port:Port){return async(req:Request):Promise<Response>=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(req.method!=='POST')return answer(405,{error:'METHOD_NOT_ALLOWED'});
 const match=/^Bearer (\S+)$/.exec(req.headers.get('Authorization')??'');if(!match)return answer(401,{error:'SESSION_REQUIRED'});
 try{
  const body=await req.json();if(!body||Object.keys(body).length!==1||!uuid(body.requestId))return answer(400,{error:'INVALID_REQUEST'});
  const actor=await port.user(match[1]);if(!actor)return answer(401,{error:'SESSION_REQUIRED'});
  const row=await port.request(actor,body.requestId,match[1]);
  const authorized=(r:PreviewRequest)=>r.id===body.requestId&&r.recipient.id===actor&&r.effectiveState==='pending';
  if(!authorized(row))return answer(403,{error:'PREVIEW_UNAVAILABLE'});
  if(!Array.isArray(row.items)||row.items.length<1||row.items.length>20)return answer(403,{error:'PREVIEW_UNAVAILABLE'});
  const paths=[...new Set(row.items.flatMap(i=>[...i.snapshot.photo_paths,...(i.snapshot.cover_thumb_path?[i.snapshot.cover_thumb_path]:[])]))];
  if(paths.length>140||paths.some(p=>!/^[-0-9a-f]{36}\/[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$/.test(p)))return answer(403,{error:'PREVIEW_UNAVAILABLE'});
  const urls=paths.length?await port.sign(paths,300):[];
  if(urls.length!==paths.length||urls.some(x=>!paths.includes(x.path)||!x.signedUrl))return answer(503,{error:'PREVIEW_UNAVAILABLE'});
  const fresh=await port.request(actor,body.requestId,match[1]);if(!authorized(fresh)||fresh.requestVersion!==row.requestVersion)return answer(403,{error:'PREVIEW_UNAVAILABLE'});
  return answer(200,{requestId:row.id,requestVersion:row.requestVersion,expiresIn:300,urls});
 }catch{return answer(403,{error:'PREVIEW_UNAVAILABLE'});}
};}
