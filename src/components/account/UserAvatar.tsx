import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, typefaces } from '../../theme';
import { Icon } from '../ui';

/** A round avatar; `arch` frames it like a listing photo (a public profile's hero). */
export function UserAvatar({ size = 44, avatarUrl, name = '', accessibilityLabel = 'Foto de tu cuenta', arch = false }: { size?: number; avatarUrl?: string | null; name?: string; accessibilityLabel?: string; arch?: boolean }) {
  const { colors, styles } = useStyles();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatarUrl]);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('').toLocaleUpperCase('es');
  return <View accessibilityLabel={accessibilityLabel} accessible style={[styles.frame, arch ? { width: size, height: Math.round(size * 1.17), borderTopLeftRadius: size / 2, borderTopRightRadius: size / 2, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, borderWidth: 0 } : { width: size, height: size, borderRadius: size / 2 }]}>
    {avatarUrl && !failed ? <Image key={avatarUrl} source={{ uri: avatarUrl }} resizeMode="cover" style={styles.photo} onError={() => setFailed(true)} /> : initials ? <Text style={[styles.initials, arch && styles.archInitials, { fontSize: size * (arch ? .44 : .32) }]}>{initials}</Text> : <Icon name="person-outline" color={colors.primary} size={size * 0.48} />}
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  frame: { backgroundColor: colors.softBlue, borderWidth: 2, borderColor: colors.surface, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  photo: { width: '100%', height: '100%' }, initials: { color: colors.primary, fontWeight: '600', letterSpacing: -0.6 },
  archInitials: { fontFamily: typefaces.display, fontWeight: '400', letterSpacing: 0 },
}));
