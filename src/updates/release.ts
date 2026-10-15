/** One Android release, as https://www.karmahouse.site/android/latest.json describes it. */
export type AppRelease = { version: string; versionCode: number; date: string; size: number; sha256: string; url: string; notes: string[] };
/** What the phone keeps between launches: the last manifest, when it was asked for, and the versionCode put off with «Ahora no». */
export type UpdateState = { checkedAt: number; release: AppRelease | null; dismissed: number };

export const MANIFEST_URL = 'https://www.karmahouse.site/android/latest.json';
export const CHECK_EVERY_MS = 24 * 3600_000;
export const EMPTY_UPDATE: UpdateState = { checkedAt: 0, release: null, dismissed: 0 };

/** The only download accepted: the APK of that same version in the official public release. */
export const apkUrl = (version: string) => `https://github.com/ArtStyles/karma-house/releases/download/v${version}/KarmaHouse.apk`;

const positiveInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;

/** Anything unexpected rejects the whole manifest: the phone then simply shows no update. */
export function parseRelease(value: unknown): AppRelease | null {
  if (!value || typeof value !== 'object') return null;
  const { version, versionCode, date, size, sha256, url, notes } = value as Record<string, unknown>;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version) || url !== apkUrl(version)) return null;
  if (!positiveInteger(versionCode) || !positiveInteger(size)) return null;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  if (!Array.isArray(notes) || !notes.every(note => typeof note === 'string')) return null;
  return { version, versionCode, date, size, sha256, url, notes: notes.map(note => note.trim()).filter(Boolean) };
}

export const isNewer = (release: AppRelease | null, installedCode: number | null): release is AppRelease =>
  !!release && installedCode != null && release.versionCode > installedCode;

export function readUpdateState(raw: string | null): UpdateState {
  try {
    const value = JSON.parse(raw ?? '');
    return {
      checkedAt: Number.isFinite(value.checkedAt) ? value.checkedAt : 0,
      release: parseRelease(value.release),
      dismissed: Number.isInteger(value.dismissed) ? value.dismissed : 0,
    };
  } catch { return EMPTY_UPDATE; }
}

/** At most one check a day; a clock set backwards checks again instead of waiting. */
export const dueForCheck = (checkedAt: number, now: number) => now - checkedAt >= CHECK_EVERY_MS || now < checkedAt;

/** Decimal megabytes with a comma, as on the landing: 85268595 → «85,3 MB». */
export const formatSize = (bytes: number) => `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB`;

/** Local noon, so a date-only value never shows the day before west of UTC. */
export const formatReleaseDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });

export const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
