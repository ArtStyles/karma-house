import { isMapLocation, normalizeMapLocation, type MapLocation } from './geo.ts';
import { isListingCondition, isDraftFloor, type ListingCondition } from './listingOptions.ts';
import { parseDecimal } from './numericInput.ts';
export type { ListingCondition } from './listingOptions.ts';

export type ListingStatus = 'active' | 'paused' | 'sold';
export type ModerationStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface PhotoDraft {
  uri: string;
  storagePath?: string;
  /** Stable per selected photo, persisted with the draft for safe upload retries. */
  uploadId?: string;
}

export type ListingType = 'Casa' | 'Apartamento';

export interface Listing {
  id: string;
  title: string;
  location: string;
  province: string;
  mapLocation?: MapLocation;
  condition?: ListingCondition;
  floor?: number;
  priceNegotiable?: boolean;
  price: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  type: ListingType;
  description: string;
  amenities: string[];
  imageKey: 'vedado' | 'interior' | 'terrace';
  photoUri?: string;
  owner: 'demo' | 'local' | 'remote';
  ownerId?: string;
  moderationStatus?: ModerationStatus;
  reviewNote?: string;
  version?: number;
  clientRequestId?: string;
  photos?: PhotoDraft[];
  status: ListingStatus;
  createdAt: string;
}

export interface ListingDraft {
  condition?: ListingCondition | '';
  floor?: string;
  priceNegotiable?: boolean | null;
  expectedVersion?: number;
  title: string;
  location: string;
  province: string;
  mapLocation?: MapLocation;
  price: string;
  bedrooms: string;
  bathrooms: string;
  area: string;
  type: ListingType;
  description: string;
  amenities: string[];
  imageKey: Listing['imageKey'];
  photoUri?: string;
  photos?: PhotoDraft[];
  clientRequestId?: string;
}

export interface ListingFilters {
  query: string;
  type: 'Todas' | ListingType;
  maxPrice: string;
  minBedrooms: number;
  sort: 'recent' | 'price-asc' | 'price-desc' | 'area-desc';
  province?: string;
  minPrice?: string;
  minArea?: string;
  maxArea?: string;
  minBathrooms?: number;
  condition?: ListingCondition | '';
  amenities?: string[];
  negotiableOnly?: boolean;
}

export interface DraftValidation {
  ok: boolean;
  errors: Partial<Record<keyof ListingDraft, string>>;
}

export const emptyDraft: ListingDraft = {
  title: '',
  location: '',
  province: '',
  price: '',
  bedrooms: '',
  bathrooms: '',
  area: '',
  type: 'Casa',
  description: '',
  amenities: [],
  imageKey: 'vedado',
};

export const defaultFilters: ListingFilters = {
  query: '',
  type: 'Todas',
  maxPrice: '',
  minBedrooms: 0,
  sort: 'recent',
  province: '', minPrice: '', minArea: '', maxArea: '', minBathrooms: 0,
  condition: '', amenities: [], negotiableOnly: false,
};

const NEW_LISTING_MS = 7 * 24 * 60 * 60 * 1000;
/** «Nueva» for a week after the listing was created; a future or malformed date never qualifies. */
export function isNewListing(createdAt: string, now = Date.now()): boolean {
  const age = now - Date.parse(createdAt);
  return age >= 0 && age < NEW_LISTING_MS;
}

/** One-tap presets on Explorar. Each owns a single filter, so the full sheet stays the source of truth. */
export type Shortcut = ListingType | 'price' | 'bedrooms';
export const PRICE_SHORTCUT = '30000';
export const BEDROOM_SHORTCUT = 3;

export function shortcutActive(filters: ListingFilters, shortcut: Shortcut): boolean {
  if (shortcut === 'price') return filters.maxPrice.trim() === PRICE_SHORTCUT && !filters.minPrice?.trim();
  if (shortcut === 'bedrooms') return filters.minBedrooms === BEDROOM_SHORTCUT;
  return filters.type === shortcut;
}

