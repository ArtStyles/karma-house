import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bumpErrorMessage, canBumpNow, decodeProAccounts, decodeProCodes, decodeProStatus, decodeRedeem, formatProDate, isProActive, isProCodeShape, nextBumpAt, normalizeProCode, proContactMailto, proErrorMessage } from '../src/pro/domain.ts';
import { createProRepository } from '../src/pro/repository.ts';
import { mapRemoteListing, type RemotePropertyRow } from '../src/data/remoteMapping.ts';

const id = '43000000-0000-4000-8000-000000000003';

test('a code reads the same with or without prefix, spaces or case', () => {
  assert.equal(normalizeProCode('kh-7q4m x9tr-2plw'), '7Q4MX9TR2PLW');
  assert.equal(normalizeProCode('7Q4M-X9TR-2PLW'), '7Q4MX9TR2PLW');
  // Only a 14-symbol input carries the prefix: a 12-symbol body may start with KH.
  assert.equal(normalizeProCode('KHQ4-X9TR-2PLW'), 'KHQ4X9TR2PLW');
  assert.ok(isProCodeShape('KH-7Q4M-X9TR-2PLW'));
  assert.ok(!isProCodeShape('KH-7Q4M-X9TR-2PL0'), '0 is not in the alphabet');
  assert.ok(!isProCodeShape('KH-7Q4M-X9TR'));
});

test('the next bump is a week after the last one, or after publication', () => {
  const createdAt = '2026-10-01T10:00:00.000Z';
  assert.equal(nextBumpAt({ createdAt }).toISOString(), '2026-10-08T10:00:00.000Z');
  assert.equal(nextBumpAt({ createdAt, bumpedAt: '2026-10-10T08:00:00.000Z' }).toISOString(), '2026-10-17T08:00:00.000Z');
  assert.ok(canBumpNow({ createdAt }, Date.parse('2026-10-08T10:00:00.000Z')));
  assert.ok(!canBumpNow({ createdAt }, Date.parse('2026-10-08T09:59:59.000Z')));
  assert.ok(isProActive('2026-10-20T00:00:00Z', Date.parse('2026-10-14T00:00:00Z')));
  assert.ok(!isProActive('2026-10-13T00:00:00Z', Date.parse('2026-10-14T00:00:00Z')));
  assert.ok(!isProActive(null));
});

test('server codes become guidance; unknown failures ask to retry', () => {
  assert.match(proErrorMessage(new Error('KH_PRO_CODE_RATE')), /dentro de una hora/);
  assert.match(proErrorMessage({ message: 'KH_PRO_REQUIRED' }), /parte de KarmaHouse Pro/);
  assert.match(proErrorMessage(new Error('KH_ACCOUNT_DELETING')), /se está eliminando/);
  assert.match(proErrorMessage(new Error('fetch failed')), /Comprueba la conexión/);
  assert.match(proErrorMessage(new Error('KH_ASSISTED_CONSENT_REQUIRED')), /consentimiento vigente/);
  assert.match(proErrorMessage(new Error('KH_ADMIN_REQUIRED')), /acceso a Administración/);
  assert.equal(proErrorMessage(new Error('KH_AGENCY_DISABLED')), 'El espacio de inmobiliarias aún no está habilitado.');
  // An unknown KH_ code is a refusal, not a connection problem.
  assert.equal(proErrorMessage(new Error('KH_SOMETHING')), 'No se pudo completar esta acción.');
  assert.equal(proErrorMessage(new TypeError('Network request failed')), 'No se pudo completar. Comprueba la conexión y vuelve a intentarlo.');
  // The date is relative to now: a fixed one ages into the past and would hit the stale-data branch.
  const bumpedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(bumpErrorMessage(new Error('KH_BUMP_TOO_SOON'), { createdAt: '2026-01-01T10:00:00.000Z', bumpedAt }),
    `Podrás subir este anuncio el ${formatProDate(nextBumpAt({ createdAt: bumpedAt }))}.`);
  // Stale local data (bumped from another device): the computed date is past, so never show it.
  assert.equal(bumpErrorMessage(new Error('KH_BUMP_TOO_SOON'), { createdAt: '2026-01-01T10:00:00.000Z' }), 'Este anuncio ya se subió esta semana.');
  assert.match(proContactMailto(), /^mailto:.+\?subject=Quiero%20KarmaHouse%20Pro$/);
});

