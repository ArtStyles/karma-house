import type {RemotePropertyRow} from '../data/remoteMapping.ts';
import type {MessagingRequestContext} from '../messaging/types.ts';
export type TransferState='pending'|'accepted'|'rejected'|'cancelled'|'expired'|'invalidated';
export interface TransferItem {propertyId:string;expectedPropertyVersion:number;expectedProvenanceVersion:number;sourceManagerId:string;snapshot:RemotePropertyRow}
export interface PropertyVersion {propertyId:string;version:number}
export interface TransferRequest {id:string;requestVersion:number;state:TransferState;effectiveState:TransferState;expiresAt:string;createdAt:string;sourceManagerId:string;recipient:{id:string;displayName:string};items:TransferItem[];canAccept:boolean;canReject:boolean;canCancel:boolean;reasonCode:string|null;resultPropertyVersions:PropertyVersion[]|null}
export interface OfferTransferInput {clientRequestId:string;collaboratorId:string;expectedCollaboratorVersion:number;recipientId:string;items:{propertyId:string;expectedVersion:number;expectedProvenanceVersion:number}[]}
export interface DecideTransferInput {requestId:string;expectedRequestVersion:number;clientRequestId:string;decision:'accept'|'reject'|'cancel'}
export interface TransferDecision {requestId:string;state:TransferState;requestVersion:number;reasonCode:string|null;propertyVersions:PropertyVersion[]}
export interface TransferPage {items:TransferRequest[];hasMore:boolean}
export interface ListingTransferRepository {list(scope:'incoming'|'outgoing',offset:number,context:MessagingRequestContext):Promise<TransferPage>;get(id:string,context:MessagingRequestContext):Promise<TransferRequest>;offer(input:OfferTransferInput,context:MessagingRequestContext):Promise<TransferRequest>;decide(input:DecideTransferInput,context:MessagingRequestContext):Promise<TransferDecision>}
