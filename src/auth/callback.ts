type CallbackDestination = { recovery: boolean; returnTo: string };
export type AuthCallback = CallbackDestination & (
  | { kind: 'code'; code: string }
  | { kind: 'token_hash'; tokenHash: string; type: 'email' | 'signup' | 'recovery' }
  | { kind: 'session'; accessToken: string; refreshToken: string }
);

const invalidLink = () => new Error('El enlace no es válido o ha caducado. Solicita uno nuevo e inténtalo otra vez.');

export function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && /^(?:\/(?:profile|publish|favorites|my-listings|messages|message-reports|account-settings|requests|notifications|notification-settings)|\/(?:property|edit|messages)\/[A-Za-z0-9_-]+|\/)$/.test(value)
    ? value : '/profile';
}

/** Deduplicate one-time exchanges across remounts; a failed request must remain retryable. */
export function memoizeAuthCallback<T>(execute: (url: string) => Promise<T>): (url: string) => Promise<T> {
  let pending: { url: string; result: Promise<T> } | null = null;
  return url => {
    if (pending?.url === url) return pending.result;
    const result = execute(url);
    pending = { url, result };
    void result.catch(() => { if (pending?.result === result) pending = null; });
    return result;
  };
}

/** Parse only the callback we generated; provider messages and tokens never enter UI errors. */
export function parseAuthCallback(rawUrl: string, expectedCallbackUrl: string): AuthCallback {
  let url: URL;
  let expected: URL;
  try { url = new URL(rawUrl); expected = new URL(expectedCallbackUrl); } catch { throw invalidLink(); }
  if (url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname || url.username || url.password) throw invalidLink();
  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const keys = ['code', 'token_hash', 'access_token', 'refresh_token', 'type', 'mode', 'returnTo', 'error', 'error_description'];
  for (const key of keys) if (query.getAll(key).length + fragment.getAll(key).length > 1) throw invalidLink();
  if (query.has('error') || fragment.has('error') || query.has('error_description') || fragment.has('error_description')) throw invalidLink();
  const type = query.get('type') ?? fragment.get('type');
  if (type && !['email', 'signup', 'recovery'].includes(type)) throw invalidLink();
  const destination = { recovery: type === 'recovery' || query.get('mode') === 'recovery', returnTo: safeReturnTo(query.get('returnTo')) };
  const code = query.get('code');
  const tokenHash = query.get('token_hash');
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (fragment.has('code') || fragment.has('token_hash') || query.has('access_token') || query.has('refresh_token')) throw invalidLink();
  if ([Boolean(code), Boolean(tokenHash), Boolean(accessToken || refreshToken)].filter(Boolean).length !== 1) throw invalidLink();
  if (code && /^[A-Za-z0-9_-]{8,2048}$/.test(code)) return { kind: 'code', code, ...destination };
  if (tokenHash && /^[A-Za-z0-9_-]{16,512}$/.test(tokenHash) && (type === 'email' || type === 'signup' || type === 'recovery')) {
    return { kind: 'token_hash', tokenHash, type, ...destination };
  }
  if (accessToken && refreshToken && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken) && accessToken.length < 32768 && /^[A-Za-z0-9_-]{10,512}$/.test(refreshToken)) {
    return { kind: 'session', accessToken, refreshToken, ...destination };
  }
  throw invalidLink();
}
