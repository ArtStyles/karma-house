import type { MessagingRequestContext } from '../messaging/types.ts';

export type KarmaLevel = 'new' | 'active' | 'trusted' | 'featured';
export interface PublicProfile {
  id: string; displayName: string; memberSince: string; verified: boolean; level: KarmaLevel; levelReasons: string[];
  activeListings: string[]; activeListingCount: number; approvedListingCount: number;
  responseMinutes: number | null; responseRate: number | null; visitsAgreed: number; avatarUrlPath: string | null;
}
/** Signed out there is no token: the RPC runs as anon and shows only people with active listings. */
export interface ProfileReadContext { signal: AbortSignal; accessToken?: string | null }
export interface ProfileRepository {
  get(userId: string, context: ProfileReadContext): Promise<PublicProfile>;
  setVerified(userId: string, verified: boolean, note: string, context: Partial<MessagingRequestContext> & Pick<MessagingRequestContext, 'signal' | 'checkpoint'>): Promise<PublicProfile>;
  /** A signed URL for the avatar, or null when it cannot be signed (the screen shows initials). */
  avatarUrl(path: string): Promise<string | null>;
}
