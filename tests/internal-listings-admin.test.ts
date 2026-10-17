// @ts-nocheck -- Render the real TSX with deterministic hooks and no native or network services.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { listingBoardLabels, listingBoardState, normalizeSearch } from '../src/domain/listings.ts';
import { bumpErrorMessage, canBumpNow, formatProDate, isProActive, nextBumpAt } from '../src/pro/domain.ts';

function harness(screen, overrides = {}) {
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0;
  let auth = { user: { id: 'admin-A' }, session: { access_token: 'token-A' }, isAdmin: true, isOwner: true };
  let page = { items: [], total: 0, loading: false, refreshing: false, error: null, hasMore: false, offset: 0, reload: async () => {}, refresh: async () => {} };
  const context = {
    React, PROVINCES: [],
    useAuth: () => auth, useAdminQuery: () => page, useAdminApi: () => async () => {},
    useMarketplace: () => ({ mode: 'cloud', reviewListing: async () => {} }),
    useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef(initial) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
    useEffect() {}, useFocusEffect() {}, useCallback: fn => fn,
    createThemedStyles: () => () => ({ colors: { primary: '#00f' }, styles: new Proxy({}, { get: () => ({}) }) }),
    internalLayout: { maxWidth: 720, gutter: 20, radius: 16, gap: 16 },
    StyleSheet: { create: value => value }, router: { push() {} }, supabase: null,
    options: values => Object.entries(values).map(([value, label]) => ({ value, label })),
    listingFacts: () => '', operationBadge: () => '', typeLabel: () => '', formatMoney: () => '$ 1',
    listingBoardState, listingBoardLabels, normalizeSearch, listingOperation: () => 'sale', priceSuffix: () => '',
    useIncomingTransferCount: () => ({ count: 0, refresh: async () => {} }),
    usePro: () => ({ repository: null, status: null, error: '', loading: false, reload: async () => {} }),
    useAgencyWorkspace: () => ({ agencies: [] }),
    bumpErrorMessage, canBumpNow, formatProDate, isProActive, nextBumpAt,
    useConsultationRefresh: () => ({ refreshing: false, refresh: async () => {}, isRefreshing: () => false }),
    remoteErrorMessage: e => e.message, adminError: e => e.message,
    accountActions: () => ['suspend'], actionLabel: { suspend: 'Suspender cuenta' }, roleLabel: { member: 'Miembro' },
    ...overrides,
  };
  for (const name of ['SafeAreaView', 'ScrollView', 'RefreshControl', 'PageTitle', 'EmptyState', 'View', 'Notice', 'Text', 'TextInput', 'Modal', 'KeyboardAvoidingView', 'ActivityIndicator', 'Button', 'PropertyImage', 'AdminToolbar', 'AdminPagination', 'AdminStatus', 'AccountPrompt', 'ActionGroup', 'Pill', 'Pressable', 'Icon', 'ListingStateChip', 'Pagination', 'Sheet', 'IconButton']) context[name] = name;
  const source = readFileSync(`src/screens/${screen}.tsx`, 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText + `\nglobalThis.renderScreen = ${screen};`, context);
  return { render(props) { stateIndex = 0; refIndex = 0; return context.renderScreen(props); }, setAuth(value) { auth = value; }, get auth() { return auth; }, setPage(value) { page = { ...page, ...value }; } };
}
function elements(tree) { return !tree ? [] : Array.isArray(tree) ? tree.flatMap(elements) : typeof tree === 'object' ? [tree, ...elements(tree.props?.children)] : []; }

test('failed review query never claims that the moderation queue is complete', () => {
  const screen = harness('AdminScreen');
  screen.setPage({ error: 'server unavailable' });
  const tree = screen.render();
  assert.ok(elements(tree).some(node => node.type === 'Notice' && node.props.error));
  assert.ok(elements(tree).some(node => node.type === 'EmptyState' && node.props.title === 'No pudimos cargar los anuncios'));
  assert.equal(elements(tree).some(node => node.type === 'EmptyState' && node.props.title === 'Todo revisado'), false);
});

test('review confirmation hides the previous private selection synchronously on token rotation', () => {
  const screen = harness('AdminScreen');
  screen.setPage({ items: [{ id: 'home-A', title: 'PRIVATE_REVIEW_A', price: 1, ownerId: 'member', version: 1, moderationStatus: 'pending', amenities: [] }], total: 1 });
  elements(screen.render()).find(node => node.type === 'Button' && node.props.label === 'Aprobar').props.onPress();
  assert.equal(elements(screen.render()).find(node => node.type === 'Modal').props.visible, true);
  screen.setAuth({ ...screen.auth, session: { access_token: 'token-B' } }); screen.setPage({ items: [] });
  const tree = screen.render();
  assert.equal(elements(tree).find(node => node.type === 'Modal').props.visible, false);
  assert.equal(JSON.stringify(tree).includes('PRIVATE_REVIEW_A'), false);
});

