import { createContext, type PropsWithChildren, useContext, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { createNotificationsController, emptyNotificationsState, type NotificationsState } from './controller';
import { createSupabaseNotificationRepository } from './repository';
import type { NotificationPreferences, SaveNotificationPreferencesInput } from './types';

export interface NotificationsContextValue extends NotificationsState {
  available: boolean;
  refreshSummary(): Promise<void>;
  refreshList(): Promise<void>;
  autoRefreshList(): Promise<void>;
  loadMore(): Promise<void>;
  pauseList(): void;
  invalidateAfterBlockChange(): Promise<void>;
  setUnreadOnly(value: boolean): void;
  markRead(id: string): Promise<void>;
  markAllRead(readThrough: string): Promise<void>;
  loadPreferences(): Promise<void>;
  savePreferences(input: SaveNotificationPreferencesInput): Promise<NotificationPreferences>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);
const unavailable = async (): Promise<never> => { throw new Error('Inicia sesión para consultar tus avisos.'); };
const unavailableContext: NotificationsContextValue = {
  ...emptyNotificationsState(), available: false, refreshSummary: async () => {}, refreshList: async () => {},
  autoRefreshList: async () => {}, loadMore: async () => {}, pauseList: () => {}, invalidateAfterBlockChange: async () => {}, setUnreadOnly: () => {},
  markRead: unavailable, markAllRead: unavailable, loadPreferences: async () => {}, savePreferences: unavailable,
};

export function NotificationsProvider({ children }: PropsWithChildren) {
  return isSupabaseConfigured
    ? <CloudNotificationsProvider>{children}</CloudNotificationsProvider>
    : <NotificationsContext.Provider value={unavailableContext}>{children}</NotificationsContext.Provider>;
}

function CloudNotificationsProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const userId = auth.ready ? auth.user?.id ?? null : null;
  const accessToken = userId ? auth.session?.access_token ?? null : null;
  const controller = useMemo(() => {
    if (!supabase) throw new Error('Notifications require a configured client');
    return createNotificationsController(createSupabaseNotificationRepository(supabase));
  }, []);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useLayoutEffect(() => { controller.setSession(userId, accessToken); }, [controller, userId, accessToken]);
  useLayoutEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => { void controller.refreshSummary(userId).catch(() => {}); };
    if (AppState.currentState === 'active') refresh();
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 30000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [controller, userId]);

  const sessionKey = controller.getSessionKey();
  const methods = useMemo(() => {
    function actor() {
      if (!userId) throw new Error('KH_AUTH_REQUIRED');
      controller.assertSession(userId, sessionKey);
      return userId;
    }
    return {
      refreshSummary: async () => controller.refreshSummary(actor()),
      refreshList: async () => controller.refreshList(actor()),
      autoRefreshList: async () => controller.autoRefreshList(actor()),
      loadMore: async () => controller.loadMore(actor()),
      pauseList: () => { try { controller.pauseList(actor()); } catch { /* A previous account cannot pause this one. */ } },
      invalidateAfterBlockChange: async () => controller.invalidateAfterBlockChange(actor()),
      setUnreadOnly: (value: boolean) => controller.setUnreadOnly(value, actor()),
      markRead: async (id: string) => controller.markRead(id, actor()),
      markAllRead: async (cutoff: string) => controller.markAllRead(cutoff, actor()),
      loadPreferences: async () => controller.loadPreferences(actor()),
      savePreferences: async (input: SaveNotificationPreferencesInput) => controller.savePreferences(input, actor()),
    };
  }, [controller, userId, sessionKey]);
  const visible = auth.ready && state.userId === userId ? state : emptyNotificationsState(userId);
  const value = useMemo<NotificationsContextValue>(() => ({ ...visible, ...methods, available: true }), [visible, methods]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error('useNotifications debe usarse dentro de NotificationsProvider.');
  return value;
}
