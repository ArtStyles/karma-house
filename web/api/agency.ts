// Keep this function self-contained: Vercel emits JS, while Node ESM cannot
// resolve imports pointing at the original .ts sources in the function package.
interface PublicAgencyIdentity {agencyId:string;tradeName:string;logoPath:string|null;verified:boolean;isPrincipal:boolean}
type PublicAgencyProfile=(PublicAgencyIdentity&{identityOnly:true})|(PublicAgencyIdentity&{identityOnly?:false;businessPhone:string;province:string;municipality:string;serviceAreas:string[];description:string;officeAddress?:string});
function decodePublicAgencyProfile(value: unknown): PublicAgencyProfile {
  const invalid=()=>new Error('Invalid public agency profile');
  if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['agencyId','tradeName','businessPhone','province','municipality','serviceAreas','description','logoPath','verified','officeAddress','isPrincipal','identityOnly'].includes(k)))throw invalid();
  const text=(x:unknown,min:number,max:number)=>{if(typeof x!=='string'||x.includes('\0')||x.trim().length<min||x.trim().length>max)throw invalid();return x.trim();};
  const id=text(v.agencyId,36,36);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||typeof v.verified!=='boolean'||(v.isPrincipal!==undefined&&typeof v.isPrincipal!=='boolean')||(v.isPrincipal&&!v.verified))throw invalid();
  let logoPath=null;if(v.logoPath!==null){logoPath=text(v.logoPath,83,83);if(!new RegExp(`^${id}/logos/[0-9a-f-]{36}\\.jpg$`,'i').test(logoPath))throw invalid();}
  const identity={agencyId:id,tradeName:text(v.tradeName,2,120),logoPath,verified:v.verified,isPrincipal:v.isPrincipal===true};
  if(v.identityOnly===true){
   if(!identity.isPrincipal||Object.keys(v).some(k=>!['agencyId','tradeName','logoPath','verified','isPrincipal','identityOnly'].includes(k)))throw invalid();
   return {...identity,identityOnly:true};
  }
  if(v.identityOnly!==undefined&&v.identityOnly!==false)throw invalid();
  const phone=text(v.businessPhone,9,16);if(!/^\+\d{8,15}$/.test(phone))throw invalid();
  if(!Array.isArray(v.serviceAreas)||v.serviceAreas.length<1||v.serviceAreas.length>20)throw invalid();
  const zones=v.serviceAreas.map(x=>text(x,2,80));if(new Set(zones.map(x=>x.toLocaleLowerCase('es'))).size!==zones.length)throw invalid();
  return {...identity,businessPhone:phone,province:text(v.province,2,80),municipality:text(v.municipality,2,80),serviceAreas:zones,description:text(v.description,20,1000),...(v.officeAddress===undefined?{}:{officeAddress:text(v.officeAddress,1,200)})};
}
// Deliberately local to avoid a runtime dependency on the separate /p function.
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function handleAgencyProfile(request:Request,env:{supabaseUrl:string;anonKey:string;publicOrigin:string},fetcher:typeof fetch=fetch):Promise<Response>{
 const url=new URL(request.url),id=url.searchParams.get('id')??url.pathname.split('/').at(-1)??'';
 const unavailable=(status=404)=>new Response('<!doctype html><html lang="es"><meta charset="utf-8"><title>Inmobiliaria no disponible</title><main><h1>Inmobiliaria no disponible</h1><a href="/">Volver a KarmaHouse</a></main></html>',{status,headers});
 if(!UUID.test(id))return unavailable();if(!env.supabaseUrl||!env.anonKey)return unavailable(503);
 const base=env.supabaseUrl.replace(/\/$/,''),auth={apikey:env.anonKey,Authorization:`Bearer ${env.anonKey}`,'Content-Type':'application/json'};
 try{
  const response=await fetcher(`${base}/rest/v1/rpc/kh_public_agency_profile`,{method:'POST',headers:auth,body:JSON.stringify({p_agency_id:id})});if(!response.ok)return unavailable(503);
  const raw=await response.json();if(raw===null)return unavailable();const p=decodePublicAgencyProfile(raw);if(p.agencyId!==id)return unavailable(503);
  let logo='';if(p.logoPath&&new RegExp(`^${id}/logos/[0-9a-f-]{36}\\.jpg$`,'i').test(p.logoPath)){
   try{const signed=await fetcher(`${base}/storage/v1/object/sign/agency-assets/${p.logoPath}`,{method:'POST',headers:auth,body:JSON.stringify({expiresIn:300})});const value=await signed.json();if(signed.ok&&typeof value.signedURL==='string'){const u=new URL(value.signedURL.startsWith('/object/')?`${base}/storage/v1${value.signedURL}`:value.signedURL,base);if(u.origin===new URL(base).origin&&decodeURIComponent(u.pathname)===`/storage/v1/object/sign/agency-assets/${p.logoPath}`&&u.searchParams.has('token'))logo=u.href;}}catch{/* Safe text profile remains available. */}
  }
  const e=escapeHtml;
  const commercial=p.identityOnly?'<p>Perfil comercial pendiente de completar.</p>':`<p>${e(p.municipality)}, ${e(p.province)}</p><h2>Servicios</h2><p>${e(p.description)}</p><p>Zonas: ${p.serviceAreas.map(e).join(', ')}</p><h2>Contacto comercial</h2><a href="tel:${e(p.businessPhone)}">${e(p.businessPhone)}</a>${p.officeAddress?`<h2>Dirección de oficina</h2><p>${e(p.officeAddress)}</p>`:''}`;
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(p.tradeName)} · KarmaHouse</title><style>:root{color-scheme:light dark}body{margin:0;font:17px/1.6 system-ui;background:light-dark(#f5f5f7,#111418);color:light-dark(#1c1c1e,#f2f4f7)}main{max-width:720px;margin:auto;padding:28px}section{padding:24px;border:1px solid #8592a144;border-radius:20px}a{color:light-dark(#0153a8,#7db4f0)}img{width:96px;height:96px;object-fit:cover;border-radius:18px}.verified{color:light-dark(#227a46,#7cd6a2)}.principal{display:inline-block;padding:5px 10px;border-radius:12px;background:light-dark(#fff3da,#3c3020);color:light-dark(#8a5c15,#e8bd72);font-weight:700}h1{line-height:1.2}</style></head><body><main><a href="/">KarmaHouse</a><section>${logo?`<img src="${e(logo)}" alt="Logo de ${e(p.tradeName)}">`:''}<h1>${e(p.tradeName)}</h1>${p.verified?`<p class="${p.isPrincipal?'principal':'verified'}">✓ ${p.isPrincipal?'Inmobiliaria principal':'Inmobiliaria verificada por KarmaHouse'}</p>`:''}${commercial}</section></main></body></html>`,{status:200,headers});
 }catch{return unavailable(503);}
}
export function GET(request:Request){return handleAgencyProfile(request,{supabaseUrl:process.env.SUPABASE_URL??'',anonKey:process.env.SUPABASE_ANON_KEY??'',publicOrigin:new URL(request.url).origin});}
