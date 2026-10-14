import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeBump, decodeProStatus, decodeRedeem, normalizeProCode, type ProBumpResult, type ProRedeemResult, type ProStatus } from './domain.ts';

/** The supplied identity is pinned for every call, as in src/data/propertyReports.ts. */
export function createProRepository(client: SupabaseClient, credentials: { actorId: string; accessToken: string }) {
  const { actorId, accessToken } = credentials;
  async function call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const request = client.rpc(name, { p_actor_id: actorId, ...args }).setHeader('Authorization', `Bearer ${accessToken}`);
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    if (error) throw error;
    return data;
  }
  return {
    status: async (signal?: AbortSignal): Promise<ProStatus> => decodeProStatus(await call('kh_pro_status', {}, signal)),
    redeem: async (code: string, agencyId: string | null): Promise<ProRedeemResult> =>
      decodeRedeem(await call('kh_redeem_pro_code', { p_code: normalizeProCode(code), p_agency_id: agencyId })),
    bump: async (propertyId: string): Promise<ProBumpResult> => decodeBump(await call('kh_bump_property', { p_property_id: propertyId })),
  };
}
export type ProRepository = ReturnType<typeof createProRepository>;

/** Public badge: works signed out, so it never sends a session. */
export async function readProBadge(client: SupabaseClient, userId: string, signal: AbortSignal): Promise<boolean> {
  const { data, error } = await client.rpc('kh_pro_badge', { p_user_id: userId }).abortSignal(signal);
  if (error) throw error;
  return data === true;
}
