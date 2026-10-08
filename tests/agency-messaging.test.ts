import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgencyMessagingRepository, mergeAgencyMessages, decodePublicContact, decodeAgencyConversation } from '../src/agencies/messaging/repository.ts';
import { pendingIntentDestination, createPendingIntentStore } from '../src/auth/pendingIntent.ts';
import { safeReturnTo } from '../src/auth/callback.ts';
import { renderListing, handle } from '../web/api/p.ts';
import { createReportModerationRepository } from '../src/messaging/reportModeration.ts';
const id = (n: number) => `45000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = { userId: id(1), accessToken: 'buyer', signal: new AbortController().signal, checkpoint() { } };
const msg = (seq: number) => ({ id: id(seq + 10), conversationId: id(2), seq, clientMessageId: id(seq + 20), senderId: id(1), body: 'Hola', createdAt: '2026-10-08T12:00:00Z' });
test('conversation retains only validated own blocked target IDs for former-assignee unblock', () => {
    const row = { id: id(2), agencyId: id(3), dealId: id(4), propertyId: id(5), buyerId: id(1), canSend: true, closedReason: null, lastSeq: 0, agencyName: 'Agencia', propertyTitle: 'Casa', assigneeId: null, dealVersion: 2, unreadCount: 0, blockedUserIds: [id(8)] };
    assert.deepEqual(decodeAgencyConversation({ ...row, receipt: { secret: true } }, context).blockedUserIds, [id(8)]);
    assert.equal('receipt' in decodeAgencyConversation(row, context), false);
    assert.throws(() => decodeAgencyConversation({ ...row, blockedUserIds: ['bad'] }, context));
    assert.throws(() => decodeAgencyConversation({ ...row, blockedUserIds: [id(8), id(8)] }, context));
});
test('agency block/unblock uses conversation scope and pinned actor without a personal chat', async () => {
    const calls: any[] = [];
    const client = { rpc(name: string, args: any) { calls.push({ name, args }); return { setHeader(k: string, v: string) { assert.equal(k, 'Authorization'); assert.equal(v, 'Bearer buyer'); return this; }, async abortSignal() { return { data: null, error: null }; } }; } };
    const repo = createAgencyMessagingRepository(client as any);
    for (const blocked of [true, false]) await repo.setBlocked({ conversationId: id(2), otherUserId: id(4), blocked, clientRequestId: id(blocked ? 31 : 32) }, context);
    assert.deepEqual(calls.map(c => c.name), ['kh_set_agency_conversation_block', 'kh_set_agency_conversation_block']);
    assert.deepEqual(calls.map(c => c.args.p_payload.blocked), [true, false]);
    assert.ok(calls.every(c => c.args.p_actor_id === context.userId && c.args.p_agency_id === null && c.args.p_payload.conversationId === id(2)));
    await assert.rejects(repo.setBlocked({ conversationId: id(2), otherUserId: id(4), blocked: true, clientRequestId: id(33) }, { ...context, checkpoint() { throw Error('KH_ACCOUNT_CHANGED'); } }));
    assert.equal(calls.length, 2);
});
test('history orders sequence and merges replay once', async () => {
    const calls: any[] = [];
    const client = { rpc(n: string, a: any) { calls.push([n, a]); return { setHeader() { return this; }, async abortSignal() { return { data: { items: [msg(2), msg(1)], hasMore: true }, error: null }; } }; } };
    const repo = createAgencyMessagingRepository(client as any);
    const p = await repo.history(id(2), 3, context);
    assert.deepEqual(p.items.map(m => m.seq), [1, 2]);
    assert.equal(p.hasMore, true);
    assert.equal(calls[0][1].p_limit, 30);
    assert.equal(calls[0][1].p_agency_id, null);
    assert.deepEqual(mergeAgencyMessages([msg(1)], p.items).map(m => m.seq), [1, 2]);
});
test('mixed_agency_verification_renders_separate_badges; public_contact_choices_do_not_expose_verification_evidence', () => {
    const p = decodePublicContact({ propertyId: id(3), personalContact: false, agencies: [{ agencyId: id(4), tradeName: 'Uno', verified: true, contactAvailable: true, evidenceReferences: ['secret'] }, { agencyId: id(5), tradeName: 'Dos', verified: false, contactAvailable: true }] });
    assert.deepEqual(p.agencies.map(a => a.verified), [true, false]);
    assert.ok(!JSON.stringify(p).includes('secret'));
    assert.equal(p.personalContact, false);
    assert.throws(() => decodePublicContact({ propertyId: id(3), agencies: [] }));
});
test('agency/manager intent survives login but requires explicit confirmation', async () => {
    const intent = { kind: 'agency-contact' as const, propertyId: id(3), agencyId: id(4), preferredManagerId: id(5) };
    const destination = `/property/${id(3)}?agencyId=${id(4)}&managerId=${id(5)}`;
    assert.equal(pendingIntentDestination(intent), destination);
    assert.equal(safeReturnTo(destination), destination);
    let saved: string | null = null;
    const store = createPendingIntentStore({ now: () => 1, storage: { getItem: async () => saved, setItem: async (_k, v) => { saved = v; }, removeItem: async () => { saved = null; } } });
    await store.write(intent);
    assert.deepEqual(await store.take(destination), intent);
    assert.equal(await store.read(), null);
    assert.equal(safeReturnTo(destination + '&other=1'), '/profile');
    assert.equal(safeReturnTo(destination.replace(id(5), 'bad')), '/profile');
});
test('web public agency badges and manager links never label the technical seller', () => {
    const row = { id: id(3), title: 'Casa', location: 'Vedado', province: 'La Habana', type: 'Casa', description: 'Casa', price: 1, area: null, bedrooms: 1, bathrooms: 1, amenities: [], condition: null, floor: null, price_negotiable: null };
    const html = renderListing(row, [], 'https://example.com', `https://example.com/p/${id(3)}`, { name: 'Custodio', level: 'trusted', verified: true }, { propertyId: id(3), personalContact: false, agencies: [{ agencyId: id(4), tradeName: 'Uno', verified: true, contactAvailable: true }, { agencyId: id(5), tradeName: 'Dos', verified: false, contactAvailable: true }] }, { agencyId: id(4), managerId: id(5) });
    assert.ok(!html.includes('Custodio'));
    assert.equal((html.match(/aria-label="Inmobiliaria verificada"/g) ?? []).length, 1);
    assert.ok(html.includes(`agencyId=${id(4)}&amp;managerId=${id(5)}`));
});
test('moderator agency queue only consumes reported snapshot and uses scoped review RPC', async () => {
    const calls: any[] = [];
    const client = { rpc(name: string, args: any) { calls.push({ name, args }); return { setHeader() { return this; }, abortSignal() { return this; }, then(resolve: any) { resolve({ data: { items: [], hasMore: false }, error: null }); } }; } };
    const repo = createReportModerationRepository(client as any, { actorId: id(1), accessToken: 'mod' }, 'agency');
    assert.deepEqual(await repo.list('open', 0), []);
    assert.equal(calls[0].name, 'kh_list_agency_message_reports');
    assert.equal(calls[0].args.p_limit, 30);
    await repo.review(id(2), 'Revisado');
    assert.equal(calls[1].name, 'kh_review_agency_message_report');
    assert.equal(calls[1].args.p_agency_id, null);
    assert.ok(calls[1].args.p_payload.clientRequestId);
    await repo.review(id(2), 'Revisado');
    assert.equal(calls[1].args.p_payload.clientRequestId, calls[2].args.p_payload.clientRequestId);
});
test('buyer send pins account token and stable message request, rejects foreign ACK', async () => {
    const calls: any[] = [];
    let wrong = false;
    const client = { rpc(n: string, a: any) { calls.push({ n, a }); return { setHeader(_k: string, v: string) { assert.equal(v, 'Bearer buyer'); return this; }, async abortSignal() { return { data: { ...msg(1), senderId: wrong ? id(99) : context.userId }, error: null }; } }; } };
    const repo = createAgencyMessagingRepository(client as any), input = { conversationId: id(2), clientMessageId: id(21), body: 'Hola' };
    await repo.send(input, context);
    await repo.send(input, context);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[0].a.p_agency_id, null);
    assert.equal(calls[0].a.p_payload.clientRequestId, input.clientMessageId);
    wrong = true;
    await assert.rejects(repo.send(input, context));
});
test('public page requires positive personal contact metadata before asking for a seller', async () => {
    for (const metadata of [null, { propertyId: id(3), personalContact: false, agencies: [] }, { propertyId: id(3), personalContact: true, agencies: [] }]) {
        const calls: string[] = [];
        const fetcher = async (url: any) => { calls.push(String(url)); const body = String(url).includes('properties?') ? [{ id: id(3), owner_id: id(99), title: 'Casa', location: 'Vedado', province: 'La Habana', description: 'Casa', price: 1, bedrooms: 1, bathrooms: 1, photo_paths: [], amenities: [] }] : String(url).includes('kh_public_property_contact') ? metadata : { id: id(99), displayName: 'Responsable personal', level: 'new', verified: true }; return new Response(JSON.stringify(body), { status: 200 }); };
        const response = await handle(new Request(`https://example.com/p/${id(3)}?agencyId=${id(4)}&managerId=${id(5)}`), { supabaseUrl: 'https://fixture.invalid', anonKey: 'fixture', publicOrigin: 'https://example.com' }, fetcher as typeof fetch);
        const html = await response.text();
        assert.equal(calls.some(u => u.includes('kh_public_profile')), metadata?.personalContact === true);
        assert.equal(html.includes('Responsable personal'), metadata?.personalContact === true);
        assert.ok(html.includes(`agencyId=${id(4)}&amp;managerId=${id(5)}`));
    }
});
test('return routing rejects malformed, duplicate, unrelated and manager-only parameters', () => {
    for (const suffix of [`?managerId=${id(5)}`, `?agencyId=${id(4)}&agencyId=${id(5)}`, `?agencyId=bad`, `?agencyId=${id(4)}#other`, `?agencyId=${id(4)}&returnTo=https://evil.invalid`])
        assert.equal(safeReturnTo(`/property/${id(3)}${suffix}`), '/profile');
    assert.equal(safeReturnTo(`/agency-conversation/${id(3)}?agencyId=${id(4)}`), `/agency-conversation/${id(3)}?agencyId=${id(4)}`);
});
