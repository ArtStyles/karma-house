import type { MessagingRequestContext } from '../../messaging/types';
import type { Listing, ListingDraft } from '../../domain/listings';
import type { AgencyPublicationPolicy, AgencyRequestContext, MandateState, Page } from '../types';
export interface AgencyProperty {
    property: Listing;
    originAgencyId: string | null;
    authorityVersion: number;
    cycleId: string;
    mandate: {
        agencyId: string;
        state: MandateState;
        version: number;
        reference: string;
    };
    canEditCommon: boolean;
    canConfirmSale: boolean;
    publicationPolicy: AgencyPublicationPolicy;
    moderationHold: boolean;
}
export interface AgencyPropertyMatches {items:DuplicateCandidate[];review:Record<string,unknown>}
export interface AgencyPropertySaveInput {
    duplicateDecision?:Record<string,unknown>;
    draft: ListingDraft;
    publicationIntent: 'draft' | 'submit';
    propertyId?: string;
    expectedVersion?: number;
    sourceReference: string;
    consentReference: string;
    clientRequestId: string;
}
export interface AgencyMandateRequest {
    id: string;
    propertyId: string;
    agencyId: string;
    agencyName: string;
    state: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
    version: number;
    canDecide: boolean;
    canWithdraw: boolean;
    internalReference?: string;
    mandateVersion?: number;
}
export interface PropertyChangeRequest {
    id: string;
    propertyId: string;
    agencyId: string;
    agencyName: string;
    kind: 'content' | 'price';
    proposedPayload: Record<string, unknown>;
    expectedPropertyVersion: number;
    state: AgencyMandateRequest['state'];
    version: number;
    canDecide: boolean;
}
export interface PropertyRequestDecision {
    requestId: string;
    expectedVersion: number;
    decision: 'accept' | 'reject';
    clientRequestId: string;
}
export interface MandateWithdrawal {
    propertyId: string;
    requestingAgencyId: string;
    expectedVersion: number;
    requestId?: string;
    clientRequestId: string;
}
export interface DuplicateCandidate {
    id: string;
    title: string;
    location: string;
    version: number;
}
export interface MergePropertyDuplicates {
    canonicalId: string;
    duplicateIds: string[];
    expectedVersions: Record<string, number>;
    originEvidence: string;
    reason: string;
    clientRequestId: string;
}
export interface AgencyPropertyRepository {
    findMatches(input:{draft:ListingDraft;propertyId?:string;clientRequestId:string},context:AgencyRequestContext):Promise<AgencyPropertyMatches>;
    listAuthorizations(offset:number,context:AgencyRequestContext):Promise<Page<CurrentAgencyMandate>>;
    listPersonalAuthorizations(offset:number,context:MessagingRequestContext):Promise<Page<CurrentAgencyMandate>>;
    list(offset: number, context: AgencyRequestContext): Promise<Page<AgencyProperty>>;
    get(propertyId: string, context: AgencyRequestContext): Promise<AgencyProperty>;
    save(input: AgencyPropertySaveInput, context: AgencyRequestContext): Promise<AgencyProperty>;
    listMandates(offset: number, context: AgencyRequestContext): Promise<Page<AgencyMandateRequest>>;
    listPersonalMandates(offset: number, context: MessagingRequestContext): Promise<Page<AgencyMandateRequest>>;
    requestMandate(input: {
        propertyId: string;
        internalReference: string;
        clientRequestId: string;
    }, context: AgencyRequestContext): Promise<AgencyMandateRequest>;
    decideMandate(input: PropertyRequestDecision, context: AgencyRequestContext): Promise<AgencyMandateRequest>;
    decidePersonalMandate(input: PropertyRequestDecision, context: MessagingRequestContext): Promise<AgencyMandateRequest>;
    withdrawMandate(input: MandateWithdrawal, context: AgencyRequestContext): Promise<void>;
    withdrawPersonalMandate(input: MandateWithdrawal, context: MessagingRequestContext): Promise<void>;
    listChanges(offset: number, context: AgencyRequestContext): Promise<Page<PropertyChangeRequest>>;
    listPersonalChanges(offset: number, context: MessagingRequestContext): Promise<Page<PropertyChangeRequest>>;
    proposeChange(input: {
        propertyId: string;
        kind: 'content' | 'price';
        proposedPayload: Record<string, unknown>;
        expectedPropertyVersion: number;
        clientRequestId: string;
    }, context: AgencyRequestContext): Promise<PropertyChangeRequest>;
    decideChange(input: PropertyRequestDecision, context: AgencyRequestContext): Promise<PropertyChangeRequest>;
    decidePersonalChange(input: PropertyRequestDecision, context: MessagingRequestContext): Promise<PropertyChangeRequest>;
    duplicateCandidates(id: string, offset: number, context: MessagingRequestContext): Promise<Page<DuplicateCandidate> & {
        canonical: DuplicateCandidate;
    }>;
    mergeDuplicates(input: MergePropertyDuplicates, context: MessagingRequestContext): Promise<void>;
}

export interface CurrentAgencyMandate {propertyId:string;agencyId:string;agencyName:string;version:number;internalReference?:string}
