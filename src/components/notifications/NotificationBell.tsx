import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { IconButton } from '../ui';

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return <View>
    <IconButton name="notifications-outline"
      label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Abrir notificaciones'}
      onPress={() => router.push('/notifications')} />
    {unreadCount > 0 && <View pointerEvents="none" accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" aria-hidden style={styles.badge}>
      <Text style={styles.count}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute', right: -2, top: -2, minWidth: 19, height: 19,
    paddingHorizontal: 5, borderRadius: 11, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  count: { color: colors.white, fontSize: 10, fontWeight: '700' },
});
