import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { usePushNotifications } from '../../push/PushProvider';
import { colors } from '../../theme';
import { Button, Icon, Notice } from '../ui';

export function PushDeviceCard() {
  const push = usePushNotifications();
  const blocked = push.permission === 'denied' && !push.canAskAgain;
  const run = (action: () => Promise<void>) => { void action().catch(() => {}); };

  if (!push.supported) return <View style={styles.card}>
    <View style={styles.heading}>
      <View style={styles.icon}><Icon name="phone-portrait-outline" color={colors.primary} size={23} /></View>
      <View style={styles.copy}><Text accessibilityRole="header" style={styles.title}>También en tu teléfono</Text><Text style={styles.description}>
        {Platform.OS === 'web' ? 'Activa los avisos desde la app de KarmaHouse en tu Android. Aquí puedes elegir qué novedades recibir.'
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
    {push.enabled ? <Button label="Desactivar en este teléfono" secondary loading={push.busy} disabled={!push.ready} onPress={() => run(push.disable)} />
      : <Button label={blocked ? 'Abrir ajustes de Android' : push.error ? 'Reintentar activación' : 'Activar en este teléfono'} icon={blocked ? 'settings-outline' : 'notifications-outline'} loading={push.busy} disabled={!push.ready} onPress={() => run(blocked ? push.openSettings : push.enable)} />}
    {push.enabled && blocked && <Button label="Abrir ajustes de Android" secondary disabled={push.busy} onPress={() => run(push.openSettings)} />}
    <Text style={styles.footnote}>Los avisos no muestran el texto de tus mensajes. Puedes desactivarlos cuando quieras.</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#DDE7F2', borderRadius: 24, backgroundColor: colors.white, padding: 19, gap: 16 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  icon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  enabledIcon: { backgroundColor: '#EAF6EF' }, copy: { flex: 1, minWidth: 0, gap: 6 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.3, color: colors.ink },
  description: { fontSize: 13, lineHeight: 20, color: colors.muted },
  status: { flexDirection: 'row', alignItems: 'center', gap: 9 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#9AA5B4' }, enabledDot: { backgroundColor: colors.green },
  statusText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
