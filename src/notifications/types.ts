import type { MessagingRequestContext } from '../messaging/types.ts';

export type NotificationCategory = 'message' | 'visit' | 'offer';
export interface AppNotification {
  id: string;
  seq: string;
  recipientId: string;
  category: NotificationCategory;
  conversationId: string;
  messageId: string;
  negotiationId: string | null;
  actorId: string;
  actorName: string;
  propertyTitle: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}
export interface NotificationPreferences {
  messages: boolean;
  visits: boolean;
  offers: boolean;
  version: number;
}
export interface NotificationSummary { unreadCount: number; readThrough: string }
export interface NotificationPage extends NotificationSummary {
  items: AppNotification[];
  nextCursor: string | null;
}
export interface NotificationListOptions {
  beforeSeq?: string;
  unreadOnly?: boolean;
  category?: NotificationCategory;
}
export interface SaveNotificationPreferencesInput {
  messages: boolean;
  visits: boolean;
  offers: boolean;
  expectedVersion: number;
}
export interface NotificationRepository {
  summary(context: MessagingRequestContext): Promise<NotificationSummary>;
  list(options: NotificationListOptions, context: MessagingRequestContext): Promise<NotificationPage>;
  markRead(id: string, context: MessagingRequestContext): Promise<{ unreadCount: number }>;
  markAllRead(readThrough: string, context: MessagingRequestContext): Promise<{ unreadCount: number }>;
  preferences(context: MessagingRequestContext): Promise<NotificationPreferences>;
  savePreferences(input: SaveNotificationPreferencesInput, context: MessagingRequestContext): Promise<NotificationPreferences>;
}
