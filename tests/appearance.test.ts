import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppearanceStore, resolveAppearance } from '../src/settings/appearance.ts';
import { lightColors, darkColors } from '../src/theme/palette.ts';

const KEY = 'karmahouse.appearance.v1';
function storage(initial: string | null = null) {
  const items = new Map<string, string>();
  if (initial !== null) items.set(KEY, initial);
  return {
    items,
    async getItem(key: string) { return items.get(key) ?? null; },
    async setItem(key: string, value: string) { items.set(key, value); },
  };
}

test('a new installation follows the system after loading its preference', async () => {
  const store = createAppearanceStore({ storage: storage() });
  assert.equal(store.getState().ready, false);
  await store.hydrate();
  assert.equal(store.getState().ready, true);
  assert.equal(resolveAppearance(store.getState().preference, 'dark'), 'dark');
  assert.equal(resolveAppearance(store.getState().preference, 'light'), 'light');
});

test('manual choices override the system, while system handles unavailable appearance', () => {
  assert.equal(resolveAppearance('light', 'dark'), 'light');
  assert.equal(resolveAppearance('dark', 'light'), 'dark');
  assert.equal(resolveAppearance('system', null), 'light');
  assert.equal(resolveAppearance('system', 'unspecified'), 'light');
  assert.equal(resolveAppearance('system', undefined), 'light');
});

test('every appearance choice survives a restart', async () => {
  for (const preference of ['light', 'dark', 'system'] as const) {
    const disk = storage();
    const first = createAppearanceStore({ storage: disk });
    await first.hydrate();
    await first.setPreference(preference);
    const restarted = createAppearanceStore({ storage: disk });
    await restarted.hydrate();
    assert.equal(restarted.getState().preference, preference);
  }
});

test('invalid stored preferences fall back to system', async () => {
  for (const invalid of ['LIGHT', 'unknown', '', '{}']) {
    const store = createAppearanceStore({ storage: storage(invalid) });
    await store.hydrate();
    assert.equal(resolveAppearance(store.getState().preference, 'dark'), 'dark');
  }
});

test('a storage read failure does not block startup', async () => {
  const store = createAppearanceStore({ storage: { ...storage(), async getItem() { throw new Error('Unavailable'); } } });
  await store.hydrate();
  assert.equal(store.getState().ready, true);
  assert.equal(store.getState().preference, 'system');
});

test('a choice updates subscribers before its storage write completes', async () => {
  let release!: () => void;
  const store = createAppearanceStore({ storage: { ...storage(), setItem: () => new Promise<void>(resolve => { release = resolve; }) } });
  await store.hydrate();
  let observed = '';
  const unsubscribe = store.subscribe(() => { observed = store.getState().preference; });
  const saved = store.setPreference('dark');
  assert.equal(observed, 'dark');
  await Promise.resolve();
  release();
  await saved;
  unsubscribe();
});

test('late hydration cannot replace a choice made during startup', async () => {
  let finishRead!: (value: string) => void;
  const store = createAppearanceStore({ storage: { ...storage(), getItem: () => new Promise<string>(resolve => { finishRead = resolve; }) } });
  const loaded = store.hydrate();
  await store.setPreference('dark');
  finishRead('light');
  await loaded;
  assert.equal(store.getState().preference, 'dark');
});

test('quick successive changes persist the last choice in order', async () => {
  const disk = storage();
  let finishFirst!: () => void;
  let writes = 0;
  const store = createAppearanceStore({ storage: { ...disk, async setItem(key, value) {
    if (++writes === 1) await new Promise<void>(resolve => { finishFirst = resolve; });
    await disk.setItem(key, value);
  } } });
  await store.hydrate();
  const first = store.setPreference('dark');
  const last = store.setPreference('light');
  await Promise.resolve();
  assert.equal(writes, 1);
  assert.equal(store.getState().preference, 'light');
  finishFirst();
  await Promise.all([first, last]);
  const restarted = createAppearanceStore({ storage: disk });
  await restarted.hydrate();
  assert.equal(restarted.getState().preference, 'light');
});

test('failed saves are visible and the next choice can still persist', async () => {
  const disk = storage();
  let fail = true;
  const store = createAppearanceStore({ storage: { ...disk, async setItem(key, value) {
    if (fail) throw new Error('Full');
    await disk.setItem(key, value);
  } } });
  await store.hydrate();
  await store.setPreference('dark');
  assert.equal(store.getState().preference, 'dark');
  assert.equal(store.getState().saveFailed, true);
  fail = false;
  await store.setPreference('light');
  assert.equal(store.getState().saveFailed, false);
  assert.equal(disk.items.get(KEY), 'light');
});

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

test('both palettes keep body text, secondary text and action labels readable', () => {
  for (const colors of [lightColors, darkColors]) {
    for (const background of [colors.paper, colors.surface]) {
      assert.ok(contrast(colors.ink, background) >= 4.5, 'body text contrast');
      assert.ok(contrast(colors.muted, background) >= 4.5, 'secondary text contrast');
      assert.ok(contrast(colors.primary, background) >= 4.5, 'link contrast');
    }
    assert.ok(contrast(colors.onPrimary, colors.primaryFill) >= 4.5, 'button contrast');
    assert.ok(contrast(colors.onPrimary, colors.dangerFill) >= 4.5, 'destructive button contrast');
    assert.ok(contrast(colors.inverseInk, colors.inverseSurface) >= 4.5, 'floating action contrast');
  }
});

test('white photo labels stay readable even over a fully white image', () => {
  for (const colors of [lightColors, darkColors]) {
    const opacity = parseInt(colors.photoOverlay.slice(7, 9), 16) / 255;
    const background = '#' + [1, 3, 5].map(offset => {
      const foreground = parseInt(colors.photoOverlay.slice(offset, offset + 2), 16);
      return Math.round(foreground * opacity + 255 * (1 - opacity)).toString(16).padStart(2, '0');
    }).join('');
    assert.ok(contrast(colors.onPrimary, background) >= 4.5, 'photo label contrast');
  }
});
