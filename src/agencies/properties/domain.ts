import { isUuid } from '../../messaging/domain.ts';
import type { AgencyMandateRequest, PropertyChangeRequest, DuplicateCandidate } from './types.ts';
export const invalidPropertyRequest = () => Error('No se pudieron interpretar los datos de la solicitud.');
function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw invalidPropertyRequest(); return v as Record<string, unknown>; }
function uuid(v: unknown) { if (!isUuid(v))
    throw invalidPropertyRequest(); return v; }
function version(v: unknown) { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1)
    throw invalidPropertyRequest(); return v; }
function text(v: unknown, max = 120) { if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw invalidPropertyRequest(); return v; }
function boolean(v: unknown) { if (typeof v !== 'boolean')
    throw invalidPropertyRequest(); return v; }
function base(value: unknown) { const v = object(value); if (!['pending', 'accepted', 'rejected', 'withdrawn'].includes(String(v.state)))
    throw invalidPropertyRequest(); return { id: uuid(v.id), propertyId: uuid(v.propertyId), agencyId: uuid(v.agencyId), agencyName: text(v.agencyName), state: v.state as AgencyMandateRequest['state'], version: version(v.version), canDecide: boolean(v.canDecide) }; }
export function decodeMandate(value: unknown): AgencyMandateRequest { const v = object(value); return { ...base(v), canWithdraw: boolean(v.canWithdraw), ...(v.internalReference === undefined ? {} : { internalReference: text(v.internalReference, 100) }), ...(v.mandateVersion === undefined || v.mandateVersion === null ? {} : { mandateVersion: version(v.mandateVersion) }) }; }
export function decodePropertyChange(value: unknown): PropertyChangeRequest { const v = object(value); if (!['price', 'content'].includes(String(v.kind)))
    throw invalidPropertyRequest(); return { ...base(v), kind: v.kind as 'price' | 'content', proposedPayload: object(v.proposedPayload), expectedPropertyVersion: version(v.expectedPropertyVersion) }; }
export function decodeDuplicateCandidate(value: unknown): DuplicateCandidate { const v = object(value); return { id: uuid(v.id), title: text(v.title), location: text(v.location), version: version(v.version) }; }
export function sharedPropertyId(value:string):string{
 const raw=value.trim();if(isUuid(raw))return raw;
 const invalid=()=>Error('Introduce el UUID o el enlace público de la vivienda.');
 let url:URL;try{url=new URL(raw)}catch{throw invalid()}
 if(url.username||url.password||url.search||url.hash||url.port)throw invalid();
 const path=url.protocol==='karmahouse:'&&url.hostname==='property'?url.pathname.match(/^\/([0-9a-f-]+)\/?$/i):url.protocol==='https:'&&url.hostname==='karmahouse.vercel.app'?url.pathname.match(/^\/(?:p|property)\/([0-9a-f-]+)\/?$/i):null;
 if(!path||!isUuid(path[1]))throw invalid();return path[1];
}
export function decodeCurrentMandate(value:unknown):import('./types.ts').CurrentAgencyMandate{const v=object(value);return {propertyId:uuid(v.propertyId),agencyId:uuid(v.agencyId),agencyName:text(v.agencyName),version:version(v.version),...(v.internalReference===undefined?{}:{internalReference:text(v.internalReference,100)})}}

export async function resolvePropertyAliases(ids:string[],resolve:(id:string)=>Promise<unknown>,checkpoint:()=>void):Promise<string[]>{
 checkpoint();
 const canonical=await Promise.all(ids.map(async id=>{if(!isUuid(id))throw Error('El enlace de vivienda no es válido.');const resolved=await resolve(id);checkpoint();if(!isUuid(resolved))throw Error('El servidor devolvió un enlace de vivienda no válido.');return resolved}));
 return [...new Set(canonical)];
}
