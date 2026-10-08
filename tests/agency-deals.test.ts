import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAgencyDeal, normalizeExternalContact } from '../src/agencies/deals/domain.ts';
import { createAgencyDealRepository } from '../src/agencies/deals/repository.ts';
const id = (n: number) => `45000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deal = { id: id(1), agencyId: id(2), propertyId: id(3), cycleId: id(4), buyerId: id(5), contactKind: 'account', privateContact: null, assigneeId: null, stage: 'inquiry', version: 1, closedReason: null };
const context = { userId: id(6), agencyId: id(2), generation: 1, accessToken: 'pinned', signal: new AbortController().signal, checkpoint() { } };
test('external contact requires consent and validates optional phone', () => {
    assert.deepEqual(normalizeExternalContact({ name: ' Ana Pérez ', phone: null, consentReference: ' Autorización verbal 1 ' }), { name: 'Ana Pérez', phone: null, consentReference: 'Autorización verbal 1' });
    for (const change of [{ name: 'A' }, { phone: 'not phone' }, { consentReference: '' }])
        assert.throws(() => normalizeExternalContact({ name: 'Ana', phone: null, consentReference: 'Autorización', ...change }));
});
test('deal decoder rejects cross agency and inconsistent external/account shape', () => {
    assert.deepEqual(decodeAgencyDeal(deal, id(2)), deal);
    assert.throws(() => decodeAgencyDeal(deal, id(9)));
    assert.throws(() => decodeAgencyDeal({ ...deal, privateContact: { name: 'Ana', phone: null, consentReference: 'private' } }, id(2)));
    assert.throws(() => decodeAgencyDeal({ ...deal, stage: 'reserved' }, id(2)));
});
test('deal pages bind actor/agency and request limit 30; abort prevents late result', async () => {
    let args: any, header: any;
    let changed = false;
    const client = { rpc(_name: string, a: any) { args = a; return { setHeader(_n: string, h: string) { header = h; return this; }, async abortSignal() { changed = true; return { data: { items: [deal], hasMore: true }, error: null }; } }; } };
    const repo = createAgencyDealRepository(client as any);
    assert.equal((await repo.list(30, context)).hasMore, true);
    assert.equal(args.p_limit, 30);
    assert.equal(args.p_offset, 30);
    assert.equal(args.p_actor_id, context.userId);
    assert.equal(args.p_agency_id, context.agencyId);
    assert.equal(header, 'Bearer pinned');
    await assert.rejects(repo.list(-1, context));
    await assert.rejects(repo.list(0, { ...context, checkpoint() { if (changed)
            throw Error('changed'); } }), /changed/);
});
