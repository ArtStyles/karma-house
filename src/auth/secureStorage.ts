export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const prefix = 'kh-secure-v1:';
type Manifest = { generation: string; count: number };
let sequence = 0;

function manifest(value: string | null): Manifest | null {
  if (!value?.startsWith(prefix)) return null;
  try {
    const parsed = JSON.parse(value.slice(prefix.length));
    if (/^[a-z0-9-]+$/.test(parsed.generation) && Number.isInteger(parsed.count) && parsed.count > 0 && parsed.count <= 128) return parsed;
  } catch { /* A malformed manifest must never become a partial session. */ }
  throw new Error('No se pudo leer la sesión guardada.');
}

function splitUtf8(value: string): string[] {
  const chunks: string[] = [];
  let chunk = '';
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    const size = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (bytes + size > 1800) { chunks.push(chunk); chunk = ''; bytes = 0; }
    chunk += character;
    bytes += size;
  }
  chunks.push(chunk);
  if (chunks.length > 128) throw new Error('La sesión supera el tamaño admitido.');
  return chunks;
}

/** SecureStore can reject large values. All session bytes remain encrypted in <=1800-byte chunks.
 * A new manifest is published only after every chunk succeeds, preserving the old session on failure.
 * Per-key serialization prevents refresh/logout writes from interleaving.
 */
export function createChunkedAuthStorage(storage: AuthStorage): AuthStorage {
  const queues = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, action: () => Promise<T>): Promise<T> {
    const result = (queues.get(key) ?? Promise.resolve()).then(action, action);
    queues.set(key, result);
    void result.finally(() => { if (queues.get(key) === result) queues.delete(key); }).catch(() => undefined);
    return result;
  }
  const chunkKey = (key: string, info: Manifest, index: number) => `${key}.${info.generation}.${index}`;
  async function cleanup(key: string, info: Manifest | null) {
    if (info) await Promise.allSettled(Array.from({ length: info.count }, (_, index) => storage.removeItem(chunkKey(key, info, index))));
  }
  return {
    getItem: key => serial(key, async () => {
      const value = await storage.getItem(key);
      const info = manifest(value);
      if (!info) return value;
      const parts = await Promise.all(Array.from({ length: info.count }, (_, index) => storage.getItem(chunkKey(key, info, index))));
      if (parts.some(part => part === null)) throw new Error('No se pudo recuperar la sesión completa.');
      return parts.join('');
    }),
    setItem: (key, value) => serial(key, async () => {
      const previous = manifest(await storage.getItem(key));
      const parts = splitUtf8(value);
      const next = { generation: `${Date.now().toString(36)}-${(++sequence).toString(36)}`, count: parts.length };
      try {
        for (let index = 0; index < parts.length; index += 1) await storage.setItem(chunkKey(key, next, index), parts[index]);
        await storage.setItem(key, prefix + JSON.stringify(next));
      } catch (error) { await cleanup(key, next); throw error; }
      await cleanup(key, previous);
    }),
    removeItem: key => serial(key, async () => {
      const raw = await storage.getItem(key);
      let previous: Manifest | null = null;
      try { previous = manifest(raw); } catch { /* Allow logout to discard a damaged manifest. */ }
      await storage.removeItem(key);
      await cleanup(key, previous);
    }),
  };
}
