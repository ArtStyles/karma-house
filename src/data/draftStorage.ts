import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { DraftStorage } from '../domain/draftPersistence';

// Photos can exceed localStorage's small quota. IndexedDB persists the whole draft and
// its stable request/photo IDs in one transaction before any network write starts.
let databasePromise: Promise<IDBDatabase> | null = null;
function database(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('Este navegador no permite guardar el borrador.')); return; }
      const request = indexedDB.open('karmahouse-local-drafts', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts'); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); databasePromise = null; };
        resolve(db);
      };
      request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento de borradores.'));
      request.onblocked = () => reject(new Error('Cierra otras pestañas de KarmaHouse y vuelve a cargar el borrador.'));
    }).catch(error => { databasePromise = null; throw error; });
  }
  return databasePromise;
}

type DraftRecord = { value: string | null };
async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction('drafts', mode);
    const request = operation(transaction.objectStore('drafts'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = transaction.onabort = () => reject(new Error('No se pudo guardar el borrador. Comprueba el espacio libre del navegador e inténtalo de nuevo.'));
  });
}

const webDraftStorage: DraftStorage = {
  async getItem(key) {
    const saved = await transact<DraftRecord | undefined>('readonly', store => store.get(key));
    if (saved !== undefined) return saved.value;
    // Migrate pre-IndexedDB drafts without discarding an unread legacy value.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) {
      await transact('readwrite', store => store.put({ value: legacy }, key));
      await AsyncStorage.removeItem(key).catch(() => undefined);
    }
    return legacy;
  },
  async setItem(key, value) { await transact('readwrite', store => store.put({ value }, key)); },
  async removeItem(key) {
    // A small tombstone also prevents a leftover legacy value from being imported again.
    await transact('readwrite', store => store.put({ value: null }, key));
    await AsyncStorage.removeItem(key).catch(() => undefined);
  },
};

export const draftStorage: DraftStorage = Platform.OS === 'web' ? webDraftStorage : AsyncStorage;
