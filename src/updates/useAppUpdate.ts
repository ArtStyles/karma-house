import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { draftStorage } from '../data/draftStorage';
import { createDeadlineFetch } from '../lib/fetchTimeout';
import { dueForCheck, EMPTY_UPDATE, isNewer, MANIFEST_URL, parseRelease, readUpdateState, toHex, type AppRelease, type UpdateState } from './release';

export type UpdatePhase = 'idle' | 'downloading' | 'verifying' | 'ready' | 'error';
/** `release` is set only when it is newer than this APK; `pending` while it is not put off with «Ahora no». */
export type AppUpdate = { release: AppRelease | null; pending: boolean; phase: UpdatePhase; percent: number; downloaded: boolean; error: string };

const KEY = 'karmahouse.appUpdate.v1';
const FLAG_GRANT_READ_URI_PERMISSION = 1;
// Only the Android APK updates itself; the web app is always the latest deploy.
const ANDROID = Platform.OS === 'android';
// No OTA updates: the embedded config is the one this APK was built with.
const installed = ANDROID ? Constants.expoConfig?.android?.versionCode ?? null : null;
const deadlineFetch = createDeadlineFetch();

let saved: UpdateState = EMPTY_UPDATE;
let snapshot: AppUpdate = { release: null, pending: false, phase: 'idle', percent: 0, downloaded: false, error: '' };
let checking = false;
let download: AbortController | null = null;
const listeners = new Set<() => void>();

const apk = () => new File(Paths.cache, 'KarmaHouse-update.apk');
const complete = (file: File, release: AppRelease | null) => !!release && file.exists && file.size === release.size;

function publish(patch: Partial<AppUpdate> = {}) {
  const release = isNewer(saved.release, installed) ? saved.release : null;
  snapshot = { ...snapshot, ...patch, release, pending: !!release && saved.dismissed !== release.versionCode };
  listeners.forEach(listener => listener());
}

function persist() {
  void draftStorage.setItem(KEY, JSON.stringify(saved)).catch(() => undefined);
}

async function hydrate() {
  saved = readUpdateState(await draftStorage.getItem(KEY).catch(() => null));
  const release = isNewer(saved.release, installed) ? saved.release : null;
  try {
    // A half-finished download, or the APK of the version now installed, is up to 85 MB of nothing.
    const file = apk();
    if (file.exists && !complete(file, release)) file.delete();
    publish({ downloaded: complete(file, release) });
  } catch { publish(); }
}

const ready = ANDROID ? hydrate() : Promise.resolve();

async function check() {
  await ready;
  if (!ANDROID || checking || !dueForCheck(saved.checkedAt, Date.now())) return;
  checking = true;
  try {
    const response = await deadlineFetch(MANIFEST_URL, { headers: { Accept: 'application/json' } });
    // A server error keeps the last known release; a broken manifest shows none.
    const release = response.ok ? parseRelease(await response.json().catch(() => null)) : saved.release;
    saved = { ...saved, checkedAt: Date.now(), release };
    persist();
    publish();
  } catch { /* Offline: the next launch or return to the app tries again. */ } finally { checking = false; }
}

if (ANDROID) {
  void check();
  AppState.addEventListener('change', state => { if (state === 'active') void check(); });
}

/** «Ahora no»: no dot until a newer version than this one. */
export function dismissUpdate() {
  if (!snapshot.release) return;
  saved = { ...saved, dismissed: snapshot.release.versionCode };
  persist();
  publish();
}

export function cancelUpdate() {
  download?.abort();
}

/** Downloads only when asked, reuses a complete earlier download, checks the SHA-256 and opens Android's installer. */
export async function installUpdate() {
  const release = snapshot.release;
  if (!release || download || snapshot.phase === 'verifying') return;
  const controller = new AbortController();
  download = controller;
  const file = apk();
  try {
    if (!complete(file, release)) {
      if (file.exists) file.delete();
      publish({ phase: 'downloading', percent: 0, downloaded: false, error: '' });
      await File.createDownloadTask(release.url, file, {
        signal: controller.signal,
        onProgress: ({ bytesWritten }) => {
          const percent = Math.min(100, Math.floor(bytesWritten / release.size * 100));
          if (percent !== snapshot.percent) publish({ percent });
        },
      }).downloadAsync();
    }
    publish({ phase: 'verifying', error: '' });
    // ponytail: the whole APK (~85 MB) passes through memory once; hash it in chunks if low-RAM phones fail here.
    const digest = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes()));
    if (digest !== release.sha256) {
      file.delete();
      publish({ phase: 'error', downloaded: false, error: 'El archivo descargado no coincide con el oficial y lo borramos. Inténtalo de nuevo.' });
      return;
    }
  } catch {
    if (controller.signal.aborted) {
      try { if (file.exists) file.delete(); } catch { /* The next launch removes it. */ }
      publish({ phase: 'idle', percent: 0, downloaded: false, error: '' });
    } else publish({ phase: 'error', downloaded: complete(file, release), error: 'No pudimos descargar la actualización. Revisa tu conexión e inténtalo de nuevo.' });
    return;
  } finally {
    if (download === controller) download = null;
  }
  publish({ phase: 'ready', downloaded: true, error: '' });
  try {
    // Android asks once to allow installs from KarmaHouse, then installs over this version.
    // If the person backs out, the checked APK stays for «Instalar» without spending data again.
    await startActivityAsync('android.intent.action.VIEW', { data: file.contentUri, type: 'application/vnd.android.package-archive', flags: FLAG_GRANT_READ_URI_PERMISSION });
  } catch {
    publish({ phase: 'error', error: 'No pudimos abrir el instalador de Android. También puedes descargar el APK desde karmahouse.site.' });
  }
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => snapshot;

export function useAppUpdate(): AppUpdate {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
