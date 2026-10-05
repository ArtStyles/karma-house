import { useCallback, useEffect, useMemo, useRef, useState,useSyncExternalStore } from 'react';
import {listingManagementEvents} from '../state/listingManagementEvents';
import { useAuth } from '../auth/AuthProvider';
import { createCatalogRepository } from '../catalog/repository';
import { createRowSigner } from '../data/supabaseMarketplace';
import type { Listing } from '../domain/listings';
import { supabase } from '../lib/supabase';
import { ProfileError, profileErrorMessage } from './domain';
import { createSupabaseProfileRepository } from './repository';
import type { PublicProfile } from './types';

export interface PublicProfileState {
  profile: PublicProfile | null; avatarUrl: string | null; listings: Listing[];
  loading: boolean; notFound: boolean; error: string | null; saving: boolean; saveError: string | null;
}
const idle: PublicProfileState = { profile: null, avatarUrl: null, listings: [], loading: false, notFound: false, error: null, saving: false, saveError: null };
const passthrough = () => {};

/** `userId` undefined keeps the hook idle; without Supabase (demo) every profile is unavailable. */
export function usePublicProfile(userId: string | undefined, { withListings = false } = {}) {
  const auth = useAuth();
  const viewer = auth.ready ? auth.user?.id ?? null : null;
  const managementGeneration=useSyncExternalStore(listingManagementEvents.subscribe,listingManagementEvents.getSnapshot,listingManagementEvents.getSnapshot);
  const scope=`${userId??''}:${viewer??''}:${managementGeneration}:${auth.session?.access_token??''}`;
  const latestScope=useRef(scope);latestScope.current=scope;const loadedScope=useRef('');
  const token = useRef<string | null>(null);
  token.current = viewer ? auth.session?.access_token ?? null : null;
  const repositories = useMemo(() => supabase ? {
    profiles: createSupabaseProfileRepository(supabase, process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? ''),
    catalog: createCatalogRepository(supabase, createRowSigner(supabase)),
  } : null, []);
  const [state, setState] = useState<PublicProfileState>(idle);
  const [attempt, setAttempt] = useState(0);
  // Visibility depends on who is looking: a new viewer or target aborts the previous load and its writes.
  const epoch = useRef(0);

  useEffect(() => {
    const mine = ++epoch.current;
    const captured=scope;loadedScope.current=scope;
    if (!userId) { setState(idle); return; }
    if (!repositories) { setState({ ...idle, notFound: true }); return; }
    if (!auth.ready) { setState({ ...idle, loading: true }); return; }
    const request = new AbortController();
    const live = () => epoch.current === mine && !request.signal.aborted && latestScope.current===captured;
    setState({ ...idle, loading: true });
    void (async () => {
      try {
        const profile = await repositories.profiles.get(userId, { signal: request.signal, accessToken: token.current });
        if (!live()) return;
        setState({ ...idle, profile, loading: withListings && profile.activeListings.length > 0 });
        const avatar = profile.avatarUrlPath ? repositories.profiles.avatarUrl(profile.avatarUrlPath) : Promise.resolve(null);
        void avatar.then(avatarUrl => { if (live() && avatarUrl) setState(value => ({ ...value, avatarUrl })); });
        if (!withListings || !profile.activeListings.length) return;
        const rows = await repositories.catalog.byIds(profile.activeListings, passthrough).catch(() => []);
        if (!live()) return;
        const byId = new Map(rows.map(row => [row.id, row]));
        const listings = profile.activeListings.map(id => byId.get(id))
          .filter((item): item is Listing => Boolean(item && item.status === 'active' && (!item.moderationStatus || item.moderationStatus === 'approved')));
        setState(value => ({ ...value, listings, loading: false }));
      } catch (error) {
        if (!live()) return;
        setState({ ...idle, notFound: error instanceof ProfileError && error.notFound, error: profileErrorMessage(error) });
      }
    })();
    return () => request.abort();
  }, [repositories, userId, viewer, auth.ready, withListings, attempt,scope]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);

  /** Admin only; resolves true once the server stored the change. */
  const setVerified = useCallback(async (verified: boolean, note: string): Promise<boolean> => {
    if (!repositories || !userId) return false;
    const mine = epoch.current;
    const request = new AbortController();
    const checkpoint = () => { if (epoch.current !== mine) { request.abort(); throw new Error('KH_ACCOUNT_CHANGED'); } };
    setState(value => ({ ...value, saving: true, saveError: null }));
    try {
      const profile = await repositories.profiles.setVerified(userId, verified, note,
        { userId: viewer ?? undefined, accessToken: token.current ?? undefined, signal: request.signal, checkpoint });
      if (epoch.current === mine) setState(value => ({ ...value, profile, saving: false }));
      return true;
    } catch (error) {
      if (epoch.current === mine) setState(value => ({ ...value, saving: false, saveError: profileErrorMessage(error) }));
      return false;
    }
  }, [repositories, userId, viewer]);

  return { ...(loadedScope.current===scope?state:{...idle,loading:!!userId}), retry, setVerified };
}
