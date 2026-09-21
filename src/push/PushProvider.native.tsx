import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router, useRootNavigationState } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { isSupabaseConfigured } from '../lib/supabase';
import { createDeadlineFetch } from '../lib/fetchTimeout';
import { PushContext, unavailablePush } from './context';
import { createPushController } from './controller';
import { sessionFromAccessToken } from './domain';
import { nativeInstallationStore, nativePushAdapter, pushProjectId } from './nativeAdapter.native';
import { createPushRepository } from './repository';
import { registerBeforeSignOut } from './signOutHooks';
export { usePushNotifications } from './context';

const suppressed = { shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false };
// Before auth hydration no foreground notification belongs to a confirmed account.
if (Platform.OS === 'android') Notifications.setNotificationHandler({ handleNotification: async () => suppressed });

export function PushProvider({ children }: PropsWithChildren) {
  return Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && isSupabaseConfigured
    ? <AndroidPushProvider>{children}</AndroidPushProvider>
    : <PushContext.Provider value={unavailablePush}>{children}</PushContext.Provider>;
}

function AndroidPushProvider({ children }: PropsWithChildren) {
  const auth = useAuth(), notices = useNotifications(), rootNavigation = useRootNavigationState();
  const summary = useRef(notices.refreshSummary);
  useLayoutEffect(() => { summary.current = notices.refreshSummary; }, [notices.refreshSummary]);
  const controller = useMemo(() => createPushController({
    store: nativeInstallationStore, adapter: nativePushAdapter, projectId: pushProjectId,
    repository: createPushRepository(process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '', process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '', createDeadlineFetch()),
    navigate: id => router.push({ pathname: '/messages/[id]', params: { id } }),
    refreshSummary: () => summary.current(),
  }), []);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useLayoutEffect(() => { controller.resume(); return () => controller.suspend(); }, [controller]);
  const currentSession = useMemo(() => auth.ready && auth.user && auth.session ? sessionFromAccessToken(auth.user.id, auth.session.access_token) : null, [auth.ready, auth.user?.id, auth.session?.access_token]);
  useLayoutEffect(() => {
    void controller.setSession(currentSession, auth.ready).then(() => controller.refresh()).catch(() => {});
  }, [controller, currentSession, auth.ready]);
  useLayoutEffect(() => { controller.setNavigationReady(!!rootNavigation?.key); }, [controller, rootNavigation?.key]);
  useLayoutEffect(() => registerBeforeSignOut(controller.beforeSignOut), [controller]);

  useEffect(() => {
    Notifications.setNotificationHandler({ handleNotification: async notification => controller.shouldPresent(notification.request.content.data)
      ? { shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true } : suppressed });
    const respond = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) { Notifications.clearLastNotificationResponse(); return; }
      controller.receiveResponse(`${response.notification.request.identifier}:${response.actionIdentifier}`, response.notification.request.content.data);
    };
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(respond);
    const receivedSubscription = Notifications.addNotificationReceivedListener(notification => controller.receiveNotification(notification.request.content.data));
    const tokenSubscription = Notifications.addPushTokenListener(() => { void controller.refresh().catch(() => {}); });
    const initial = Notifications.getLastNotificationResponse(); if (initial) respond(initial);
    const appSubscription = AppState.addEventListener('change', next => { if (next === 'active') void controller.refresh().catch(() => {}); });
    return () => {
      responseSubscription.remove(); receivedSubscription.remove(); tokenSubscription.remove(); appSubscription.remove();
      Notifications.setNotificationHandler({ handleNotification: async () => suppressed });
    };
  }, [controller]);

  const value = useMemo(() => ({ ...state, enable: controller.enable, disable: controller.disable, refresh: controller.refresh, openSettings: controller.openSettings }), [state, controller]);
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}
