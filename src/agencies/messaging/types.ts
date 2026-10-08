import type { MessagingRequestContext, ReportReason } from '../../messaging/types';
import type { AgencyRequestContext, Page } from '../types';
export type AgencyConversationContext = MessagingRequestContext | AgencyRequestContext;
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
}
export interface AgencyMessage {
    id: string;
    conversationId: string;
    seq: number;
    clientMessageId: string;
    senderId: string | null;
    body: string;
    createdAt: string;
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
    report(input: {
        conversationId: string;
        reportedUserId: string;
        reason: ReportReason;
        details: string;
        clientRequestId: string;
    }, context: AgencyConversationContext): Promise<void>;
}
