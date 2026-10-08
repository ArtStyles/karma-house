// Standalone public contract: deployed with web/**, without mobile dependencies.
export interface PublicAgencyProfile {
  agencyId: string; tradeName: string; businessPhone: string; province: string;
  municipality: string; serviceAreas: string[]; description: string;
  logoPath: string | null; verified: boolean; officeAddress?: string;
}
export function decodePublicAgencyProfile(value: unknown): PublicAgencyProfile {
  const invalid=()=>new Error('Invalid public agency profile');
  if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['agencyId','tradeName','businessPhone','province','municipality','serviceAreas','description','logoPath','verified','officeAddress'].includes(k)))throw invalid();
  const text=(x:unknown,min:number,max:number)=>{if(typeof x!=='string'||x.includes('\0')||x.trim().length<min||x.trim().length>max)throw invalid();return x.trim();};
  const id=text(v.agencyId,36,36),phone=text(v.businessPhone,9,16);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||!/^\+\d{8,15}$/.test(phone)||typeof v.verified!=='boolean')throw invalid();
  if(!Array.isArray(v.serviceAreas)||v.serviceAreas.length<1||v.serviceAreas.length>20)throw invalid();
  const zones=v.serviceAreas.map(x=>text(x,2,80));if(new Set(zones.map(x=>x.toLocaleLowerCase('es'))).size!==zones.length)throw invalid();
  let logoPath=null;if(v.logoPath!==null){logoPath=text(v.logoPath,83,83);if(!new RegExp(`^${id}/logos/[0-9a-f-]{36}\\.jpg$`,'i').test(logoPath))throw invalid();}
  return {agencyId:id,tradeName:text(v.tradeName,2,120),businessPhone:phone,province:text(v.province,2,80),municipality:text(v.municipality,2,80),serviceAreas:zones,description:text(v.description,20,1000),logoPath,verified:v.verified,...(v.officeAddress===undefined?{}:{officeAddress:text(v.officeAddress,1,200)})};
}
