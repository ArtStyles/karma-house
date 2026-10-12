import test from 'node:test';
import assert from 'node:assert/strict';
import { safeReturnTo } from '../src/auth/callback.ts';
import { emptyDraft } from '../src/domain/listings.ts';
import { elements, executeComponent, Hooks } from './helpers/tsxHooks.ts';
import { publicationReturnTo, readPublicationEntry } from '../src/domain/publicationEntry.ts';

test('authentication returns to the selected publication operation and optional paste entry', () => {
  for (const route of ['/publish?operation=sale', '/publish?operation=swap', '/publish?operation=rent', '/publish?operation=wanted', '/publish?import=1', '/publish?operation=rent&import=1']) {
    assert.equal(safeReturnTo(route), route);
  }
});

test('publication return routes reject ambiguous operations and additional destinations', () => {
  for (const route of ['/publish?operation=other', '/publish?operation=rent&operation=sale', '/publish?operation=rent&returnTo=https://example.test', '/publish?import=true', '/publish?operation=rent#fragment', '//example.test/publish?operation=rent']) {
    assert.equal(safeReturnTo(route), '/profile');
  }
});

test('publication entry accepts only known single operations and an explicit paste flag', async () => {
  const { readPublicationEntry } = await import('../src/domain/publicationEntry.ts');
  assert.deepEqual(readPublicationEntry({ operation: 'sale' }), { operation: 'sale', import: false });
  assert.deepEqual(readPublicationEntry({ operation: 'swap' }), { operation: 'swap', import: false });
  assert.deepEqual(readPublicationEntry({ operation: 'rent' }), { operation: 'rent', import: false });
  assert.deepEqual(readPublicationEntry({ operation: 'wanted', import: '1' }), { operation: 'wanted', import: true });
  assert.deepEqual(readPublicationEntry({ import: '1' }), { import: true });
  assert.deepEqual(readPublicationEntry({ operation: ['sale', 'rent'], import: ['1'] }), { import: false });
  assert.deepEqual(readPublicationEntry({ operation: 'other', import: 'true' }), { import: false });
});

test('publication entry builds a return destination without losing paste or operation', async () => {
  const { publicationReturnTo } = await import('../src/domain/publicationEntry.ts');
  assert.equal(publicationReturnTo({ operation: 'rent', import: true }), '/publish?operation=rent&import=1');
  assert.equal(publicationReturnTo({ operation: 'wanted', import: false }), '/publish?operation=wanted');
  assert.equal(publicationReturnTo({ import: true }), '/publish?import=1');
  assert.equal(publicationReturnTo({ import: false }), '/publish');
});

test('a fresh wanted or rent draft starts with the required defaults without mutating the shared draft', async () => {
  const { restorePublicationDraft } = await import('../src/domain/publicationEntry.ts');
  const before = structuredClone(emptyDraft);
  const wanted = restorePublicationDraft(null, emptyDraft, 'wanted');
  assert.equal(wanted.operation, 'wanted');
  assert.equal(wanted.type, '');
  assert.deepEqual(wanted.wantedOperations, ['sale', 'swap']);
  assert.equal(restorePublicationDraft(null, emptyDraft, 'rent').rentPeriod, 'month');
  assert.equal(restorePublicationDraft(null, emptyDraft, 'sale').operation, 'sale');
  assert.equal(restorePublicationDraft(null, emptyDraft, 'swap').operation, 'swap');
  assert.deepEqual(emptyDraft, before);
});

test('restoring an existing draft preserves its operation, photos and retry identity despite another entry choice', async () => {
  const { restorePublicationDraft } = await import('../src/domain/publicationEntry.ts');
  const saved = { ...emptyDraft, operation: 'sale' as const, title: 'Mi borrador', description: 'Texto conservado', clientRequestId: 'existing-request', photoUri: 'file:///cover.jpg', photos: [{ uri: 'file:///cover.jpg', uploadId: 'photo-id' }] };
  const restored = restorePublicationDraft(JSON.stringify(saved), emptyDraft, 'rent');
  assert.equal(restored.operation, 'sale');
  assert.equal(restored.title, 'Mi borrador');
  assert.equal(restored.description, 'Texto conservado');
  assert.equal(restored.clientRequestId, 'existing-request');
  assert.equal(restored.photoUri, 'file:///cover.jpg');
  assert.deepEqual(restored.photos, [{ uri: 'file:///cover.jpg', uploadId: 'photo-id' }]);
});

test('an unfinished operation choice keeps entered fields and photos when the entry supplies the operation', async () => {
  const { restorePublicationDraft } = await import('../src/domain/publicationEntry.ts');
  const saved = { ...emptyDraft, title: 'Datos empezados', photoUri: 'file:///cover.jpg', photos: [{ uri: 'file:///cover.jpg' }] };
  const restored = restorePublicationDraft(JSON.stringify(saved), emptyDraft, 'wanted');
  assert.equal(restored.operation, 'wanted');
  assert.equal(restored.title, 'Datos empezados');
  assert.equal(restored.type, saved.type);
  assert.equal(restored.photoUri, 'file:///cover.jpg');
  assert.deepEqual(restored.photos, [{ uri: 'file:///cover.jpg' }]);
});

test('corrupt persisted data falls back to a fresh selected operation rather than a broken form', async () => {
  const { restorePublicationDraft } = await import('../src/domain/publicationEntry.ts');
  const restored = restorePublicationDraft('{invalid', emptyDraft, 'wanted');
  assert.equal(restored.operation, 'wanted');
  assert.equal(restored.type, '');
  assert.equal(restored.title, '');
});

test('a retained publication form becomes inactive when its screen loses focus', () => {
  const hooks = new Hooks();
  const bindings: Record<string, unknown> = {
    useStyles: () => ({ colors: {}, styles: {} }), useMarketplace: () => ({ ready: true, mode: 'demo' }),
    useAuth: () => ({ ready: true }), useLocalSearchParams: () => ({ operation: 'rent' }),
    useFocusEffect: (work: () => void) => hooks.useEffect(work, [work]), readPublicationEntry, publicationReturnTo,
    OPERATIONS: [], choices: [], ASSISTED_PUBLICATION_EMAIL: '',
  };
  for (const name of ['SafeAreaView', 'View', 'PageTitle', 'Button', 'ListingForm']) bindings[name] = name;
  const component = executeComponent('src/screens/PublishScreen.tsx', 'PublishScreen', hooks, bindings);
  const render = () => hooks.render(() => component());
  render();
  assert.equal(elements(render()).find(element => element.type === 'ListingForm')?.props.active, true);
  hooks.dispose();
  assert.equal(elements(render()).find(element => element.type === 'ListingForm')?.props.active, false);
});