test('status and redemption decode strictly', () => {
  const status = decodeProStatus({ personalUntil: null, agencies: [{ id, tradeName: 'Casas', role: 'admin', until: '2026-11-01T00:00:00Z' }] });
  assert.equal(status.agencies[0].role, 'admin');
  assert.throws(() => decodeProStatus({ personalUntil: 'mañana', agencies: [] }));
  assert.throws(() => decodeProStatus({ personalUntil: null, agencies: [{ id, tradeName: 'Casas', role: 'owner', until: null }] }));
  assert.deepEqual(decodeRedeem({ ok: true, kind: 'user', id, until: '2026-11-13T00:00:00Z' }), { kind: 'user', id, until: '2026-11-13T00:00:00Z' });
  assert.throws(() => decodeRedeem({ ok: false, error: 'KH_PRO_CODE_RATE' }), /KH_PRO_CODE_RATE/);
});

test('owner lists keep one page and refuse unknown states', () => {
  const row = { id, days: 30, note: 'Pago', boundName: null, state: 'unused', createdAt: '2026-10-14T00:00:00Z', expiresAt: '2026-11-13T00:00:00Z', redeemedAt: null, redeemedFor: null, cancelNote: null };
  const page = decodeProCodes({ items: Array.from({ length: 31 }, () => row), hasMore: true });
  assert.equal(page.items.length, 30);
  assert.throws(() => decodeProCodes({ items: [{ ...row, state: 'lost' }], hasMore: false }));
  assert.equal(decodeProAccounts({ items: [{ kind: 'agency', id, name: 'Casas', until: '2026-11-13T00:00:00Z', note: null, effective: true }], hasMore: false }).items[0].kind, 'agency');
});

test('the repository pins the actor and sends only the normalized code', async () => {
  const calls: { name: string; args: Record<string, unknown>; header?: string }[] = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      const entry: { name: string; args: Record<string, unknown>; header?: string } = { name, args };
      calls.push(entry);
      const builder = {
        setHeader(_key: string, value: string) { entry.header = value; return builder; },
        abortSignal() { return builder; },
        then(resolve: (value: unknown) => void) { resolve({ data: { ok: true, kind: 'user', id, until: '2026-11-13T00:00:00Z' }, error: null }); },
      };
      return builder;
    },
  };
  const repository = createProRepository(client as never, { actorId: id, accessToken: 'token' });
  assert.equal((await repository.redeem('kh-7q4m-x9tr-2plw', null)).kind, 'user');
  assert.deepEqual(calls[0], { name: 'kh_redeem_pro_code', args: { p_actor_id: id, p_code: '7Q4MX9TR2PLW', p_agency_id: null }, header: 'Bearer token' });
});

test('listings carry the bump date and the Pro mark when the server sends them', () => {
  const row: RemotePropertyRow = { id, owner_id: id, client_request_id: 'pro-row', title: 'Casa Pro', location: 'Vedado', province: 'La Habana', price: 50000,
    bedrooms: 2, bathrooms: 1, area: 100, type: 'Casa', description: 'Casa ficticia para la prueba de Pro.', amenities: [], photo_paths: [],
    availability: 'active', moderation: 'approved', review_note: null, created_at: '2026-10-01T10:00:00Z', version: 1 };
  const plain = mapRemoteListing(row, new Map());
  assert.equal(plain.isPro, undefined); assert.equal(plain.bumpedAt, undefined);
  const mapped = mapRemoteListing({ ...row, bumped_at: '2026-10-10T08:00:00Z', is_pro: true }, new Map());
  assert.equal(mapped.bumpedAt, '2026-10-10T08:00:00Z'); assert.equal(mapped.isPro, true);
  assert.throws(() => mapRemoteListing({ ...row, is_pro: 'yes' as never }, new Map()));
  assert.throws(() => mapRemoteListing({ ...row, bumped_at: 'ayer' }, new Map()));
  // supabaseMarketplace.ts pulls React Native in, so read the column list from the source text.
  const source = readFileSync(new URL('../src/data/supabaseMarketplace.ts', import.meta.url), 'utf8');
  const columns = /PROPERTY_COLUMNS = '([^']+)'/.exec(source)![1].split(',');
  assert.ok(columns.includes('bumped_at') && columns.includes('is_pro:kh_is_pro'));
});
