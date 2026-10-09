import assert from 'node:assert/strict';
import test from 'node:test';
import { executeComponent, Hooks } from './helpers/tsxHooks.ts';

function fixture() {
  const hooks = new Hooks();
  let reduced = false;
  const commands: { kind: string; value: number; config?: any }[] = [];
  const component = executeComponent('src/components/MotionPressable.tsx', 'MotionPressable', hooks, {
    AnimatedPressable: 'AnimatedPressable',
    useReducedMotion: () => reduced,
    useSharedValue: (initial: number) => hooks.useRef({ value: initial }).current,
    useAnimatedStyle: (work: () => any) => ({ evaluate: work }),
    withTiming: (value: number, config: any) => { commands.push({ kind: 'timing', value, config }); return value; },
    withSpring: (value: number, config: any) => { commands.push({ kind: 'spring', value, config }); return value; },
    cancelAnimation: () => commands.push({ kind: 'cancel', value: 1 }),
    ReduceMotion: { Always: 'always', System: 'system' },
  });
  return { commands, render: (props: any = {}) => hooks.render(() => component(props)), reduce: () => { reduced = true; } };
}

test('press feedback is immediate and return uses a non-bouncing interruptible spring', () => {
  const f = fixture();
  let tree = f.render({ style: ({ pressed }: any) => ({ opacity: pressed ? .8 : 1 }) });
  tree.props.onPressIn({});
  tree = f.render({ style: ({ pressed }: any) => ({ opacity: pressed ? .8 : 1 }) });
  assert.equal(tree.props.style[0].opacity, .8);
  assert.equal(f.commands.at(-1)?.value, .98);
  tree.props.onPressOut({});
  assert.equal(f.commands.at(-1)?.kind, 'spring');
  assert.equal(f.commands.at(-1)?.value, 1);
  assert.equal(f.commands.at(-1)?.config.dampingRatio, 1);
  assert.equal(f.commands.at(-1)?.config.overshootClamping, true);
  tree.props.onPressIn({});
  assert.equal(f.commands.at(-1)?.value, .98);
});

test('disabling a held button resets its scale and pressed style', () => {
  const f = fixture();
  f.render().props.onPressIn({});
  const disabled = { disabled: true, style: ({ pressed }: any) => ({ pressed }) };
  f.render(disabled);
  const tree = f.render(disabled);
  assert.equal(tree.props.disabled, true);
  assert.equal(tree.props.style[0].pressed, false);
  assert.equal(tree.props.style[1].evaluate().transform[0].scale, 1);
});

test('reduced motion keeps visual pressed feedback while omitting compression', () => {
  const f = fixture();
  f.reduce();
  const props = { style: ({ pressed }: any) => ({ pressed }) };
  f.render(props).props.onPressIn({});
  const tree = f.render(props);
  assert.equal(tree.props.style[0].pressed, true);
  assert.equal(tree.props.style[1].evaluate().transform[0].scale, 1);
});

test('custom card scale and caller events are retained without committing on touch-down', () => {
  const f = fixture();
  let down = 0, up = 0, committed = 0;
  const tree = f.render({ pressedScale: .995, onPressIn: () => down++, onPressOut: () => up++, onPress: () => committed++ });
  tree.props.onPressIn({});
  assert.equal(f.commands.at(-1)?.value, .995);
  assert.equal(committed, 0);
  tree.props.onPressOut({});
  assert.equal(down, 1);
  assert.equal(up, 1);
  tree.props.onPress();
  assert.equal(committed, 1);
});
