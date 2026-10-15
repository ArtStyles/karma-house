import test from 'node:test';
import assert from 'node:assert/strict';
import { keepVerifierOnFailure } from '../src/auth/pkce.ts';

function store(initial: Record<string, string>) {
  const items = { ...initial };
  return { items, auth: { storageKey: 'sb-x-auth-token', storage: { getItem: async (key: string) => items[key] ?? null, setItem: async (key: string, value: string) => { items[key] = value; } } } };
}
const key = 'sb-x-auth-token-code-verifier';

test('a refused resend puts back the verifier the first email needs', async () => {
  const { items, auth } = store({ [key]: '"signup"' });
  const result = await keepVerifierOnFailure(auth, async () => { delete items[key]; return { error: { code: 'over_email_send_rate_limit' } }; });
  assert.ok(result.error);
  assert.equal(items[key], '"signup"');
});

test('a thrown resend restores too, and a successful one keeps the new verifier', async () => {
  const { items, auth } = store({ [key]: '"signup"' });
  await assert.rejects(keepVerifierOnFailure(auth, async () => { delete items[key]; throw new Error('offline'); }), /offline/);
  assert.equal(items[key], '"signup"');
  await keepVerifierOnFailure(auth, async () => { items[key] = '"resend"'; return { error: null }; });
  assert.equal(items[key], '"resend"');
});
