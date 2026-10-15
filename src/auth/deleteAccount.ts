import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKETS = ['property-photos', 'account-avatars'] as const;
/** `started`: the server already began (listings gone, agencies left), so the account can only be finished, not kept. */
export type AccountDeletionError = Error & { started: boolean };
const failure = (started: boolean, uncertain = false): AccountDeletionError => Object.assign(new Error(uncertain
  ? 'La conexión falló y puede que tu cuenta ya haya empezado a eliminarse. Reintenta para terminar; lo borrado no se recupera.'
  : started
  ? 'Tu cuenta ya empezó a eliminarse y lo borrado no se recupera. Comprueba tu conexión y reintenta para terminar.'
  : 'No pudimos eliminar tu cuenta. Comprueba tu conexión y vuelve a intentarlo.'), { started: started || uncertain });

/**
 * Server first removes the listings and returns the account's files, the client deletes those through
 * the Storage API (SQL cannot), and only then the server deletes the account. Every step can be retried.
 * `checkpoint` throws when the signed-in account changed mid-way, so nothing runs for the wrong person.
 */
export async function deleteAccount(client: SupabaseClient, actor: { id: string; accessToken: string }, checkpoint: () => void): Promise<void> {
  let started = false;
  const rpc = async (name: string) => {
    checkpoint();
    const { data, error } = await client.rpc(name, { p_actor_id: actor.id }).setHeader('Authorization', `Bearer ${actor.accessToken}`);
    checkpoint();
    // A server refusal carries a code; a lost response does not, and the step may have committed anyway.
    if (error) throw failure(started, !started && !(error as { code?: string }).code);
    return data as unknown;
  };
  const files = await rpc('kh_begin_account_deletion');
  started = true;
  for (const bucket of BUCKETS) {
    const names = files && typeof files === 'object' ? (files as Record<string, unknown>)[bucket] : undefined;
    // The server only lists this account's folder; refuse anything else rather than delete it.
    if (!Array.isArray(names) || !names.every(name => typeof name === 'string' && name.startsWith(`${actor.id}/`))) throw failure(started);
    if (!names.length) continue;
    checkpoint();
    const { error } = await client.storage.from(bucket).remove(names as string[]);
    if (error) throw failure(started);
  }
  await rpc('kh_delete_account');
}
