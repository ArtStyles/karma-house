import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import type { MessagingRequestContext } from '../messaging/types';
import { SavedSearchError, savedSearchErrorMessage } from './domain';
import { createSupabaseSavedSearchRepository } from './repository';
import type { SavedSearch, SaveSearchInput } from './types';

interface SavedSearchesState { items: SavedSearch[]; loading: boolean; error: string | null; saving: boolean }
const emptyState: SavedSearchesState = { items: [], loading: false, error: null, saving: false };

export function useSavedSearches() {
  const auth = useAuth();
  const userId = auth.ready ? auth.user?.id ?? null : null;
  const accessToken = userId ? auth.session?.access_token ?? null : null;
  const repository = useMemo(() => supabase ? createSupabaseSavedSearchRepository(supabase) : null, []);
  const [state, setState] = useState<SavedSearchesState>(emptyState);
  // Each account gets an epoch; requests from a previous one are aborted and never touch state.
  const session = useRef({ userId, accessToken, epoch: 0, requests: new Set<AbortController>() });
  session.current.accessToken = accessToken;

  useLayoutEffect(() => {
    const current = session.current;
    current.userId = userId;
    current.epoch += 1;
    current.requests.forEach(request => request.abort());
    current.requests.clear();
    setState(emptyState);
  }, [userId]);

  const run = useCallback(async <T>(task: (context: MessagingRequestContext) => Promise<T>, apply: (result: T) => void) => {
    const current = session.current;
    const { userId: actor, accessToken: token, epoch } = current;
    if (!repository || !actor || !token) throw new SavedSearchError('Inicia sesión para guardar tus búsquedas.');
    const request = new AbortController();
    current.requests.add(request);
    const live = () => !request.signal.aborted && current.epoch === epoch && current.userId === actor;
    try {
      const result = await task({ userId: actor, accessToken: token, signal: request.signal,
        checkpoint() { if (!live()) throw new Error('KH_ACCOUNT_CHANGED'); } });
      if (live()) apply(result);
      return result;
    } finally { current.requests.delete(request); }
  }, [repository]);

  // A request from a previous account fails with KH_ACCOUNT_CHANGED; that account's state is already gone.
  const fail = useCallback((error: unknown) => {
    if (error instanceof Error && error.message === 'KH_ACCOUNT_CHANGED') return;
    setState(value => ({ ...value, loading: false, saving: false, error: savedSearchErrorMessage(error) })); }, []);

  const refresh = useCallback(async () => {
    if (!repository || !session.current.userId) return;
    setState(value => ({ ...value, loading: true, error: null }));
    try { await run(context => repository.list(context), items => setState(value => ({ ...value, items, loading: false }))); }
    catch (error) { fail(error); }
  }, [repository, run, fail]);

  /** Resolves to the stored search, or null after showing the error. */
  const save = useCallback(async (input: SaveSearchInput): Promise<SavedSearch | null> => {
    if (!repository) return null;
    setState(value => ({ ...value, saving: true, error: null }));
    try {
      return await run(context => repository.save(input, context), saved => setState(value => ({ ...value, saving: false,
        items: value.items.some(item => item.id === saved.id) ? value.items.map(item => item.id === saved.id ? saved : item) : [saved, ...value.items] })));
    } catch (error) { fail(error); return null; }
  }, [repository, run, fail]);

  const toggle = useCallback((search: SavedSearch) => save({ id: search.id, name: search.name, filters: search.filters,
    enabled: !search.enabled, expectedVersion: search.version }), [save]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    if (!repository) return false;
    setState(value => ({ ...value, saving: true, error: null }));
    try {
      await run(context => repository.remove(id, context), () => setState(value => ({ ...value, saving: false, items: value.items.filter(item => item.id !== id) })));
      return true;
    } catch (error) { fail(error); return false; }
  }, [repository, run, fail]);

  const signedIn = Boolean(userId && accessToken);
  useEffect(() => { if (signedIn) void refresh(); }, [signedIn, userId, refresh]);

  return { ...state, available: Boolean(repository) && signedIn, refresh, save, toggle, remove };
}
