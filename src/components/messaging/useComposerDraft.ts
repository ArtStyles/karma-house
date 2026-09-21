import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { composerStorageKey, createComposerDraft, type ComposerDraft } from './composerDraft';

// A remounted screen shares pending writes with its previous instance. Each account has a distinct key.
const drafts = new Map<string, ComposerDraft>();

export function useComposerDraft(userId: string, conversationId: string) {
  const store = useMemo(() => {
    const key = composerStorageKey(userId, conversationId);
    let value = drafts.get(key);
    if (!value) { value = createComposerDraft(AsyncStorage, key); drafts.set(key, value); }
    return value;
  }, [userId, conversationId]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.hydrate(); }, [store]);
  return { ...snapshot, change: (text: string) => { void store.change(text).catch(() => undefined); }, retry: store.retry, clearAfterEnqueue: store.clearAfterEnqueue };
}
