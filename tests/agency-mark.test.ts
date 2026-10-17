import assert from 'node:assert/strict';
import test from 'node:test';
import { elements, executeComponent, Hooks } from './helpers/tsxHooks.ts';

const AGENCY = '11111111-1111-4111-8111-111111111111';
const OLD = `${AGENCY}/logos/22222222-2222-4222-8222-222222222222.jpg`, NEW = `${AGENCY}/logos/33333333-3333-4333-8333-333333333333.jpg`;
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(dataSaver: boolean) {
  const hooks = new Hooks(), signed: string[] = [], looked: string[] = [];
  const component = executeComponent('src/components/agencies/AgencyMark.tsx', 'AgencyMark', hooks, {
    useStyles: () => ({ styles: {} }), useDataSaverState: () => ({ enabled: dataSaver, ready: true }),
    LOGO: /^[0-9a-f-]{36}\/logos\/[0-9a-f-]{36}\.jpg$/i, agencyInitials: (name: string) => name.slice(0, 2).toUpperCase(),
    publishedLogo: async (id: string) => { looked.push(id); return OLD; },
    signLogo: async (path: string) => { signed.push(path); return `https://storage.test/${path}?token=t`; },
    ArchImage: 'ArchImage', Text: 'Text', Image: 'Image',
  });
  const render = (props: Record<string, unknown>) => hooks.render(() => component({ agencyId: AGENCY, name: 'Casa Vedado', width: 56, height: 66, bottom: 14, ...props }));
  const logo = (tree: unknown) => elements(tree).find(x => x.type === 'Image')?.props.source.uri as string | undefined;
  const initials = (tree: unknown) => elements(tree).find(x => x.type === 'Text')?.props.children[0];
  return { render, logo, initials, signed, looked };
}

test('an agency mark shows its logo over the initials and follows a new logo path', async () => {
  const f = fixture(false);
  let tree = f.render({ logoPath: OLD });
  assert.equal(f.logo(tree), undefined); assert.equal(f.initials(tree), 'CA');
  await settle(); tree = f.render({ logoPath: OLD });
  assert.equal(f.logo(tree), `https://storage.test/${OLD}?token=t`); assert.equal(f.initials(tree), 'CA');
  // A changed logo is a new path: the old file stops showing at once and the new one is signed.
  tree = f.render({ logoPath: NEW }); assert.equal(f.logo(tree), undefined);
  await settle(); tree = f.render({ logoPath: NEW });
  assert.equal(f.logo(tree), `https://storage.test/${NEW}?token=t`); assert.deepEqual(f.signed, [OLD, NEW]);
});

test('without a logo, or under data saver, the mark keeps the initials and downloads nothing', async () => {
  const none = fixture(false);
  none.render({ logoPath: null }); await settle();
  assert.equal(none.logo(none.render({ logoPath: null })), undefined); assert.deepEqual(none.signed, []);
  const saver = fixture(true);
  saver.render({ logoPath: OLD }); await settle();
  assert.equal(saver.logo(saver.render({ logoPath: OLD })), undefined); assert.deepEqual(saver.signed, []);
  // Where the logo is managed, it shows anyway.
  saver.render({ logoPath: OLD, eager: true }); await settle();
  assert.equal(saver.logo(saver.render({ logoPath: OLD, eager: true })), `https://storage.test/${OLD}?token=t`);
});

test('a mark that does not know the logo looks up the published one (invitations)', async () => {
  const f = fixture(false);
  f.render({}); await settle();
  assert.equal(f.logo(f.render({})), `https://storage.test/${OLD}?token=t`); assert.deepEqual(f.looked, [AGENCY]);
});
