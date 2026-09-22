// @ts-nocheck -- Executed directly by Node 24; app compilation has no Node type dependency.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createListing,
  filterListings,
  listingBoardState,
  updateListing,
  validateDraft,
  type Listing,
  type ListingDraft,
} from '../src/domain/listings.ts';
import {
  createMarketplaceController,
  decodeMarketplaceSnapshot,
  type MarketplaceStorage,
} from '../src/state/marketplaceStore.ts';

const baseDraft: ListingDraft = {
  title: 'Casa de prueba en el barrio Sol',
  location: 'Barrio Sol',
  province: 'La Habana',
  price: '125000',
  bedrooms: '3',
  bathrooms: '2',
  area: '140',
  type: 'Casa',
  description: 'Vivienda ficticia luminosa con patio y espacio para compartir.',
  amenities: ['Patio', 'Balcón'],
  imageKey: 'vedado',
};

const listings: Listing[] = [
  createListing(baseDraft, { id: 'local-casa', now: '2026-09-15T12:00:00.000Z' }),
  {
    ...createListing(
      {
        ...baseDraft,
        title: 'Apartamento en Védado Norte',
        location: 'Védado Norte',
        price: '80000',
        bedrooms: '2',
        type: 'Apartamento',
        imageKey: 'interior',
      },
      { id: 'local-apto', now: '2026-09-16T12:00:00.000Z' },
    ),
    owner: 'demo',
  },
  {
    ...createListing(
      { ...baseDraft, title: 'Casa pausada', price: '50000' },
      { id: 'local-paused', now: '2026-09-14T12:00:00.000Z' },
    ),
    status: 'paused',
  },
];

test('la búsqueda ignora mayúsculas y tildes', () => {
  const result = filterListings(listings, {
    query: 'vedado',
    type: 'Todas',
    maxPrice: '',
    minBedrooms: 0,
    sort: 'recent',
  });

  assert.deepEqual(result.map((listing) => listing.id), ['local-apto']);
});

test('los filtros se combinan y excluyen anuncios inactivos', () => {
  const result = filterListings(listings, {
    query: 'habana',
    type: 'Casa',
    maxPrice: '130000',
    minBedrooms: 3,
    sort: 'price-asc',
  });

  assert.deepEqual(result.map((listing) => listing.id), ['local-casa']);
});

test('un precio máximo inválido se ignora sin vaciar el catálogo', () => {
  const result = filterListings(listings, {
    query: '',
    type: 'Todas',
    maxPrice: 'no es un número',
    minBedrooms: 0,
    sort: 'price-asc',
  });

  assert.deepEqual(result.map((listing) => listing.id), ['local-apto', 'local-casa']);
});

test('la validación rechaza números no finitos y límites no razonables', () => {
  const cases: Array<[Partial<ListingDraft>, keyof ListingDraft]> = [
    [{ price: '1e309' }, 'price'],
    [{ price: '0' }, 'price'],
    [{ bedrooms: '0' }, 'bedrooms'],
    [{ bedrooms: '2.5' }, 'bedrooms'],
    [{ bathrooms: '0' }, 'bathrooms'],
    [{ area: '0' }, 'area'],
    [{ area: '10001' }, 'area'],
  ];

  for (const [change, field] of cases) {
    const result = validateDraft({ ...baseDraft, ...change });
    assert.equal(result.ok, false, `se esperaba error en ${field}`);
    assert.ok(result.errors[field], `falta el error de ${field}`);
  }
});

test('la validación admite una foto web en data URI mayor de 2 KB', () => {
  const photoUri = `data:image/jpeg;base64,${'A'.repeat(3_000)}`;
  const result = validateDraft({ ...baseDraft, photoUri });

  assert.equal(result.ok, true);
  assert.equal(result.errors.photoUri, undefined);
});

test('la validación rechaza esquemas de foto ajenos a imágenes locales', () => {
  const result = validateDraft({ ...baseDraft, photoUri: 'https://ejemplo.invalid/foto.jpg' });

  assert.equal(result.ok, false);
  assert.ok(result.errors.photoUri);
});

