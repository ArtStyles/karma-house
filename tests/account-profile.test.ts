import assert from 'node:assert/strict';
import test from 'node:test';
import { avatarPathFor, normalizeAccountName, selectedAvatarAsset, validateAvatarUpload, validateSignedAvatarUrl } from '../src/auth/accountProfile.ts';
import { createAccountProfileRepository, saveAccountProfile, type AccountProfileRepository } from '../src/auth/accountProfileRepository.ts';
import { safeReturnTo } from '../src/auth/callback.ts';

const actor = '11000000-0000-4000-8000-000000000001';
const imageId = '22000000-0000-4000-8000-000000000002';
const path = `${actor}/${imageId}.jpg`;
const origin = 'https://example.supabase.co';
const upload = { data: new Uint8Array([255,216,255,224,0,16,255,217]).buffer, contentType: 'image/jpeg' as const };

test('account name and settings auth return are constrained', () => {
  assert.equal(normalizeAccountName('  Ana María  '), 'Ana María');
  for (const value of ['', 'a', 'x'.repeat(81), 'Ana\nAdmin']) assert.throws(() => normalizeAccountName(value));
  assert.equal(safeReturnTo('/account-settings'), '/account-settings');
  assert.equal(safeReturnTo('https://evil.test/account-settings'), '/profile');
});
test('avatar cancellation is a no-op and selected assets exclude invalid input', () => {
  assert.equal(selectedAvatarAsset({ canceled: true, assets: null }), null);
  const asset = { uri: 'file:///photo.jpg', width: 900, height: 700, type: 'image', mimeType: 'image/jpeg' };
  assert.equal(selectedAvatarAsset({ canceled: false, assets: [asset] }), asset);
  for (const invalid of [{ ...asset, mimeType: 'image/svg+xml' }, { ...asset, type: 'video' }, { ...asset, width: 0 }, { ...asset, uri: 'https://evil.test/photo.jpg' }]) assert.throws(() => selectedAvatarAsset({ canceled: false, assets: [invalid] }));
});
test('avatar upload validates MIME, size, signature and actor-scoped path', () => {
  validateAvatarUpload(upload);
  assert.throws(() => validateAvatarUpload({ ...upload, contentType: 'text/html' }));
  assert.throws(() => validateAvatarUpload({ ...upload, data: new ArrayBuffer(1048577) }));
  assert.throws(() => validateAvatarUpload({ ...upload, data: new Uint8Array([60,104,116,109,108]).buffer }));
  assert.equal(avatarPathFor(actor, imageId), path);
  assert.throws(() => avatarPathFor('../other', imageId));
});
test('avatar signed URLs stay on the configured origin and exact private object', () => {
  const url = `${origin}/storage/v1/object/sign/account-avatars/${path}?token=signature`;
  assert.equal(validateSignedAvatarUrl(url, origin, path), url);
  for (const invalid of [url.replace(origin, 'https://evil.test'), url.replace(path, `${imageId}/${imageId}.jpg`), 'data:image/jpeg;base64,AAA', url.replace('/sign/', '/public/'), `${origin}/storage/v1/object/sign/account-avatars/${path}`]) assert.throws(() => validateSignedAvatarUrl(invalid, origin, path));
});
test('profile upload is attached only after success and retains a fixed actor', async () => {
  const calls: string[] = [];
  const repository: AccountProfileRepository = {
    load: async () => ({ id: actor, displayName: 'Ana', avatarPath: null }),
    upload: async (avatarPath, _image, context) => { calls.push(`upload:${context.actorId}:${avatarPath}`); },
    update: async (name, avatarPath, replace, context) => { calls.push(`update:${context.actorId}`); assert.equal(replace, true); assert.equal(avatarPath, path); return { id: actor, displayName: name, avatarPath }; },
    remove: async () => { calls.push('remove'); }, sign: async () => null,
  };
  const context = { actorId: actor, accessToken: 'fixed-token', signal: new AbortController().signal, checkpoint() {} };
  const result = await saveAccountProfile(repository, context, { displayName: 'Ana Nueva', avatar: upload }, null, () => imageId);
  assert.equal(result.avatarPath, path); assert.deepEqual(calls, [`upload:${actor}:${path}`, `update:${actor}`]);
});
test('session changes after upload never attach the avatar to another account', async () => {
  let changed = false; let updates = 0;
  const repository: AccountProfileRepository = {
    load: async () => ({ id: actor, displayName: 'Ana', avatarPath: null }), upload: async () => { changed = true; },
    update: async () => { updates++; throw Error('should not update'); }, remove: async () => {}, sign: async () => null,
  };
  const context = { actorId: actor, accessToken: 'fixed-token', signal: new AbortController().signal, checkpoint() { if (changed) throw Error('session changed'); } };
  await assert.rejects(saveAccountProfile(repository, context, { displayName: 'Ana', avatar: upload }, null, () => imageId));
  assert.equal(updates, 0);
});
test('failed upload preserves profile and removing an avatar does not upload a replacement', async () => {
  let updates = 0; let removals = 0;
  const repository: AccountProfileRepository = {
    load: async () => ({ id: actor, displayName: 'Ana', avatarPath: path }), upload: async () => { throw Error('offline'); },
    update: async (name, avatarPath, replace) => { updates++; assert.equal(avatarPath, null); assert.equal(replace, true); return { id: actor, displayName: name, avatarPath }; },
    remove: async () => { removals++; }, sign: async () => null,
  };
  const context = { actorId: actor, accessToken: 'fixed-token', signal: new AbortController().signal, checkpoint() {} };
  await assert.rejects(saveAccountProfile(repository, context, { displayName: 'Ana', avatar: upload }, path, () => imageId));
  assert.equal(updates, 0);
  await saveAccountProfile(repository, context, { displayName: 'Ana', avatar: null }, path, () => imageId);
  assert.equal(updates, 1); assert.ok(removals >= 1);
});

