interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
interface Snapshot { text: string; ready: boolean; error: string | null }

export function composerStorageKey(userId: string, conversationId: string) {
  return `karmahouse:message-draft:v1:${encodeURIComponent(userId)}:${encodeURIComponent(conversationId)}`;
}

export function createComposerDraft(storage: Storage, key: string) {
  let snapshot: Snapshot = { text: '', ready: false, error: null };
  let reading: Promise<void> | null = null;
  let writes: Promise<unknown> = Promise.resolve();
  let revision = 0;
  const listeners = new Set<() => void>();
  function publish(next: Snapshot) { snapshot = next; for (const listener of listeners) listener(); }

  async function hydrate() {
    if (snapshot.ready) return;
    if (reading) return reading;
    reading = (async () => {
      try {
        const value = await storage.getItem(key);
        if (value !== null && value.length > 2000) throw new Error('Invalid draft');
        publish({ text: value ?? '', ready: true, error: null });
      } catch { publish({ ...snapshot, ready: false, error: 'No pudimos recuperar tu borrador. Reintenta para conservar lo que escribiste.' }); }
      finally { reading = null; }
    })();
    return reading;
  }

  function change(text: string): Promise<void> {
    if (!snapshot.ready) return Promise.reject(new Error('Primero hay que recuperar el borrador.'));
    if (text.length > 2000) return Promise.reject(new Error('El mensaje admite hasta 2000 caracteres.'));
    const version = ++revision;
    publish({ ...snapshot, text });
    const write = writes.then(() => storage.setItem(key, text));
    writes = write.catch(() => undefined);
    return write.then(() => { if (version === revision) publish({ ...snapshot, error: null }); }).catch(error => {
      if (version === revision) publish({ ...snapshot, error: 'No pudimos guardar el borrador en este dispositivo. Tu texto sigue aquí; reintenta antes de salir.' });
      throw error;
    });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hydrate,
    change,
    async clearAfterEnqueue(sentText: string) {
      if (snapshot.text !== sentText) return;
      try { await change(''); }
      catch { publish({ ...snapshot, error: 'El mensaje ya está en la bandeja de salida. No pudimos limpiar el borrador del dispositivo; reintenta guardarlo para evitar recuperarlo otra vez.' }); }
    },
    async retry() { if (snapshot.ready) await change(snapshot.text); else await hydrate(); },
  };
}

export type ComposerDraft = ReturnType<typeof createComposerDraft>;
