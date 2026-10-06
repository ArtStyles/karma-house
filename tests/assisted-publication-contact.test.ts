import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTED_PUBLICATION_EMAIL, assistedPublicationMailto, openAssistedPublicationRequest } from '../src/lib/assistedPublication.ts';

test('assisted intake opens a reviewable email with blank fields and explicit later authorization', () => {
  const url = new URL(assistedPublicationMailto());
  assert.equal(url.protocol, 'mailto:');
  assert.equal(url.pathname, 'fejames07@gmail.com');
  assert.equal(ASSISTED_PUBLICATION_EMAIL, url.pathname);
  assert.equal(url.searchParams.get('subject'), 'Ayuda para publicar en KarmaHouse');
  const body = url.searchParams.get('body')!;
  assert.match(body, /Provincia y zona aproximada:\n/);
  assert.match(body, /Fotos: las adjuntaré/);
  assert.match(body, /Quiero conocer el proceso y revisar el anuncio antes de autorizar su publicación/);
  assert.doesNotMatch(body, /access_token|refresh_token|client_request_id|autorizo a publicar/i);
});

test('a missing email app leaves a manual alternative and never retries or sends a request', async () => {
  const calls: string[] = [];
  assert.equal(await openAssistedPublicationRequest(async url => { calls.push(url); throw Error('No email app'); }), false);
  assert.deepEqual(calls, [assistedPublicationMailto()]);
  assert.equal(await openAssistedPublicationRequest(async () => true), true);
});
