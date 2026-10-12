import assert from 'node:assert/strict';
import test from 'node:test';
import * as content from '../web/src/content.ts';
import { PROVINCES as APP_PROVINCES } from '../src/domain/listingOptions.ts';

const { APK, FAQ, INSTALL, JOURNEY, NOTES, PROVINCES, PUBLISH, SHA, VERSION, plain, structuredData } = content;

test('provinces match the app: 15 provinces and the Isla de la Juventud', () => {
  assert.deepEqual([...PROVINCES], [...APP_PROVINCES]);
  assert.equal(PROVINCES.length, 16);
});

test('copy never makes claims BRAND.md forbids', () => {
  const copy = JSON.stringify(Object.fromEntries(Object.entries(content).filter(([, v]) => typeof v !== 'function')));
  for (const banned of [/verificad/i, /garantizad/i, /16 provincias/i, /revolico/i, /whatsapp/i]) assert.doesNotMatch(copy, banned);
});

test('every step has a title and one blue phrase', () => {
  assert.equal(JOURNEY.length, 4);
  assert.equal(PUBLISH.length, 3);
  for (const step of [...JOURNEY, ...PUBLISH]) {
    assert.ok(step.title && step.accent && step.text && step.label);
    assert.ok(!step.title.includes(step.accent));
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
