import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useMessagingActivity } from '../components/messaging/useMessagingActivity';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { createNegotiationsController, emptyNegotiationsState } from './controller';
import { createSupabaseNegotiationRepository } from './repository';
import type { CreateNegotiationInput, NegotiationRepository, RespondNegotiationInput } from './types';

const unavailable = async (): Promise<never> => { throw new Error('Inicia sesión para gestionar visitas y ofertas.'); };
const unavailableRepository: NegotiationRepository = { list: unavailable, create: unavailable, respond: unavailable };

export function useNegotiations({ conversationId, pendingOnly = false, enabled = true }: { conversationId?: string; pendingOnly?: boolean; enabled?: boolean } = {}) {
  const auth = useAuth();
  const active = useMessagingActivity();
  const userId = auth.ready ? auth.user?.id ?? null : null;
  const token = auth.session?.access_token ?? null;
  const controller = useMemo(() => createNegotiationsController(supabase ? createSupabaseNegotiationRepository(supabase) : unavailableRepository,{ conversationId,pendingOnly }),[conversationId,pendingOnly]);
  const state = useSyncExternalStore(controller.subscribe,controller.getState,controller.getState);
  useLayoutEffect(() => { controller.setSession(userId,token); },[controller,userId,token]);
  useEffect(() => {
    if (!enabled || !active || !userId || !isSupabaseConfigured) return;
    void controller.autoRefresh();
    const timer = setInterval(() => { void controller.autoRefresh(); },15000);
    return () => clearInterval(timer);
  },[controller,enabled,active,userId]);
  useLayoutEffect(() => () => controller.dispose(),[controller]);
  const visible = state.userId === userId ? state : emptyNegotiationsState(userId);
  return { ...visible, available: isSupabaseConfigured, refresh: controller.refresh, loadMore: controller.loadMore,
    create: (input: CreateNegotiationInput) => controller.create(input,userId ?? ''),
    respond: (input: RespondNegotiationInput) => controller.respond(input,userId ?? ''),
  };
}
