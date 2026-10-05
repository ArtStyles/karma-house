import { isUuid } from '../messaging/domain.ts';
import type { AssistedCollaboratorInput, AssistedProvenance } from './types.ts';
const field=(value:unknown,min:number,max:number,label:string)=>{
  if(typeof value!=='string'||value.trim().length<min||value.trim().length>max||value.includes('\0')) throw new Error(`Revisa ${label}.`);
  return value.trim();
};
export function validateCollaborator(input:AssistedCollaboratorInput):AssistedCollaboratorInput {
  if(!['owner','manager','agency'].includes(input.kind)) throw new Error('Elige el tipo de colaborador.');
  const accountId=input.accountId||null;
  if(accountId && (!isUuid(accountId)||!input.linkEvidenceReference?.trim())) throw new Error('Registra la confirmación de la cuenta por el canal conocido.');
  return {...input,privateName:field(input.privateName,2,120,'el nombre privado'),privateContact:field(input.privateContact,1,200,'el contacto privado'),contactChannel:field(input.contactChannel,1,40,'el canal'),accountId,linkEvidenceReference:accountId?field(input.linkEvidenceReference,1,500,'la confirmación'):undefined};
}
export function validateProvenance(input:AssistedProvenance,now=Date.now()):AssistedProvenance {
  if(!isUuid(input.collaboratorId)) throw new Error('Selecciona el colaborador.');
  for(const key of ['receivedAt','consentAt','lastConfirmedAt'] as const) if(!Number.isFinite(Date.parse(input[key]))||Date.parse(input[key])>now) throw new Error('Revisa la fecha de recepción, autorización y confirmación.');
  return {...input,collaboratorReference:field(input.collaboratorReference,1,100,'la referencia del anuncio'),sourceChannel:field(input.sourceChannel,1,40,'el canal del material'),consentText:field(input.consentText,20,2000,'la autorización'),consentVersion:field(input.consentVersion,1,100,'la versión de autorización'),evidenceReference:field(input.evidenceReference,1,500,'la referencia privada del permiso')};
}
export function assistedError(error:unknown):string {
  const message=error instanceof Error?error.message:String((error as {message?:string})?.message??'');
  if(/KH_OFFICIAL_ACCOUNT_REQUIRED/.test(message)) return 'Solo la cuenta principal oficial de KarmaHouse puede preparar y ofrecer estos traspasos.';
  if(/KH_PROPERTY_MANAGEMENT_CHANGED/.test(message)) return 'La gestión de este anuncio cambió. Actualiza Mis anuncios antes de continuar.';
  if(/ACCOUNT_CHANGED|SESSION_REQUIRED/.test(message)) return 'La sesión cambió. Vuelve a iniciar sesión con la cuenta correcta.';
  if(/VERSION_CONFLICT|ASSISTED_CONFLICT/.test(message)) return 'Estos datos cambiaron. Actualiza antes de guardar.';
  if(/ASSISTED_INVALID|ASSISTED_CONSENT/.test(message)) return 'Completa la autorización, la referencia y la confirmación del anuncio.';
  if(/ACCOUNT_SUSPENDED|ACCOUNT_DELETING|RECIPIENT_INVALID/.test(message)) return 'La cuenta destinataria debe estar confirmada y activa.';
  return message.startsWith('Revisa ')||message.startsWith('Registra ')||message.startsWith('Selecciona ')?message:'No se pudo completar la gestión. Actualiza y vuelve a intentar.';
}