test('crear normaliza el borrador y editar conserva el id y la fecha', () => {
  const created = createListing(
    { ...baseDraft, title: '  Casa de prueba en el barrio Sol  ', amenities: [' Patio ', '', 'Patio'] },
    { id: 'local-estable', now: '2026-09-16T08:00:00.000Z' },
  );
  const updated = updateListing(created, { ...baseDraft, title: 'Casa actualizada de prueba' });

  assert.equal(created.title, 'Casa de prueba en el barrio Sol');
  assert.deepEqual(created.amenities, ['Patio']);
  assert.equal(updated.id, 'local-estable');
  assert.equal(updated.createdAt, '2026-09-16T08:00:00.000Z');
  assert.equal(updated.title, 'Casa actualizada de prueba');
});

test('editar sin foto elimina la foto anterior', () => {
  const created = createListing(
    { ...baseDraft, photoUri: 'file:///documentos/foto-anterior.jpg' },
    { id: 'local-con-foto', now: '2026-09-16T08:00:00.000Z' },
  );

  const updated = updateListing(created, baseDraft);

  assert.equal(updated.photoUri, undefined);
  assert.equal(Object.hasOwn(updated, 'photoUri'), false);
});

test('editar un anuncio demo se rechaza', () => {
  assert.throws(
    () => updateListing({ ...listings[0], owner: 'demo' }, baseDraft),
    /solo puedes editar anuncios locales/i,
  );
});

test('el codec recupera campos válidos y reporta un esquema parcialmente corrupto', () => {
  const validLocal = createListing(baseDraft, {
    id: 'local-conservado',
    now: '2026-09-16T09:00:00.000Z',
  });
  const decoded = decodeMarketplaceSnapshot(
    JSON.stringify({
      version: 1,
      localListings: [
        validLocal,
        { id: 7 },
        { ...validLocal, id: 'demo-no', owner: 'demo' },
        { ...validLocal, id: 'local-titulo-largo', title: 'X'.repeat(101) },
      ],
      favoriteIds: ['demo-uno', 42, 'demo-uno', 'local-conservado'],
      campoDesconocido: 'se descarta',
    }),
  );

  assert.deepEqual(decoded.snapshot.localListings.map((listing) => listing.id), ['local-conservado']);
  assert.deepEqual(decoded.snapshot.favoriteIds, ['demo-uno', 'local-conservado']);
  assert.match(decoded.issue ?? '', /datos inválidos/i);
  assert.deepEqual(Object.keys(decoded.snapshot).sort(), ['favoriteIds', 'localListings', 'version']);
});

test('el codec usa un estado seguro y reporta JSON ilegible', () => {
  const decoded = decodeMarketplaceSnapshot('{json roto');

  assert.deepEqual(decoded.snapshot, { version: 1, localListings: [], favoriteIds: [] });
  assert.match(decoded.issue ?? '', /no se pudieron leer/i);
});

test('el codec conserva una sola entrada cuando se repite un id local', () => {
  const first = createListing(baseDraft, {
    id: 'local-repetido',
    now: '2026-09-16T09:00:00.000Z',
  });
  const duplicate = { ...first, title: 'Casa duplicada de prueba' };

  const decoded = decodeMarketplaceSnapshot(
    JSON.stringify({
      version: 1,
      localListings: [first, duplicate],
      favoriteIds: [],
    }),
  );

  assert.deepEqual(decoded.snapshot.localListings.map((listing) => listing.title), [first.title]);
  assert.match(decoded.issue ?? '', /duplicad|inválid/i);
});

test('la hidratación mantiene ready en falso hasta terminar la lectura', async () => {
  const read = deferred<string | null>();
  const storage: MarketplaceStorage = {
    getItem: async () => read.promise,
    setItem: async () => undefined,
  };
  const controller = createMarketplaceController({ storage, demoListings: listings.slice(0, 1) });

  const hydration = controller.hydrate();
  assert.equal(controller.getState().ready, false);
  read.resolve(null);
  await hydration;

  assert.equal(controller.getState().ready, true);
  assert.deepEqual(controller.getState().listings.map((listing) => listing.id), ['local-casa']);
});

test('la hidratación descarta un anuncio local cuyo id coincide con un demo', async () => {
  const demo = { ...listings[0], id: 'demo-colision', owner: 'demo' as const };
  const collidingLocal = createListing(baseDraft, {
    id: 'demo-colision',
    now: '2026-09-16T09:00:00.000Z',
  });
  const storage: MarketplaceStorage = {
    getItem: async () =>
      JSON.stringify({ version: 1, localListings: [collidingLocal], favoriteIds: [] }),
    setItem: async () => undefined,
  };
  const controller = createMarketplaceController({ storage, demoListings: [demo] });

  await controller.hydrate();

  assert.deepEqual(controller.getState().listings.map((listing) => listing.id), ['demo-colision']);
  assert.match(controller.getState().storageError ?? '', /colisi|inválid/i);
});

