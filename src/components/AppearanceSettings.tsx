import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, rounded, typography, useTheme } from '../theme';
import { darkColors, lightColors } from '../theme/palette';
import type { AppearancePreference } from '../settings/appearance';
import { Notice } from './ui';

// Each choice shows a small window of itself: the ground and an arch, by night in sol, by day in blue.
const options: { value: AppearancePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
];

export function AppearanceSettings() {
  const { styles } = useStyles();
  const { preference, scheme, setPreference, saveFailed } = useTheme();
  return <View style={styles.section}>
    <View style={styles.copy}><Text accessibilityRole="header" style={styles.title}>Apariencia</Text><Text style={styles.description}>Elige cómo quieres ver KarmaHouse.</Text></View>
    <View accessibilityRole="radiogroup" accessibilityLabel="Apariencia de KarmaHouse" style={styles.options}>
      {options.map(option => {
        const selected = preference === option.value;
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
          accessibilityState={{ checked: selected }} aria-checked={selected} onPress={() => setPreference(option.value)}
          style={({ pressed }) => [styles.option, selected && styles.selected, pressed && { opacity: .75 }]}>
          <View style={[styles.window, { backgroundColor: option.value === 'dark' ? darkColors.paper : lightColors.paper }]}>
            <View style={[styles.arch, { backgroundColor: option.value === 'dark' ? darkColors.sol : option.value === 'light' ? lightColors.primary : darkColors.primary }]} />
            {option.value === 'system' && <View style={styles.night} />}
          </View>
          <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
        </Pressable>;
      })}
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.description}>{preference === 'system'
      ? `Se adapta a tu dispositivo. Ahora usa el modo ${scheme === 'dark' ? 'oscuro' : 'claro'}.`
      : 'KarmaHouse abre en Oscuro, el modo de noche. Tu elección se conserva en este dispositivo.'}</Text>
    {saveFailed && <Notice error>No pudimos guardar tu elección. Toca de nuevo el modo que prefieras para reintentarlo.</Notice>}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  section: { gap: 12, marginBottom: 24 },
  copy: { gap: 4, paddingHorizontal: 4 }, title: { ...typography.section, color: colors.ink }, description: { color: colors.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, minWidth: 0, alignItems: 'center', gap: 8, paddingTop: 8, paddingHorizontal: 8, paddingBottom: 10, borderRadius: rounded.inner, backgroundColor: colors.surface, borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: colors.primary },
  window: { alignSelf: 'stretch', height: 76, borderRadius: rounded.thumb, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end', borderWidth: 1, borderColor: colors.border },
  arch: { width: 36, height: 48, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  night: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%', backgroundColor: darkColors.paper, opacity: .92 },
  label: { color: colors.body, fontSize: 14, lineHeight: 19, fontWeight: '600' }, selectedLabel: { color: colors.ink },
}));