export function toggleShortcut(filters: ListingFilters, shortcut: Shortcut): Partial<ListingFilters> {
  const active = shortcutActive(filters, shortcut);
  if (shortcut === 'price') return active ? { maxPrice: '' } : { maxPrice: PRICE_SHORTCUT, minPrice: '' };
  if (shortcut === 'bedrooms') return { minBedrooms: active ? 0 : BEDROOM_SHORTCUT };
  return { type: active ? 'Todas' : shortcut };
}

function filterNumber(value?: string): number | undefined {
  if (!value?.trim()) return undefined;
  const number = parseDecimal(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function filterRangeError(filters: ListingFilters): string | null {
  for (const [low, high, label] of [[filters.minPrice, filters.maxPrice, 'precio'], [filters.minArea, filters.maxArea, 'área']] as const) {
    if ([low, high].some(value => value?.trim() && filterNumber(value) === undefined)) return `Introduce un ${label} válido, igual o mayor que cero.`;
    const minimum = filterNumber(low); const maximum = filterNumber(high);
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) return `El ${label} mínimo no puede superar el máximo.`;
  }
  return null;
}

export type ListingBoardState = 'sold' | 'rejected' | 'draft' | 'pending' | 'paused' | 'live';

/**
 * One answer to «¿está mi vivienda en el catálogo?». Commercial status and moderation each hide
 * a listing on their own, so the owner needs them resolved into a single state, not stacked.
 */
export function listingBoardState(listing: Pick<Listing, 'status' | 'moderationStatus'>): ListingBoardState {
  if (listing.status === 'sold') return 'sold';
  if (listing.moderationStatus === 'rejected') return 'rejected';
  if (listing.moderationStatus === 'draft') return 'draft';
  if (listing.moderationStatus === 'pending') return 'pending';
  if (listing.status === 'paused') return 'paused';
  return 'live';
}

export function activeFilterCount(filters: ListingFilters): number {
  return [!!filters.query.trim(), filters.type !== 'Todas', !!filters.province?.trim(),
    !!(filters.minPrice?.trim() || filters.maxPrice.trim()), !!(filters.minArea?.trim() || filters.maxArea?.trim()),
    filters.minBedrooms > 0, (filters.minBathrooms ?? 0) > 0, !!filters.condition, !!filters.negotiableOnly,
  ].filter(Boolean).length + new Set((filters.amenities ?? []).map(normalizeSearch).filter(Boolean)).size;
}

export function filterListings(listings: Listing[], filters: ListingFilters): Listing[] {
  const query = normalizeSearch(filters.query);
  const parsedMaxPrice = parseDecimal(filters.maxPrice);
  const hasMaxPrice =
    filters.maxPrice.trim() !== '' && Number.isFinite(parsedMaxPrice) && parsedMaxPrice >= 0;
  const minBedrooms =
    Number.isFinite(filters.minBedrooms) && filters.minBedrooms > 0
      ? Math.floor(filters.minBedrooms)
      : 0;
  const minPrice = filterNumber(filters.minPrice);
  const minArea = filterNumber(filters.minArea); const maxArea = filterNumber(filters.maxArea);
  const province = normalizeSearch(filters.province ?? '');
  const amenities = (filters.amenities ?? []).map(normalizeSearch).filter(Boolean);

  return listings
    .filter((listing) => listing.status === 'active')
    .filter((listing) => !listing.moderationStatus || listing.moderationStatus === 'approved')
    .filter((listing) => filters.type === 'Todas' || listing.type === filters.type)
    .filter((listing) => !hasMaxPrice || listing.price <= parsedMaxPrice)
    .filter((listing) => minPrice === undefined || listing.price >= minPrice)
    .filter((listing) => minArea === undefined || listing.area >= minArea)
    .filter((listing) => maxArea === undefined || listing.area <= maxArea)
    .filter((listing) => !province || normalizeSearch(listing.province) === province)
    .filter((listing) => !filters.condition || listing.condition === filters.condition)
    .filter((listing) => !filters.negotiableOnly || listing.priceNegotiable === true)
    .filter((listing) => !(filters.minBathrooms && filters.minBathrooms > 0) || listing.bathrooms >= filters.minBathrooms)
    .filter((listing) => amenities.every(amenity => listing.amenities.some(value => normalizeSearch(value) === amenity)))
    .filter((listing) => listing.bedrooms >= minBedrooms)
    .filter((listing) => {
      if (!query) return true;
      return normalizeSearch(
        [
          listing.title,
          listing.location,
          listing.province,
          listing.description,
          ...listing.amenities,
        ].join(' '),
      ).includes(query);
    })
    .sort((left, right) => {
      if (filters.sort === 'price-asc') return left.price - right.price;
      if (filters.sort === 'price-desc') return right.price - left.price;
      if (filters.sort === 'area-desc') return right.area - left.area;
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });
}

export function validateDraft(draft: ListingDraft): DraftValidation {
  const errors: DraftValidation['errors'] = {};
  if (draft.condition !== undefined && draft.condition !== '' && !isListingCondition(draft.condition)) errors.condition = 'Selecciona un estado de vivienda válido.';
  if (draft.floor !== undefined && !isDraftFloor(draft.floor)) errors.floor = 'La planta debe ser un número entero entre 0 y 99.';
  if (draft.priceNegotiable != null && typeof draft.priceNegotiable !== 'boolean') errors.priceNegotiable = 'Indica si el precio es negociable.';

  validateText(draft.title, 'title', 3, 100, errors, 'El título');
  validateText(draft.location, 'location', 2, 80, errors, 'La ubicación');
  validateText(draft.province, 'province', 2, 80, errors, 'La provincia');
  validateText(draft.description, 'description', 20, 2000, errors, 'La descripción');
  validateNumber(draft.price, 'price', errors, {
    label: 'El precio',
    min: 0,
    max: 100_000_000,
    exclusiveMin: true,
  });
  validateNumber(draft.bedrooms, 'bedrooms', errors, {
    label: 'Los dormitorios',
    min: 1,
    max: 20,
    integer: true,
  });
  validateNumber(draft.bathrooms, 'bathrooms', errors, {
    label: 'Los baños',
    min: 1,
    max: 20,
    integer: true,
  });
  validateNumber(draft.area, 'area', errors, {
    label: 'El área',
    min: 0,
    max: 10_000,
    exclusiveMin: true,
  });

  if (draft.type !== 'Casa' && draft.type !== 'Apartamento') {
    errors.type = 'Selecciona un tipo de vivienda válido.';
  }
  if (!['vedado', 'interior', 'terrace'].includes(draft.imageKey)) {
    errors.imageKey = 'Selecciona una imagen válida.';
  }
  const amenities = normalizeAmenities(draft.amenities);
  if (amenities.length > 20 || amenities.some((amenity) => amenity.length > 60)) {
    errors.amenities = 'Usa hasta 20 comodidades de 60 caracteres cada una.';
  }
  if (draft.photos === undefined && draft.photoUri !== undefined && !isSupportedPhotoUri(draft.photoUri)) {
    errors.photoUri = 'La foto debe ser una imagen local válida de hasta 4 MB.';
  }
  if (draft.photos !== undefined && (
    !Array.isArray(draft.photos) || draft.photos.length > 6 ||
    draft.photos.some((photo) => !photo || typeof photo.uri !== 'string' ||
      (photo.storagePath ? !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(photo.storagePath)
        : !photo.uri.trim() || !isSupportedPhotoUri(photo.uri)))
  )) {
    errors.photos = 'Selecciona hasta seis fotos locales válidas de hasta 4 MB cada una.';
  }
  if (draft.clientRequestId !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(draft.clientRequestId)) {
    errors.clientRequestId = 'El identificador del borrador no es válido.';
  }
  if (draft.mapLocation !== undefined && !isMapLocation(draft.mapLocation)) {
    errors.mapLocation = 'Selecciona una ubicación válida en el mapa.';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function createListing(
  draft: ListingDraft,
  options: { id?: string; now?: string } = {},
): Listing {
  const values = validatedValues(draft);
  const id = options.id?.trim() || createLocalId();
  const createdAt = options.now ?? new Date().toISOString();

  if (!id) throw new Error('El identificador del anuncio no puede estar vacío.');
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error('La fecha de creación no es válida.');
  }

  return {
    id,
    ...values,
    owner: 'local',
    status: 'active',
    createdAt,
  };
}

export function updateListing(listing: Listing, draft: ListingDraft): Listing {
  if (listing.owner !== 'local') {
    throw new Error('Solo puedes editar anuncios locales.');
  }

  const { photoUri: _previousPhotoUri, photos: _previousPhotos, mapLocation: _previousMapLocation, condition, floor, priceNegotiable, ...listingWithoutPhoto } = listing;
  return {
    ...listingWithoutPhoto,
    ...(draft.condition === undefined && condition !== undefined ? { condition } : {}),
    ...(draft.floor === undefined && floor !== undefined ? { floor } : {}),
    ...(draft.priceNegotiable === undefined && priceNegotiable !== undefined ? { priceNegotiable } : {}),
    ...validatedValues(draft),
    id: listing.id,
    owner: 'local',
    createdAt: listing.createdAt,
  };
}

export function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '$0';
  return `$${Math.round(price).toLocaleString('en-US')}`;
}

interface NumberRules {
  label: string;
  min: number;
  max: number;
  exclusiveMin?: boolean;
  integer?: boolean;
}

/** Exported so the server payload cannot drift from the local demo filter. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

function normalizeAmenities(amenities: string[]): string[] {
  return [...new Set(amenities.map((amenity) => amenity.trim()).filter(Boolean))];
}

function validateText(
  value: string,
  field: keyof ListingDraft,
  min: number,
  max: number,
  errors: DraftValidation['errors'],
  label: string,
): void {
  const length = value.trim().length;
  if (length < min || length > max) {
    errors[field] = `${label} debe tener entre ${min} y ${max} caracteres.`;
  }
}

function validateNumber(
  value: string,
  field: keyof ListingDraft,
  errors: DraftValidation['errors'],
  rules: NumberRules,
): void {
  const trimmed = value.trim();
  const parsed = parseDecimal(trimmed);
  const outsideMinimum = rules.exclusiveMin ? parsed <= rules.min : parsed < rules.min;

  if (
    trimmed === '' ||
    !Number.isFinite(parsed) ||
    outsideMinimum ||
    parsed > rules.max ||
    (rules.integer && !Number.isInteger(parsed))
  ) {
    errors[field] = `${rules.label} no es válido.`;
  }
}

function validatedValues(
  draft: ListingDraft,
): Omit<Listing, 'id' | 'owner' | 'status' | 'createdAt'> {
  const validation = validateDraft(draft);
  if (!validation.ok) {
    throw new Error(`Revisa los datos del anuncio: ${Object.values(validation.errors).join(' ')}`);
  }

  const photoUri = draft.photos?.[0]?.uri.trim() ?? draft.photoUri?.trim();
  return {
    title: draft.title.trim(),
    location: draft.location.trim(),
    province: draft.province.trim(),
    ...(draft.condition ? { condition: draft.condition } : {}),
    ...(draft.floor?.trim() ? { floor: Number(draft.floor) } : {}),
    ...(draft.priceNegotiable != null ? { priceNegotiable: draft.priceNegotiable } : {}),
    ...(draft.mapLocation ? { mapLocation: normalizeMapLocation(draft.mapLocation) } : {}),
    price: parseDecimal(draft.price),
    bedrooms: Number(draft.bedrooms.trim()),
    bathrooms: Number(draft.bathrooms.trim()),
    area: parseDecimal(draft.area),
    type: draft.type,
    description: draft.description.trim(),
    amenities: normalizeAmenities(draft.amenities),
    imageKey: draft.imageKey,
    ...(photoUri ? { photoUri } : {}),
    ...(draft.photos ? { photos: draft.photos.map((photo) => ({ ...photo })) } : {}),
    ...(draft.clientRequestId ? { clientRequestId: draft.clientRequestId } : {}),
  };
}

function createLocalId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isSupportedPhotoUri(value: string): boolean {
  const uri = value.trim();
  if (!uri) return true;

  const dataImage = /^data:image\/(?:jpeg|jpg|png|webp|heic|heif);base64,([a-z0-9+/]+={0,2})$/i.exec(
    uri,
  );
  if (dataImage) {
    const base64 = dataImage[1];
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const decodedBytes = Math.floor((base64.length * 3) / 4) - padding;
    return decodedBytes <= 4 * 1024 * 1024;
  }

  return (
    uri.length <= 4096 && /^(?:file|content|ph|assets-library):\/\/.+/i.test(uri)
  );
}
