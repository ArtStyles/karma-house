import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { Icon } from '../ui';

export function UserAvatar({ size = 44, avatarUrl, name = '', accessibilityLabel = 'Foto de tu cuenta' }: { size?: number; avatarUrl?: string | null; name?: string; accessibilityLabel?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatarUrl]);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('').toLocaleUpperCase('es');
  return <View accessibilityLabel={accessibilityLabel} accessible style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }]}>
    {avatarUrl && !failed ? <Image key={avatarUrl} source={{ uri: avatarUrl }} resizeMode="cover" style={styles.photo} onError={() => setFailed(true)} /> : initials ? <Text style={[styles.initials, { fontSize: size * 0.32 }]}>{initials}</Text> : <Icon name="person-outline" color={colors.primary} size={size * 0.48} />}
  </View>;
}
const styles = StyleSheet.create({
  frame: { backgroundColor: '#E6F0FD', borderWidth: 2, borderColor: colors.white, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  photo: { width: '100%', height: '100%' }, initials: { color: colors.primary, fontWeight: '600', letterSpacing: -0.6 },
});
