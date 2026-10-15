import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, internalLayout, useTheme } from '../theme';
import type { AppearancePreference } from '../settings/appearance';
import { Icon, Notice, type IconName } from './ui';

const options: { value: AppearancePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Claro', icon: 'sunny-outline' },
  { value: 'dark', label: 'Oscuro', icon: 'moon-outline' },
  { value: 'system', label: 'Sistema', icon: 'phone-portrait-outline' },
];

export function AppearanceSettings() {
  const { colors, styles } = useStyles();
  const { preference, scheme, setPreference, saveFailed } = useTheme();
  return <View style={styles.card}>
    <View style={styles.heading}>
      <View style={styles.copy}><Text accessibilityRole="header" style={styles.title}>Apariencia</Text><Text style={styles.description}>Elige cómo quieres ver KarmaHouse.</Text></View>
    </View>
    <View accessibilityRole="radiogroup" accessibilityLabel="Apariencia de KarmaHouse" style={styles.options}>
      {options.map(option => {
        const selected = preference === option.value;
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
          accessibilityState={{ checked: selected }} aria-checked={selected} onPress={() => setPreference(option.value)}
          style={({ pressed }) => [styles.option, selected && styles.selected, pressed && { opacity: .75 }]}>
          <Icon name={option.icon} size={23} color={selected ? colors.primary : colors.muted} />
          <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
          <View style={[styles.indicator, selected && styles.indicatorSelected]}>{selected && <View style={styles.dot} />}</View>
        </Pressable>;
      })}
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.description}>{preference === 'system'
      ? `Se adapta a tu dispositivo. Ahora usa el modo ${scheme === 'dark' ? 'oscuro' : 'claro'}.`
      : 'Tu elección se conserva en este dispositivo.'}</Text>
    {saveFailed && <Notice error>No pudimos guardar tu elección. Toca de nuevo el modo que prefieras para reintentarlo.</Notice>}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: internalLayout.radius, padding: 16, gap: 16, marginBottom: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, gap: 4 }, title: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -.3 }, description: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  options: { gap: 8 }, option: { width: '100%', minHeight: 52, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  selected: { backgroundColor: colors.softBlue, borderColor: colors.accentBorder }, label: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '500' }, selectedLabel: { color: colors.primary, fontWeight: '600' },
  indicator: { width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' }, indicatorSelected: { borderColor: colors.primary }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
}));
