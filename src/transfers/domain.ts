import {isUuid} from '../messaging/domain.ts';import {mapRemoteListing,type RemotePropertyRow} from '../data/remoteMapping.ts';
import {assistedError} from '../assisted/domain.ts';import type {OfferTransferInput,TransferRequest,TransferState,TransferDecision,PropertyVersion} from './types.ts';
const states:TransferState[]=['pending','accepted','rejected','cancelled','expired','invalidated'];
const invalid=()=>new Error('No se pudo interpretar la solicitud. Actualiza y vuelve a intentar.');
const record=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw invalid();return v as Record<string,unknown>;};
const uuid=(v:unknown):string=>{if(!isUuid(v))throw invalid();return v;};
const version=(v:unknown):number=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1)throw invalid();return v;};
const state=(v:unknown):TransferState=>{if(!states.includes(v as TransferState))throw invalid();return v as TransferState;};
const date=(v:unknown):string=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw invalid();return v;};
const bool=(v:unknown):boolean=>{if(typeof v!=='boolean')throw invalid();return v;};
function versions(v:unknown):PropertyVersion[]{if(!Array.isArray(v)||v.length>20)throw invalid();const result=v.map(x=>{const r=record(x);return {propertyId:uuid(r.propertyId),version:version(r.version)};});if(new Set(result.map(x=>x.propertyId)).size!==result.length)throw invalid();return result;}
export function validateOffer(input:OfferTransferInput):OfferTransferInput {
 uuid(input.clientRequestId);uuid(input.collaboratorId);uuid(input.recipientId);version(input.expectedCollaboratorVersion);
 if(!Array.isArray(input.items)||input.items.length<1||input.items.length>20||new Set(input.items.map(x=>x.propertyId)).size!==input.items.length)throw Error('Selecciona entre 1 y 20 anuncios diferentes de un mismo colaborador.');
 input.items.forEach(item=>{uuid(item.propertyId);version(item.expectedVersion);version(item.expectedProvenanceVersion);});return input;
}
export function decodeTransferRequest(value:unknown):TransferRequest {
 const r=record(value),recipient=record(r.recipient);const source=uuid(r.sourceManagerId);
 if(typeof recipient.displayName!=='string'||recipient.displayName.length>80||!Array.isArray(r.items)||r.items.length<1||r.items.length>20)throw invalid();
 const items=r.items.map(value=>{const i=record(value),snapshot=record(i.snapshot) as unknown as RemotePropertyRow;mapRemoteListing(snapshot,new Map());const propertyId=uuid(i.propertyId);if(snapshot.id!==propertyId||snapshot.owner_id!==source||uuid(i.sourceManagerId)!==source||snapshot.version!==version(i.expectedPropertyVersion))throw invalid();return {propertyId,expectedPropertyVersion:version(i.expectedPropertyVersion),expectedProvenanceVersion:version(i.expectedProvenanceVersion),sourceManagerId:source,snapshot};});
 if(new Set(items.map(x=>x.propertyId)).size!==items.length)throw invalid();
 return {id:uuid(r.id),requestVersion:version(r.requestVersion),state:state(r.state),effectiveState:state(r.effectiveState),expiresAt:date(r.expiresAt),createdAt:date(r.createdAt),sourceManagerId:source,recipient:{id:uuid(recipient.id),displayName:recipient.displayName},items,canAccept:bool(r.canAccept),canReject:bool(r.canReject),canCancel:bool(r.canCancel),reasonCode:typeof r.reasonCode==='string'?r.reasonCode:null,resultPropertyVersions:r.resultPropertyVersions==null?null:versions(r.resultPropertyVersions)};
}
export function decodeTransferDecision(value:unknown):TransferDecision {const r=record(value);return {requestId:uuid(r.requestId),requestVersion:version(r.requestVersion),state:state(r.state),reasonCode:typeof r.reasonCode==='string'?r.reasonCode:null,propertyVersions:versions(r.propertyVersions)};}
export function transferError(error:unknown):string {
 const m=error instanceof Error?error.message:String((error as {message?:unknown})?.message??'');
 if(/KH_CHAT_MANAGER_CHANGED/.test(m))return 'El responsable del anuncio cambió. Actualiza la ficha y vuelve a tocar Contactar.';
 if(/KH_TRANSFERS_DISABLED/.test(m))return 'Los traspasos todavía no están habilitados.';
 if(/KH_TRANSFER_MEDIA_MISSING/.test(m))return 'Falta una imagen del lote. No cambió ningún gestor. KarmaHouse debe recuperar el archivo antes de reintentar.';
 if(/KH_TRANSFER_(STALE|EXPIRED|RECIPIENT_CHANGED|INELIGIBLE)|KH_VERSION_CONFLICT/.test(m))return 'El lote cambió o venció. Actualiza la solicitud; hará falta una oferta nueva si ya no es válida.';
 if(/KH_TRANSFER_ALREADY_PENDING/.test(m))return 'Uno de los anuncios ya tiene una solicitud pendiente.';
 if(/KH_TRANSFER_NOT_FOUND/.test(m))return 'Esta solicitud no está disponible para tu cuenta.';
 if(/KH_TRANSFER_DECISION_CONFLICT/.test(m))return 'Esta acción ya tiene otro resultado. Actualiza para comprobarlo.';
 if(/KH_TRANSFER_INVALID/.test(m))return 'Revisa el destinatario y selecciona de 1 a 20 anuncios del mismo colaborador.';
 if(/network|fetch|timeout|tiempo|conexi/i.test(m))return 'No pudimos confirmar el resultado. Actualiza o repite la misma acción; se conservará su identificador.';
 return assistedError(error);
}
export const transferStateLabel:Record<TransferState,string>={pending:'Por aceptar',accepted:'Aceptado',rejected:'Rechazado',cancelled:'Cancelado',expired:'Vencido',invalidated:'Ya no es válido'};
