export type ListingStatus = 'active' | 'paused' | 'sold';

export type ListingType = 'Casa' | 'Apartamento';

export interface Listing {
  id: string;
  title: string;
  location: string;
  province: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  type: ListingType;
  description: string;
  amenities: string[];
  imageKey: 'vedado' | 'interior' | 'terrace';
  photoUri?: string;
  owner: 'demo' | 'local';
  status: ListingStatus;
  createdAt: string;
}

export interface ListingDraft {
  title: string;
  location: string;
  province: string;
  price: string;
  bedrooms: string;
  bathrooms: string;
  area: string;
  type: ListingType;
  description: string;
  amenities: string[];
  imageKey: Listing['imageKey'];
  photoUri?: string;
}

export interface ListingFilters {
  query: string;
  type: 'Todas' | ListingType;
  maxPrice: string;
  minBedrooms: number;
  sort: 'recent' | 'price-asc';
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
};

export function filterListings(listings: Listing[], filters: ListingFilters): Listing[] {
  const query = normalizeSearch(filters.query);
  const parsedMaxPrice = Number(filters.maxPrice.trim());
  const hasMaxPrice =
    filters.maxPrice.trim() !== '' && Number.isFinite(parsedMaxPrice) && parsedMaxPrice >= 0;
  const minBedrooms =
    Number.isFinite(filters.minBedrooms) && filters.minBedrooms > 0
      ? Math.floor(filters.minBedrooms)
      : 0;

  return listings
    .filter((listing) => listing.status === 'active')
    .filter((listing) => filters.type === 'Todas' || listing.type === filters.type)
    .filter((listing) => !hasMaxPrice || listing.price <= parsedMaxPrice)
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
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });
}

export function validateDraft(draft: ListingDraft): DraftValidation {
  const errors: DraftValidation['errors'] = {};

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
  if (draft.photoUri !== undefined && !isSupportedPhotoUri(draft.photoUri)) {
    errors.photoUri = 'La foto debe ser una imagen local válida de hasta 4 MB.';
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

  const { photoUri: _previousPhotoUri, ...listingWithoutPhoto } = listing;
  return {
    ...listingWithoutPhoto,
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

function normalizeSearch(value: string): string {
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
  const parsed = Number(trimmed);
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

  const photoUri = draft.photoUri?.trim();
  return {
    title: draft.title.trim(),
    location: draft.location.trim(),
    province: draft.province.trim(),
    price: Number(draft.price.trim()),
    bedrooms: Number(draft.bedrooms.trim()),
    bathrooms: Number(draft.bathrooms.trim()),
    area: Number(draft.area.trim()),
    type: draft.type,
    description: draft.description.trim(),
    amenities: normalizeAmenities(draft.amenities),
    imageKey: draft.imageKey,
    ...(photoUri ? { photoUri } : {}),
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
