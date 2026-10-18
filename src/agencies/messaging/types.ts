import type { MessagingRequestContext, ReportReason } from '../../messaging/types';
import type { AgencyRequestContext, AgencyRole, Page } from '../types';
export type AgencyConversationContext = MessagingRequestContext | AgencyRequestContext;
/** client, supervisor (admin or coordinator), lead (the responsable) or attendant (added to this conversation). */
export type AgencyConversationRole = 'client' | 'supervisor' | 'lead' | 'attendant';
export interface AgencyAttendant { userId: string; displayName: string; role: AgencyRole; lead: boolean }
export interface AgencyConversation {
    id: string;
    agencyId: string;
    dealId: string;
    propertyId: string;
    buyerId: string | null;
    canSend: boolean;
    closedReason: string | null;
    lastSeq: number;
    agencyName: string;
    propertyTitle: string;
    assigneeId: string | null;
    dealVersion: number;
    unreadCount: number;
    blockedUserIds: string[];
    role: AgencyConversationRole | null;
    canManage: boolean;
    canSeeDeal: boolean;
    agencyBlocked: boolean;
    /** The team member reading has a personal block on the client, wherever it was made. */
    clientBlockedByMe: boolean;
    buyerName: string | null;
    attendants: AgencyAttendant[];
    lastMessage: { body: string; createdAt: string; fromAgency: boolean } | null;
    lastMessageAt: string | null;
}
export interface AgencyMessage {
    id: string;
    conversationId: string;
    seq: number;
    clientMessageId: string;
    senderId: string | null;
    body: string;
    createdAt: string;
    /** null before the server says which side wrote it. */
    fromAgency: boolean | null;
    senderName: string | null;
    senderRole: AgencyRole | null;
}
export interface PublicAgencyContact {
    agencyId: string;
    tradeName: string;
    verified: boolean;
    isPrincipal?: boolean;
    contactAvailable: boolean;
}
export interface PublicPropertyContact {
    propertyId: string;
    personalContact: boolean;
    agencies: PublicAgencyContact[];
}
export interface AgencyMessagingRepository {
    start(input: {
        propertyId: string;
        agencyId: string;
        preferredManagerId?: string;
        clientRequestId: string;
    }, context: MessagingRequestContext): Promise<AgencyConversation>;
    list(offset: number, context: AgencyConversationContext): Promise<Page<AgencyConversation>>;
    get(id: string, context: AgencyConversationContext): Promise<AgencyConversation>;
    history(id: string, beforeSeq: number | null, context: AgencyConversationContext): Promise<Page<AgencyMessage>>;
    send(input: {
        conversationId: string;
        clientMessageId: string;
        body: string;
    }, context: AgencyConversationContext): Promise<AgencyMessage>;
    markRead(id: string, lastSeq: number, context: AgencyConversationContext): Promise<void>;
    setBlocked(input: {
        conversationId: string;
        otherUserId: string;
        blocked: boolean;
        clientRequestId: string;
    }, context: AgencyConversationContext): Promise<void>;
    setAttendant(input: {
        conversationId: string;
        userId: string;
        attending: boolean;
        clientRequestId: string;
    }, context: AgencyRequestContext): Promise<AgencyConversation>;
    setAgencyBlock(input: {
        conversationId: string;
        agencyId: string;
        blocked: boolean;
        clientRequestId: string;
    }, context: MessagingRequestContext): Promise<AgencyConversation>;
    report(input: {
        conversationId: string;
        /** Omitted by a client: the report names the last team member who wrote. */
        reportedUserId?: string;
        reason: ReportReason;
        details: string;
        clientRequestId: string;
    }, context: AgencyConversationContext): Promise<void>;
}
