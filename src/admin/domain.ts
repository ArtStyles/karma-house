import { isUuid } from '../messaging/domain.ts';

export type AccountRole = 'owner' | 'admin' | 'member';
export type AccountAction = 'suspend' | 'reactivate' | 'grant_admin' | 'revoke_admin';
export type AdminSection = 'accounts' | 'listings' | 'history';
export interface AccountAccess { role: AccountRole; suspended: boolean; reason: string | null }
export interface AdminAccount { id: string; displayName: string; role: AccountRole; suspended: boolean; reason: string | null }
export interface AdminListing { id: string; title: string; ownerId: string; ownerName: string; moderation: string; availability: string; version: number }
export interface AdminEvent { id: string; actorName: string; action: string; targetName: string; reason: string | null; createdAt: string }
export interface AdminPage { items: (AdminAccount | AdminListing | AdminEvent)[]; hasMore: boolean }
export const roleLabel: Record<AccountRole,string> = {owner:'Propietario',admin:'Administrador',member:'Usuario'};
export const actionLabel: Record<AccountAction,string> = {suspend:'Suspender cuenta',reactivate:'Reactivar cuenta',grant_admin:'Dar administración',revoke_admin:'Retirar administración'};
const roles = ['owner','admin','member'];
const record = (value: unknown): value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value);
const text = (value: unknown, max = 1000): value is string => typeof value==='string' && value.length<=max;
const exact = (value: Record<string,unknown>, keys: string[]) => Object.keys(value).length===keys.length && keys.every(key=>key in value);
const invalid = () => new Error('No se pudieron interpretar los datos de administración.');
export function decodeAccess(value: unknown): AccountAccess {
  if (!record(value) || !exact(value,['role','suspended','reason']) || !roles.includes(String(value.role)) || typeof value.suspended!=='boolean'
    || !(value.reason===null || text(value.reason)) || (value.suspended && value.role!=='member')) throw invalid();
  return value as unknown as AccountAccess;
}
export function accountActions(actor: AccountRole,target: AccountRole,suspended: boolean): AccountAction[] {
  if(actor!=='owner' || target==='owner') return [];
  return [suspended?'reactivate':'suspend',...(target==='admin'?['revoke_admin' as const]:suspended?[]:['grant_admin' as const])];
}
export function decodeAdminPage(section: AdminSection,value: unknown): AdminPage {
  if(!record(value) || !Array.isArray(value.items) || value.items.length>51 || typeof value.hasMore!=='boolean') throw invalid();
  for(const row of value.items) {
    if(!record(row)) throw invalid();
    if(section==='accounts') {
      if(!exact(row,['id','displayName','role','suspended','reason']) || !isUuid(row.id) || !text(row.displayName,80) || !roles.includes(String(row.role))
        || typeof row.suspended!=='boolean' || !(row.reason===null || text(row.reason))) throw invalid();
    } else if(section==='listings') {
      if(!exact(row,['id','title','ownerId','ownerName','moderation','availability','version']) || !isUuid(row.id) || !isUuid(row.ownerId)
        || !text(row.title,100) || !text(row.ownerName,80) || !['draft','pending','approved','rejected'].includes(String(row.moderation))
        || !['active','paused','sold'].includes(String(row.availability)) || !Number.isSafeInteger(row.version) || (row.version as number)<1) throw invalid();
    } else if(!exact(row,['id','actorName','action','targetName','reason','createdAt']) || typeof row.id!=='string' || !/^\d+$/.test(row.id)
      || !text(row.actorName,80) || !text(row.action,80) || !text(row.targetName,100) || !(row.reason===null || text(row.reason))
      || typeof row.createdAt!=='string' || !Number.isFinite(Date.parse(row.createdAt))) throw invalid();
  }
  return {items:value.items.slice(0,50) as AdminPage['items'],hasMore:value.hasMore};
}
export function adminError(error: unknown): string {
  const message=error instanceof Error?error.message:record(error)?String(error.message??''):'';
  if(/KH_ACCOUNT_SUSPENDED/.test(message)) return 'Esta cuenta está suspendida. No puede publicar ni enviar mensajes.';
  if(/KH_OWNER_PROTECTED/.test(message)) return 'La cuenta propietaria está protegida.';
  if(/KH_OWNER_REQUIRED/.test(message)) return 'Solo el propietario puede gestionar los permisos y las suspensiones.';
  if(/KH_ADMIN_REQUIRED/.test(message)) return 'Tu cuenta ya no tiene acceso a Administración.';
  if(/KH_ADMIN_STATE_CHANGED|KH_VERSION_CONFLICT/.test(message)) return 'Los datos cambiaron. Actualiza la lista antes de repetir la acción.';
  if(/KH_ACCOUNT_CHANGED/.test(message)) return 'La sesión cambió. Abre esta sección con tu cuenta actual.';
  if(/KH_ADMIN_INVALID/.test(message)) return 'Escribe un motivo de entre 3 y 1000 caracteres.';
  return 'No se pudo completar la gestión. Comprueba la conexión y actualiza la lista.';
}
export function eventLabel(action: string): string {
  if(action in actionLabel) return actionLabel[action as AccountAction];
  if(action.startsWith('property_approved_')) return action.endsWith('_paused')?'Anuncio pausado':'Anuncio publicado';
  if(action.startsWith('property_rejected_')) return 'Anuncio retirado o devuelto';
  if(action.startsWith('property_pending_')) return 'Anuncio enviado a revisión';
  if(action.startsWith('property_draft_')) return 'Borrador guardado';
  return action==='report_reviewed'?'Reporte revisado':action==='verify'?'Perfil verificado':action==='unverify'?'Verificación retirada':'Gestión administrativa';
}
