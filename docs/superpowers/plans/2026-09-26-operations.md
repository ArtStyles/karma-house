# Permuta y «Busco vivienda» — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un anuncio puede ser venta (`sale`), permuta (`swap`) o búsqueda (`wanted`); se publica, filtra, muestra y comparte según su operación, sin tocar chat, favoritos, reportes ni moderación.

**Architecture:** Una columna `operation` en `public.properties` con campos `swap_*` y nulos permitidos en `type`/`area`/`bathrooms` solo para `wanted`. `kh_save_property` valida por operación; `kh_catalog_where` filtra por `operations` y excluye `wanted` cuando el cliente no lo pide. En el cliente, `Listing.operation` (opcional, ausente = `sale`), validación por operación, un paso previo en Publicar, filtro «Operación», tarjeta, detalle y ficha pública adaptados.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, React Native / Expo Router, `node --test`, Vercel function.

Spec: `docs/superpowers/specs/2026-09-26-operations-design.md`.

**Contexto para quien no conoce el repo**

- `npm run check` = `tsc --noEmit` + `node --experimental-strip-types --test tests/*.test.ts`. Los tests importan `.ts` con extensión; los módulos de dominio no importan React Native. `tests/` está fuera del typecheck.
- El node del sistema no tiene red. Para scripts contra Supabase usa `"$N"` con `N="$USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"` (Git Bash). Los scripts `scripts/apply-*.mjs` leen `infra/.env.local` por `scripts/cloud-db.mjs`; sin `--commit` aplican migración y suite en una transacción que se revierte.
- Convenciones: código y comentarios en inglés; textos de interfaz y documentos en español; commits en inglés, tipo `feat:`/`fix:`/`docs:`, última línea `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Git avisa de LF/CRLF; ignóralo.
- Formato de dinero en la app: `formatMoney` en `src/theme.ts` (`$ 85,000`), pero `theme.ts` importa React Native; los módulos de dominio usan su propio `Intl.NumberFormat('es-CU')`.
- `PROVINCES`, `CONDITIONS`, `AMENITIES` viven en `src/domain/listingOptions.ts`. `Pill`, `Button`, `Icon`, `Notice`, `SelectionField` en `src/components/ui.tsx` y `src/components/SelectionField.tsx`.
- Un `Listing` sin `operation` es una venta: así los datos locales, la demo y los tests existentes siguen válidos.

**Estructura de archivos**

- Modify `src/domain/listingOptions.ts` — tipos y listas de operación y diferencia.
- Modify `src/domain/listings.ts` — `Listing`, `ListingDraft`, `ListingFilters`, `validateDraft`, `validatedValues`, `filterListings`, atajos, `activeFilterCount`.
- Create `src/domain/operations.ts` — textos de presentación por operación (tarjeta, detalle, compartir).
- Modify `src/data/propertyPayload.ts`, `src/data/remoteMapping.ts`, `src/domain/draftPersistence.ts`, `src/state/marketplaceStore.ts`, `src/catalog/query.ts`.
- Create `supabase/migrations/20260926000100_operations.sql`, `supabase/tests/operations.sql`, `scripts/apply-operations.mjs`, `scripts/verify-operations.mjs`.
- Modify `src/components/ListingForm.tsx`, `src/screens/EditScreen.tsx` — paso de operación, sección de permuta, formulario de busco.
- Modify `src/components/CatalogFilters.tsx`, `src/screens/ExploreScreen.tsx`, `src/components/PropertyCard.tsx`, `src/screens/MyListingsScreen.tsx`, `src/screens/AdminScreen.tsx`.
- Modify `src/screens/DetailScreen.tsx`.
- Modify `web/api/p.ts`, `web/public/index.html`.
- Create `tests/operations.test.ts`; modify `tests/public-listing.test.ts`.
- Create `docs/operations-verification.md`; modify `README.md`, `docs/growth-roadmap.md`.

---

### Task 1: Dominio — tipos, validación por operación y filtros

**Files:**
- Modify: `src/domain/listingOptions.ts`
- Modify: `src/domain/listings.ts`
- Create: `src/domain/operations.ts`
- Test: `tests/operations.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/operations.test.ts
// @ts-nocheck -- Pure domain modules run directly in Node.
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDraft, createListing, filterListings, activeFilterCount, shortcutActive, toggleShortcut, defaultFilters } from '../src/domain/listings.ts';
import { isListingOperation, isSwapBalance, OPERATIONS, SWAP_BALANCES } from '../src/domain/listingOptions.ts';
import { listingOperation, operationBadge, priceLabel, listingFacts, swapBalanceText, shareText, operationsFor } from '../src/domain/operations.ts';

const sale = { title: 'Casa de prueba', location: 'Vedado', province: 'La Habana', price: '50000', bedrooms: '2', bathrooms: '1', area: '80', type: 'Casa', description: 'Vivienda luminosa con patio para compartir.', amenities: ['Patio'], imageKey: 'vedado', clientRequestId: 'ops-test' };
const swap = { ...sale, operation: 'swap', swapWants: 'Apartamento en Playa o Vedado, dos habitaciones, sin diferencia.', swapProvinces: ['La Habana'], swapBalance: 'pay', swapAmount: '5000' };
const wanted = { title: 'Busco apartamento en Playa', location: 'Playa o Vedado', province: 'La Habana', price: '40000', bedrooms: '2', bathrooms: '', area: '', type: '', description: 'Busco apartamento con balcón, planta baja o con ascensor.', amenities: [], imageKey: 'vedado', clientRequestId: 'ops-wanted', operation: 'wanted' };
const at = { now: '2026-09-26T00:00:00.000Z' };

