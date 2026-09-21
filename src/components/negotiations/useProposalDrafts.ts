import { useMemo, useSyncExternalStore } from 'react';
import { havanaDateTime } from '../../negotiations/domain';
import { createProposalDraftStore } from '../../negotiations/proposalDraft';

export function useProposalDrafts(){
  const store=useMemo(()=>createProposalDraftStore(havanaDateTime(new Date(Date.now()+86400000)).date),[]);
  useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  return store;
}
