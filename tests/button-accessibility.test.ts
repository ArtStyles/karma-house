import assert from 'node:assert/strict';
import test from 'node:test';
import { executeComponent, Hooks } from './helpers/tsxHooks.ts';

function renderButton(props: Record<string, unknown>) {
  const hooks = new Hooks();
  const Button = executeComponent('src/components/ui.tsx', 'Button', hooks, {
    useStyles: () => ({ colors: {}, styles: {} }),
    MotionPressable: 'MotionPressable', ActivityIndicator: 'ActivityIndicator', Text: 'Text', Icon: 'Icon',
  });
  return hooks.render(() => Button({ label: 'Guardar', onPress: () => {}, ...props }));
}

test('a pending button communicates busy and prevents another submission', () => {
  const button = renderButton({ loading: true });
  assert.equal(button.props.accessibilityState.busy, true);
  assert.equal(button.props.accessibilityState.disabled, true);
  assert.equal(button.props.disabled, true);
});

test('an available button and a disabled button do not announce an active request', () => {
  for (const disabled of [false, true]) {
    const button = renderButton({ disabled });
    assert.equal(button.props.accessibilityState.busy, false);
    assert.equal(button.props.disabled, disabled);
  }
});
