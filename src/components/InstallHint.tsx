import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme';
import { Icon, IconButton } from './ui';

const DISMISSED = 'karmahouse-install-hint-dismissed';

/** iPhone has no install prompt: a site reaches the home screen only from the browser's share menu. */
function shouldShow() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = (navigator as { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  if (!iphone || installed) return false;
  try { return localStorage.getItem(DISMISSED) !== '1'; } catch { return true; }
}

export function InstallHint() {
  const { colors, styles } = useStyles();
  const [visible, setVisible] = useState(shouldShow);
  if (!visible) return null;
  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISSED, '1'); } catch { /* Private mode: it simply shows again next visit. */ }
  };
  return <View style={styles.card}>
    <View style={styles.icon}><Icon name="share-outline" color={colors.primary} size={22} /></View>
    <View style={styles.copy}>
      <Text accessibilityRole="header" style={styles.title}>Instala KarmaHouse en tu iPhone</Text>
      <Text style={styles.description}>Toca Compartir y luego «Añadir a pantalla de inicio». Se abre como una app, sin la barra del navegador.</Text>
    </View>
    <IconButton name="close" label="Cerrar" onPress={dismiss} style={styles.close} />
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface, padding: 14, paddingRight: 6, marginBottom: 12 },
  icon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 4, paddingTop: 1 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.2, color: colors.ink },
  description: { fontSize: 13, lineHeight: 19, color: colors.muted },
  close: { backgroundColor: 'transparent', marginTop: -4 },
}));
