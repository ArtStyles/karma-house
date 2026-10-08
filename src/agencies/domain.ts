import {isProvince} from '../domain/listingOptions.ts';
import type {AgencyAction,AgencyApplicationInput,AgencyRole,AgencyVerificationRequestInput} from './types.ts';
export function strictRecord(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Revisa los datos de la inmobiliaria.');
 const record=value as Record<string,unknown>;
 if(Object.keys(record).some(key=>!keys.includes(key)))throw Error('Revisa los campos de la inmobiliaria.');
 return record;
}
export function agencyField(value:unknown,min:number,max:number,label:string):string{
 if(typeof value!=='string'||value.includes('\0')||value.trim().length<min||value.trim().length>max)throw Error(`Revisa ${label}.`);
 return value.trim();
}
function references(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>5)throw Error('Revisa las referencias privadas.');
 return value.map(v=>agencyField(v,1,500,'las referencias privadas'));
}
export function normalizeAgencyApplication(input:unknown):AgencyApplicationInput{
 const v=strictRecord(input,['tradeName','responsibleFullName','businessPhone','province','municipality','serviceAreas','description','officeAddress','publishOfficeAddress','evidenceReferences']);
 const phone=agencyField(v.businessPhone,9,30,'el teléfono comercial').replace(/[\s()-]/g,'');
 if(!/^\+\d{8,15}$/.test(phone))throw Error('Revisa el teléfono comercial.');
 if(!isProvince(v.province))throw Error('Revisa la provincia.');
 if(!Array.isArray(v.serviceAreas)||v.serviceAreas.length<1||v.serviceAreas.length>20)throw Error('Revisa las zonas de servicio.');
 const zones=v.serviceAreas.map(x=>agencyField(x,2,80,'las zonas de servicio'));
 if(new Set(zones.map(x=>x.toLocaleLowerCase('es'))).size!==zones.length)throw Error('Revisa las zonas repetidas.');
 if(typeof v.publishOfficeAddress!=='boolean')throw Error('Revisa la privacidad de la oficina.');
 const address=v.officeAddress===null?null:agencyField(v.officeAddress,0,200,'la oficina')||null;
 if(v.publishOfficeAddress&&!address)throw Error('Revisa la dirección de la oficina.');
 return {tradeName:agencyField(v.tradeName,2,120,'el nombre comercial'),responsibleFullName:agencyField(v.responsibleFullName,2,160,'el responsable'),businessPhone:phone,province:v.province,municipality:agencyField(v.municipality,2,80,'el municipio'),serviceAreas:zones,description:agencyField(v.description,20,1000,'la descripción'),officeAddress:address,publishOfficeAddress:v.publishOfficeAddress,evidenceReferences:references(v.evidenceReferences)};
}
export function normalizeAgencyVerificationRequest(input:unknown):AgencyVerificationRequestInput{
 const v=strictRecord(input,['message','evidenceReferences']);
 return {message:agencyField(v.message,20,1000,'la explicación'),evidenceReferences:references(v.evidenceReferences)};
}
export function canPerformAgencyAction(role:AgencyRole,action:AgencyAction):boolean{
 if(!['manager','coordinator','admin'].includes(role))return false;
 if(action==='manage_deal')return true;
 if(action==='coordinate')return role==='coordinator'||role==='admin';
 return ['manage_team','manage_property','confirm_sale','request_verification'].includes(action)&&role==='admin';
}
export function agencyError(error:unknown):string{
 const message=error instanceof Error?error.message:String(error);
 if(/ACCOUNT_CHANGED|SESSION_REQUIRED/.test(message))return 'La sesión cambió. Actualiza antes de continuar.';
 if(/KH_AGENCY_DISABLED/.test(message))return 'El espacio de inmobiliarias aún no está habilitado.';
 if(/KH_AGENCY_NOT_APPROVED/.test(message))return 'La inmobiliaria debe ser aprobada por KarmaHouse antes de operar.';
 if(/KH_AGENCY_LAST_ADMIN/.test(message))return 'Debe quedar al menos un administrador activo en la inmobiliaria.';
 if(/CONFLICT|VERSION/.test(message))return 'Los datos cambiaron. Actualiza antes de volver a guardar.';
 if(/ROLE_REQUIRED|MEMBERSHIP_REQUIRED|OWNER_REQUIRED|ADMIN_REQUIRED/.test(message))return 'Tu cuenta no tiene permiso para esta acción.';
 if(/EMAIL_UNCONFIRMED/.test(message))return 'Confirma el correo antes de continuar.';
 return /^(Revisa|Selecciona|Completa) /.test(message)?message:'No se pudo completar la acción. Actualiza y vuelve a intentar.';
}
