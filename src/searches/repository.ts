import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessagingRequestContext } from '../messaging/types.ts';
import { isUuid } from '../messaging/domain.ts';
import { decodeSavedSearch, SavedSearchError } from './domain.ts';
import type { SavedSearchRepository } from './types.ts';

const SERVER_ERRORS: [RegExp, string][] = [
  [/KH_SEARCH_LIMIT/, 'Ya tienes 10 alertas. Borra alguna para guardar otra.'],
  [/KH_SEARCH_CONFLICT/, 'Esta alerta cambió en otro dispositivo. Actualiza la lista.'],
  [/KH_SEARCH_NOT_FOUND/, 'Esta alerta ya no existe.'],
  [/KH_SEARCH_INVALID/, 'Revisa los filtros de la búsqueda e inténtalo de nuevo.'],
];

export function createSupabaseSavedSearchRepository(client: SupabaseClient): SavedSearchRepository {
  // Same identity binding as the notifications repository: actor id, bearer token and abort signal per call.
  const rpc = async (name: string, parameters: Record<string, unknown>, context: MessagingRequestContext): Promise<unknown> => {
    context.checkpoint();
    if (context.signal.aborted) throw new Error('KH_ACCOUNT_CHANGED');
    const { data, error } = await client.rpc(name, { ...parameters, p_actor_id: context.userId })
      .setHeader('Authorization', `Bearer ${context.accessToken}`).abortSignal(context.signal);
    context.checkpoint();
    if (context.signal.aborted) throw new Error('KH_ACCOUNT_CHANGED');
    if (error) {
      const known = SERVER_ERRORS.find(([pattern]) => pattern.test(error.message ?? ''));
      throw known ? new SavedSearchError(known[1]) : error;
    }
    return data;
  };
  return {
    async list(context) {
      const data = await rpc('kh_list_saved_searches', {}, context);
      if (!Array.isArray(data)) throw new SavedSearchError('No se pudieron interpretar tus alertas. Actualiza la lista.');
      return data.map(decodeSavedSearch);
    },
    async save(input, context) { return decodeSavedSearch(await rpc('kh_save_search', { p_payload: input }, context)); },
    async remove(id, context) {
      if (!isUuid(id)) throw new SavedSearchError('Esta alerta ya no existe.');
      await rpc('kh_delete_saved_search', { p_id: id }, context);
    },
  };
}
