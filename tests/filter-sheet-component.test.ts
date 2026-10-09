import assert from 'node:assert/strict';
import test from 'node:test';
import { createFilterDismissalGate, filterSheetPosition, shouldDismissFilterSheet } from '../src/components/filterSheetMotion.ts';
import { control, elements, executeComponent, Hooks } from './helpers/tsxHooks.ts';

function fixture(deferBridge = false) {
  const hooks = new Hooks();
  const animations: { kind: string; target: number; complete?: (finished: boolean) => void }[] = [];
  const callbacks: Record<string, (event: any, success?: boolean) => void> = {};
  const bridge: (() => void)[] = [];
  let closed = 0, applied = 0, keyboard = false, dismissedKeyboard = 0, width = 400, reduced = false;
  const pan: any = {};
  for (const name of ['enabled', 'activeOffsetY', 'failOffsetX', 'maxPointers']) pan[name] = (value: unknown) => { pan[name + 'Value'] = value; return pan; };
  for (const name of ['onBegin', 'onUpdate', 'onEnd', 'onFinalize']) pan[name] = (work: any) => { callbacks[name] = work; return pan; };
  const component = executeComponent('src/components/FilterSheet.tsx', 'FilterSheet', hooks, {
    useStyles: () => ({ colors: {}, styles: {} }),
    createFilterDismissalGate, filterSheetPosition, shouldDismissFilterSheet,
    useReducedMotion: () => reduced,
    useWindowDimensions: () => ({ width, height: 800 }), useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
    useSharedValue: (initial: any) => hooks.useRef({ value: initial }).current,
    useAnimatedStyle: (work: () => any) => ({ evaluate: work }),
    withTiming: (target: number, _config: any, complete?: any) => { animations.push({ kind: 'timing', target, complete }); return target; },
    withSpring: (target: number, _config: any, complete?: any) => { animations.push({ kind: 'spring', target, complete }); return target; },
    cancelAnimation() {}, scheduleOnRN: (work: (...args: any[]) => void, ...args: any[]) => { if (deferBridge) bridge.push(() => work(...args)); else work(...args); },
    ReduceMotion: { System: 'system', Never: 'never' }, SHEET_SPRING: { duration: 300, dampingRatio: 1, overshootClamping: true },
    Gesture: { Pan: () => pan }, GestureDetector: 'GestureDetector', GestureHandlerRootView: 'GestureHandlerRootView',
    Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', Pressable: 'Pressable', View: 'View', Animated: { View: 'AnimatedView' },
    Keyboard: { isVisible: () => keyboard, dismiss: () => { keyboard = false; dismissedKeyboard++; } },
    StyleSheet: { absoluteFill: {} },
  });
  const render = () => hooks.render(() => component({
    onClose: () => closed++,
    children: (close: (commit?: () => void) => void) => ({ type: 'Apply', props: { label: 'Apply', onPress: () => close(() => applied++) } }),
  }));
  const layout = () => {
    const sheet = elements(render()).find(element => element.props.testID === 'filter-sheet')!;
    sheet.props.onLayout({ nativeEvent: { layout: { height: 600 } } });
  };
  return { render, layout, callbacks, animations, pan, closed: () => closed, applied: () => applied, keyboard: () => { keyboard = true; }, keyboardDismissals: () => dismissedKeyboard, wide: () => { width = 900; }, reduce: () => { reduced = true; }, dispose: () => hooks.dispose(), flush: () => { for (const work of bridge.splice(0)) work(); } };
}

test('the real sheet ignores a completion from an interrupted drag dismissal', () => {
  const f = fixture(); f.layout();
  f.callbacks.onBegin({}); f.callbacks.onUpdate({ translationY: 240 }); f.callbacks.onEnd({ velocityY: 0 });
  const old = f.animations.at(-1)!;
  assert.equal(old.target, 632);
  f.callbacks.onBegin({});
  old.complete?.(true);
  assert.equal(f.closed(), 0);
  f.callbacks.onUpdate({ translationY: -400 }); f.callbacks.onEnd({ velocityY: -500 });
  assert.equal(f.animations.at(-1)?.target, 0);
});

test('the real sheet applies only once and completes the explicit confirmation', () => {
  const f = fixture(); f.layout();
  const apply = control(f.render(), 'Apply');
  apply.onPress(); apply.onPress();
  assert.equal(f.applied(), 1);
  const finish = f.animations.at(-1)?.complete;
  f.callbacks.onBegin({});
  finish?.(true); finish?.(true);
  assert.equal(f.closed(), 1);
});

test('Back hides the keyboard before closing and unmount cancels late callbacks', () => {
  const f = fixture(); f.layout(); f.keyboard();
  f.render().props.onRequestClose();
  assert.equal(f.keyboardDismissals(), 1);
  assert.equal(f.closed(), 0);
  f.render().props.onRequestClose();
  const finish = f.animations.at(-1)?.complete;
  f.dispose(); finish?.(true);
  assert.equal(f.closed(), 0);
});

test('desktop and reduced motion use fades and disable the drag', () => {
  for (const change of ['wide', 'reduce'] as const) {
    const f = fixture(); f[change](); f.layout();
    assert.equal(f.pan.enabledValue, false);
    control(f.render(), 'Apply').onPress();
    assert.equal(f.animations.at(-1)?.kind, 'timing');
    f.animations.at(-1)?.complete?.(true);
    assert.equal(f.closed(), 1);
  }
});

test('a completion already queued for JS is rejected if the UI gesture retook the panel', () => {
  const f = fixture(true); f.layout();
  f.callbacks.onBegin({}); f.callbacks.onUpdate({ translationY: 240 }); f.callbacks.onEnd({ velocityY: 0 });
  f.flush();
  f.animations.at(-1)?.complete?.(true);
  f.callbacks.onBegin({});
  f.flush();
  assert.equal(f.closed(), 0);
});

test('a reduced-motion change completes an accepted gesture close before its JS begin arrives', () => {
  const f = fixture(true); f.layout();
  f.callbacks.onBegin({}); f.callbacks.onUpdate({ translationY: 240 }); f.callbacks.onEnd({ velocityY: 0 });
  f.reduce(); f.render();
  f.flush();
  assert.equal(f.closed(), 1);
});

test('a mode change settles a re-released panel even while JS retains the previous close ticket', () => {
  const f = fixture(true); f.layout();
  f.callbacks.onBegin({}); f.callbacks.onUpdate({ translationY: 240 }); f.callbacks.onEnd({ velocityY: 0 });
  f.flush();
  f.callbacks.onBegin({}); f.callbacks.onUpdate({ translationY: 20 }); f.callbacks.onEnd({ velocityY: 0 });
  f.reduce(); f.render();
  f.flush();
  assert.equal(f.closed(), 1);
});