test('favoritos concurrentes esperan disco y se guardan en serie sin perder cambios', async () => {
  const firstWrite = deferred<void>();
  const writes: string[] = [];
  let writeCount = 0;
  const storage: MarketplaceStorage = {
    getItem: async () => null,
    setItem: async (_key, value) => {
      writes.push(value);
      writeCount += 1;
      if (writeCount === 1) await firstWrite.promise;
    },
  };
  const controller = createMarketplaceController({ storage, demoListings: [] });
  await controller.hydrate();

  const first = controller.toggleFavorite('demo-uno');
  const second = controller.toggleFavorite('demo-dos');
  await waitFor(() => writes.length === 1);
  assert.deepEqual(controller.getState().favoriteIds, []);
  assert.equal(writes.length, 1);

  firstWrite.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(controller.getState().favoriteIds, ['demo-uno', 'demo-dos']);
  assert.equal(writes.length, 2);
  assert.deepEqual(JSON.parse(writes[1]).favoriteIds, ['demo-uno', 'demo-dos']);
});

test('una escritura fallida conserva el estado previo y la cola sigue operativa', async () => {
  let shouldFail = true;
  const storage: MarketplaceStorage = {
    getItem: async () => null,
    setItem: async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('disco no disponible');
      }
    },
  };
  const controller = createMarketplaceController({ storage, demoListings: [] });
  await controller.hydrate();

  await assert.rejects(controller.toggleFavorite('demo-uno'), /disco no disponible/);
  assert.deepEqual(controller.getState().favoriteIds, []);
  assert.match(controller.getState().storageError ?? '', /disco no disponible/);

  await controller.toggleFavorite('demo-dos');
  assert.deepEqual(controller.getState().favoriteIds, ['demo-dos']);
});

test('una mutación reintenta la lectura fallida antes de escribir', async () => {
  let reads = 0;
  const writes: string[] = [];
  const storage: MarketplaceStorage = {
    getItem: async () => {
      reads += 1;
      if (reads === 1) throw new Error('lectura temporalmente fallida');
      return JSON.stringify({ version: 1, localListings: [], favoriteIds: ['demo-persistido'] });
    },
    setItem: async (_key, value) => {
      writes.push(value);
    },
  };
  const controller = createMarketplaceController({ storage, demoListings: [] });

  await controller.hydrate();
  await controller.toggleFavorite('demo-nuevo');

  assert.equal(reads, 2);
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0]).favoriteIds, ['demo-persistido', 'demo-nuevo']);
});

test('crear rechaza un id normalizado que colisiona con un anuncio demo', async () => {
  const demo = { ...listings[0], id: 'demo-reservado', owner: 'demo' as const };
  let writes = 0;
  const storage: MarketplaceStorage = {
    getItem: async () => null,
    setItem: async () => {
      writes += 1;
    },
  };
  const controller = createMarketplaceController({
    storage,
    demoListings: [demo],
    idFactory: () => ' demo-reservado ',
  });
  await controller.hydrate();

  await assert.rejects(controller.saveListing(baseDraft), /identificador único/i);
  assert.equal(writes, 0);
  assert.deepEqual(controller.getState().listings.map((listing) => listing.id), ['demo-reservado']);
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('La condición esperada no ocurrió.');
}

test('the board state answers whether the listing is in the catalogue, not which field blocked it', () => {
  assert.equal(listingBoardState({ status: 'active', moderationStatus: 'approved' }), 'live');
  assert.equal(listingBoardState({ status: 'active' }), 'live');
  assert.equal(listingBoardState({ status: 'paused', moderationStatus: 'approved' }), 'paused');
  assert.equal(listingBoardState({ status: 'sold', moderationStatus: 'approved' }), 'sold');
  // Moderation hides the listing whatever the commercial status says, so it wins over 'active'.
  assert.equal(listingBoardState({ status: 'active', moderationStatus: 'pending' }), 'pending');
  assert.equal(listingBoardState({ status: 'paused', moderationStatus: 'rejected' }), 'rejected');
  assert.equal(listingBoardState({ status: 'active', moderationStatus: 'draft' }), 'draft');
  // A sold listing is sold first: reactivating it is the owner's decision, not the reviewer's.
  assert.equal(listingBoardState({ status: 'sold', moderationStatus: 'rejected' }), 'sold');
});
