import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

/**
 * The arch frame for photos in lists, thumbnails, avatars and agency logos: top radius half the width, 14–22 below.
 * Put the photo inside (PropertyImage, Image) sized to fill. `glow` adds the lamp light, once per screen at most.
 */
export function ArchImage({ width, height, bottom = 18, glow = false, children, style }: {
  width: number; height: number; bottom?: number; glow?: boolean; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const top = width / 2;
  return <View style={[{ width, height, borderTopLeftRadius: top, borderTopRightRadius: top, borderBottomLeftRadius: bottom, borderBottomRightRadius: bottom,
    overflow: 'hidden', backgroundColor: colors.photoGround }, glow && { boxShadow: `0 0 64px ${colors.glow}` }, style]}>{children}</View>;
}
