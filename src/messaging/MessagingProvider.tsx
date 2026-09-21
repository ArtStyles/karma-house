import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createContext, type PropsWithChildren, useContext, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { createMessagingController, emptyMessagingState } from './controller';
import { MessagingError, setMessageIdGenerator } from './domain';
import { createSupabaseMessagingRepository } from './repository';
import type { MessagingContextValue } from './types';

setMessageIdGenerator(() => Crypto.randomUUID());
const MessagingContext = createContext<MessagingContextValue | null>(null);
const unavailable = async (): Promise<never> => { throw new MessagingError('Los mensajes están disponibles al conectar KarmaHouse e iniciar sesión.'); };
const unavailableContext: MessagingContextValue = {
  ...emptyMessagingState(), available: false, refresh: async () => {}, startConversation: unavailable, openConversation: unavailable,
  loadOlder: unavailable, sendMessage: unavailable, retryMessage: unavailable, discardMessage: unavailable,
  markRead: unavailable, setBlocked: unavailable, reportConversation: unavailable,
};

export function MessagingProvider({ children }: PropsWithChildren) {
  if (!isSupabaseConfigured) return <MessagingContext.Provider value={unavailableContext}>{children}</MessagingContext.Provider>;
  return <CloudMessagingProvider>{children}</CloudMessagingProvider>;
}

function CloudMessagingProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const accessToken = auth.session?.access_token ?? null;
  const controller = useMemo(() => {
    if (!supabase) throw new Error('Messaging requires a configured client');
    return createMessagingController(createSupabaseMessagingRepository(supabase), AsyncStorage);
  }, []);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useLayoutEffect(() => { controller.setSession(userId, accessToken); }, [controller, userId, accessToken]);
  useEffect(() => {
    if (!auth.ready || !userId) return;
    const refresh = () => { void controller.refresh().catch(() => {}); };
    if (AppState.currentState === 'active') refresh();
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 15000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [auth.ready, userId, controller]);
  useEffect(() => () => controller.dispose(), [controller]);

  const value = useMemo<MessagingContextValue>(() => {
    // Auth can render a new identity before its layout effect invalidates the controller.
    const visible = auth.ready && state.userId === userId ? state : emptyMessagingState(userId);
    return {
      ...visible, available: true, refresh: controller.refresh, startConversation: controller.startConversation,
      openConversation: controller.openConversation, loadOlder: controller.loadOlder, sendMessage: controller.sendMessage,
      retryMessage: controller.retryMessage, discardMessage: controller.discardMessage, markRead: controller.markRead,
      setBlocked: controller.setBlocked, reportConversation: controller.reportConversation,
    };
  }, [auth.ready, userId, state, controller]);
  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
}

export function useMessaging(): MessagingContextValue {
  const value = useContext(MessagingContext);
  if (!value) throw new Error('useMessaging debe usarse dentro de MessagingProvider.');
  return value;
}
