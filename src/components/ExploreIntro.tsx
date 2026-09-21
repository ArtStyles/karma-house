import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors } from '../theme';
import { Icon } from './ui';

/** Decorative architecture, not a photograph of a property in the catalogue. */
export function ExploreIntro() {
  const compact = useWindowDimensions().width < 370;
  return <View style={[styles.panel, compact && styles.compactPanel]}>
    <View style={styles.copy}>
      <View style={styles.eyebrow}><View style={styles.dot} /><Text style={styles.eyebrowText}>TU PRÓXIMO CAPÍTULO</Text></View>
      <Text accessibilityRole="header" style={[styles.title, compact && styles.compactTitle]}>Un lugar para{ '\n' }llamar hogar.</Text>
      <Text style={styles.subtitle}>Compra y venta en Cuba</Text>
    </View>
    <View pointerEvents="none" accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.art, compact && styles.compactArt]}>
      <View style={styles.halo} />
      <View style={styles.sun} />
      <View style={styles.backBuilding}><View style={styles.window} /><View style={styles.window} /><View style={styles.window} /></View>
      <View style={styles.house}><View style={styles.roof} /><View style={styles.facade}><View style={styles.frontWindow} /><View style={styles.door} /></View></View>
      <View style={styles.tree}><View style={styles.trunk} /></View>
      <View style={styles.pin}><Icon name="location" size={20} color={colors.primary} /></View>
      <View style={styles.ground} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#EAF2FC', borderRadius: 25, paddingHorizontal: 20, paddingVertical: 22, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#DFEAF7', marginBottom: 18 },
  compactPanel: { paddingHorizontal: 15, paddingVertical: 18 }, compactTitle: { fontSize: 24, lineHeight: 28, letterSpacing: -.9 }, compactArt: { width: 62, marginLeft: 0, transform: [{ scale: .78 }, { translateX: 3 }] },
  copy: { flex: 1, zIndex: 1 }, eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 9 }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
  eyebrowText: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: '#426482' },
  title: { fontSize: 28, lineHeight: 31, letterSpacing: -1, fontWeight: '700', color: '#143658' }, subtitle: { color: '#486580', fontSize: 12, lineHeight: 18, marginTop: 10 },
  art: { width: 94, height: 125, marginLeft: 2 }, halo: { width: 135, height: 135, borderRadius: 68, backgroundColor: '#D9E8FA', position: 'absolute', left: -15, top: 0 },
  sun: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#F7DDA7', position: 'absolute', top: 3, right: 6 },
  backBuilding: { position: 'absolute', left: 2, top: 27, width: 31, height: 78, borderRadius: 5, backgroundColor: '#89AED7', padding: 9, gap: 9, transform: [{ rotate: '-5deg' }] },
  window: { width: 10, height: 9, borderRadius: 2, backgroundColor: '#E8F1FB' },
  house: { position: 'absolute', right: 2, bottom: 20, width: 70, height: 78 }, roof: { position: 'absolute', width: 51, height: 51, backgroundColor: '#316DA9', transform: [{ rotate: '45deg' }], borderRadius: 5, left: 9, top: 0 },
  facade: { position: 'absolute', bottom: 0, width: 70, height: 56, backgroundColor: '#FFFFFF', borderRadius: 5, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, boxShadow: '0 5px 14px rgba(28,67,111,0.12)' },
  frontWindow: { width: 18, height: 21, backgroundColor: '#B9D4EE', borderRadius: 3, marginBottom: 22 }, door: { width: 17, height: 32, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: '#316DA9' },
  tree: { position: 'absolute', left: -6, bottom: 17, width: 24, height: 41, borderRadius: 14, backgroundColor: '#76A899' }, trunk: { position: 'absolute', width: 3, height: 22, backgroundColor: '#3E7568', bottom: -8, left: 11 },
  pin: { position: 'absolute', top: -2, left: 22, width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(28,67,111,0.1)' },
  ground: { position: 'absolute', height: 3, borderRadius: 2, width: 105, bottom: 12, left: -7, backgroundColor: '#B4CBE3' },
});
