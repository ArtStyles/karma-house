// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePublicProfile, levelDescription, levelLabel, memberSinceText, responseText } from '../src/profiles/domain.ts';
import { createSupabaseProfileRepository } from '../src/profiles/repository.ts';

const id = '11111111-1111-4111-8111-111111111111';
const listing = '22222222-2222-4222-8222-222222222222';
const profile = { id, displayName: 'Ana', memberSince: '2026-03-10T12:00:00Z', verified: true, level: 'trusted',
  levelReasons: ['Verificado por KarmaHouse', '3 anuncios aprobados'], activeListings: [listing], activeListingCount: 1,
  approvedListingCount: 3, responseMinutes: 45, responseRate: 90, visitsAgreed: 5, avatarUrlPath: `${id}/33333333-3333-4333-8333-333333333333.jpg` };

test('levels read in Spanish with a description', () => {
  assert.deepEqual(['new', 'active', 'trusted', 'featured'].map(levelLabel), ['Nuevo', 'Activo', 'Confiable', 'Destacado']);
  for (const level of ['new', 'active', 'trusted', 'featured']) assert.ok(levelDescription(level).length > 20);
  assert.equal(new Set(['new', 'active', 'trusted', 'featured'].map(levelDescription)).size, 4);
});

test('response time and membership read naturally', () => {
  assert.equal(responseText(30), 'Suele responder en menos de una hora');
  assert.equal(responseText(70), 'Suele responder en una hora');
  assert.equal(responseText(200), 'Suele responder en unas 3 horas');
  assert.equal(responseText(1500), 'Suele responder en un día');
  assert.equal(responseText(5000), 'Suele responder en unos 3 días');
  assert.equal(responseText(null), '');
  assert.equal(memberSinceText('2026-03-10T12:00:00Z'), 'En KarmaHouse desde marzo de 2026');
});

test('a public profile decodes strictly', () => {
  assert.deepEqual(decodePublicProfile(profile), profile);
  assert.deepEqual(decodePublicProfile({ ...profile, responseMinutes: null, responseRate: null, avatarUrlPath: null }).avatarUrlPath, null);
  const bad = [
    { ...profile, id: 'x' }, { ...profile, level: 'gold' }, { ...profile, verified: 'yes' }, { ...profile, displayName: '' },
    { ...profile, visitsAgreed: -1 }, { ...profile, approvedListingCount: 1.5 }, { ...profile, activeListingCount: '1' },
    { ...profile, responseRate: 101 }, { ...profile, responseMinutes: -3 }, { ...profile, memberSince: 'ayer' },
    { ...profile, activeListings: ['x'] }, { ...profile, activeListings: Array.from({ length: 25 }, () => listing) },
    { ...profile, levelReasons: [1] }, { ...profile, avatarUrlPath: '../secret.jpg' },
    { ...profile, avatarUrlPath: `44444444-4444-4444-8444-444444444444/33333333-3333-4333-8333-333333333333.jpg` },
    { ...profile, email: 'ana@example.com' }, (({ verified: _v, ...rest }) => rest)(profile), null, [],
  ];
  for (const value of bad) assert.throws(() => decodePublicProfile(value), JSON.stringify(value)?.slice(0, 80));
});

function fakeClient(result = { data: profile, error: null }) {
  const calls = [];
  const client = { rpc(name, args) {
    const call = { name, args, headers: {} }; calls.push(call);
    const builder = {
      setHeader(key, value) { call.headers[key] = value; return builder; },
      abortSignal(signal) { call.signal = signal; return builder; },
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    };
    return builder;
  } };
  return { client, calls };
}

test('the repository reads a profile with or without a session', async () => {
  const { client, calls } = fakeClient();
  const repository = createSupabaseProfileRepository(client);
  const signal = new AbortController().signal;
  assert.deepEqual(await repository.get(id, { signal }), profile);
  assert.equal(calls[0].name, 'kh_public_profile');
  assert.deepEqual(calls[0].args, { p_user_id: id });
  assert.equal('Authorization' in calls[0].headers, false);
  await repository.get(id, { signal, accessToken: 'tok' });
  assert.deepEqual(calls[1].headers, { Authorization: 'Bearer tok' });
  await assert.rejects(repository.get('x', { signal }));
  assert.equal(calls.length, 2);
});

test('a hidden profile reads as not found', async () => {
  const { client } = fakeClient({ data: null, error: { message: 'KH_PROFILE_NOT_FOUND' } });
  await assert.rejects(createSupabaseProfileRepository(client).get(id, { signal: new AbortController().signal }), error => error.notFound === true);
});

test('verifying needs a session and binds the actor', async () => {
  const { client, calls } = fakeClient();
  const repository = createSupabaseProfileRepository(client);
  const signal = new AbortController().signal;
  await assert.rejects(repository.setVerified(id, true, '', { signal, checkpoint() {} }));
  assert.equal(calls.length, 0);
  const context = { userId: '55555555-5555-4555-8555-555555555555', accessToken: 'tok', signal, checkpoint() {} };
  assert.deepEqual(await repository.setVerified(id, true, '  DNI revisado ', context), profile);
  assert.deepEqual(calls[0].args, { p_actor_id: context.userId, p_user_id: id, p_verified: true, p_note: 'DNI revisado' });
  assert.deepEqual(calls[0].headers, { Authorization: 'Bearer tok' });
  await repository.setVerified(id, false, '   ', context);
  assert.equal(calls[1].args.p_note, null);
});