test('account moderation confirmation hides the old selection synchronously on token rotation', () => {
  const screen = harness('AdminManagementScreen');
  screen.setPage({ items: [{ id: 'member', displayName: 'PRIVATE_ACCOUNT_A', role: 'member', suspended: false }], total: 1 });
  elements(screen.render({ section: 'accounts' })).find(node => node.type === 'Button' && node.props.label === 'Suspender cuenta').props.onPress();
  assert.equal(elements(screen.render({ section: 'accounts' })).find(node => node.type === 'Modal').props.visible, true);
  screen.setAuth({ ...screen.auth, session: { access_token: 'token-B' } }); screen.setPage({ items: [] });
  const tree = screen.render({ section: 'accounts' });
  assert.equal(elements(tree).find(node => node.type === 'Modal').props.visible, false);
  assert.equal(JSON.stringify(tree).includes('PRIVATE_ACCOUNT_A'), false);
});

test('my listings state filter shows pending listings without mixing in live listings', () => {
  const ownListings = [
    { id: 'pending-home', title: 'PENDING_HOME', ownerId: 'admin-A', price: 1, status: 'active', moderationStatus: 'pending' },
    { id: 'live-home', title: 'LIVE_HOME', ownerId: 'admin-A', price: 1, status: 'active', moderationStatus: 'approved' },
  ];
  const screen = harness('MyListingsScreen', { useMarketplace: () => ({ mode: 'cloud', ownListings, refresh: async () => {} }) });
  const filter = elements(screen.render()).find(node => node.type === 'Pill' && node.props.label.startsWith('En revisión'));
  assert.ok(filter, 'the list provides its state filter');
  filter.props.onPress();
  const tree = screen.render();
  assert.ok(JSON.stringify(tree).includes('PENDING_HOME'));
  assert.equal(JSON.stringify(tree).includes('LIVE_HOME'), false);
});

test('my listings keeps initial loading distinct from an empty account', () => {
  const screen = harness('MyListingsScreen', { useMarketplace: () => ({ mode: 'cloud', ready: false, ownListings: [] }) });
  const tree = screen.render();
  assert.ok(elements(tree).some(node => node.type === 'ActivityIndicator'));
  assert.equal(elements(tree).some(node => node.type === 'EmptyState'), false);
});

test('my listings exposes the failed load without claiming that the account has no listings', () => {
  const screen = harness('MyListingsScreen', { useMarketplace: () => ({ mode: 'cloud', ready: true, storageError: 'server unavailable', ownListings: [] }) });
  const tree = screen.render();
  assert.ok(elements(tree).some(node => node.type === 'Notice' && node.props.error));
  assert.equal(elements(tree).some(node => node.type === 'EmptyState'), false);
});

// Pro: «Subir anuncio» depends on the listing being covered by Pro (item.isPro, from the server), a week after publication or the last bump.
const day = 864e5, ago = days => new Date(Date.now() - days * day).toISOString(), future = new Date(Date.now() + 30 * day).toISOString();
const settle = async () => { for (let n = 0; n < 4; n++) await new Promise(resolve => setImmediate(resolve)); };
const proFor = (personalUntil, extra = {}) => ({ repository: null, status: { personalUntil, agencies: [] }, error: '', loading: false, reload: async () => {}, ...extra });
const liveHome = (extra = {}) => ({ id: 'live-home', title: 'LIVE_HOME', ownerId: 'admin-A', price: 1, status: 'active', moderationStatus: 'approved', createdAt: ago(8), isPro: true, ...extra });
const unmarkedHome = (extra = {}) => { const { isPro, ...listing } = liveHome(extra); return listing; };
function myListings(listing, pro, marketplace = {}, overrides = {}) { return harness('MyListingsScreen', { usePro: () => pro, useMarketplace: () => ({ mode: 'cloud', ownListings: [listing], refresh: async () => {}, ...marketplace }), ...overrides }); }
const button = (screen, label) => elements(screen.render()).find(node => node.type === 'Button' && node.props.label === label);
const shows = (screen, text) => JSON.stringify(screen.render()).includes(text);
const errorNotice = screen => elements(screen.render()).find(node => node.type === 'Notice' && node.props.error)?.props.children;

test('my listings offers Subir anuncio on a Pro listing once a week has passed since publishing', () => {
  const screen = myListings(liveHome({ createdAt: ago(8) }), proFor(future));
  assert.ok(button(screen, 'Subir anuncio'));
  assert.equal(shows(screen, 'Podrás subirlo el'), false);
});

