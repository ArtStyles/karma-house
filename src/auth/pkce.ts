export type VerifierStore = { storage: { getItem(key: string): unknown; setItem(key: string, value: string): unknown }; storageKey: string };

/**
 * Runs a call that starts a new PKCE flow and, if it fails, puts back the verifier stored before it.
 * Our email links carry no flow id, so the exchange reads `<storageKey>-code-verifier`, which mirrors the
 * latest flow; supabase-js deletes it when a resend fails, and the earlier email would stop working here.
 */
export async function keepVerifierOnFailure<T extends { error: unknown }>(auth: VerifierStore, run: () => Promise<T>): Promise<T> {
  const key = `${auth.storageKey}-code-verifier`, saved = await auth.storage.getItem(key);
  const restore = async () => { if (typeof saved === 'string') await Promise.resolve(auth.storage.setItem(key, saved)).catch(() => undefined); };
  try {
    const result = await run();
    if (result.error) await restore();
    return result;
  } catch (cause) { await restore(); throw cause; }
}
