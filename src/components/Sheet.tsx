import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../settings/useReducedMotion';
import { createThemedStyles, rounded, typography } from '../theme';

const ease = Easing.bezier(.22, 1, .36, 1);

/**
 * The default bottom sheet for confirming, choosing and writing a reason: dim veil, 32 px top corners,
 * a mediopunto outline as its handle. It rises from below while the veil fades in; with reduced motion it only fades.
 * Tapping the veil or Android back closes it.
 */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose(): void; title?: string; children: ReactNode }) {
  const { styles } = useStyles();
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <KeyboardAvoidingView behavior="padding" style={styles.veil}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={StyleSheet.absoluteFill} />
      <SheetRise accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <SheetHandle />
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {title ? <Text accessibilityRole="header" style={styles.title}>{title}</Text> : null}
          {children}
        </ScrollView>
      </SheetRise>
    </KeyboardAvoidingView>
  </Modal>;
}

/**
 * A sheet's body rising from below; with reduced motion it only fades. It moves by transform, never by a layout
 * animation: an Android Modal first lays out shorter than the screen (without the system bars), and SlideInDown kept
 * that first position, so the sheet stopped 215 px above the bottom edge on a Pixel and the screen showed beneath it.
 * Mount it inside the Modal, so it rises each time the sheet opens.
 */
export function SheetRise({ style, children, ...props }: ComponentProps<typeof Animated.View>) {
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const shown = useSharedValue(0);
  useEffect(() => { shown.value = withTiming(1, { duration: reduced ? 200 : 320, easing: ease }); }, [shown, reduced]);
  const rise = useAnimatedStyle(() => reduced ? { opacity: shown.value } : { transform: [{ translateY: (1 - shown.value) * height }] });
  return <Animated.View {...props} style={[style, rise]}>{children}</Animated.View>;
}

/** The mediopunto outline every sheet carries as its handle. */
export function SheetHandle() {
  const { styles } = useStyles();
  return <View accessible={false} aria-hidden style={styles.handle} />;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  veil: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '90%', alignSelf: 'center', backgroundColor: colors.sheet, borderTopLeftRadius: rounded.sheet, borderTopRightRadius: rounded.sheet, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border },
  handle: { alignSelf: 'center', marginTop: 10, width: 34, height: 17, borderTopLeftRadius: 17, borderTopRightRadius: 17, borderWidth: 2.4, borderBottomWidth: 0, borderColor: colors.muted },
  content: { paddingHorizontal: 20, paddingTop: 14, gap: 12 },
  title: { ...typography.sheetTitle, color: colors.ink },
}));
