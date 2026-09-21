// @ts-nocheck -- Executed directly by Node; native modules are injected at the storage boundary.
import assert from 'node:assert/strict';
import test from 'node:test';
import { memoizeAuthCallback, parseAuthCallback, safeReturnTo } from '../src/auth/callback.ts';
import { createChunkedAuthStorage } from '../src/auth/secureStorage.ts';
import { authErrorMessage, validateEmail, validateNewPassword } from '../src/auth/errors.ts';

const callback = 'https://karma.example/auth/callback';

test('auth accepts the three supported email callback formats and recovery intent', () => {
  assert.deepEqual(parseAuthCallback(`${callback}?code=valid-code-123&mode=recovery`, callback), {
    kind: 'code', code: 'valid-code-123', recovery: true, returnTo: '/profile',
  });
  assert.deepEqual(parseAuthCallback('karmahouse://auth/callback?token_hash=valid_hash_123456789&type=email', 'karmahouse://auth/callback'), {
    kind: 'token_hash', tokenHash: 'valid_hash_123456789', type: 'email', recovery: false, returnTo: '/profile',
  });
  assert.equal(parseAuthCallback(`${callback}#access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature&refresh_token=valid-refresh-token&type=recovery`, callback).recovery, true);
});

test('auth rejects foreign URLs, unsupported token types, duplicates and ambiguous credentials', () => {
  for (const url of [
    'https://attacker.example/auth/callback?code=valid-code-123',
    `${callback}/extra?code=valid-code-123`,
    `${callback}?token_hash=valid_hash_123456789&type=invite`,
    `${callback}?code=valid-code-123&code=second-code-123`,
    `${callback}?code=valid-code-123&token_hash=valid_hash_123456789&type=email`,
    `${callback}?access_token=abc&refresh_token=abc`,
    `${callback}#access_token=not-a-jwt&refresh_token=valid-refresh-token`,
  ]) assert.throws(() => parseAuthCallback(url, callback), /enlace/i, url);
});

test('auth never reflects provider error details and only returns to known local screens', () => {
  assert.throws(() => parseAuthCallback(`${callback}?error=access_denied&error_description=secret-token`, callback), error => !error.message.includes('secret-token'));
  for (const path of ['https://attacker.example', '//attacker.example', '/\\evil', '/%2f%2fevil', '/auth?code=token', '/profile?access_token=token']) assert.equal(safeReturnTo(path), '/profile');
  assert.equal(safeReturnTo('/publish'), '/publish');
  assert.equal(safeReturnTo('/property/home-123'), '/property/home-123');
  assert.equal(safeReturnTo('/messages'), '/messages');
  assert.equal(safeReturnTo('/messages/chat-123'), '/messages/chat-123');
  assert.equal(safeReturnTo('/message-reports'), '/message-reports');
  assert.equal(safeReturnTo('/requests'), '/requests');
  for (const path of ['/notifications', '/notification-settings']) {
    assert.equal(safeReturnTo(path), path);
    for (const suffix of ['?access_token=secret', '/other', '/../auth', '#token']) assert.equal(safeReturnTo(path + suffix), '/profile');
  }
  for (const path of ['/requests?access_token=secret', '/requests/../auth', '/requests/other']) assert.equal(safeReturnTo(path), '/profile');
  for (const path of ['/messages//evil', '/messages/../auth', '/messages?id=token', '/messages/chat/extra']) assert.equal(safeReturnTo(path), '/profile');
});

function memoryStore() {
  const entries = new Map();
  let failWrite = false;
  return {
    entries,
    failNextWrite() { failWrite = true; },
    async getItem(key) { return entries.get(key) ?? null; },
    async setItem(key, value) {
      if (failWrite) { failWrite = false; throw new Error('unavailable'); }
      assert.ok(Buffer.byteLength(value, 'utf8') <= 1800, 'all secure-store entries stay below the native limit');
      entries.set(key, value);
    },
    async removeItem(key) { entries.delete(key); },
  };
}

test('native auth storage round-trips large Unicode sessions and removes all chunks on logout', async () => {
  const disk = memoryStore();
  const storage = createChunkedAuthStorage(disk);
  const session = JSON.stringify({ access_token: 'x'.repeat(4500), name: 'José 🏠'.repeat(400) });
  await storage.setItem('session', session);
  assert.ok(disk.entries.size > 3);
  assert.equal(await storage.getItem('session'), session);
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
  assert.equal(disk.entries.size, 0);
});

test('native auth storage preserves the previous session if replacement fails and serializes account changes', async () => {
  const disk = memoryStore();
  const storage = createChunkedAuthStorage(disk);
  await storage.setItem('session', 'first-account');
  disk.failNextWrite();
  await assert.rejects(storage.setItem('session', 'failed-account'), /unavailable/);
  assert.equal(await storage.getItem('session'), 'first-account');
  await Promise.all([storage.setItem('session', 'second-account'.repeat(400)), storage.removeItem('session'), storage.setItem('session', 'third-account')]);
  assert.equal(await storage.getItem('session'), 'third-account');
  assert.equal(disk.entries.size, 2);
});

test('native auth storage fails closed when a session chunk disappears', async () => {
  const disk = memoryStore();
  const storage = createChunkedAuthStorage(disk);
  await storage.setItem('session', 'x'.repeat(4000));
  const chunkKey = [...disk.entries.keys()].find(key => key !== 'session');
  disk.entries.delete(chunkKey);
  await assert.rejects(storage.getItem('session'), /sesión/i);
});

test('auth validation normalizes emails and rejects unsafe or incomplete form input', () => {
  assert.equal(validateEmail('  Persona@Example.COM '), 'persona@example.com');
  for (const value of ['', 'invalid', 'person @example.com', 'person@example']) assert.throws(() => validateEmail(value), /correo/i);
  assert.throws(() => validateNewPassword('short'), /contraseña/i);
  assert.doesNotThrow(() => validateNewPassword('valid-password'));
  const issue = authErrorMessage({ code: 'unknown', message: 'secret-token-in-server-response' });
  assert.ok(!issue.includes('secret-token'));
  assert.match(authErrorMessage({ code: 'email_not_confirmed' }), /confirma/i);
});

test('email callback shares a single pending exchange but retries the same link after a connection failure', async () => {
  let attempts = 0;
  let rejectFirst;
  const first = new Promise((_resolve, reject) => { rejectFirst = reject; });
  const complete = memoizeAuthCallback(async () => { attempts++; if (attempts === 1) await first; return { recovery: true }; });
  const pending = complete('same-email-link');
  assert.equal(complete('same-email-link'), pending);
  rejectFirst(new Error('temporary network issue'));
  await assert.rejects(pending, /temporary/);
  assert.deepEqual(await complete('same-email-link'), { recovery: true });
  assert.equal(attempts, 2);
  await complete('same-email-link');
  assert.equal(attempts, 2, 'a successfully consumed one-time code is not exchanged again');
});