test('my listings tells when a Pro listing bumped yesterday can go up again', () => {
  const screen = myListings(liveHome({ createdAt: ago(30), bumpedAt: ago(1) }), proFor(future));
  assert.equal(button(screen, 'Subir anuncio'), undefined);
  assert.ok(shows(screen, 'Podrás subirlo el'));
});

test('my listings follows the listing, not the person: an agency listing is covered without a personal Pro', () => {
  for (const pro of [proFor(null), proFor(ago(1)), { ...proFor(null), status: null }]) {
    assert.ok(button(myListings(liveHome({ createdAt: ago(8) }), pro), 'Subir anuncio'));
    assert.ok(shows(myListings(liveHome({ createdAt: ago(30), bumpedAt: ago(1) }), pro), 'Podrás subirlo el'));
  }
});

test('my listings shows neither the bump nor its date on a listing Pro does not cover, even if the person has Pro', () => {
  for (const pro of [proFor(future), proFor(null), { ...proFor(null), status: null }]) {
    for (const listing of [unmarkedHome({ createdAt: ago(8) }), unmarkedHome({ createdAt: ago(30), bumpedAt: ago(1) })]) {
      const screen = myListings(listing, pro);
      assert.equal(button(screen, 'Subir anuncio'), undefined);
      assert.equal(shows(screen, 'Podrás subirlo el'), false);
    }
  }
});

test('Subir anuncio spins alone while it runs; Pausar only waits', async () => {
  let finish; const gate = new Promise(resolve => { finish = resolve; });
  const screen = myListings(liveHome(), proFor(future, { repository: { bump: () => gate } }));
  button(screen, 'Subir anuncio').props.onPress();
  assert.equal(button(screen, 'Subir anuncio').props.loading, true);
  assert.equal(button(screen, 'Pausar').props.loading, false);
  assert.equal(button(screen, 'Pausar').props.disabled, true);
  finish({ bumpedAt: ago(0), nextBumpAt: future }); await settle();
  assert.equal(button(screen, 'Subir anuncio').props.loading, false);
  assert.equal(button(screen, 'Pausar').props.disabled, false);
});

test('a refresh that fails after a successful bump is a loading problem, not a failed bump', async () => {
  const repository = { bump: async () => ({ bumpedAt: ago(0), nextBumpAt: future }) };
  const screen = myListings(liveHome(), proFor(future, { repository }), { refresh: async () => { throw new Error('REFRESH_DOWN'); } });
  button(screen, 'Subir anuncio').props.onPress(); await settle();
  assert.equal(errorNotice(screen), 'REFRESH_DOWN');
});

test('a bump refused because Pro ended explains it and re-reads Pro', async () => {
  let reloads = 0;
  const repository = { bump: async () => { throw { message: 'KH_PRO_REQUIRED' }; } };
  const screen = myListings(liveHome(), proFor(future, { repository, reload: async () => { reloads++; } }));
  button(screen, 'Subir anuncio').props.onPress(); await settle();
  assert.match(errorNotice(screen), /parte de KarmaHouse Pro/);
  assert.equal(reloads, 1);
});

test('pull to refresh also re-reads Pro', async () => {
  let reloads = 0;
  const screen = myListings(liveHome(), proFor(future, { reload: async () => { reloads++; } }), {}, { useConsultationRefresh: (key, work) => ({ refreshing: false, refresh: work, isRefreshing: () => false }) });
  await elements(screen.render()).find(node => node.type === 'ScrollView').props.refreshControl.props.onRefresh(); await settle();
  assert.equal(reloads, 1);
});

test('my listings sends an agency listing to the agency instead of offering personal edits', () => {
  const agency = { id: 'agency-1', tradeName: 'Casas Principal' };
  const screen = myListings(liveHome({ createdAt: ago(8), agencyId: agency.id }), proFor(null), {}, { useAgencyWorkspace: () => ({ agencies: [agency] }) });
  assert.ok(button(screen, 'Gestionar en la inmobiliaria'));
  assert.ok(shows(screen, 'Lo gestiona Casas Principal.'));
  for (const label of ['Editar', 'Pausar', 'Reactivar']) assert.equal(button(screen, label), undefined, label);
  assert.equal(shows(screen, 'Cerrar anuncio'), false);
  assert.ok(button(screen, 'Subir anuncio'), 'the agency Pro still lets members bump it');
  const personal = myListings(liveHome({ createdAt: ago(8) }), proFor(null));
  assert.ok(button(personal, 'Editar'));
  assert.equal(button(personal, 'Gestionar en la inmobiliaria'), undefined);
});
