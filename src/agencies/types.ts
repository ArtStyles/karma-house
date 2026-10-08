import type { MessagingRequestContext } from '../messaging/types';
export type AgencyState='pending'|'needs_changes'|'approved'|'rejected'|'suspended';
export type AgencyRole='manager'|'coordinator'|'admin';
export type AgencyVerificationRequestState='pending'|'needs_changes'|'approved'|'rejected'|'cancelled';
export type AgencyPublicationPolicy='requires_review'|'direct';
export type MandateState='active'|'withdrawn';
export type DealStage='inquiry'|'visit_proposed'|'visit_confirmed'|'visited'|'offer'|'won'|'lost';
export interface Page<T>{items:T[];hasMore:boolean}
export interface AgencyRequestContext extends MessagingRequestContext {agencyId:string;generation:number}
export interface AgencyApplicationInput {tradeName:string;responsibleFullName:string;businessPhone:string;province:string;municipality:string;serviceAreas:string[];description:string;officeAddress:string|null;publishOfficeAddress:boolean;evidenceReferences:string[]}
export interface AgencyVerificationRequestInput {message:string;evidenceReferences:string[]}
export interface AgencySummary {id:string;tradeName:string;state:AgencyState;version:number;logoPath:string|null;verified:boolean;verificationVersion:number}
export interface AgencyApplication {agency:AgencySummary;input:AgencyApplicationInput;reviewNote:string|null;emailConfirmed:boolean}
export interface AgencyMembership {agencyId:string;userId:string;role:AgencyRole;state:'active'|'removed';version:number}
export interface AgencyInvitation {id:string;agencyId:string;recipientId:string;role:AgencyRole;state:'pending'|'accepted'|'declined'|'cancelled'|'expired';version:number;expiresAt:string}
export interface AgencyVerificationRequest {id:string;agencyId:string;input:AgencyVerificationRequestInput;state:AgencyVerificationRequestState;reviewNote:string|null;version:number;createdAt:string;reviewedAt:string|null}
export type AgencyAction='manage_deal'|'coordinate'|'manage_team'|'manage_property'|'confirm_sale'|'request_verification';
