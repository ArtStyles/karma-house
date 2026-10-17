import { listingBoardLabels, type ListingBoardState } from '../domain/listings';
import { StateChip, type StateTone } from './StateChip';

const tones: Record<ListingBoardState, StateTone> = { live: 'done', pending: 'waiting', rejected: 'danger', paused: 'paused', draft: 'neutral', sold: 'neutral' };

/** One state per listing («¿está en el catálogo?»), the same chip in Mis anuncios and in an agency's portfolio. */
export function ListingStateChip({ state }: { state: ListingBoardState }) {
  return <StateChip tone={tones[state]} label={listingBoardLabels[state]} />;
}
