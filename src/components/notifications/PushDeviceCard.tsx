import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { usePushNotifications } from '../../push/PushProvider';
import { createThemedStyles, rounded, typography } from '../../theme';
import { ActionGroup, Button, Icon, Notice } from '../ui';

export function PushDeviceCard() {
  const { colors, styles } = useStyles();
  const push = usePushNotifications();
  const blocked = push.permission === 'denied' && !push.canAskAgain;
  const run = (action: () => Promise<void>) => { void action().catch(() => {}); };

  if (!push.supported) return <View style={styles.card}>
    <View style={styles.heading}>
      <View style={styles.icon}><Icon name="phone-portrait-outline" color={colors.primary} size={23} /></View>
      <View style={styles.copy}><Text accessibilityRole="header" style={styles.title}>Avisos en este dispositivo</Text><Text style={styles.description}>
        {Platform.OS === 'web' ? 'En la web, tus novedades llegan a la bandeja de KarmaHouse. Para recibir avisos en el teléfono, por ahora necesitas la app de Android. Aquí puedes elegir qué novedades recibir.'
          : Platform.OS === 'ios' ? 'En iPhone, por ahora puedes consultar todas tus novedades en la bandeja de KarmaHouse.'
            : 'Abre la versión instalada de KarmaHouse para recibir avisos con la app cerrada.'}
      </Text></View>
    </View>
  </View>;

  return <View style={styles.card}>
    <View style={styles.heading}>
      <View style={[styles.icon, push.enabled && styles.enabledIcon]}><Icon name={push.enabled ? 'notifications' : 'notifications-outline'} color={push.enabled ? colors.green : colors.primary} size={23} /></View>
      <View style={styles.copy}><Text accessibilityRole="header" style={styles.title}>En este teléfono</Text><Text style={styles.description}>Recibe avisos de tus conversaciones, visitas y ofertas aunque KarmaHouse esté cerrada.</Text></View>
    </View>
    {!push.ready ? <View style={styles.status}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.statusText}>Comprobando tus avisos…</Text></View>
      : <View style={styles.status} accessibilityLiveRegion="polite"><View style={[styles.dot, push.enabled && !blocked && styles.enabledDot]} /><Text style={styles.statusText}>{blocked ? 'Permiso desactivado en Android' : push.enabled ? 'Avisos activados en este teléfono' : 'Avisos de este teléfono desactivados'}</Text></View>}
    {blocked && <Text style={styles.footnote}>Permite las notificaciones en los ajustes de Android y vuelve a KarmaHouse para activarlas.</Text>}
    {push.error && <Notice error>{push.error}</Notice>}
    <ActionGroup>{push.enabled ? <Button label="Desactivar en este teléfono" secondary loading={push.busy} disabled={!push.ready} onPress={() => run(push.disable)} />
      : <Button label={blocked ? 'Abrir ajustes de Android' : push.error ? 'Reintentar activación' : 'Activar en este teléfono'} icon={blocked ? 'settings-outline' : 'notifications-outline'} loading={push.busy} disabled={!push.ready} onPress={() => run(blocked ? push.openSettings : push.enable)} />}
    {push.enabled && blocked && <Button label="Abrir ajustes de Android" secondary disabled={push.busy} onPress={() => run(push.openSettings)} />}</ActionGroup>
    <Text style={styles.footnote}>Los avisos no muestran el texto de tus mensajes. Puedes desactivarlos cuando quieras.</Text>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: rounded.card, backgroundColor: colors.surface, padding: 16, gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: rounded.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softBlue },
  enabledIcon: { backgroundColor: colors.softGreen }, copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { ...typography.cardTitle, color: colors.ink },
  description: { fontSize: 13, lineHeight: 19, color: colors.muted },
  status: { flexDirection: 'row', alignItems: 'center', gap: 9 }, dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.muted }, enabledDot: { backgroundColor: colors.green },
  statusText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 18 },
}));
