import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { Brand, Icon } from '../ui';
import { MAP_ATTRIBUTION } from './mapConfig';

export function MapAttribution() {
  return <View style={styles.attribution}>
    {MAP_ATTRIBUTION.map(item => <Text key={item.url} accessibilityRole="link" onPress={() => { void Linking.openURL(item.url); }} style={styles.attributionText}>{item.label}</Text>)}
  </View>;
}

export function MapStatus({ status, onRetry }: { status: 'loading' | 'ready' | 'error'; onRetry: () => void }) {
  if (status === 'ready') return null;
  return <View style={styles.status} pointerEvents={status === 'loading' ? 'none' : 'auto'}>
    <View accessibilityRole={status === 'error' ? 'alert' : undefined} style={styles.statusCard}>
      {status === 'loading' ? <><ActivityIndicator color={colors.primary} /><Text style={styles.statusText}>Cargando mapa…</Text></> : <>
        <Icon name="cloud-offline-outline" color={colors.muted} size={25} />
        <Text style={styles.errorTitle}>El mapa no pudo cargar</Text>
        <Text style={styles.statusText}>Comprueba tu conexión y vuelve a intentar.</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Icon name="refresh" size={17} color={colors.primary} /><Text style={styles.retryText}>Reintentar mapa</Text></Pressable>
      </>}
    </View>
  </View>;
}

export function MapBrand() {
  return <View pointerEvents="none" style={styles.brand}><Brand height={18} /></View>;
}

const styles = StyleSheet.create({
  attribution: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9, paddingHorizontal: 7, paddingVertical: 5, backgroundColor: '#FAFBFC' },
  attributionText: { fontSize: 10, lineHeight: 14, color: '#50565C' },
  status: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 4 },
  statusCard: { maxWidth: 285, alignItems: 'center', gap: 10, padding: 18, borderRadius: 19, backgroundColor: '#FFFFFFF5', borderColor: colors.border, borderWidth: 1 },
  statusText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  errorTitle: { color: colors.ink, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  retry: { minHeight: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: colors.softBlue, flexDirection: 'row', alignItems: 'center', gap: 7 },
  retryText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  brand: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, backgroundColor: '#FFFFFFEB' },
});
