import test from 'node:test';
import assert from 'node:assert/strict';
import { control, elements, executeComponent, Hooks } from './helpers/tsxHooks.ts';

function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

async function fixture(guest = false, agency = false) {
  const hooks = new Hooks(), refresh = deferred<any>(), start = deferred<string>(), destinations: unknown[] = [], starts: unknown[] = [];
  const owner = 'owner', listing = { id: 'property', ownerId: owner, operation: 'sale', status: 'active', title: 'Casa', location: 'Vedado', province: 'La Habana', price: 100, createdAt: '2026-10-01', amenities: [] };
  const options = { propertyId: listing.id, personalContact: true, agencies: agency ? [{ agencyId: 'agency', tradeName: 'Inmobiliaria', contactAvailable: true }] : [] };
  const bindings: Record<string, unknown> = {
    AbortController,
    useStyles: () => ({ colors: {}, styles: {} }), useLocalSearchParams: () => ({ id: listing.id }),
    useMarketplace: () => ({ mode: 'cloud', isOwnListing: () => false }),
    useAuth: () => ({ ready: true, user: guest ? null : { id: 'buyer' }, session: { access_token: 'buyer' } }),
    useMessaging: () => ({ ready: true, startConversation: (...args: unknown[]) => { starts.push(args); return start.promise; } }),
    useAgencyWorkspace: () => ({ captureAccountContext: () => ({ signal: new AbortController().signal, checkpoint() {}, release() {} }) }),
    supabase: {}, isUuid: () => true, readPublicPropertyContact: async () => options,
    createAgencyMessagingRepository: () => ({ start: (...args: unknown[]) => { starts.push(args); return start.promise.then(id => ({ id })); } }),
    useFocusEffect: (work: () => void) => hooks.useEffect(work, [work]),
    useListing: () => ({ listing, ready: true, offline: false, retry() {} }),
    useFavoriteHeart: () => ({ favorite: false, error: '', toggle: async () => {} }),
    useListingManagement: () => ({ value: { managerId: owner, contactAvailable: true }, refresh: () => refresh.promise }),
    pendingIntentStore: { write: async () => {}, take: async () => null }, pendingIntentDestination: () => '/property/property',
    usePublicProfile: () => ({ profile: null }), listingPresentation: () => 'ready', useWindowDimensions: () => ({ width: 390, height: 844 }),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0 }), useReducedMotion: () => false,
    listingOperation: () => 'sale', cartelLabel: () => 'Se vende', formatMoney: () => '$100', priceSuffix: () => '',
    StyleSheet: { absoluteFill: {} }, PROPERTY_REPORT_REASONS: [], CONDITIONS: [], NEEDS_CONNECTION: 'Sin conexión',
    createMessageId: () => 'request', agencyError: (error: Error) => error.message,
    router: { push: (destination: unknown) => destinations.push(destination) },
  };
  for (const name of ['ActivityIndicator', 'View', 'Text', 'Pressable', 'SafeAreaView', 'ScrollView', 'Button', 'Icon', 'IconButton', 'PropertyImage', 'Notice', 'Sheet', 'Feature', 'Detail', 'Cartel', 'StateChip', 'ArchImage', 'PhotoGallery', 'ReportConversationSheet', 'AgencyVerifiedBadge']) bindings[name] = name;
  const component = executeComponent('src/screens/DetailScreen.tsx', 'DetailScreen', hooks, bindings);
  const render = () => hooks.render(() => component());
  render(); await settle(); render(); control(render(), 'Contactar').onPress();
  const sheet = () => elements(render()).find(element => element.type === 'Sheet' && elements(element).some(child => child.props?.label === 'Cerrar'))!;
  const contact = () => control(sheet(), agency ? 'Contactar con Inmobiliaria' : 'Contactar con el responsable personal').onPress();
  return { render, sheet, contact, refresh, start, starts, destinations, close: () => control(render(), 'Cerrar').onPress(), blur: () => hooks.dispose() };
}

test('guest contact hides its sheet before navigating to authentication', async () => {
  const f = await fixture(true); f.contact(); await settle();
  assert.equal(f.destinations.length, 1); assert.equal(f.sheet().props.visible, false);
});

test('closing during personal authority refresh prevents starting a conversation', async () => {
  const f = await fixture(); f.contact(); f.close(); f.refresh.resolve({ managerId: 'owner', contactAvailable: true }); await settle();
  assert.equal(f.starts.length, 0); assert.equal(f.destinations.length, 0); assert.equal(f.sheet().props.visible, false);
});

test('closing after a request starts suppresses its eventual navigation', async () => {
  const f = await fixture(); f.contact(); f.refresh.resolve({ managerId: 'owner', contactAvailable: true }); await settle();
  assert.equal(f.starts.length, 1); f.close(); f.start.resolve('conversation'); await settle(); assert.equal(f.destinations.length, 0);
});

test('a stale agency failure cannot reopen a closed sheet or show an error', async () => {
  const f = await fixture(false, true); f.contact(); await settle(); assert.equal(f.starts.length, 1, JSON.stringify(elements(f.render()).filter(element => element.type === 'Notice')));
  f.close(); f.start.reject(Error('KH_AGENCY_MANAGER_CHANGED')); await settle();
  assert.equal(f.sheet().props.visible, false); assert.equal(f.destinations.length, 0);
  assert.ok(!elements(f.render()).some(element => element.type === 'Notice' && JSON.stringify(element.props).includes('Elige de nuevo')));
});

test('losing focus invalidates a request while the detail screen remains mounted', async () => {
  const f = await fixture(); f.contact(); f.blur(); f.refresh.resolve({ managerId: 'owner', contactAvailable: true }); await settle();
  assert.equal(f.starts.length, 0); assert.equal(f.destinations.length, 0); assert.equal(f.sheet().props.visible, false);
});
