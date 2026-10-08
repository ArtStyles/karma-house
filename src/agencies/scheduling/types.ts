import type { NegotiationStatus } from '../../negotiations/types.ts';
import type { AgencyRequestContext, Page } from '../types.ts';
import type { AgencyConversationContext } from '../messaging/types.ts';
export interface AgencyProposal {
    id: string;
    dealId: string;
    kind: 'visit' | 'offer';
    status: NegotiationStatus;
    version: number;
    createdBy: string;
    amountUsd: number | null;
    visitAt: string | null;
    durationMinutes: number | null;
    note: string;
    parentId: string | null;
    expiresAt: string;
    closedReason: string | null;
}
export interface AgencyVisit {
    proposalId: string;
    propertyId: string;
    assigneeId: string | null;
    startsAt: string;
    endsAt: string;
    outcome: 'unrecorded' | 'performed' | 'no_show' | 'cancelled';
    version: number;
}
export interface ExternalResponse {
    channel: 'phone' | 'in_person' | 'whatsapp' | 'other';
    reference: string;
}
export interface AgencyProposalEvent {
    id: string;
    proposalId: string;
    actorId: string | null;
    party: 'team' | 'buyer' | 'system';
    action: string;
    responseSource: 'digital' | 'manual' | 'system';
    externalResponse: ExternalResponse | null;
    createdAt: string;
}
export interface AgencyCalendarVisit extends AgencyVisit {
    dealId: string;
    agencyId: string;
    buyerId: string | null;
    contactName: string;
    assigneeName: string;
    propertyTitle: string;
    existingConflict: boolean;
}
export interface BusyInterval {
    startsAt: string;
    endsAt: string;
}
export interface AgencyReservation {
    id: string;
    propertyId: string;
    agencyId: string;
    expiresAt: string;
    releasedAt: string | null;
    version: number;
    active: boolean;
}
export interface JointVisitSlot extends BusyInterval {
    id: string;
    propertyId: string;
    token: string;
}
export interface CreateAgencyProposal {
    dealId: string;
    kind: 'visit' | 'offer';
    note: string;
    clientRequestId: string;
    amountUsd?: string;
    visitDate?: string;
    visitTime?: string;
    durationMinutes?: number;
    replacesId?: string;
    expectedVersion?: number;
    externalResponse?: ExternalResponse;
}
export interface RespondAgencyProposal {
    proposalId: string;
    action: 'accept' | 'decline' | 'cancel';
    expectedVersion: number;
    clientRequestId: string;
    externalResponse?: ExternalResponse;
    jointVisitToken?: string;
}
export interface RecordVisitOutcome {
    proposalId: string;
    outcome: Exclude<AgencyVisit['outcome'], 'unrecorded'>;
    expectedVersion: number;
    clientRequestId: string;
}
export interface AgencySchedulingRepository {
    list(dealId: string, offset: number, context: AgencyConversationContext): Promise<Page<AgencyProposal>>;
    events(proposalId: string, offset: number, context: AgencyConversationContext): Promise<Page<AgencyProposalEvent>>;
    create(input: CreateAgencyProposal, context: AgencyConversationContext): Promise<AgencyProposal>;
    respond(input: RespondAgencyProposal, context: AgencyConversationContext): Promise<AgencyProposal>;
    recordOutcome(input: RecordVisitOutcome, context: AgencyRequestContext): Promise<AgencyVisit>;
    calendar(from: string, to: string, offset: number, context: AgencyRequestContext): Promise<Page<AgencyCalendarVisit>>;
    occupancy(propertyId: string, from: string, to: string, context: AgencyRequestContext): Promise<BusyInterval[]>;
    reservation(propertyId: string, context: AgencyRequestContext): Promise<AgencyReservation | null>;
    setReservation(input: {
        propertyId: string;
        expiresAt: string;
        clientRequestId: string;
    }, context: AgencyRequestContext): Promise<AgencyReservation>;
    releaseReservation(input: {
        reservationId: string;
        expectedVersion: number;
        clientRequestId: string;
    }, context: AgencyRequestContext): Promise<AgencyReservation>;
    createJointSlot(input: {
        propertyId: string;
        visitDate: string;
        visitTime: string;
        durationMinutes?: number;
        clientRequestId: string;
    }, context: AgencyRequestContext): Promise<JointVisitSlot>;
    joinJointSlot(input: Omit<RespondAgencyProposal, 'action'> & {
        jointVisitToken: string;
    }, context: AgencyRequestContext): Promise<AgencyProposal>;
}
