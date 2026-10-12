import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultFilters } from '../src/domain/listings.ts';
import { describeSearch, searchName, toSavedFilters } from '../src/searches/domain.ts';
import { control, executeComponent, Hooks } from './helpers/tsxHooks.ts';

test('save-search sheet sends one request while the current save is pending', async () => {
  const hooks = new Hooks();
  let requests = 0, saved = 0;
  let finish!: (value: null) => void;
  const pending = new Promise<null>(resolve => { finish = resolve; });
  const component = executeComponent('src/components/SaveSearchSheet.tsx', 'SaveSearchSheet', hooks, {
    useStyles: () => ({ colors: {}, styles: {} }),
    useSavedSearches: () => ({ save: async () => { requests++; return pending; }, saving: false, error: '' }),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0 }), searchName, toSavedFilters, describeSearch,
    Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', View: 'View', ScrollView: 'ScrollView',
    Icon: 'Icon', Text: 'Text', TextInput: 'TextInput', Button: 'Button', ActionGroup: 'ActionGroup',
  });
  const tree = hooks.render(() => component({ filters: defaultFilters, onClose() {}, onSaved: () => saved++ }));
  const save = control(tree, 'Guardar').onPress;
  save(); save();
  assert.equal(requests, 1);
  finish(null);
  await pending;
  await Promise.resolve();
  assert.equal(saved, 0);
});