test('repository pins token and actor, rejects cross-account paths before transport, and checks responses', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: actor, displayName: 'Ana', avatarPath: path }), { status: 200 });
  }) as typeof fetch;
  const repository = createAccountProfileRepository(origin,'public-key',fetcher);
  const context = { actorId: actor, accessToken: 'captured-token', signal: new AbortController().signal, checkpoint() {} };
  await repository.update('Ana',path,true,context);
  assert.equal(new Headers(calls[0].init.headers).get('Authorization'),'Bearer captured-token');
  assert.equal(JSON.parse(String(calls[0].init.body)).p_actor_id,actor);
  assert.equal(calls[0].init.signal,context.signal);
  for (const operation of [() => repository.sign(`${imageId}/${imageId}.jpg`,context),() => repository.remove(`${imageId}/${imageId}.jpg`,context),() => repository.upload(`${imageId}/${imageId}.jpg`,upload,context)]) await assert.rejects(operation);
  assert.equal(calls.length,1);
  const wrongActor = createAccountProfileRepository(origin,'public-key',(async () => new Response(JSON.stringify({ id: imageId,displayName:'Other',avatarPath:null }))) as typeof fetch);
  await assert.rejects(wrongActor.load(context));
});

test('repository rejects late data after an account change and signed URL spoofing', async () => {
  let changed = false;
  const context = { actorId: actor, accessToken: 'captured-token', signal: new AbortController().signal, checkpoint() { if(changed) throw Error('KH_ACCOUNT_CHANGED'); } };
  const repository = createAccountProfileRepository(origin,'public-key',(async () => { changed=true; return new Response(JSON.stringify({ id:actor, displayName:'Ana',avatarPath:null })); }) as typeof fetch);
  await assert.rejects(repository.load(context),/KH_ACCOUNT_CHANGED/);
  changed=false;
  const signer=createAccountProfileRepository(origin,'public-key',(async () => new Response(JSON.stringify({signedURL:`/object/sign/account-avatars/${path}?token=valid`}))) as typeof fetch);
  assert.equal(await signer.sign(path,context),`${origin}/storage/v1/object/sign/account-avatars/${path}?token=valid`);
  const badSigner=createAccountProfileRepository(origin,'public-key',(async () => new Response(JSON.stringify({signedURL:'https://evil.test/photo.jpg?token=valid'}))) as typeof fetch);
  await assert.rejects(badSigner.sign(path,context));
});
