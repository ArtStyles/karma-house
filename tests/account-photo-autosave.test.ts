import assert from 'node:assert/strict';
import test from 'node:test';
import { control, elements, executeComponent, Hooks } from './helpers/tsxHooks.ts';
import { AccountProfileError, accountProfileError } from '../src/auth/accountProfile.ts';

function deferred() { let resolve!: () => void, reject!: (error: unknown) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

// The real account form, run with stub natives: a photo must save the moment it is chosen.
function fixture() {
  const hooks = new Hooks(), uploads: ReturnType<typeof deferred>[] = [], photos: unknown[] = [], names: unknown[] = [], toasts: string[] = [];
  const chosen = { data: new ArrayBuffer(8), contentType: 'image/jpeg', previewUri: 'file:///new.jpg' };
  let picks = 0;
  const auth = {
    user: { id: 'ana', email: 'ana@example.test' }, displayName: 'Ana', avatarUrl: 'https://example.test/old.jpg', hasAvatar: true, error: null, isOwner: false,
    saveAvatar: (avatar: unknown) => { photos.push(avatar); const gate = deferred(); uploads.push(gate); return gate.promise; },
    saveProfile: async (input: unknown) => { names.push(input); },
  };
  const bindings: Record<string, unknown> = {
    useStyles: () => ({ colors: {}, styles: {} }), useAuth: () => auth, accountProfileError,
    pickAccountAvatar: async () => { picks++; return chosen; },
    router: { push() {} }, Linking: { openURL() {} }, PRIVACY_URL: '', TERMS_URL: '',
  };
  for (const name of ['View', 'Text', 'TextInput', 'Pressable', 'ActivityIndicator', 'UserAvatar', 'ActionGroup', 'Button', 'Notice', 'Icon', 'DeleteAccountSheet']) bindings[name] = name;
  const form = executeComponent('src/screens/AccountSettingsScreen.tsx', 'AccountSettingsForm', hooks, bindings);
  const props = { ownerId: 'ana', editing: { current: false }, locked: { current: false }, refreshing: () => false, onPhotoSaved: (text: string) => toasts.push(text) };
  const render = () => hooks.render(() => form(props));
  render();
  const avatar = () => elements(render()).find(element => element.type === 'UserAvatar')!.props.avatarUrl;
  const failure = () => elements(render()).find(element => element.type === 'Notice' && element.props.onRetry)?.props;
  return { render, auth, chosen, uploads, photos, names, toasts, avatar, failure, picks: () => picks };
}

test('choosing a photo uploads it at once, without «Guardar cambios» and without the name being typed', async () => {
  const f = fixture();
  control(f.render(), 'Nombre de tu cuenta').onChangeText('Ana María');
  control(f.render(), 'Cambiar foto').onPress();
  await settle();
  assert.deepEqual(f.photos, [f.chosen], 'the chosen photo goes to the server on its own');
  assert.equal(f.names.length, 0, 'the unsaved name is not sent with the photo');
  assert.equal(f.avatar(), 'file:///new.jpg', 'the new photo shows while it uploads');
  assert.ok(elements(f.render()).some(element => element.type === 'Text' && element.props.children.includes('Subiendo foto…')), 'the upload shows its progress');
  f.uploads[0].resolve(); await settle();
  assert.deepEqual(f.toasts, ['Foto actualizada.']);
  assert.equal(control(f.render(), 'Nombre de tu cuenta').value, 'Ana María', 'the typed name waits for its own button');
  control(f.render(), 'Guardar cambios').onPress(); await settle();
  // Spread: the input object comes from the component's own realm.
  assert.deepEqual(f.names.map(input => ({ ...(input as object) })), [{ displayName: 'Ana María' }], '«Guardar cambios» saves only the name');
});

test('a failed upload keeps the previous photo and «Reintentar» sends the same one again', async () => {
  const f = fixture();
  control(f.render(), 'Cambiar foto').onPress(); await settle();
  f.uploads[0].reject(new AccountProfileError('No pudimos subir la foto. Comprueba tu conexión y vuelve a intentarlo.')); await settle();
  assert.equal(f.avatar(), 'https://example.test/old.jpg', 'the previous photo stays');
  assert.match(String(f.failure()?.children), /No pudimos subir la foto/);
  assert.deepEqual(f.toasts, []);
  f.failure()!.onRetry(); await settle();
  assert.equal(f.picks(), 1, 'retrying does not reopen the gallery');
  assert.deepEqual(f.photos, [f.chosen, f.chosen]);
  f.uploads[1].resolve(); await settle();
  assert.equal(f.failure(), undefined);
  assert.deepEqual(f.toasts, ['Foto actualizada.']);
});

test('removing the photo also saves at once', async () => {
  const f = fixture();
  control(f.render(), 'Quitar foto').onPress(); await settle();
  assert.deepEqual(f.photos, [null]);
  f.uploads[0].resolve(); await settle();
  assert.deepEqual(f.toasts, ['Foto quitada.']);
});

test('photo errors say what failed', () => {
  const timeout = Object.assign(new Error('La conexión con KarmaHouse tardó demasiado. Inténtalo de nuevo.'), { name: 'TimeoutError' });
  assert.equal(accountProfileError(timeout), timeout.message);
  assert.equal(accountProfileError(new Error('offline'), 'No pudimos subir la foto.'), 'No pudimos subir la foto.');
  assert.equal(accountProfileError(new Error('KH_PROFILE_AVATAR'), 'No pudimos subir la foto.'), 'No pudimos guardar esta foto. Elige otra y vuelve a intentarlo.');
});
