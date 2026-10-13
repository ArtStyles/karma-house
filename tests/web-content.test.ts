import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as content from '../web/src/content.ts';
import { PROVINCES as APP_PROVINCES } from '../src/domain/listingOptions.ts';

const { APK, FAQ, INSTALL, NOTES, PROVINCES, SHA, TOUR, VERSION, plain, structuredData } = content;

test('provinces match the app: 15 provinces and the Isla de la Juventud', () => {
  assert.deepEqual([...PROVINCES], [...APP_PROVINCES]);
  assert.equal(PROVINCES.length, 16);
});

test('copy never makes claims BRAND.md forbids', () => {
  const copy = JSON.stringify(Object.fromEntries(Object.entries(content).filter(([, v]) => typeof v !== 'function')));
  for (const banned of [/verificad/i, /garantizad/i, /16 provincias/i, /revolico/i, /whatsapp/i]) assert.doesNotMatch(copy, banned);
});

test('every stop of the walk has its text, one coloured phrase and a photo in walk order', () => {
  const { frames } = JSON.parse(readFileSync(new URL('../web/src/tour-data.json', import.meta.url), 'utf8'));
  const at = TOUR.map((stop) => frames.indexOf(stop.photo));
  assert.equal(at[0], 0, 'the walk starts paused on its first photo');
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
  assert.equal(new Set(TOUR.map((stop) => stop.id)).size, TOUR.length);
  for (const stop of TOUR) {
    assert.ok(stop.kicker && stop.title && stop.accent && stop.text);
    assert.ok(!stop.title.includes(stop.accent));
  }
  const rooms = TOUR.flatMap((stop) => [`room-${stop.photo}-640.webp`, `room-${stop.photo}-1024.webp`]);
  for (const file of ['thumbs.webp', 'depth.webp', ...rooms, ...frames.flatMap((n: string) => [`${n}-720.webp`, `${n}-1280.webp`])]) {
    assert.ok(existsSync(new URL(`../web/public/casa/${file}`, import.meta.url)), file);
  }
});

test('download links point at the same release', () => {
  for (const url of [APK, SHA, NOTES, INSTALL]) assert.ok(url.includes(`v${VERSION}`), url);
});

test('structured data mirrors the visible FAQ and the release', () => {
  const graph = structuredData()['@graph'] as any[];
  const app = graph.find((n) => n['@type'] === 'MobileApplication');
  const faq = graph.find((n) => n['@type'] === 'FAQPage');
  assert.equal(app.softwareVersion, VERSION);
  assert.equal(app.downloadUrl, APK);
  assert.equal(faq.mainEntity.length, FAQ.length);
  faq.mainEntity.forEach((q: any, i: number) => {
    assert.equal(q.name, FAQ[i].q);
    assert.equal(q.acceptedAnswer.text, plain(FAQ[i].a));
    assert.doesNotMatch(q.acceptedAnswer.text, /</);
  });
});
