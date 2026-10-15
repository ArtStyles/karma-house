// @ts-nocheck
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { apkUrl, CHECK_EVERY_MS, dueForCheck, EMPTY_UPDATE, formatReleaseDate, formatSize, isNewer, parseRelease, readUpdateState, toHex } from '../src/updates/release.ts';

const SHA = '9e31f311a8c1ba54d65572065d31dcc7ae26c320b91daaae84bd621d89d1456a';
const valid = () => ({ version: '0.1.29', versionCode: 30, date: '2026-10-20', size: 85268595, sha256: SHA, url: apkUrl('0.1.29'), notes: ['Aviso de versión nueva en Mi espacio.', '  '] });

test('a valid manifest is read, with blank notes dropped', () => {
  assert.deepEqual(parseRelease(valid()), { ...valid(), notes: ['Aviso de versión nueva en Mi espacio.'] });
});

test('the APK may only come from that version in the official public release', () => {
  assert.equal(apkUrl('0.1.29'), 'https://github.com/ArtStyles/karma-house/releases/download/v0.1.29/KarmaHouse.apk');
  for (const url of [
    'http://github.com/ArtStyles/karma-house/releases/download/v0.1.29/KarmaHouse.apk',
    'https://github.com/someone/karma-house/releases/download/v0.1.29/KarmaHouse.apk',
    'https://github.com/ArtStyles/karma-house/releases/download/v0.1.28/KarmaHouse.apk',
    'https://github.com/ArtStyles/karma-house/releases/download/v0.1.29/../../../../evil/x.apk',
    'https://karmahouse.site.evil.com/KarmaHouse.apk',
  ]) assert.equal(parseRelease({ ...valid(), url }), null, url);
});

test('malformed fields reject the whole manifest', () => {
  for (const patch of [
    { version: '0.1' }, { versionCode: 0 }, { versionCode: 30.5 }, { versionCode: '30' }, { size: 0 }, { size: -1 },
    { sha256: SHA.toUpperCase() }, { sha256: SHA.slice(1) }, { date: '20/10/2026' }, { notes: 'Una nota' }, { notes: [1] },
  ]) assert.equal(parseRelease({ ...valid(), ...patch }), null, JSON.stringify(patch));
  for (const value of [null, undefined, 'x', 42, []]) assert.equal(parseRelease(value), null);
});

test('only a higher versionCode than the installed one is an update', () => {
  const release = parseRelease(valid());
  assert.equal(isNewer(release, 29), true);
  assert.equal(isNewer(release, 30), false);
  assert.equal(isNewer(release, 31), false);
  assert.equal(isNewer(release, null), false);
  assert.equal(isNewer(null, 29), false);
});

test('stored state survives garbage and drops an invalid release', () => {
  assert.deepEqual(readUpdateState(null), EMPTY_UPDATE);
  assert.deepEqual(readUpdateState('{'), EMPTY_UPDATE);
  assert.deepEqual(readUpdateState('null'), EMPTY_UPDATE);
  assert.deepEqual(readUpdateState(JSON.stringify({ checkedAt: 5, release: valid(), dismissed: 30 })), { checkedAt: 5, release: parseRelease(valid()), dismissed: 30 });
  assert.deepEqual(readUpdateState(JSON.stringify({ checkedAt: 'x', release: { ...valid(), size: 0 }, dismissed: 1.5 })), EMPTY_UPDATE);
});

test('the manifest is asked for at most once a day', () => {
  const at = 1_800_000_000_000;
  assert.equal(dueForCheck(0, at), true);
  assert.equal(dueForCheck(at, at + CHECK_EVERY_MS - 1), false);
  assert.equal(dueForCheck(at, at + CHECK_EVERY_MS), true);
  assert.equal(dueForCheck(at, at - 1), true, 'a clock set backwards checks again instead of waiting');
});

test('size, date and digest read as on the landing', () => {
  assert.equal(formatSize(85268595), '85,3 MB');
  assert.equal(formatReleaseDate('2026-10-05'), '5 de octubre de 2026');
  const bytes = new TextEncoder().encode('KarmaHouse');
  const digest = Uint8Array.from(createHash('sha256').update(bytes).digest());
  assert.equal(toHex(digest.buffer), createHash('sha256').update(bytes).digest('hex'));
});

test('the published manifest is valid and names the version the landing offers', () => {
  const release = parseRelease(JSON.parse(readFileSync('web/public/android/latest.json', 'utf8')));
  assert.ok(release, 'web/public/android/latest.json must pass parseRelease');
  const landing = readFileSync('web/src/content.ts', 'utf8').match(/export const VERSION = '([^']+)'/)?.[1];
  assert.equal(release.version, landing);
});
