import {normalizeAgencyApplication} from './domain.ts';
import type {AgencyApplicationInput,AgencyRole,AgencyState,AgencyVerificationRequestState} from './types.ts';
import type {AgencyRepository} from './repository.ts';
import type {MessagingRequestContext} from '../messaging/types.ts';
export type RegistrationIntent='personal'|'agency';
export function registrationMetadata(name:string,input?:AgencyApplicationInput){
 const display_name=name.trim();
 return input?{display_name,registration_intent:'agency' as const,agency_application:normalizeAgencyApplication(input)}:{display_name};
}
export function registrationNextRoute({intent,emailConfirmed,applicationState,enabled}:{intent:RegistrationIntent;emailConfirmed:boolean;applicationState:AgencyState|null;enabled:boolean}):'/agency-application'|'/agency-workspace'|'/profile'{
 return intent==='personal'?'/profile':emailConfirmed&&applicationState==='approved'&&enabled?'/agency-workspace':'/agency-application';
}
export async function recoverAgencyRegistration(repository:Pick<AgencyRepository,'application'|'capabilities'>,context:MessagingRequestContext,intent:RegistrationIntent){
 const application=await repository.application(context);context.checkpoint?.();
 if(!application)return registrationNextRoute({intent,emailConfirmed:true,applicationState:null,enabled:false});
 const {enabled}=await repository.capabilities(context);context.checkpoint?.();
 return registrationNextRoute({intent:'agency',emailConfirmed:application.emailConfirmed,applicationState:application.agency.state,enabled});
}
export function canReviewAgency(access:{isOwner:boolean;isAdmin:boolean}){return access.isOwner;}
export function canRequestAgencyVerification(state:AgencyState|null,role:AgencyRole|null,enabled:boolean){return enabled&&state==='approved'&&role==='admin';}
export function agencyVerificationPresentation(verified:boolean,state:AgencyVerificationRequestState|null){
 return {badge:verified,label:verified?'Verificada':state==='pending'?'Solicitud pendiente':state==='needs_changes'?'Necesita correcciones':state==='rejected'?'Solicitud rechazada':'Aún no verificada',publication:verified?'Los anuncios de esta inmobiliaria pueden publicarse directamente.':'Los anuncios requieren aprobación individual de KarmaHouse.'};
}
export function emptyAgencyApplication():AgencyApplicationInput{return {tradeName:'',responsibleFullName:'',businessPhone:'+53',province:'La Habana',municipality:'',serviceAreas:[],description:'',officeAddress:null,publishOfficeAddress:false,evidenceReferences:[]};}
export const agencyStateLabel:Record<AgencyState,string>={pending:'Pendiente de aprobación',needs_changes:'Necesita correcciones',approved:'Aprobada',rejected:'Rechazada',suspended:'Suspendida'};
export type AgencyFieldErrors=Partial<Record<keyof AgencyApplicationInput,string>>;
export function agencyApplicationErrors(input:AgencyApplicationInput):AgencyFieldErrors{
 const errors:AgencyFieldErrors={};
 const rules:[keyof AgencyApplicationInput,boolean,string][]=[['tradeName',input.tradeName.trim().length>=2&&input.tradeName.trim().length<=120,'Entre 2 y 120 caracteres.'],['responsibleFullName',input.responsibleFullName.trim().length>=2&&input.responsibleFullName.trim().length<=160,'Escribe el nombre completo del responsable.'],['businessPhone',/^\+\d{8,15}$/.test(input.businessPhone.replace(/[\s()-]/g,'')),'Incluye el prefijo internacional, por ejemplo +53.'],['municipality',input.municipality.trim().length>=2,'Escribe el municipio.'],['serviceAreas',input.serviceAreas.length>=1&&input.serviceAreas.length<=20,'Indica entre una y veinte zonas.'],['description',input.description.trim().length>=20&&input.description.trim().length<=1000,'Entre 20 y 1000 caracteres.']];
 for(const [key,valid,message]of rules)if(!valid)errors[key]=message;
 try{normalizeAgencyApplication(input);}catch(error){if(!Object.keys(errors).length)errors.description=error instanceof Error?error.message:'Revisa los datos.';}return errors;
}
