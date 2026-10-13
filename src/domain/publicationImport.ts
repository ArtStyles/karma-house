import type { ImportResult } from './importListing.ts';
import { emptyDraft, type ListingDraft } from './listings.ts';

type PreparedImport = { ok: true; draft: ListingDraft; summary: ImportResult } | { ok: false; error: string };
const isBlank = (value: unknown) => value == null || value === '' || (Array.isArray(value) && value.length === 0);

/** A paste supplements a draft; it never replaces an existing choice, photo or entered value. */
export function preparePublicationImport(current: ListingDraft, result: ImportResult): PreparedImport {
  if (current.operation && result.detected.includes('operation') && result.draft.operation !== current.operation) {
    return { ok: false, error: 'El texto indica otra operación. Tu borrador se conserva; pega un anuncio de la misma operación para completarlo.' };
  }
  const draft: ListingDraft = JSON.parse(JSON.stringify(current));
  const applied = new Set<keyof ListingDraft>();
  function fill<Field extends keyof ListingDraft>(field: Field) {
    const value = result.draft[field];
    if (isBlank(value) || (!isBlank(draft[field]) && !(field === 'type' && !current.operation && draft.type === emptyDraft.type))) return;
    draft[field] = value as ListingDraft[Field];
    applied.add(field);
  }
  for (const field of result.detected) if (field !== 'operation') fill(field);
  if (!current.operation) {
    draft.operation = result.draft.operation ?? 'sale';
    if (result.detected.includes('operation')) applied.add('operation');
    if (!result.detected.includes('type') && current.type === emptyDraft.type) draft.type = '';
  }
  if (draft.operation === 'rent' && !draft.rentPeriod) draft.rentPeriod = 'month';
  if (draft.operation === 'wanted' && !draft.wantedOperations?.length) draft.wantedOperations = ['sale', 'swap'];
  return {
    ok: true, draft,
    summary: { ...result, draft, detected: result.detected.filter(field => applied.has(field)), missing: result.missing.filter(field => isBlank(draft[field])), notes: [...result.notes, 'Conservamos los datos que ya tenías y tus fotos.'] },
  };
}
