import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Pressable, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useReducedMotion } from '../settings/useReducedMotion';
import { createThemedStyles, rounded } from '../theme';
import { SheetHandle } from './Sheet';
import { createFilterDismissalGate, filterSheetPosition, shouldDismissFilterSheet } from './filterSheetMotion';

const SHEET_SPRING = { duration: 300, dampingRatio: 1, overshootClamping: true, reduceMotion: ReduceMotion.System };
type CloseFilters = (commit?: () => void) => void;

/** Gesture lives on the grip only: fields, buttons and scrolling keep their own input. */
export function FilterSheet({ onClose, children }: { onClose: () => void; children: (close: CloseFilters) => ReactNode }) {
  const { styles } = useStyles();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const desktop = width >= 700;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [gate] = useState(() => createFilterDismissalGate(() => onCloseRef.current()));
  const laidOut = useRef(false);
  const sheetHeight = useSharedValue(0);
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  const epoch = useSharedValue(0);
  const start = useSharedValue(0);
  const dragging = useSharedValue(false);
  const dismissing = useSharedValue(false);
  const committed = useSharedValue(false);
  const finishClose = useCallback((ticket: number) => {
    // A new gesture can start after this callback was queued for the JS thread.
    if (ticket !== epoch.value || !dismissing.value) return;
    // A mode change may settle the UI before beginGestureClose reaches JS.
    if (!committed.value) gate.begin(ticket);
    gate.finish(ticket);
  }, [gate, epoch, dismissing, committed]);
  const interruptClose = useCallback(() => { gate.interrupt(); }, [gate]);
  const beginGestureClose = useCallback((ticket: number) => {
    if (ticket === epoch.value && gate.begin(ticket)) Keyboard.dismiss();
  }, [gate, epoch]);

  useEffect(() => {
    gate.activate();
    return () => {
      gate.deactivate();
      epoch.value++;
      cancelAnimation(y);
      cancelAnimation(opacity);
    };
  }, [gate, epoch, y, opacity]);

  const close = useCallback<CloseFilters>(commit => {
    const ticket = epoch.value + 1;
    if (!gate.begin(ticket, commit)) return;
    epoch.value = ticket;
    committed.value = !!commit;
    dismissing.value = true;
    Keyboard.dismiss();
    const complete = (finished?: boolean) => {
      'worklet';
      if (finished && epoch.value === ticket && dismissing.value) scheduleOnRN(finishClose, ticket);
    };
    if (desktop || reduced) {
      opacity.value = withTiming(0, { duration: 120, reduceMotion: ReduceMotion.Never }, complete);
    } else {
      y.value = withSpring(sheetHeight.value + 32, SHEET_SPRING, complete);
    }
  }, [gate, epoch, committed, dismissing, opacity, y, sheetHeight, desktop, reduced, finishClose]);

  // A mode change settles an open panel, or completes an already accepted close.
  useEffect(() => {
    if (!laidOut.current) return;
    if (desktop || reduced) {
      cancelAnimation(y);
      y.value = 0;
      dragging.value = false;
      if (dismissing.value) {
        cancelAnimation(opacity);
        opacity.value = 0;
        finishClose(epoch.value);
      } else {
        epoch.value++;
        opacity.value = 1;
        gate.interrupt();
      }
    }
  }, [desktop, reduced, gate, epoch, y, opacity, dragging, dismissing, finishClose]);

  const gesture = useMemo(() => Gesture.Pan()
    .enabled(!desktop && !reduced)
    .maxPointers(1)
    .activeOffsetY([-8, 8])
    .failOffsetX([-20, 20])
    .onBegin(() => {
      if (committed.value) return;
      cancelAnimation(y);
      epoch.value++;
      start.value = y.value;
      dragging.value = true;
      dismissing.value = false;
      scheduleOnRN(interruptClose);
    })
    .onUpdate(event => {
      if (!committed.value) y.value = filterSheetPosition(start.value + event.translationY, sheetHeight.value);
    })
    .onEnd(event => {
      if (committed.value) return;
      dragging.value = false;
      if (shouldDismissFilterSheet(y.value, event.velocityY, sheetHeight.value)) {
        const ticket = ++epoch.value;
        dismissing.value = true;
        scheduleOnRN(beginGestureClose, ticket);
        y.value = withSpring(sheetHeight.value + 32, { ...SHEET_SPRING, velocity: event.velocityY }, finished => {
          if (finished && epoch.value === ticket && dismissing.value) scheduleOnRN(finishClose, ticket);
        });
      } else {
        y.value = withSpring(0, { ...SHEET_SPRING, velocity: event.velocityY });
      }
    })
    .onFinalize((_event, success) => {
      if (!success && dragging.value && !committed.value) {
        dragging.value = false;
        dismissing.value = false;
        epoch.value++;
        y.value = withSpring(0, SHEET_SPRING);
        scheduleOnRN(interruptClose);
      }
    }), [desktop, reduced, committed, y, epoch, start, dragging, dismissing, sheetHeight, interruptClose, beginGestureClose, finishClose]);

  const onLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (height <= 0) return;
    sheetHeight.value = height;
    if (!laidOut.current) {
      laidOut.current = true;
      opacity.value = desktop || reduced ? withTiming(1, { duration: 160, reduceMotion: ReduceMotion.Never }) : 1;
      if (!desktop && !reduced) {
        y.value = height + 32;
        y.value = withSpring(0, SHEET_SPRING);
      }
    } else if (dismissing.value && !desktop && !reduced) {
      // Hiding the keyboard can resize the sheet while it is leaving.
      const ticket = epoch.value;
      y.value = withSpring(height + 32, SHEET_SPRING, finished => {
        if (finished && epoch.value === ticket && dismissing.value) scheduleOnRN(finishClose, ticket);
      });
    }
  };
  const sheetStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: desktop || reduced ? 0 : y.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: opacity.value * Math.max(0, 1 - Math.max(0, y.value) / Math.max(1, sheetHeight.value + 32)) }));

  return <Modal transparent visible animationType="none" onRequestClose={() => {
    if (Keyboard.isVisible()) Keyboard.dismiss(); else close();
  }}>
    <GestureHandlerRootView style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <View style={[styles.overlay, desktop && styles.desktop, { paddingTop: Math.max(insets.top, 16), paddingBottom: desktop ? Math.max(insets.bottom, 12) : 0 }]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Cancelar filtros" onPress={() => close()} style={StyleSheet.absoluteFill} />
          <Animated.View testID="filter-sheet" accessibilityViewIsModal onLayout={onLayout} style={[styles.sheet, !desktop && [styles.docked, { paddingBottom: insets.bottom }], sheetStyle]}>
            {!desktop && <GestureDetector gesture={gesture}>
              <View testID="filter-sheet-handle" collapsable={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.gripZone}>
                <SheetHandle />
              </View>
            </GestureDetector>}
            {children(close)}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  desktop: { justifyContent: 'center', paddingHorizontal: 24 },
  scrim: { backgroundColor: colors.overlay },
  sheet: { width: '100%', maxWidth: 640, maxHeight: '100%', flexShrink: 1, alignSelf: 'center', borderRadius: rounded.sheet, backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  // On a phone the sheet rests on the bottom edge.
  docked: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
  gripZone: { height: 30, alignItems: 'center', justifyContent: 'flex-start' },
}));
