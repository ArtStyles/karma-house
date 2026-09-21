import { useEffect } from 'react';
import { useMessagingActivity } from '../components/messaging/useMessagingActivity';
import { useNotifications } from './NotificationsProvider';

/** Background surfaces only read the summary; pages belong to the visible center. */
export function useNotificationCenter() {
  const active = useMessagingActivity();
  const store = useNotifications();
  const { available, userId, refreshList, autoRefreshList, pauseList, list: { unreadOnly } } = store;
  useEffect(() => {
    if (!active || !available || !userId) return;
    const refresh = () => { void autoRefreshList().catch(() => {}); };
    // Revalidate visibility after another device may have changed a block.
    // The periodic refresh below preserves pages while the person reads history.
    void refreshList().catch(() => {});
    const timer = setInterval(refresh, 30000);
    return () => { clearInterval(timer); pauseList(); };
  }, [active, available, userId, refreshList, autoRefreshList, pauseList, unreadOnly]);
  return store;
}
