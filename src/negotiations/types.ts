import type { MessagingRequestContext } from '../messaging/types.ts';

export type NegotiationKind = 'visit' | 'offer';
export type NegotiationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'superseded' | 'expired';
export type NegotiationAction = 'accept' | 'decline' | 'cancel';
export interface Negotiation {
  id: string;
  conversationId: string;
  propertyId: string;
  propertyTitle: string;
  propertyLocation: string;
  buyerId: string;
  sellerId: string;
  createdBy: string;
  kind: NegotiationKind;
  status: NegotiationStatus;
  version: number;
  amountUsd: number | null;
  visitDate: string | null;
  visitTime: string | null;
  visitAt: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
  parentId: string | null;
  expiresAt: string;
  /** Whether the conversation currently permits accept/decline/counterproposal. Cancellation is separate. */
  canAct: boolean;
}
export interface CreateNegotiationInput {
  conversationId: string;
  kind: NegotiationKind;
  clientRequestId: string;
  note: string;
  amountUsd?: string;
  visitDate?: string;
  visitTime?: string;
  replacesId?: string;
  expectedVersion?: number;
}
export interface RespondNegotiationInput {
  id: string;
  action: NegotiationAction;
  expectedVersion: number;
  clientRequestId: string;
}
export interface NegotiationListOptions { conversationId?: string; pendingOnly?: boolean; offset: number }
export interface NegotiationRepository {
  list(options: NegotiationListOptions, context: MessagingRequestContext): Promise<Negotiation[]>;
  create(input: CreateNegotiationInput, context: MessagingRequestContext): Promise<Negotiation>;
  respond(input: RespondNegotiationInput, context: MessagingRequestContext): Promise<Negotiation>;
}
