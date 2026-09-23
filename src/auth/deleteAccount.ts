import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKETS = ['property-photos', 'account-avatars'] as const;
const failure = () => new Error('No pudimos terminar de eliminar tu cuenta. Comprueba tu conexión y vuelve a intentarlo; lo que ya se borró no se recupera.');

/**
 * Server first removes the listings and returns the account's files, the client deletes those through
 * the Storage API (SQL cannot), and only then the server deletes the account. Every step can be retried.
 * `checkpoint` throws when the signed-in account changed mid-way, so nothing runs for the wrong person.
 */
export async function deleteAccount(client: SupabaseClient, actor: { id: string; accessToken: string }, checkpoint: () => void): Promise<void> {
  const rpc = async (name: string) => {
    checkpoint();
    const { data, error } = await client.rpc(name, { p_actor_id: actor.id }).setHeader('Authorization', `Bearer ${actor.accessToken}`);
    checkpoint();
    if (error) throw failure();
    return data as unknown;
  };
  const files = await rpc('kh_begin_account_deletion');
  for (const bucket of BUCKETS) {
    const names = files && typeof files === 'object' ? (files as Record<string, unknown>)[bucket] : undefined;
    // The server only lists this account's folder; refuse anything else rather than delete it.
    if (!Array.isArray(names) || !names.every(name => typeof name === 'string' && name.startsWith(`${actor.id}/`))) throw failure();
    if (!names.length) continue;
    checkpoint();
    const { error } = await client.storage.from(bucket).remove(names as string[]);
    if (error) throw failure();
  }
  await rpc('kh_delete_account');
}
