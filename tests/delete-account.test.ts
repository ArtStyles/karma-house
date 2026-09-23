import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteAccount } from '../src/auth/deleteAccount.ts';

const actor = { id: 'u1', accessToken: 'token' };
function fakeClient(files: unknown, storageError: unknown = null) {
  const calls: string[] = [];
  const client = {
    rpc(name: string, args: { p_actor_id: string }) {
      calls.push(`${name}:${args.p_actor_id}`);
      return { setHeader: () => Promise.resolve({ data: name === 'kh_begin_account_deletion' ? files : null, error: null }) };
    },
    storage: { from: (bucket: string) => ({ remove: async (names: string[]) => { calls.push(`remove ${bucket} ${names.join(',')}`); return { error: storageError }; } }) },
  };
  return { client: client as never, calls };
}

test('files are removed between the two server steps, never after the account is gone', async () => {
  const { client, calls } = fakeClient({ 'property-photos': ['u1/a/p.jpg'], 'account-avatars': [] });
  await deleteAccount(client, actor, () => {});
  assert.deepEqual(calls, ['kh_begin_account_deletion:u1', 'remove property-photos u1/a/p.jpg', 'kh_delete_account:u1']);
});

test('a storage failure stops before the account is deleted, so a retry can finish it', async () => {
  const { client, calls } = fakeClient({ 'property-photos': ['u1/a/p.jpg'], 'account-avatars': [] }, { message: 'offline' });
  await assert.rejects(deleteAccount(client, actor, () => {}), /vuelve a intentarlo/);
  assert.ok(!calls.includes('kh_delete_account:u1'));
});

test('a file outside the account folder is refused, not deleted', async () => {
  const { client, calls } = fakeClient({ 'property-photos': ['u2/a/p.jpg'], 'account-avatars': [] });
  await assert.rejects(deleteAccount(client, actor, () => {}));
  assert.deepEqual(calls, ['kh_begin_account_deletion:u1']);
});

test('an account switch mid-way stops the deletion', async () => {
  const { client, calls } = fakeClient({ 'property-photos': [], 'account-avatars': [] });
  let checks = 0;
  await assert.rejects(deleteAccount(client, actor, () => { if (++checks > 2) throw new Error('KH_ACCOUNT_CHANGED'); }), /KH_ACCOUNT_CHANGED/);
  assert.deepEqual(calls, ['kh_begin_account_deletion:u1']);
});
