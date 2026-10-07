import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../../theme';
import { IconButton } from '../ui';

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const { styles } = useStyles();
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

const useStyles = createThemedStyles(colors => StyleSheet.create({
  badge: {
    position: 'absolute', right: -2, top: -2, minWidth: 19, height: 19,
    paddingHorizontal: 5, borderRadius: 11, backgroundColor: colors.primaryFill,
    justifyContent: 'center', alignItems: 'center',
  },
  count: { color: colors.onPrimary, fontSize: 10, fontWeight: '700' },
}));
