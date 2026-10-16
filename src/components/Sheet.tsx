import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, SlideInDown } from 'react-native-reanimated';
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
  const reduced = useReducedMotion();
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <KeyboardAvoidingView behavior="padding" style={styles.veil}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={StyleSheet.absoluteFill} />
      <Animated.View accessibilityViewIsModal entering={reduced ? FadeIn.duration(200) : SlideInDown.duration(320).easing(ease)}
        style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <SheetHandle />
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {title ? <Text accessibilityRole="header" style={styles.title}>{title}</Text> : null}
          {children}
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
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
