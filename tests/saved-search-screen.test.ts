import assert from 'node:assert/strict';
import test from 'node:test';
import { elements, executeComponent, Hooks } from './helpers/tsxHooks.ts';

test('saved searches retain the loaded view and show refresh progress on a subsequent load', () => {
  const hooks = new Hooks();
  let loading = false;
  const component = executeComponent('src/screens/SavedSearchesScreen.tsx', 'SavedSearchesBody', hooks, {
    useStyles: () => ({ colors: {}, styles: {} }),
    useSavedSearches: () => ({ items: [], loading, error: '', saving: false, refresh: async () => {}, toggle: async () => {}, remove: async () => false }),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
    ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', ActivityIndicator: 'ActivityIndicator',
    EmptyState: 'EmptyState', Modal: 'Modal', View: 'View', Text: 'Text', Pressable: 'Pressable',
    SafeAreaView: 'SafeAreaView', Button: 'Button', ActionGroup: 'ActionGroup', Sheet: 'Sheet', Icon: 'Icon', IconButton: 'IconButton',
    router: { navigate() {} },
  });
  const render = () => hooks.render(() => component());
  assert.ok(elements(render()).some(item => item.type === 'ActivityIndicator'));
  loading = true;
  assert.equal(render().props.refreshControl.props.refreshing, false);
  loading = false;
  assert.ok(elements(render()).some(item => item.type === 'EmptyState'));
  loading = true;
  const refreshing = render();
  assert.equal(refreshing.props.refreshControl.props.refreshing, true);
  assert.ok(elements(refreshing).some(item => item.type === 'EmptyState'));
  assert.equal(elements(refreshing).some(item => item.type === 'ActivityIndicator'), false);
});
