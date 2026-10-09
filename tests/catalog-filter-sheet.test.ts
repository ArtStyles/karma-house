import assert from 'node:assert/strict';
import test from 'node:test';
import { activeFilterCount, defaultFilters, filterRangeError } from '../src/domain/listings.ts';
import { createFilterDismissalGate } from '../src/components/filterSheetMotion.ts';
import { control, elements, executeComponent, Hooks } from './helpers/tsxHooks.ts';

function fixture() {
  const hooks = new Hooks();
  const applied: any[] = [];
  let closed = 0;
  const gate = createFilterDismissalGate(() => closed++);
  const close = (commit?: () => void) => { if (gate.begin(1, commit)) gate.finish(1); };
  const component = executeComponent('src/components/CatalogFilters.tsx', 'CatalogFilters', hooks, {
    useStyles: () => ({ colors: {}, styles: {} }),
    activeFilterCount, defaultFilters, filterRangeError,
    FilterSheet: 'FilterSheet',
    AMENITY_GROUPS: [], CONDITIONS: [], PROVINCES: [], SORT_OPTIONS: [],
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', Switch: 'Switch',
    Icon: 'Icon', IconButton: 'IconButton', Button: 'Button', Pill: 'Pill', Notice: 'Notice',
    SelectionField: 'SelectionField', RangeFields: 'RangeFields',
    useReducedMotion: () => false, useSafeAreaInsets: () => ({}), useWindowDimensions: () => ({ width: 400 }),
    Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', Pressable: 'Pressable',
    Animated: { View: 'AnimatedView' }, StyleSheet: {}, FadeIn: { duration: () => ({ reduceMotion: () => undefined }) }, ReduceMotion: {},
  });
  const render = () => {
    const sheet = hooks.render(() => component({ filters: { ...defaultFilters, amenities: [] }, onApply: (value: any) => applied.push(value), onClose: () => closed++ }));
    assert.equal(sheet.type, 'FilterSheet');
    assert.equal(typeof sheet.props.children[0], 'function');
    return sheet.props.children[0](close);
  };
  return { render, applied, closed: () => closed };
}

test('editing and closing filters discards the draft without applying it', () => {
  const f = fixture();
  control(f.render(), 'Venta').onPress();
  control(f.render(), 'Cerrar filtros sin aplicar').onPress();
  assert.equal(f.applied.length, 0);
  assert.equal(f.closed(), 1);
});

test('Apply sends the current draft exactly once through the sheet close gate', () => {
  const f = fixture();
  control(f.render(), 'Alquiler').onPress();
  const apply = control(f.render(), 'Aplicar filtros');
  apply.onPress();
  apply.onPress();
  assert.equal(f.applied.length, 1);
  assert.equal(f.applied[0].operation, 'rent');
  assert.equal(f.closed(), 1);
});

test('invalid prices cannot commit and clearing still preserves the search query', () => {
  const f = fixture();
  const range = elements(f.render()).find(element => element.type === 'RangeFields' && element.props.label === 'Precio')!;
  range.props.onMin('500');
  range.props.onMax('100');
  const apply = control(f.render(), 'Aplicar filtros');
  assert.equal(apply.disabled, true);
  apply.onPress();
  assert.equal(f.applied.length, 0);
  control(f.render(), 'Limpiar').onPress();
  assert.equal(control(f.render(), 'Aplicar filtros').disabled, false);
});
