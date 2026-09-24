/** The proposal a summary message stands for: `created` is the proposal itself, the rest are answers to it. */
export interface MessageNegotiation {
  id: string; action: 'created' | 'accepted' | 'declined' | 'cancelled'; kind: 'offer' | 'visit'; createdBy: string;
  amountUsd: number | null; visitAt: string | null; note: string; parentId: string | null;
}
export interface ChatMessage { id: string; conversationId: string; seq: number; clientMessageId: string; senderId: string; body: string; createdAt: string; negotiation?: MessageNegotiation | null }
export interface Conversation { id: string; propertyId: string; propertyTitle: string; propertyLocation: string; buyerId: string; sellerId: string; otherUserId: string; otherName: string; lastMessage: string | null; lastMessageAt: string | null; lastSeq: number; unreadCount: number; blockedByMe: boolean; blockedByOther: boolean; canSend: boolean; propertyAvailable: boolean; createdAt: string }
export type ReportReason = 'spam' | 'fraud' | 'harassment' | 'other';
export interface ChatReport { id: string; conversationId: string; propertyTitle: string; reporterId: string; reportedUserId: string; reason: ReportReason; details: string; status: 'open' | 'reviewed'; createdAt: string; reviewNote: string | null; context: ChatMessage[] }
export interface PendingMessage { clientMessageId: string; conversationId: string; senderId: string; body: string; createdAt: string; status: 'sending' | 'failed'; error?: string }
export interface ConversationHistory { messages: ChatMessage[]; hasMore: boolean; loading: boolean; error: string | null }

export interface MessagingContextValue {
  available: boolean; ready: boolean; userId: string | null; conversations: Conversation[];
  unreadCount: number; error: string | null; pending: PendingMessage[];
  histories: Record<string, ConversationHistory>;
  refresh(): Promise<void>;
  startConversation(propertyId: string): Promise<string>;
  openConversation(id: string): Promise<void>;
  loadOlder(id: string): Promise<void>;
  sendMessage(id: string, body: string): Promise<void>;
  retryMessage(clientMessageId: string): Promise<void>;
  discardMessage(clientMessageId: string): Promise<void>;
  markRead(id: string, lastSeq: number): Promise<void>;
  setBlocked(id: string, blocked: boolean): Promise<void>;
  reportConversation(id: string, reason: ReportReason, details: string, clientReportId: string): Promise<void>;
}

export interface MessagingRequestContext {
  userId: string;
  accessToken: string;
  signal: AbortSignal;
  checkpoint(): void;
}

export interface MessagingRepository {
  listConversations(context: MessagingRequestContext): Promise<Conversation[]>;
  startConversation(propertyId: string, context: MessagingRequestContext): Promise<Conversation>;
  getConversation(id: string, context: MessagingRequestContext): Promise<Conversation>;
  listMessages(id: string, beforeSeq: number | null, context: MessagingRequestContext): Promise<ChatMessage[]>;
  sendMessage(message: PendingMessage, context: MessagingRequestContext): Promise<ChatMessage>;
  findSentMessages(clientMessageIds: string[], context: MessagingRequestContext): Promise<ChatMessage[]>;
  markRead(id: string, lastSeq: number, context: MessagingRequestContext): Promise<void>;
  setBlocked(otherUserId: string, blocked: boolean, context: MessagingRequestContext): Promise<void>;
  reportConversation(id: string, reason: ReportReason, details: string, clientReportId: string, context: MessagingRequestContext): Promise<void>;
}

export interface MessagingStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