test('operation and balance guards accept only the known values', () => {
  assert.deepEqual(OPERATIONS.map((o) => o.value), ['sale', 'swap', 'wanted']);
  assert.deepEqual(SWAP_BALANCES.map((o) => o.value), ['none', 'pay', 'receive']);
  assert.ok(isListingOperation('swap') && !isListingOperation('rent') && !isListingOperation(undefined));
  assert.ok(isSwapBalance('none') && !isSwapBalance(''));
});
test('a sale validates as before and ignores stray swap fields', () => {
  assert.ok(validateDraft(sale).ok);
  assert.ok(validateDraft({ ...sale, swapWants: 'x' }).ok);
  const listing = createListing(sale, { id: 's', ...at });
  assert.equal(listing.operation, undefined); assert.equal(listing.swap, undefined);
  assert.equal(listingOperation(listing), 'sale');
});
test('a swap needs what it wants and a balance, and keeps the amount only with a balance', () => {
  assert.ok(validateDraft(swap).ok);
  assert.equal(validateDraft({ ...swap, swapWants: 'corto' }).errors.swapWants, 'Lo que buscas a cambio debe tener entre 20 y 500 caracteres.');
  assert.equal(validateDraft({ ...swap, swapBalance: '' }).errors.swapBalance, 'Indica si hay diferencia de dinero.');
  assert.ok(validateDraft({ ...swap, swapProvinces: ['Narnia'] }).errors.swapProvinces);
  assert.ok(validateDraft({ ...swap, swapAmount: '-3' }).errors.swapAmount);
  assert.ok(validateDraft({ ...swap, swapBalance: 'none', swapAmount: '5000' }).ok);
  const listing = createListing(swap, { id: 'w', ...at });
  assert.deepEqual(listing.swap, { wants: swap.swapWants, provinces: ['La Habana'], balance: 'pay', amount: 5000 });
  assert.equal(createListing({ ...swap, swapBalance: 'none', swapAmount: '5000' }, { id: 'n', ...at }).swap.amount, undefined);
  assert.equal(listing.operation, 'swap');
});
test('a wanted ad needs no photos, area, bathrooms, type or map', () => {
  assert.ok(validateDraft(wanted).ok);
  assert.ok(validateDraft({ ...wanted, type: 'Apartamento' }).ok);
  assert.ok(validateDraft({ ...wanted, mapLocation: { latitude: 23.1, longitude: -82.4, precision: 'exact' } }).errors.mapLocation);
  assert.equal(validateDraft({ ...wanted, price: '0' }).errors.price, 'El presupuesto máximo debe ser mayor que 0 y como máximo 100000000.');
  assert.ok(validateDraft({ ...wanted, bedrooms: '' }).errors.bedrooms);
  assert.ok(!validateDraft({ ...sale, type: '' }).ok, 'a sale still needs a type');
  const listing = createListing(wanted, { id: 'b', ...at });
  assert.equal(listing.operation, 'wanted');
  assert.equal(listing.area, undefined); assert.equal(listing.bathrooms, undefined); assert.equal(listing.type, undefined);
  assert.equal(listing.bedrooms, 2); assert.equal(listing.price, 40000);
});
test('the catalogue hides wanted ads unless asked and the shortcuts toggle the operation', () => {
  const rows = [createListing(sale, { id: 's', ...at }), createListing(swap, { id: 'w', ...at }), createListing(wanted, { id: 'b', ...at })];
  assert.deepEqual(filterListings(rows, defaultFilters).map((r) => r.id).sort(), ['s', 'w']);
  assert.deepEqual(filterListings(rows, { ...defaultFilters, operation: 'wanted' }).map((r) => r.id), ['b']);
  assert.deepEqual(filterListings(rows, { ...defaultFilters, operation: 'swap' }).map((r) => r.id), ['w']);
  assert.deepEqual(filterListings(rows, { ...defaultFilters, operation: 'wanted', minArea: '10' }).map((r) => r.id), [], 'an area filter never matches a wanted ad');
  assert.deepEqual(operationsFor('offers'), ['sale', 'swap']); assert.deepEqual(operationsFor(undefined), ['sale', 'swap']); assert.deepEqual(operationsFor('wanted'), ['wanted']);
  assert.equal(activeFilterCount(defaultFilters), 0);
  assert.equal(activeFilterCount({ ...defaultFilters, operation: 'swap' }), 1);
  assert.deepEqual(toggleShortcut(defaultFilters, 'swap'), { operation: 'swap' });
  assert.ok(shortcutActive({ ...defaultFilters, operation: 'swap' }, 'swap'));
  assert.deepEqual(toggleShortcut({ ...defaultFilters, operation: 'wanted' }, 'wanted'), { operation: 'offers' });
});
test('presentation texts follow the operation', () => {
  const s = createListing(sale, { id: 's', ...at }); const w = createListing(swap, { id: 'w', ...at }); const b = createListing(wanted, { id: 'b', ...at });
  assert.equal(operationBadge(s), ''); assert.equal(operationBadge(w), 'Permuta'); assert.equal(operationBadge(b), 'Busco');
  assert.equal(priceLabel(s), 'Precio'); assert.equal(priceLabel(w), 'Valor estimado'); assert.equal(priceLabel(b), 'Presupuesto máximo');
  assert.equal(listingFacts(s), '2 hab · 1 baño · 80 m²');
  assert.equal(listingFacts(b), 'desde 2 hab · Casa o apartamento');
  assert.equal(listingFacts(createListing({ ...wanted, type: 'Apartamento' }, { id: 'b2', ...at })), 'desde 2 hab · Apartamento');
  assert.equal(swapBalanceText(w.swap), 'Añade hasta $ 5,000');
  assert.equal(swapBalanceText({ ...w.swap, balance: 'receive' }), 'Pide $ 5,000');
  assert.equal(swapBalanceText({ ...w.swap, balance: 'receive', amount: undefined }), 'Pide dinero');
  assert.equal(swapBalanceText({ ...w.swap, balance: 'none' }), 'Sin diferencia');
  assert.equal(shareText(b, 'https://x/p/b'), 'Busco: Busco apartamento en Playa\nHasta $ 40,000 USD · Playa o Vedado, La Habana\ndesde 2 hab · Casa o apartamento\n\nhttps://x/p/b');
  assert.equal(shareText(w, 'https://x/p/w'), 'Permuta: Casa de prueba\nValor estimado $ 50,000 USD · Vedado, La Habana\n2 hab · 1 baño · 80 m²\n\nhttps://x/p/w');
  assert.equal(shareText(s, 'https://x/p/s'), 'Casa de prueba\n$ 50,000 USD · Vedado, La Habana\n2 hab · 1 baño · 80 m²\n\nhttps://x/p/s');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test tests/operations.test.ts`
Expected: FAIL (`operations.ts` no existe; exports ausentes).

- [ ] **Step 3: `listingOptions.ts`**

Añade al final de `src/domain/listingOptions.ts`:

```ts
export type ListingOperation = 'sale' | 'swap' | 'wanted';
export type SwapBalance = 'none' | 'pay' | 'receive';
export const OPERATIONS: readonly { value: ListingOperation; label: string; badge: string; description: string }[] = [
  { value: 'sale', label: 'Vender', badge: 'Venta', description: 'Publica tu vivienda con precio.' },
  { value: 'swap', label: 'Permutar', badge: 'Permuta', description: 'Ofreces tu vivienda a cambio de otra.' },
  { value: 'wanted', label: 'Busco vivienda', badge: 'Busco', description: 'Cuenta qué buscas y deja que te escriban.' },
];
export const SWAP_BALANCES: readonly { value: SwapBalance; label: string }[] = [
  { value: 'none', label: 'Sin diferencia' },
  { value: 'pay', label: 'Yo añado dinero' },
  { value: 'receive', label: 'Pido dinero' },
];
export function isListingOperation(value: unknown): value is ListingOperation {
  return value === 'sale' || value === 'swap' || value === 'wanted';
}
export function isSwapBalance(value: unknown): value is SwapBalance {
  return value === 'none' || value === 'pay' || value === 'receive';
}
export function isProvince(value: unknown): value is string {
  return typeof value === 'string' && PROVINCES.includes(value);
}
```

- [ ] **Step 4: `listings.ts` — tipos**

En `src/domain/listings.ts`:

1. Cambia el import de opciones por:
```ts
import { isListingCondition, isDraftFloor, isListingOperation, isProvince, isSwapBalance, type ListingCondition, type ListingOperation, type SwapBalance } from './listingOptions.ts';
export type { ListingCondition, ListingOperation, SwapBalance } from './listingOptions.ts';
```
2. Añade antes de `export interface Listing`:
```ts
export interface ListingSwap { wants: string; provinces: string[]; balance: SwapBalance; amount?: number }
export type OperationFilter = 'offers' | ListingOperation;
```
3. En `Listing`: `type: ListingType;` → `type?: ListingType;`, `bathrooms: number;` → `bathrooms?: number;`, `area: number;` → `area?: number;`, y añade tras `imageKey`:
```ts
  /** Absent means a sale: local, demo and older remote rows never carry it. */
  operation?: ListingOperation;
  swap?: ListingSwap;
```
4. En `ListingDraft`: `type: ListingType;` → `type: ListingType | '';` (vacío solo en `wanted` = cualquiera) y añade tras `expectedVersion?`:
```ts
  operation?: ListingOperation;
  swapWants?: string;
  swapProvinces?: string[];
  swapBalance?: SwapBalance | '';
  swapAmount?: string;
```
5. En `ListingFilters` añade: `operation?: OperationFilter;`. En `defaultFilters` añade `operation: 'offers',`.
6. `Shortcut`: `export type Shortcut = ListingType | 'price' | 'bedrooms' | 'swap' | 'wanted';`
7. `shortcutActive`: antes de `return filters.type === shortcut;` añade `if (shortcut === 'swap' || shortcut === 'wanted') return (filters.operation ?? 'offers') === shortcut;`
8. `toggleShortcut`: antes de `return { type: ... }` añade `if (shortcut === 'swap' || shortcut === 'wanted') return { operation: active ? 'offers' : shortcut };`
9. `activeFilterCount`: añade `(filters.operation ?? 'offers') !== 'offers',` como último elemento del array.
10. `filterListings`: añade `const operations = operationsFor(filters.operation);` antes del `return`, y como primer `.filter`: `.filter((listing) => operations.includes(listing.operation ?? 'sale'))`. Cambia los filtros de área a `(listing.area ?? -1)` y el de baños a `(listing.bathrooms ?? -1)`; el de tipo a `filters.type === 'Todas' || listing.type === filters.type`; el sort por área a `(right.area ?? 0) - (left.area ?? 0)`.
11. Añade la función exportada (junto a `normalizeSearch`):
```ts
/** Which operations a catalogue request shows. Wanted ads only appear when asked for. */
export function operationsFor(filter: OperationFilter | undefined): ListingOperation[] {
  if (!filter || filter === 'offers') return ['sale', 'swap'];
  return [filter];
}
```

- [ ] **Step 5: `listings.ts` — `validateDraft` y `validatedValues`**

Sustituye el cuerpo de `validateDraft` entre `const errors ... = {};` y `return { ok ... }` por:

```ts
  const operation = draft.operation ?? 'sale';
  if (!isListingOperation(operation)) { errors.operation = 'Selecciona qué quieres publicar.'; return { ok: false, errors }; }
  const wanted = operation === 'wanted';
  if (draft.condition !== undefined && draft.condition !== '' && !isListingCondition(draft.condition)) errors.condition = 'Selecciona un estado de vivienda válido.';
  if (draft.floor !== undefined && !isDraftFloor(draft.floor)) errors.floor = 'La planta debe ser un número entero entre 0 y 99.';
  if (draft.priceNegotiable != null && typeof draft.priceNegotiable !== 'boolean') errors.priceNegotiable = 'Indica si el precio es negociable.';

  validateText(draft.title, 'title', 3, 100, errors, 'El título');
  validateText(draft.location, 'location', 2, 80, errors, wanted ? 'La zona' : 'La ubicación');
  validateText(draft.province, 'province', 2, 80, errors, 'La provincia');
  validateText(draft.description, 'description', 20, 2000, errors, 'La descripción');
  validateNumber(draft.price, 'price', errors, { label: wanted ? 'El presupuesto máximo' : operation === 'swap' ? 'El valor estimado' : 'El precio', min: 0, max: 100_000_000, exclusiveMin: true });
  validateNumber(draft.bedrooms, 'bedrooms', errors, { label: wanted ? 'Las habitaciones mínimas' : 'Los dormitorios', min: 1, max: 20, integer: true });
  if (wanted) {
    if (draft.type !== '' && draft.type !== 'Casa' && draft.type !== 'Apartamento') errors.type = 'Selecciona un tipo de vivienda válido.';
    if (draft.mapLocation !== undefined) errors.mapLocation = 'Un anuncio de búsqueda no lleva ubicación en el mapa.';
  } else {
    validateNumber(draft.bathrooms, 'bathrooms', errors, { label: 'Los baños', min: 1, max: 20, integer: true });
    validateNumber(draft.area, 'area', errors, { label: 'El área', min: 0, max: 10_000, exclusiveMin: true });
    if (draft.type !== 'Casa' && draft.type !== 'Apartamento') errors.type = 'Selecciona un tipo de vivienda válido.';
    if (draft.mapLocation !== undefined && !isMapLocation(draft.mapLocation)) errors.mapLocation = 'Selecciona una ubicación válida en el mapa.';
  }
  if (operation === 'swap') {
    validateText(draft.swapWants ?? '', 'swapWants', 20, 500, errors, 'Lo que buscas a cambio');
    if (!isSwapBalance(draft.swapBalance)) errors.swapBalance = 'Indica si hay diferencia de dinero.';
    const provinces = draft.swapProvinces ?? [];
    if (!Array.isArray(provinces) || provinces.some((value) => !isProvince(value)) || new Set(provinces).size !== provinces.length) errors.swapProvinces = 'Elige provincias válidas, sin repetir.';
    if (draft.swapBalance && draft.swapBalance !== 'none' && draft.swapAmount?.trim()) {
      validateNumber(draft.swapAmount, 'swapAmount', errors, { label: 'La diferencia', min: 0, max: 100_000_000, exclusiveMin: true });
    }
  }
  if (!['vedado', 'interior', 'terrace'].includes(draft.imageKey)) errors.imageKey = 'Selecciona una imagen válida.';
  const amenities = normalizeAmenities(draft.amenities);
  if (amenities.length > 20 || amenities.some((amenity) => amenity.length > 60)) errors.amenities = 'Usa hasta 20 comodidades de 60 caracteres cada una.';
  if (draft.photos === undefined && draft.photoUri !== undefined && !isSupportedPhotoUri(draft.photoUri)) errors.photoUri = 'La foto debe ser una imagen local válida de hasta 4 MB.';
  if (draft.photos !== undefined && (
    !Array.isArray(draft.photos) || draft.photos.length > 6 ||
    draft.photos.some((photo) => !photo || typeof photo.uri !== 'string' ||
      (photo.storagePath ? !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(photo.storagePath)
        : !photo.uri.trim() || !isSupportedPhotoUri(photo.uri)))
  )) errors.photos = 'Selecciona hasta seis fotos locales válidas de hasta 4 MB cada una.';
  if (draft.clientRequestId !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(draft.clientRequestId)) errors.clientRequestId = 'El identificador del borrador no es válido.';
```

(`DraftValidation.errors` es `Partial<Record<keyof ListingDraft, string>>`, así `errors.operation`, `errors.swapWants`, etc. tipan solos.)

En `validatedValues`, sustituye el `return { ... }` por:

```ts
  const operation = draft.operation ?? 'sale';
  const wanted = operation === 'wanted';
  const balance = draft.swapBalance;
  const amount = balance && balance !== 'none' && draft.swapAmount?.trim() ? parseDecimal(draft.swapAmount) : undefined;
  return {
    title: draft.title.trim(),
    location: draft.location.trim(),
    province: draft.province.trim(),
    ...(operation !== 'sale' ? { operation } : {}),
    ...(operation === 'swap' && isSwapBalance(balance) ? { swap: { wants: (draft.swapWants ?? '').trim(), provinces: [...(draft.swapProvinces ?? [])], balance, ...(amount !== undefined ? { amount } : {}) } } : {}),
    ...(!wanted && draft.condition ? { condition: draft.condition } : {}),
    ...(!wanted && draft.floor?.trim() ? { floor: Number(draft.floor) } : {}),
    ...(!wanted && draft.priceNegotiable != null ? { priceNegotiable: draft.priceNegotiable } : {}),
    ...(!wanted && draft.mapLocation ? { mapLocation: normalizeMapLocation(draft.mapLocation) } : {}),
    price: parseDecimal(draft.price),
    bedrooms: Number(draft.bedrooms.trim()),
    ...(!wanted ? { bathrooms: Number(draft.bathrooms.trim()), area: parseDecimal(draft.area) } : {}),
    ...(draft.type ? { type: draft.type } : {}),
    description: draft.description.trim(),
    amenities: wanted ? [] : normalizeAmenities(draft.amenities),
    imageKey: draft.imageKey,
    ...(photoUri ? { photoUri } : {}),
    ...(draft.photos ? { photos: draft.photos.map((photo) => ({ ...photo })) } : {}),
  };
```
Conserva lo que el `return` actual ya hacía con `photoUri`, `photos`, `imageKey` y `amenities` (compáralo antes de sustituir; si el actual incluye algo más, mantenlo). En `updateListing`, incluye `operation` y `swap` entre los campos que se extraen y se reponen igual que `condition`.

- [ ] **Step 6: `src/domain/operations.ts`**

```ts
// Presentation of a listing according to its operation: badge, price label, facts line
// and share text. Pure so the card, the detail screen, the public page and tests agree.
import type { Listing, ListingOperation, ListingSwap } from './listings.ts';
import { OPERATIONS } from './listingOptions.ts';
export { operationsFor } from './listings.ts';

const money = (value: number) => `$ ${new Intl.NumberFormat('es-CU', { maximumFractionDigits: 0 }).format(value)}`;

export function listingOperation(listing: Pick<Listing, 'operation'>): ListingOperation {
  return listing.operation ?? 'sale';
}

/** Empty for a sale: the badge only speaks when it tells something apart. */
export function operationBadge(listing: Pick<Listing, 'operation'>): string {
  const operation = listingOperation(listing);
  return operation === 'sale' ? '' : OPERATIONS.find((item) => item.value === operation)!.badge;
}

export function priceLabel(listing: Pick<Listing, 'operation'>): 'Precio' | 'Valor estimado' | 'Presupuesto máximo' {
  const operation = listingOperation(listing);
  return operation === 'wanted' ? 'Presupuesto máximo' : operation === 'swap' ? 'Valor estimado' : 'Precio';
}

export function typeLabel(listing: Pick<Listing, 'type'>): string {
  return listing.type ?? 'Casa o apartamento';
}

export function listingFacts(listing: Pick<Listing, 'operation' | 'bedrooms' | 'bathrooms' | 'area' | 'type'>): string {
  if (listingOperation(listing) === 'wanted') return `desde ${listing.bedrooms} hab · ${typeLabel(listing)}`;
  return `${listing.bedrooms} hab · ${listing.bathrooms} ${listing.bathrooms === 1 ? 'baño' : 'baños'} · ${listing.area} m²`;
}

export function swapBalanceText(swap: Pick<ListingSwap, 'balance' | 'amount'>): string {
  if (swap.balance === 'none') return 'Sin diferencia';
  if (swap.balance === 'pay') return swap.amount ? `Añade hasta ${money(swap.amount)}` : 'Añade dinero';
  return swap.amount ? `Pide ${money(swap.amount)}` : 'Pide dinero';
}

export function shareText(listing: Listing, url: string): string {
  const operation = listingOperation(listing);
  const title = operation === 'sale' ? listing.title : `${operationBadge(listing)}: ${listing.title}`;
  const price = operation === 'wanted' ? `Hasta ${money(listing.price)} USD` : operation === 'swap' ? `Valor estimado ${money(listing.price)} USD` : `${money(listing.price)} USD`;
  return `${title}\n${price} · ${listing.location}, ${listing.province}\n${listingFacts(listing)}\n\n${url}`;
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `node --experimental-strip-types --test tests/operations.test.ts` → PASS (6 tests).
Run: `npm run typecheck`. Espera errores en `PropertyCard.tsx`, `DetailScreen.tsx`, `AdminScreen.tsx`, `EditScreen.tsx`, `ListingForm.tsx`, `marketplaceStore.ts`, `remoteMapping.ts` por `type`/`area`/`bathrooms` opcionales: son las tareas siguientes. Ningún error debe venir de `src/domain/`.
Run: `npm test` → los tests existentes siguen en verde (`listing-details`, `listings`, `listing-draft`, `catalog-*`).

- [ ] **Step 8: Commit**

```bash
git add src/domain/listingOptions.ts src/domain/listings.ts src/domain/operations.ts tests/operations.test.ts
git commit -m "feat: model swap and wanted listings in the domain

A listing carries an optional operation (absent means a sale), swap ads
describe what they want and a money balance, and wanted ads drop photos,
area, bathrooms, type and map. Validation, the local catalogue filter and
the Explorar shortcuts follow the operation; presentation texts live in
one pure module.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Datos — payload, filas remotas, borrador, instantánea local, consulta

**Files:**
- Modify: `src/data/propertyPayload.ts`, `src/data/remoteMapping.ts`, `src/domain/draftPersistence.ts`, `src/state/marketplaceStore.ts`, `src/catalog/query.ts`
- Test: `tests/operations.test.ts`

- [ ] **Step 1: Write the failing tests** (añade al final de `tests/operations.test.ts`)

```ts
import { propertyPayload } from '../src/data/propertyPayload.ts';
import { mapRemoteListing } from '../src/data/remoteMapping.ts';
import { restoreDraft } from '../src/domain/draftPersistence.ts';
import { decodeMarketplaceSnapshot } from '../src/state/marketplaceStore.ts';
import { searchPayload } from '../src/catalog/query.ts';

const row = { id: 'home', owner_id: 'seller', client_request_id: 'ops-test', title: 'Casa', location: 'Vedado', province: 'La Habana', price: 50000, bedrooms: 2, bathrooms: 1, area: 80, type: 'Casa', description: 'Vivienda luminosa con patio para compartir.', amenities: [], photo_paths: [], availability: 'active', moderation: 'approved', review_note: null, version: 1, created_at: '2026-09-26T00:00:00.000Z' };

test('the payload carries the operation and the swap fields', () => {
  const p = propertyPayload(swap, 'seller', [], 'pending');
  assert.equal(p.operation, 'swap'); assert.equal(p.swapWants, swap.swapWants); assert.deepEqual(p.swapProvinces, ['La Habana']); assert.equal(p.swapBalance, 'pay'); assert.equal(p.swapAmount, 5000);
  const w = propertyPayload(wanted, 'seller', [], 'pending');
  assert.equal(w.operation, 'wanted'); assert.equal(w.type, null); assert.equal(w.area, null); assert.equal(w.bathrooms, null); assert.equal(w.mapLocation, null);
  const s = propertyPayload(sale, 'seller', [], 'pending');
  assert.equal(s.operation, 'sale'); assert.equal('swapWants' in s, false);
});
test('remote rows map the operation, allow nulls only for wanted ads and default to sale', () => {
  assert.equal(mapRemoteListing(row, new Map()).operation, undefined);
  const s = mapRemoteListing({ ...row, operation: 'swap', swap_wants: 'Apartamento en Playa con dos habitaciones.', swap_provinces: ['La Habana'], swap_balance: 'receive', swap_amount: '2000' }, new Map());
  assert.equal(s.operation, 'swap'); assert.deepEqual(s.swap, { wants: 'Apartamento en Playa con dos habitaciones.', provinces: ['La Habana'], balance: 'receive', amount: 2000 });
  const b = mapRemoteListing({ ...row, operation: 'wanted', type: null, area: null, bathrooms: null }, new Map());
  assert.equal(b.operation, 'wanted'); assert.equal(b.type, undefined); assert.equal(b.area, undefined); assert.equal(b.bathrooms, undefined);
  assert.throws(() => mapRemoteListing({ ...row, area: null }, new Map()), /no válidos/);
  assert.throws(() => mapRemoteListing({ ...row, operation: 'rent' }, new Map()), /no válidos/);
  assert.throws(() => mapRemoteListing({ ...row, operation: 'swap' }, new Map()), /no válidos/, 'a swap without its fields is invalid');
});
test('drafts and the local snapshot keep the new fields', () => {
  assert.deepEqual(restoreDraft(JSON.stringify(swap), sale), swap);
  assert.deepEqual(restoreDraft(JSON.stringify(wanted), sale), wanted);
  assert.deepEqual(restoreDraft(JSON.stringify({ ...sale, operation: 'rent' }), sale), sale);
  const listings = [createListing(swap, { id: 'w', ...at }), createListing(wanted, { id: 'b', ...at })];
  const decoded = decodeMarketplaceSnapshot(JSON.stringify({ version: 1, localListings: listings, favoriteIds: [] }));
  assert.equal(decoded.issue, null); assert.deepEqual(decoded.snapshot.localListings, listings);
});
test('the search payload sends the operations the filter stands for', () => {
  assert.deepEqual(searchPayload(defaultFilters, null, true).operations, ['sale', 'swap']);
  assert.deepEqual(searchPayload({ ...defaultFilters, operation: 'wanted' }, null, true).operations, ['wanted']);
});
```

- [ ] **Step 2: Run to verify it fails**: `node --experimental-strip-types --test tests/operations.test.ts` → FAIL.

- [ ] **Step 3: `propertyPayload.ts`**

Sustituye la función por:

```ts
export function propertyPayload(draft: ListingDraft, ownerId: string, photoPaths: string[], moderation: 'draft' | 'pending', current?: Listing) {
  const operation = draft.operation ?? 'sale';
  const wanted = operation === 'wanted';
  const balance = draft.swapBalance || null;
  return {
    ownerId, clientRequestId: draft.clientRequestId, title: draft.title.trim(), location: draft.location.trim(),
    province: draft.province.trim(), type: draft.type || null, description: draft.description.trim(), operation,
    ...(operation === 'swap' ? {
      swapWants: (draft.swapWants ?? '').trim(), swapProvinces: [...(draft.swapProvinces ?? [])], swapBalance: balance,
      swapAmount: balance && balance !== 'none' && draft.swapAmount?.trim() ? parseDecimal(draft.swapAmount) : null,
    } : {}),
    ...(!wanted && draft.condition !== undefined ? { condition: draft.condition || null } : {}),
    ...(!wanted && draft.floor !== undefined ? { floor: draft.floor.trim() ? Number(draft.floor) : null } : {}),
    ...(!wanted && draft.priceNegotiable !== undefined ? { priceNegotiable: draft.priceNegotiable } : {}),
    price: parseDecimal(draft.price), area: wanted ? null : parseDecimal(draft.area), bedrooms: Number(draft.bedrooms), bathrooms: wanted ? null : Number(draft.bathrooms),
    amenities: wanted ? [] : [...new Set(draft.amenities.map((item) => item.trim()).filter(Boolean))], photoPaths, moderation,
    // Explicit null removes a previously published point; legacy clients omit this field.
    mapLocation: !wanted && draft.mapLocation ? normalizeMapLocation(draft.mapLocation) : null,
    ...(current ? { id: current.id, expectedVersion: draft.expectedVersion ?? current.version } : {}),
  };
}
```

- [ ] **Step 4: `remoteMapping.ts`**

- Importa `isListingOperation, isProvince, isSwapBalance` de `../domain/listingOptions.ts` y `ListingOperation, SwapBalance` en el `import type`.
- En `RemotePropertyRow`: `bathrooms: number;` → `bathrooms: number | null;`, `area: number | string;` → `area: number | string | null;`, `type: ListingType;` → `type: ListingType | null;`, y añade `operation?: ListingOperation | null; swap_wants?: string | null; swap_provinces?: string[] | null; swap_balance?: SwapBalance | null; swap_amount?: number | string | null;`.
- En la condición de rechazo de `mapRemoteListing`, sustituye las cuatro líneas de `price`/`area`/`bedrooms`/`bathrooms`/`type` por:
```ts
    (row.operation != null && !isListingOperation(row.operation)) ||
    !Number.isFinite(Number(row.price)) || Number(row.price) <= 0 ||
    !Number.isInteger(row.bedrooms) || !Number.isInteger(row.version) || row.version < 1 ||
    (operation === 'wanted'
      ? (row.type != null && !['Casa', 'Apartamento'].includes(row.type)) || row.area != null || row.bathrooms != null
      : !Number.isFinite(Number(row.area)) || Number(row.area) <= 0 || !Number.isInteger(row.bathrooms) || !['Casa', 'Apartamento'].includes(row.type as string)) ||
    (operation === 'swap'
      ? typeof row.swap_wants !== 'string' || !row.swap_wants.trim() || !isSwapBalance(row.swap_balance)
        || (row.swap_provinces != null && (!Array.isArray(row.swap_provinces) || !row.swap_provinces.every(isProvince)))
        || (row.swap_amount != null && !(Number(row.swap_amount) > 0))
      : row.swap_wants != null || row.swap_balance != null) ||
```
  con `const operation: ListingOperation = row?.operation ?? 'sale';` declarado antes del `if` (tras comprobar `row`, pon `row?.`). Mantén el resto de comprobaciones (`version`, `created_at`, `availability`, `moderation`, arrays).
- En el objeto devuelto sustituye `bedrooms: row.bedrooms, bathrooms: row.bathrooms, area: Number(row.area), type: row.type,` por:
```ts
    bedrooms: row.bedrooms,
    ...(operation === 'wanted' ? {} : { bathrooms: row.bathrooms as number, area: Number(row.area) }),
    ...(row.type ? { type: row.type } : {}),
    ...(operation !== 'sale' ? { operation } : {}),
    ...(operation === 'swap' ? { swap: { wants: row.swap_wants as string, provinces: [...(row.swap_provinces ?? [])], balance: row.swap_balance as SwapBalance, ...(row.swap_amount != null ? { amount: Number(row.swap_amount) } : {}) } } : {}),
```

- [ ] **Step 5: `draftPersistence.ts`**

Importa `isListingOperation, isProvince, isSwapBalance` de `./listingOptions.ts`. En `restoreDraft`, cambia `!['Casa', 'Apartamento'].includes(value.type)` por `!['', 'Casa', 'Apartamento'].includes(value.type)` y añade a la cadena de `||`:
```ts
      || (value.operation !== undefined && !isListingOperation(value.operation))
      || (value.swapWants !== undefined && typeof value.swapWants !== 'string')
      || (value.swapAmount !== undefined && typeof value.swapAmount !== 'string')
      || (value.swapBalance !== undefined && value.swapBalance !== '' && !isSwapBalance(value.swapBalance))
      || (value.swapProvinces !== undefined && (!Array.isArray(value.swapProvinces) || !value.swapProvinces.every(isProvince)))
```

- [ ] **Step 6: `marketplaceStore.ts`**

Localiza la validación de un `Listing` local (línea ~285-305: `isIntegerWithin(value.bathrooms, 1, 20)`, `isFiniteWithin(value.area, ...)`, `value.type !== 'Casa' && ...`). Declara `const wanted = value.operation === 'wanted';` y cambia esas tres comprobaciones por:
```ts
    (value.operation !== undefined && !isListingOperation(value.operation)) ||
    (wanted ? value.bathrooms !== undefined || value.area !== undefined || (value.type !== undefined && value.type !== 'Casa' && value.type !== 'Apartamento')
      : !isIntegerWithin(value.bathrooms, 1, 20) || !isFiniteWithin(value.area, 0, 10_000, true) || (value.type !== 'Casa' && value.type !== 'Apartamento')) ||
    (value.operation === 'swap' ? !value.swap || typeof value.swap.wants !== 'string' || !isSwapBalance(value.swap.balance) || !Array.isArray(value.swap.provinces) || !value.swap.provinces.every(isProvince) || (value.swap.amount !== undefined && !(value.swap.amount > 0))
      : value.swap !== undefined) ||
```
En los dos lugares donde se reconstruye el listing (líneas ~317-350, `bathrooms: String(value.bathrooms)` para el borrador y `bathrooms: value.bathrooms` para el listing), haz `bathrooms`/`area`/`type` condicionales igual que en `remoteMapping` y copia `operation` y `swap` cuando existan. Importa los guards de `../domain/listingOptions.ts`.

- [ ] **Step 7: `catalog/query.ts`**

En `SearchPayload` añade `operations: ListingOperation[];` (importa `operationsFor` de `../domain/listings.ts` y el tipo). En `searchPayload` añade `operations: operationsFor(filters.operation),`.

- [ ] **Step 8: Verify**: `node --experimental-strip-types --test tests/operations.test.ts` → PASS (10). `npm test` → todo verde. `npm run typecheck` → solo quedan errores en pantallas/componentes.

- [ ] **Step 9: Commit**

```bash
git add src/data/propertyPayload.ts src/data/remoteMapping.ts src/domain/draftPersistence.ts src/state/marketplaceStore.ts src/catalog/query.ts tests/operations.test.ts
git commit -m "feat: carry the operation through payloads, rows, drafts and the search request

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Migración, suite SQL y scripts

**Files:**
- Create: `supabase/migrations/20260926000100_operations.sql`, `supabase/tests/operations.sql`, `scripts/apply-operations.mjs`, `scripts/verify-operations.mjs`

- [ ] **Step 1: Migración**

```sql
-- Swap and wanted listings share the properties table, so chat, favourites, reports,
-- moderation and the public page keep working off property_id. `operation` defaults to
-- 'sale' for every existing row; nulls in type/area/bathrooms are legal only for wanted ads.
alter table public.properties
  add column operation text not null default 'sale',
  add column swap_wants text,
  add column swap_provinces text[],
  add column swap_balance text,
  add column swap_amount numeric;
alter table public.properties
  alter column type drop not null,
  alter column area drop not null,
  alter column bathrooms drop not null;

create function kh_private.valid_provinces(p_values text[]) returns boolean
language sql immutable set search_path = '' as $$
  select p_values is null or (
    cardinality(p_values) <= 16
    and cardinality(p_values) = (select count(distinct value) from unnest(p_values) value)
    and not exists (select 1 from unnest(p_values) value where value not in (
      'Pinar del Río','Artemisa','La Habana','Mayabeque','Matanzas','Villa Clara','Cienfuegos','Sancti Spíritus',
      'Ciego de Ávila','Camagüey','Las Tunas','Holguín','Granma','Santiago de Cuba','Guantánamo','Isla de la Juventud')))
$$;
revoke all on function kh_private.valid_provinces(text[]) from public, anon, authenticated;

alter table public.properties
  add constraint properties_operation_valid check (operation in ('sale','swap','wanted')),
  add constraint properties_swap_fields check (
    (operation = 'swap'
      and swap_wants is not null and char_length(btrim(swap_wants)) between 20 and 500
      and swap_balance in ('none','pay','receive')
      and (swap_amount is null or (swap_balance <> 'none' and swap_amount > 0 and swap_amount <= 100000000))
      and kh_private.valid_provinces(swap_provinces))
    or (operation <> 'swap' and swap_wants is null and swap_provinces is null and swap_balance is null and swap_amount is null)),
  add constraint properties_offer_fields check (operation = 'wanted' or (type is not null and area is not null and bathrooms is not null)),
  add constraint properties_wanted_fields check (operation <> 'wanted' or (
    area is null and bathrooms is null and latitude is null and longitude is null and location_precision is null
    and condition is null and floor is null and price_negotiable is null and amenities = '{}'));

-- The original photo rule was an unnamed table check; wanted ads are the one case without photos.
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
    where conrelid = 'public.properties'::regclass and pg_get_constraintdef(oid) like '%cardinality(photo_paths) >= 1%';
  if v_name is not null then execute format('alter table public.properties drop constraint %I', v_name); end if;
end $$;
alter table public.properties add constraint properties_photos_required
  check (moderation = 'draft' or operation = 'wanted' or cardinality(photo_paths) >= 1);

create or replace function public.kh_save_property(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_request text;
  v_expected integer;
  v_mode text;
  v_operation text;
  v_type text;
  v_amenities text[];
  v_photos text[];
  v_price numeric;
  v_area numeric;
  v_bedrooms numeric;
  v_bathrooms numeric;
  v_map_location jsonb;
  v_condition text;
  v_floor numeric;
  v_negotiable boolean;
  v_swap_wants text;
  v_swap_provinces text[];
  v_swap_balance text;
  v_swap_amount numeric;
  v_canonical jsonb;
  v_exists boolean;
  v_existing public.properties%rowtype;
  v_saved public.properties%rowtype;
  v_receipt kh_private.property_save_requests%rowtype;
begin
  if v_user is null then raise exception 'KH_AUTH_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'KH_INVALID_PAYLOAD'; end if;
  if p_payload ? 'ownerId' and p_payload->>'ownerId' is distinct from v_user::text then
    raise exception 'KH_ACCOUNT_CHANGED' using errcode='42501';
  end if;
  v_request := p_payload->>'clientRequestId';
  if v_request is null or v_request !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'KH_INVALID_REQUEST_ID'; end if;
  v_id := nullif(p_payload->>'id','')::uuid;
  v_expected := nullif(p_payload->>'expectedVersion','')::integer;
  v_mode := coalesce(p_payload->>'moderation','pending');
  if v_mode not in ('draft','pending') then raise exception 'KH_INVALID_MODERATION'; end if;
  if p_payload ? 'operation' and p_payload->'operation' <> 'null'::jsonb then
    v_operation := p_payload->>'operation';
    if v_operation not in ('sale','swap','wanted') then raise exception 'KH_INVALID_OPERATION'; end if;
  end if;
  if jsonb_typeof(coalesce(p_payload->'amenities','[]'::jsonb)) is distinct from 'array'
    or jsonb_typeof(coalesce(p_payload->'photoPaths','[]'::jsonb)) is distinct from 'array' then
    raise exception 'KH_INVALID_ARRAY';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_payload->'amenities','[]'::jsonb)) value where jsonb_typeof(value)<>'string')
    or exists (select 1 from jsonb_array_elements(coalesce(p_payload->'photoPaths','[]'::jsonb)) value where jsonb_typeof(value)<>'string') then
    raise exception 'KH_INVALID_ARRAY';
  end if;
  select coalesce(array_agg(value order by value),'{}'::text[]) into v_amenities from (
    select distinct btrim(value) as value from jsonb_array_elements_text(coalesce(p_payload->'amenities','[]'::jsonb)) value where btrim(value)<>''
  ) clean;
  select coalesce(array_agg(value order by ordinal),'{}'::text[]) into v_photos
    from jsonb_array_elements_text(coalesce(p_payload->'photoPaths','[]'::jsonb)) with ordinality paths(value,ordinal);
  v_price := (p_payload->>'price')::numeric;
  v_area := (p_payload->>'area')::numeric;
  v_bedrooms := (p_payload->>'bedrooms')::numeric;
  v_bathrooms := (p_payload->>'bathrooms')::numeric;
  v_type := nullif(p_payload->>'type','');
  if v_price is null or not(v_price>0 and v_price<=100000000)
    or v_bedrooms is null or not(v_bedrooms between 1 and 20 and v_bedrooms=trunc(v_bedrooms))
    or not kh_private.valid_amenities(v_amenities) then raise exception 'KH_INVALID_PROPERTY'; end if;
  if coalesce(char_length(btrim(p_payload->>'title')),0) not between 3 and 100
    or coalesce(char_length(btrim(p_payload->>'location')),0) not between 2 and 80
    or coalesce(char_length(btrim(p_payload->>'province')),0) not between 2 and 80
    or coalesce(char_length(btrim(p_payload->>'description')),0) not between 20 and 2000
    or (v_type is not null and v_type not in ('Casa','Apartamento')) then raise exception 'KH_INVALID_PROPERTY'; end if;

  -- Lock before resolving omission: an older client must preserve the current public point.
  perform pg_advisory_xact_lock(hashtextextended('kh:save:'||v_user::text||':'||v_request,0));
  if v_id is null then
    select * into v_existing from public.properties where owner_id=v_user and client_request_id=v_request for update;
    v_exists := found;
  else
    select * into v_existing from public.properties where id=v_id and owner_id=v_user for update;
    if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
    if v_existing.client_request_id<>v_request then raise exception 'KH_REQUEST_CONFLICT'; end if;
    if v_expected is null or v_expected<1 then raise exception 'KH_EXPECTED_VERSION_REQUIRED'; end if;
    v_exists := true;
  end if;
  -- An older APK sends no operation: it keeps whatever the row is, or publishes a sale.
  if v_operation is null then v_operation := coalesce(v_existing.operation,'sale'); end if;
  if v_id is not null and v_existing.operation <> v_operation then raise exception 'KH_OPERATION_LOCKED'; end if;

  if v_operation = 'wanted' then
    -- A wanted ad has no home to describe: only what is being looked for.
    v_area := null; v_bathrooms := null; v_amenities := '{}'; v_map_location := 'null'::jsonb;
    v_condition := null; v_floor := null; v_negotiable := null;
  else
    if v_area is null or not(v_area>0 and v_area<=10000)
      or v_bathrooms is null or not(v_bathrooms between 1 and 20 and v_bathrooms=trunc(v_bathrooms))
      or v_type is null then raise exception 'KH_INVALID_PROPERTY'; end if;
    if p_payload ? 'mapLocation' then
      v_map_location := kh_private.normalize_map_location(p_payload->'mapLocation');
    elsif v_id is not null and v_existing.latitude is not null then
      v_map_location := jsonb_build_object('latitude',v_existing.latitude,'longitude',v_existing.longitude,'precision',v_existing.location_precision);
    else
      v_map_location := 'null'::jsonb;
    end if;
    -- Omission from an old APK preserves current values. Explicit JSON null clears them.
    if p_payload ? 'condition' then
      if p_payload->'condition' <> 'null'::jsonb and
        (jsonb_typeof(p_payload->'condition') <> 'string' or p_payload->>'condition' not in ('new','good','needs-renovation')) then
        raise exception 'KH_INVALID_PROPERTY_DETAILS';
      end if;
      v_condition := p_payload->>'condition';
    elsif v_id is not null then v_condition := v_existing.condition;
    end if;
    if p_payload ? 'floor' then
      if p_payload->'floor' <> 'null'::jsonb then
        if jsonb_typeof(p_payload->'floor') <> 'number' then raise exception 'KH_INVALID_PROPERTY_DETAILS'; end if;
        v_floor := (p_payload->>'floor')::numeric;
        if not(v_floor between 0 and 99 and v_floor=trunc(v_floor)) then raise exception 'KH_INVALID_PROPERTY_DETAILS'; end if;
      end if;
    elsif v_id is not null then v_floor := v_existing.floor;
    end if;
    if p_payload ? 'priceNegotiable' then
      if p_payload->'priceNegotiable' <> 'null'::jsonb and jsonb_typeof(p_payload->'priceNegotiable') <> 'boolean' then
        raise exception 'KH_INVALID_PROPERTY_DETAILS';
      end if;
      v_negotiable := (p_payload->>'priceNegotiable')::boolean;
    elsif v_id is not null then v_negotiable := v_existing.price_negotiable;
    end if;
  end if;

  if v_operation = 'swap' then
    v_swap_wants := btrim(p_payload->>'swapWants');
    v_swap_balance := p_payload->>'swapBalance';
    v_swap_amount := nullif(p_payload->>'swapAmount','')::numeric;
    if jsonb_typeof(coalesce(p_payload->'swapProvinces','[]'::jsonb)) <> 'array'
      or exists (select 1 from jsonb_array_elements(coalesce(p_payload->'swapProvinces','[]'::jsonb)) value where jsonb_typeof(value)<>'string') then
      raise exception 'KH_INVALID_SWAP';
    end if;
    select coalesce(array_agg(value order by ordinal),'{}'::text[]) into v_swap_provinces
      from jsonb_array_elements_text(coalesce(p_payload->'swapProvinces','[]'::jsonb)) with ordinality items(value,ordinal);
    if v_swap_wants is null or char_length(v_swap_wants) not between 20 and 500
      or v_swap_balance is null or v_swap_balance not in ('none','pay','receive')
      or not kh_private.valid_provinces(v_swap_provinces)
      or (v_swap_amount is not null and (v_swap_balance='none' or not(v_swap_amount>0 and v_swap_amount<=100000000))) then
      raise exception 'KH_INVALID_SWAP';
    end if;
  end if;

  v_canonical := jsonb_build_object(
    'clientRequestId',v_request,'title',btrim(p_payload->>'title'),'location',btrim(p_payload->>'location'),
    'province',btrim(p_payload->>'province'),'description',btrim(p_payload->>'description'),'type',v_type,
    'price',v_price,'area',v_area,'bedrooms',v_bedrooms,'bathrooms',v_bathrooms,
    'amenities',to_jsonb(v_amenities),'photoPaths',to_jsonb(v_photos),'moderation',v_mode,'mapLocation',v_map_location,
    'condition',v_condition,'floor',v_floor,'priceNegotiable',v_negotiable,
    'operation',v_operation,'swapWants',v_swap_wants,'swapProvinces',to_jsonb(v_swap_provinces),'swapBalance',v_swap_balance,'swapAmount',v_swap_amount
  );
  if v_id is null and v_exists then
    select * into v_receipt from kh_private.property_save_requests where property_id=v_existing.id;
    if v_receipt.initial_payload=v_canonical then return to_jsonb(v_existing); end if;
    raise exception 'KH_REQUEST_CONFLICT';
  elsif v_id is not null then
    select * into v_receipt from kh_private.property_save_requests where property_id=v_existing.id;
    if v_receipt.last_expected_version=v_expected and v_receipt.last_payload=v_canonical and v_existing.version=v_receipt.last_result_version then
      return to_jsonb(v_existing);
    end if;
    if v_existing.version<>v_expected then raise exception 'KH_VERSION_CONFLICT'; end if;
    if v_existing.moderation<>'draft' then v_mode := 'pending'; end if;
  end if;
  -- validate_photos only waives the minimum for drafts; a wanted ad is the other case without photos.
  perform kh_private.validate_photos(v_user,v_request,v_photos,case when v_operation='wanted' then 'draft' else v_mode end);
  if v_id is null then
    insert into public.properties(owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,latitude,longitude,location_precision,condition,floor,price_negotiable,operation,swap_wants,swap_provinces,swap_balance,swap_amount)
    values(v_user,v_request,v_canonical->>'title',v_canonical->>'location',v_canonical->>'province',v_type,v_canonical->>'description',v_price,v_area,v_bedrooms::integer,v_bathrooms::integer,v_amenities,v_photos,v_mode,
      (v_map_location->>'latitude')::numeric,(v_map_location->>'longitude')::numeric,v_map_location->>'precision',v_condition,v_floor::integer,v_negotiable,
      v_operation,v_swap_wants,v_swap_provinces,v_swap_balance,v_swap_amount)
    returning * into v_saved;
    insert into kh_private.property_save_requests(property_id,initial_payload,last_payload,last_expected_version,last_result_version)
    values(v_saved.id,v_canonical,v_canonical,null,v_saved.version);
  else
    update public.properties set title=v_canonical->>'title',location=v_canonical->>'location',province=v_canonical->>'province',
      type=v_type,description=v_canonical->>'description',price=v_price,area=v_area,bedrooms=v_bedrooms::integer,bathrooms=v_bathrooms::integer,
      amenities=v_amenities,photo_paths=v_photos,moderation=v_mode,review_note=null,updated_at=now(),version=version+1,
      latitude=(v_map_location->>'latitude')::numeric,longitude=(v_map_location->>'longitude')::numeric,location_precision=v_map_location->>'precision',
      condition=v_condition,floor=v_floor::integer,price_negotiable=v_negotiable,
      swap_wants=v_swap_wants,swap_provinces=v_swap_provinces,swap_balance=v_swap_balance,swap_amount=v_swap_amount
      where id=v_id returning * into v_saved;
    update kh_private.property_save_requests set last_payload=v_canonical,last_expected_version=v_expected,last_result_version=v_saved.version where property_id=v_id;
  end if;
  return to_jsonb(v_saved);
end;
$$;

-- Catalogue: an explicit `operations` array filters; without it only offers show, so an
-- older APK never receives a wanted ad (whose type/area/bathrooms it cannot parse).
create or replace function kh_private.kh_catalog_where(f jsonb)
returns text language plpgsql immutable parallel safe as $fn$
declare v text := 'p.moderation=''approved'' and p.availability=''active''';
begin
  if jsonb_typeof(f->'operations') = 'array' and jsonb_array_length(f->'operations') > 0 then
    if exists (select 1 from jsonb_array_elements_text(f->'operations') o where o not in ('sale','swap','wanted')) then
      raise exception 'KH_INVALID_OPERATION';
    end if;
    v := v || ' and p.operation = any(array(select jsonb_array_elements_text($1->''operations'')))';
  else
    v := v || ' and p.operation in (''sale'',''swap'')';
  end if;
  if f->>'type' is not null then v := v || ' and p.type = ($1->>''type'')'; end if;
  if f->>'province' is not null then
    v := v || ' and kh_private.kh_unaccent(lower(p.province)) = kh_private.kh_unaccent(lower($1->>''province''))';
  end if;
  if f->>'condition' is not null then v := v || ' and p.condition = ($1->>''condition'')'; end if;
  if f->>'min_price' is not null then v := v || ' and p.price >= ($1->>''min_price'')::numeric'; end if;
  if f->>'max_price' is not null then v := v || ' and p.price <= ($1->>''max_price'')::numeric'; end if;
  if f->>'min_area' is not null then v := v || ' and p.area >= ($1->>''min_area'')::numeric'; end if;
  if f->>'max_area' is not null then v := v || ' and p.area <= ($1->>''max_area'')::numeric'; end if;
  if coalesce((f->>'min_bedrooms')::int, 0) > 0 then v := v || ' and p.bedrooms >= ($1->>''min_bedrooms'')::int'; end if;
  if f->>'min_bathrooms' is not null then v := v || ' and p.bathrooms >= ($1->>''min_bathrooms'')::int'; end if;
  if f->>'negotiable_only' is not null then v := v || ' and p.price_negotiable is true'; end if;
  if jsonb_typeof(f->'amenities') = 'array' and jsonb_array_length(f->'amenities') > 0 then
    -- ponytail: per-row unaccent over the amenities array, no index. Add a generated
    -- unaccented text[] column with a gin index if amenity filters become a hot path.
    v := v || ' and not exists (select 1 from jsonb_array_elements_text($1->''amenities'') a(want)'
           || ' where not exists (select 1 from unnest(p.amenities) have'
           || ' where kh_private.kh_unaccent(lower(have)) = a.want))';
  end if;
  return v;
end $fn$;

-- Wanted ads never carry a point, so kh_map_clusters already skips them through `latitude is not null`.
notify pgrst, 'reload schema';
```

- [ ] **Step 2: Suite SQL**

```sql
-- Swap and wanted listings through the RPCs. Reserved synthetic actors; everything rolls back.
begin;
create or replace function pg_temp.ops_assert(ok boolean, description text) returns void
language plpgsql as $$ begin
  if ok is not true then raise exception 'OPS ASSERTION FAILED: %', description; end if;
end $$;
create or replace function pg_temp.ops_error(statement text, expected_message text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected error (%): %',expected_message,sqlerrm;
  end;
  raise exception 'OPS ASSERTION FAILED: expected %',expected_message;
end $$;
create or replace function pg_temp.ops_as(actor uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('26000000-0000-4000-8000-000000000001','kh-ops-seller@example.invalid','{}');
insert into storage.objects(bucket_id,name,owner_id) values
 ('property-photos','26000000-0000-4000-8000-000000000001/ops-swap/photo.jpg','26000000-0000-4000-8000-000000000001');
create temporary table ops_context(swap_id uuid, wanted_id uuid, sale_id uuid);
insert into ops_context default values;
grant select,update on ops_context to authenticated;

set local role authenticated;
select pg_temp.ops_as('26000000-0000-4000-8000-000000000001');

-- A swap with everything.
update ops_context set swap_id=(public.kh_save_property('{
 "clientRequestId":"ops-swap","title":"Casa para permutar","location":"Vedado","province":"La Habana","type":"Casa",
 "description":"Casa amplia con patio, la cambio por apartamento.","price":80000,"area":120,"bedrooms":3,"bathrooms":2,
 "photoPaths":["26000000-0000-4000-8000-000000000001/ops-swap/photo.jpg"],"operation":"swap",
 "swapWants":"Apartamento en Playa o Vedado con dos habitaciones.","swapProvinces":["La Habana","Artemisa"],"swapBalance":"pay","swapAmount":5000}')->>'id')::uuid;
select pg_temp.ops_assert((select operation='swap' and swap_balance='pay' and swap_amount=5000 and swap_provinces=array['La Habana','Artemisa']
  from public.properties where id=(select swap_id from ops_context)),'the swap row keeps its fields');
-- A swap without what it wants, or with an amount and no balance, is rejected.
select pg_temp.ops_error($q$select public.kh_save_property('{"clientRequestId":"ops-swap-2","title":"Casa","location":"Vedado","province":"La Habana","type":"Casa","description":"Casa amplia con patio, la cambio por apartamento.","price":80000,"area":120,"bedrooms":3,"bathrooms":2,"photoPaths":[],"operation":"swap","swapBalance":"none"}')$q$,'KH_INVALID_SWAP');
select pg_temp.ops_error($q$select public.kh_save_property('{"clientRequestId":"ops-swap-3","title":"Casa","location":"Vedado","province":"La Habana","type":"Casa","description":"Casa amplia con patio, la cambio por apartamento.","price":80000,"area":120,"bedrooms":3,"bathrooms":2,"photoPaths":[],"operation":"swap","swapWants":"Apartamento en Playa o Vedado con dos habitaciones.","swapBalance":"none","swapAmount":100}')$q$,'KH_INVALID_SWAP');
-- A wanted ad: no photos, no area, no bathrooms, no type, no map.
update ops_context set wanted_id=(public.kh_save_property('{
 "clientRequestId":"ops-wanted","title":"Busco apartamento en Playa","location":"Playa o Vedado","province":"La Habana","type":null,
 "description":"Busco apartamento con balcón, planta baja o con ascensor.","price":40000,"area":null,"bedrooms":2,"bathrooms":null,
 "photoPaths":[],"operation":"wanted","mapLocation":{"latitude":23.1,"longitude":-82.4,"precision":"exact"}}')->>'id')::uuid;
select pg_temp.ops_assert((select operation='wanted' and type is null and area is null and bathrooms is null and latitude is null and cardinality(photo_paths)=0 and moderation='pending'
  from public.properties where id=(select wanted_id from ops_context)),'the wanted row drops what it does not describe');
-- An old payload without operation is a sale, and an unknown operation is rejected.
update ops_context set sale_id=(public.kh_save_property('{
 "clientRequestId":"ops-sale","title":"Casa en venta","location":"Vedado","province":"La Habana","type":"Casa",
 "description":"Casa amplia con patio y garaje, lista para entrar.","price":90000,"area":100,"bedrooms":2,"bathrooms":1,"photoPaths":[],"moderation":"draft"}')->>'id')::uuid;
select pg_temp.ops_assert((select operation='sale' from public.properties where id=(select sale_id from ops_context)),'no operation means a sale');
select pg_temp.ops_error($q$select public.kh_save_property('{"clientRequestId":"ops-rent","title":"Casa","location":"Vedado","province":"La Habana","type":"Casa","description":"Casa amplia con patio y garaje, lista para entrar.","price":90000,"area":100,"bedrooms":2,"bathrooms":1,"photoPaths":[],"operation":"rent"}')$q$,'KH_INVALID_OPERATION');
-- The operation cannot change on edit.
select pg_temp.ops_error((select format($q$select public.kh_save_property('{"id":"%s","expectedVersion":1,"clientRequestId":"ops-swap","title":"Casa para permutar","location":"Vedado","province":"La Habana","type":"Casa","description":"Casa amplia con patio, la cambio por apartamento.","price":80000,"area":120,"bedrooms":3,"bathrooms":2,"photoPaths":["26000000-0000-4000-8000-000000000001/ops-swap/photo.jpg"],"operation":"sale"}')$q$, swap_id) from ops_context),'KH_OPERATION_LOCKED');

-- Approve everything as the database owner and read the catalogue as a user.
reset role;
update public.properties set moderation='approved' where id in (select swap_id from ops_context union select wanted_id from ops_context union select sale_id from ops_context);
set local role authenticated;
select pg_temp.ops_as('26000000-0000-4000-8000-000000000001');
create temporary table ops_results as
  select 'default' as name, public.kh_search_properties('{"query":"ops","limit":48}') as r
  union all select 'wanted', public.kh_search_properties('{"query":"ops","limit":48,"operations":["wanted"]}')
  union all select 'swap', public.kh_search_properties('{"query":"ops","limit":48,"operations":["swap"]}');
select pg_temp.ops_assert((select not exists (select 1 from ops_results, jsonb_array_elements(r->'rows') row where name='default' and row->>'operation'='wanted')
  and exists (select 1 from ops_results, jsonb_array_elements(r->'rows') row where name='default' and row->>'id'=(select swap_id::text from ops_context))),
  'without operations the catalogue shows offers and hides wanted ads');
select pg_temp.ops_assert((select count(*)=1 and bool_and(row->>'id'=(select wanted_id::text from ops_context)) from ops_results, jsonb_array_elements(r->'rows') row where name='wanted'),'operations=[wanted] returns only the wanted ad');
select pg_temp.ops_assert((select count(*)=1 and bool_and(row->>'operation'='swap') from ops_results, jsonb_array_elements(r->'rows') row where name='swap'),'operations=[swap] returns only the swap');
select pg_temp.ops_error($q$select public.kh_search_properties('{"operations":["rent"]}')$q$,'KH_INVALID_OPERATION');
select pg_temp.ops_assert((select (public.kh_map_clusters('{"west":-180,"south":-90,"east":180,"north":90,"zoom":3,"operations":["wanted"]}')->'items') = '[]'::jsonb),'a wanted ad never lands on the map');
rollback;
```

Nota: la búsqueda `"query":"ops"` no coincide con títulos; sustitúyela por `"query":""` si el prefijo no encuentra los títulos («Casa para permutar», «Busco apartamento»): la intención es acotar a filas de la suite. Si sin `query` aparecen anuncios reales del proyecto, filtra en los asserts por `row->>'id'` como ya hacen los de `wanted` y `swap`, y en `default` comprueba solo que el `swap_id` aparece y el `wanted_id` no.

- [ ] **Step 3: Scripts**

`scripts/apply-operations.mjs`: copia `scripts/apply-chat-negotiation-cards.mjs` y cambia el comentario de cabecera, las rutas (`20260926000100_operations.sql`, `supabase/tests/operations.sql`) y el inventario a `"select (select count(*) from auth.users)::int as users, (select count(*) from public.properties)::int as properties, (select count(*) from storage.objects)::int as objects"`.

`scripts/verify-operations.mjs`:
```js
// Read-only: the operations columns and constraints exist, and the suite passes on the applied schema.
import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const suite = readFileSync(new URL('../supabase/tests/operations.sql', import.meta.url), 'utf8');
const db = createDatabaseClient();
try {
  await db.connect();
  const { rows } = await db.query(`select
    (select count(*) from information_schema.columns where table_schema='public' and table_name='properties' and column_name in ('operation','swap_wants','swap_provinces','swap_balance','swap_amount'))::int as columns,
    (select count(*) from pg_constraint where conrelid='public.properties'::regclass and conname in ('properties_operation_valid','properties_swap_fields','properties_offer_fields','properties_wanted_fields','properties_photos_required'))::int as constraints,
    (select count(*) from public.properties where operation<>'sale')::int as non_sale`);
  console.log(JSON.stringify(rows[0]));
  if (rows[0].columns !== 5 || rows[0].constraints !== 5) throw new Error('KH_NOT_APPLIED: ejecuta apply-operations.mjs --commit');
  await db.query(suite);
  console.log('suite superada sobre el esquema aplicado');
} catch (error) { await db.query('rollback').catch(() => {}); console.error('falló:', error.message); process.exitCode = 1; }
finally { await db.end(); }
```

- [ ] **Step 4: Run the dry run against the project**

Git Bash:
```bash
N="$USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"; "$N" scripts/apply-operations.mjs
```
Expected: `suite superada; nada se aplicó (usa --commit para aplicar)` e `inventoryUnchanged: true`. Si un assert falla, arregla migración o suite y repite. **No pases `--commit`** en esta tarea: lo decide el usuario.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260926000100_operations.sql supabase/tests/operations.sql scripts/apply-operations.mjs scripts/verify-operations.mjs
git commit -m "feat: store swap and wanted listings in properties

One operation column with swap fields; nulls in type, area and bathrooms
are legal only for wanted ads. kh_save_property validates per operation
and keeps an older client's payload as a sale; kh_catalog_where hides
wanted ads unless the request asks for them.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Publicar — paso de operación, permuta y busco en el formulario

**Files:**
- Modify: `src/components/ListingForm.tsx`, `src/screens/EditScreen.tsx`

Contexto: `ListingForm` tiene tres pasos (`step` 0-2) con `stepFields` para resumir errores, `changeField(name, value)`, `Field`, `ChoiceField`, `SelectionField`, `Pill` (de `./ui`), y `ListingPhotos`/`LocationPicker`. `initialDraft` llega en edición; en Publicar no hay `initialDraft` (borrador nuevo).

- [ ] **Step 1: Paso previo de operación**

- Añade estado `const operation = draft.operation ?? 'sale';` y `const wanted = operation === 'wanted';`, y `const [choosing, setChoosing] = useState(() => !initialDraft && !draft.operation);` — pero el borrador se hidrata después: calcula `choosing` como `hydrated && !initialDraft && draft.operation === undefined && !chosen`, con `const [chosen, setChosen] = useState(false)`.
- Cuando `choosing`, en lugar de los pasos renderiza:
```tsx
<View style={styles.section}>
  <SectionHeading title="¿Qué quieres publicar?" description="Elige una opción. Después no se puede cambiar sin crear otro anuncio." />
  {OPERATIONS.map((item) => (
    <Pressable key={item.value} accessibilityRole="button" onPress={() => { changeField('operation', item.value); if (item.value === 'wanted') { changeField('type', ''); changeField('photos', []); changeField('photoUri', undefined); changeField('mapLocation', undefined); } setChosen(true); }}
      style={({ pressed }) => [styles.fieldCard, styles.operationOption, pressed && { opacity: .8 }]}>
      <Icon name={item.value === 'sale' ? 'pricetag-outline' : item.value === 'swap' ? 'swap-horizontal-outline' : 'search-outline'} size={25} color={colors.primary} />
      <View style={{ flex: 1 }}><Text style={styles.operationTitle}>{item.label}</Text><Text style={styles.operationText}>{item.description}</Text></View>
      <Icon name="chevron-forward" size={19} color={colors.muted} />
    </Pressable>
  ))}
</View>
```
  con estilos `operationOption: { flexDirection: 'row', alignItems: 'center', gap: 14 }`, `operationTitle: { fontSize: 17, fontWeight: '600', color: colors.ink }`, `operationText: { fontSize: 14, color: colors.muted }`. Importa `OPERATIONS`, `SWAP_BALANCES`, `PROVINCES` de `../domain/listingOptions`.
- En el primer paso, muestra arriba una línea `<Text style={styles.operationTag}>{OPERATIONS.find(o => o.value === operation)?.label}</Text>` con un botón «Cambiar» (`Button secondary`) que hace `setChosen(false)` y `changeField('operation', undefined)` solo cuando no hay `initialDraft` (en edición no se cambia).
- `stepFields` pasa a función `stepFieldsFor(operation)`:
  - `sale`/`swap`: como hoy, y `swap` añade `'swapWants', 'swapProvinces', 'swapBalance', 'swapAmount'` al paso 1.
  - `wanted`: `[['title', 'type', 'location', 'province'], ['price', 'bedrooms', 'description'], []]`.
  Sustituye cada uso de `stepFields[step]` por `stepFieldsFor(operation)[step]`. Añade a `fieldLabels`: `operation: 'Qué publicas', swapWants: 'Qué buscas a cambio', swapProvinces: 'Provincias que aceptas', swapBalance: 'Diferencia', swapAmount: 'Importe de la diferencia'`.

- [ ] **Step 2: Paso 0 según operación**

- `ChoiceField "Tipo de vivienda"`: en `wanted` añade una tercera `Pill` «Cualquiera» activa cuando `draft.type === ''` (`changeField('type', '')`).
- Etiqueta de `location`: `wanted ? 'Zonas que te interesan' : 'Zona o barrio'`, placeholder en `wanted` «Ej. Playa, Vedado o Miramar».
- `LocationPicker` (mapa) no se muestra en `wanted`.

- [ ] **Step 3: Paso 1 según operación**

- `wanted`: no renderizar `ListingPhotos`, ni baños, superficie, negociable, estado, planta ni comodidades. Etiquetas: precio → «Presupuesto máximo en USD»; habitaciones → «Habitaciones mínimas». `SectionHeading` título «Lo que buscas», descripción «Cuanto más claro, mejores mensajes recibirás.».
- `swap`: precio etiquetado «Valor estimado en USD» con hint «Sirve para que te encuentren por precio; no es una oferta.». Tras comodidades, nueva tarjeta:
```tsx
<View style={styles.fieldCard}>
  <SectionHeading title="A cambio busco" description="Describe qué vivienda aceptarías y en qué provincias." />
  <Field label="Qué buscas a cambio" required multiline numberOfLines={4} value={draft.swapWants ?? ''} onChangeText={value => changeField('swapWants', value)} error={errors.swapWants} placeholder="Ej. Apartamento de dos habitaciones en Playa o Vedado, con balcón." />
  <ChoiceField label="Provincias que aceptas (opcional)" error={errors.swapProvinces}>
    {PROVINCES.map(province => <Pill key={province} label={province} active={draft.swapProvinces?.includes(province)} icon={draft.swapProvinces?.includes(province) ? 'checkmark-circle' : 'add-outline'}
      onPress={() => changeField('swapProvinces', draft.swapProvinces?.includes(province) ? draft.swapProvinces.filter(item => item !== province) : [...(draft.swapProvinces ?? []), province])} />)}
  </ChoiceField>
  <SelectionField label="Diferencia de dinero" value={draft.swapBalance ?? ''} options={[{ value: '', label: 'Elige una opción' }, ...SWAP_BALANCES]} onChange={value => changeField('swapBalance', value as ListingDraft['swapBalance'])} error={errors.swapBalance} />
  {draft.swapBalance && draft.swapBalance !== 'none' ? <Field label="Importe de la diferencia (USD, opcional)" keyboardType="decimal-pad" value={draft.swapAmount ?? ''} onChangeText={value => changeField('swapAmount', value)} error={errors.swapAmount} /> : null}
</View>
```
  Comprueba las props reales de `Field` (línea ~538) y de `ChoiceField`; ajusta nombres si difieren.

- [ ] **Step 4: Paso 2 (revisión)**

- Título del `Fact`s: en `wanted` muestra `Fact bed "desde N hab."` y `Fact home "Casa o apartamento" | tipo`; sin foto, sin superficie ni baños, sin `LocationPicker`. Precio con etiqueta: `wanted` «Presupuesto máximo», `swap` «Valor estimado».
- `swap`: tras la descripción añade `<Text style={styles.reviewLocation}>A cambio busca: {draft.swapWants?.trim()}</Text>`, provincias unidas por «, » si hay, y `swapBalanceText({ balance: draft.swapBalance, amount: draft.swapAmount?.trim() ? parseDecimal(draft.swapAmount) : undefined })` (importa de `../domain/operations` y `parseDecimal` de `../domain/numericInput`).
- Encabezado de revisión: `wanted` → «Revisa tu búsqueda».

- [ ] **Step 5: `EditScreen.toDraft`**

Añade al objeto: `operation: listing.operation, swapWants: listing.swap?.wants, swapProvinces: listing.swap?.provinces ? [...listing.swap.provinces] : undefined, swapBalance: listing.swap?.balance, swapAmount: listing.swap?.amount === undefined ? '' : String(listing.swap.amount)`, y `bathrooms: listing.bathrooms === undefined ? '' : String(listing.bathrooms)`, `area: listing.area === undefined ? '' : String(listing.area)`, `type: listing.type ?? ''`.

- [ ] **Step 6: Verify**

`npm run typecheck` (ya no debe fallar en `ListingForm.tsx` ni `EditScreen.tsx`). `npm test` verde. Abre el preview web (`preview_start` con `web`, puerto 8083, en modo demo sin Supabase o con sesión) y comprueba: Publicar muestra las tres opciones; «Busco vivienda» tiene dos pasos sin fotos; «Permutar» muestra la tarjeta «A cambio busco»; la revisión refleja cada caso; «Vender» es idéntico a antes.

- [ ] **Step 7: Commit**

```bash
git add src/components/ListingForm.tsx src/screens/EditScreen.tsx
git commit -m "feat: publish a sale, a swap or a wanted ad from the same form

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Catálogo — filtro, atajos, tarjeta, Mis anuncios, Admin

**Files:**
- Modify: `src/components/CatalogFilters.tsx`, `src/screens/ExploreScreen.tsx`, `src/components/PropertyCard.tsx`, `src/screens/MyListingsScreen.tsx`, `src/screens/AdminScreen.tsx`

- [ ] **Step 1: `CatalogFilters`**

En la sección «Vivienda y ubicación», antes de las pills de tipo:
```tsx
<Text style={styles.label}>Operación</Text>
<View style={styles.choices}>{([['offers', 'Venta y permuta'], ['sale', 'Venta'], ['swap', 'Permuta'], ['wanted', 'Busco']] as const).map(([value, label]) =>
  <Pill key={value} label={label} active={(draft.operation ?? 'offers') === value} onPress={() => change({ operation: value })} />)}</View>
```
El botón «Limpiar» ya reparte `defaultFilters`, que trae `operation: 'offers'`. El texto del pie: si `(draft.operation ?? 'offers') === 'wanted'`, di «búsqueda/búsquedas» en lugar de «vivienda/viviendas».

- [ ] **Step 2: `ExploreScreen`**

En `shortcuts` añade `{ value: 'swap', label: 'Permutas' }, { value: 'wanted', label: 'Busco' }` tras Apartamentos. `hasTags`: añade `|| (filters.operation ?? 'offers') === 'sale'` (el filtro «solo venta» no tiene atajo). El contador `homes`: si `filters.operation === 'wanted'`, usa «búsqueda/búsquedas».

- [ ] **Step 3: `PropertyCard`**

- Importa `listingFacts, operationBadge, priceLabel` de `../domain/operations`.
- `const facts = listingFacts(listing);` sustituye la línea actual.
- `const operation = operationBadge(listing);` y la insignia: `const badge = operation || (listing.owner === 'demo' ? 'Demo' : ...)` (la operación manda sobre «Nueva»). Añade estilo `operationBadge: { color: colors.primary }` y aplícalo cuando `badge === operation && operation`.
- Sin foto en un busco: en lugar de `PropertyImage`, cuando `listing.operation === 'wanted' && !(listing.photos?.length)` renderiza `<View style={[horizontal ? styles.horizontalImage : styles.image, styles.wantedImage]}><Icon name="search-outline" size={37} color={colors.primary} /><Text style={styles.wantedText}>Busco vivienda</Text></View>` con `wantedImage: { backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center', gap: 8 }`, `wantedText: { color: colors.primary, fontWeight: '600' }`.
- Precio: `wanted` → `<Text style={styles.price}>Hasta {formatMoney(listing.price)} <Text style={styles.currency}>USD</Text></Text>`; `swap` → currency text `USD · valor est.`. `accessibilityLabel` usa `priceLabel(listing)`.

- [ ] **Step 4: `MyListingsScreen` y `AdminScreen`**

- Mis anuncios: junto al título de cada fila, `operationBadge(item)` como texto pequeño en `colors.primary` cuando no esté vacío.
- Admin (línea ~90-91): `{listing.type ?? 'Casa o apartamento'} · ...` y `listingFacts(listing)` en la segunda línea; prefija el título con `operationBadge(listing)` si existe («Permuta · Casa…»).

- [ ] **Step 5: Verify**: `npm run typecheck` sin errores en estos archivos; `npm test` verde. En el preview web: chips «Permutas»/«Busco» activan el filtro (recuento cambia), la hoja de filtros muestra «Operación», la tarjeta de un busco (modo demo: publica uno local) se ve con icono y «Hasta $».

- [ ] **Step 6: Commit**

```bash
git add src/components/CatalogFilters.tsx src/screens/ExploreScreen.tsx src/components/PropertyCard.tsx src/screens/MyListingsScreen.tsx src/screens/AdminScreen.tsx
git commit -m "feat: filter and label listings by operation in the catalogue

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Detalle

**Files:**
- Modify: `src/screens/DetailScreen.tsx`

- [ ] **Step 1: Cabecera y datos**

- Importa `listingOperation, operationBadge, priceLabel, swapBalanceText, typeLabel, shareText` de `../domain/operations`.
- `const operation = listingOperation(listing);` `const wanted = operation === 'wanted';`
- Título de navegación (línea ~110): `{operationBadge(listing) || listing.type}`; en `wanted` «Busco», en `swap` «Permuta».
- Galería y miniaturas: renderizar solo si `!wanted || photoCount > 0`; si `wanted` sin fotos, un bloque `styles.wantedHero` (alto 200, `colors.softBlue`, icono `search-outline` y texto «Busco vivienda») en lugar de `PropertyImage`, manteniendo los botones de volver/compartir/favorito.
- Insignia de estado: en `wanted` «Búsqueda activa» / «Cerrada» (`sold`) / «En pausa»; en `swap` «En permuta».
- Precio: `<Text style={styles.priceLabel}>{priceLabel(listing)}</Text>` encima del importe cuando `operation !== 'sale'`; en `wanted` el importe se presenta «Hasta $ X».
- Features: `wanted` → `Feature bed` con etiqueta «Mínimo» y valor `${listing.bedrooms}`, `Feature home-outline` valor `typeLabel(listing)` etiqueta «Tipo», y ninguna de baños/superficie. Resto igual.
- Título de sección «Sobre esta vivienda» → `wanted ? 'Qué busca' : 'Sobre esta vivienda'`.

- [ ] **Step 2: Sección de permuta**

Tras «Sobre esta vivienda», cuando `listing.swap`:
```tsx
<View style={styles.section}>
  <Text accessibilityRole="header" style={styles.sectionTitle}>A cambio busca</Text>
  <View style={styles.group}><Text style={styles.description}>{listing.swap.wants}</Text></View>
  <View style={styles.amenities}>
    <View style={styles.amenity}><Icon name="cash-outline" size={21} color={colors.primary} /><Text style={styles.amenityText}>{swapBalanceText(listing.swap)}</Text></View>
    {listing.swap.provinces.length > 0 && <View style={styles.amenity}><Icon name="map-outline" size={21} color={colors.primary} /><Text style={styles.amenityText}>{listing.swap.provinces.join(', ')}</Text></View>}
  </View>
</View>
```

- [ ] **Step 3: Barra inferior y compartir**

- `barLabel`: `wanted ? 'Presupuesto máximo · USD' : operation === 'swap' ? 'Valor estimado · USD' : 'Precio de venta · USD'`.
- Botón: `own ? 'Editar anuncio' : wanted ? 'Tengo algo que encaja' : 'Contactar'`.
- `share()`: `const message = shareText(listing, listingShareUrl(listing.id));` y el `Share.share` como está.

- [ ] **Step 4: Verify**: `npm run typecheck` limpio en todo el proyecto; `npm test` verde. Preview web: detalle de un busco local sin galería y con «Tengo algo que encaja»; detalle de una permuta con «A cambio busca».

- [ ] **Step 5: Commit**

```bash
git add src/screens/DetailScreen.tsx
git commit -m "feat: show swap terms and wanted ads on the detail screen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Ficha pública y landing

**Files:**
- Modify: `web/api/p.ts`, `web/public/index.html`
- Test: `tests/public-listing.test.ts`

- [ ] **Step 1: Write the failing tests** (añade a `tests/public-listing.test.ts`)

```ts
test('the public page labels swaps and wanted ads', () => {
  const swapRow = { ...row, operation: 'swap' as const, swap_wants: 'Apartamento en Playa con dos habitaciones.', swap_provinces: ['La Habana'], swap_balance: 'pay' as const, swap_amount: '5000' };
  const swapHtml = renderListing(swapRow, photos, site, self);
  assert.ok(swapHtml.includes('<title>Permuta: Casa en el Vedado &lt;script&gt;alert(1)&lt;/script&gt;</title>'));
  assert.ok(swapHtml.includes('<meta property="og:description" content="Valor est. 85,000 USD · Vedado, La Habana · 3 hab · 2 baños · 120.5 m²">'));
  assert.ok(swapHtml.includes('<h2>A cambio busca</h2>') && swapHtml.includes('Apartamento en Playa con dos habitaciones.') && swapHtml.includes('Añade hasta $ 5,000') && swapHtml.includes('<dd>La Habana</dd>'));
  const wantedRow = { ...row, operation: 'wanted' as const, type: null, area: null, bathrooms: null, description: 'Busco con balcón, planta baja o ascensor.' };
  const wantedHtml = renderListing(wantedRow, [], site, self);
  assert.ok(wantedHtml.includes('<title>Busco: Casa en el Vedado &lt;script&gt;alert(1)&lt;/script&gt;</title>'));
  assert.ok(wantedHtml.includes('<meta property="og:description" content="Hasta 85,000 USD · Vedado, La Habana · desde 3 hab · Casa o apartamento">'));
  assert.ok(!wantedHtml.includes('Superficie') && !wantedHtml.includes('Baños') && !wantedHtml.includes('og:image'));
  assert.ok(wantedHtml.includes('Tengo algo que encaja'));
  assert.ok(wantedHtml.includes('<dt>Habitaciones mínimas</dt><dd>3</dd>'));
});
```

- [ ] **Step 2: `web/api/p.ts`**

- `PublicListingRow`: `type: string | null; area: number | string | null; bathrooms: number | null;` y añade `operation?: 'sale' | 'swap' | 'wanted' | null; swap_wants?: string | null; swap_provinces?: string[] | null; swap_balance?: 'none' | 'pay' | 'receive' | null; swap_amount?: number | string | null;`.
- `COLUMNS` añade `,operation,swap_wants,swap_provinces,swap_balance,swap_amount`.
- `describeListing`: 
```ts
export function describeListing(row: PublicListingRow): string {
  const op = row.operation ?? 'sale';
  const place = `${row.location}, ${row.province}`;
  if (op === 'wanted') return `Hasta ${formatPrice(row.price)} USD · ${place} · desde ${row.bedrooms} hab · ${row.type ?? 'Casa o apartamento'}`;
  const price = op === 'swap' ? `Valor est. ${formatPrice(row.price)} USD` : `${formatPrice(row.price)} USD`;
  return `${price} · ${place} · ${row.bedrooms} hab · ${row.bathrooms} baños · ${Number(row.area)} m²`;
}
```
- `renderListing`: `const op = row.operation ?? 'sale'; const titleText = op === 'sale' ? row.title : `${op === 'swap' ? 'Permuta' : 'Busco'}: ${row.title}`;` y usa `escapeHtml(titleText)` en `<title>`/`og:title`; el `<h1>` conserva el título y muestra encima `<p class="eyebrow">Permuta</p>`/`Busco` (añade `.eyebrow{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--primary);margin:16px 0 0}` al `STYLE`). Precio: `wanted` → `Hasta $ X`, `swap` → `$ X <small>USD · valor estimado</small>`. Detalles: `wanted` → `[['Tipo', row.type ?? 'Casa o apartamento'], ['Zona', place], ['Habitaciones mínimas', String(row.bedrooms)]]`; otros como hoy. Sección permuta cuando `op === 'swap'`:
```ts
  const swap = op === 'swap' ? `<section class="card"><h2>A cambio busca</h2><p>${escapeHtml((row.swap_wants ?? '').trim()).replace(/\r?\n/g, '<br>')}</p><dl><dt>Diferencia</dt><dd>${escapeHtml(balanceText(row))}</dd>${row.swap_provinces?.length ? `<dt>Provincias</dt><dd>${escapeHtml(row.swap_provinces.join(', '))}</dd>` : ''}</dl></section>` : '';
```
  con `function balanceText(row)`: `none` → «Sin diferencia»; `pay` → amount ? `Añade hasta $ ${formatPrice(amount)}` : «Añade dinero»; `receive` → amount ? `Pide $ ${formatPrice(amount)}` : «Pide dinero». Colócala entre la descripción y las características. Amenities se omiten en `wanted`. Texto del aviso y botón: `wanted` → «Para responder a esta búsqueda, ábrela en KarmaHouse.» y botón «Tengo algo que encaja» (mismo `href`).
- Con `photoUrls` vacío ya no hay galería ni `og:image` (comportamiento actual).

- [ ] **Step 3: Landing**

En `web/public/index.html`: `<h1>Compra, vende o permuta casa en Cuba. Sin intermediarios.</h1>`; FAQ «¿Puedo publicar permutas o alquileres?» → «¿Puedo publicar permutas o búsquedas?» con respuesta «Sí. Al publicar eliges Vender, Permutar o Busco vivienda. Una permuta lleva tu vivienda y lo que buscas a cambio; un busco solo describe lo que buscas y quien tenga algo que encaje te escribe. Alquiler, todavía no.». Pie: «Compra, venta y permuta de viviendas en Cuba…».

- [ ] **Step 4: Verify**: `node --experimental-strip-types --test tests/public-listing.test.ts` → PASS (13). `npm run check` verde.

- [ ] **Step 5: Commit**

```bash
git add web/api/p.ts web/public/index.html tests/public-listing.test.ts
git commit -m "feat: describe swaps and wanted ads on the public page and the landing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Aplicar, verificar en navegador y documentar

**Files:**
- Create: `docs/operations-verification.md`
- Modify: `README.md`, `docs/growth-roadmap.md`

- [ ] **Step 1: Aplicar la migración** (solo con el visto bueno del usuario)

```bash
N="$USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"; "$N" scripts/apply-operations.mjs --commit && "$N" scripts/verify-operations.mjs
```
Expected: `migración aplicada`, `suite superada sobre el esquema aplicado`, `{"columns":5,"constraints":5,...}`.

- [ ] **Step 2: Navegador (web con Supabase, sesión del usuario)**

`preview_start` `web` (puerto 8083). Publicar una permuta y un busco de prueba con el usuario admin, aprobarlos desde Admin, comprobar en Explorar: por defecto aparecen venta y permuta; chip «Busco» muestra solo el busco; detalle de cada uno; abrir la ficha pública de ambos en `https://karmahouse.vercel.app/p/<id>` (tras el push, Vercel despliega). Después pausar o borrar los anuncios de prueba (Mis anuncios) para no dejar datos ficticios aprobados; si quedan, anotarlo.

- [ ] **Step 3: Docs**

`docs/operations-verification.md`: fecha, commit, salida de `apply --commit` y `verify`, recorrido en navegador (con ids de prueba y su estado final), ficha pública, límites (APK 0.1.6 ve permutas como ventas; sin búsqueda por «a cambio busco»; sin alertas).

`README.md` «Qué puedes probar»: añade `- Publicar una permuta (con lo que buscas a cambio, provincias y diferencia) o un anuncio «Busco vivienda» sin fotos; filtro «Operación» en Explorar y fichas públicas etiquetadas.` y en el párrafo de migraciones menciona `20260926000100_operations.sql` con `node scripts/apply-operations.mjs`.

`docs/growth-roadmap.md`: añade una fila «Permuta y busco» entregada con enlace a la verificación.

- [ ] **Step 4: Commit and push**

```bash
git add docs/operations-verification.md README.md docs/growth-roadmap.md
git commit -m "docs: verify swap and wanted listings end to end

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin main
```

---

## Self-review

- Spec: servidor (T3), ficha pública (T7), dominio y datos (T1-T2), publicar (T4), catálogo/tarjeta/Mis anuncios/Admin (T5), detalle y compartir (T6), landing (T7), compatibilidad (canonical con `operation`, `operations` ausente → ofertas, T3), verificación (T3 suite, T1-T2-T7 unitarias, T8 navegador y docs). `kh_map_clusters` no se toca: la spec lo pedía como explícito, pero `latitude is not null` ya excluye `wanted` y la suite lo comprueba; la spec queda corregida en esa línea por T8.
- Tipos: `ListingSwap {wants, provinces, balance, amount?}` igual en dominio, `remoteMapping`, `marketplaceStore`, `operations.ts` y `EditScreen`; `OperationFilter` y `operationsFor` usados por `filterListings`, `query.ts` y tests; `Shortcut` incluye `swap`/`wanted` y `ExploreScreen` los lista.
- Sin marcadores.
