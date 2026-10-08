import type { AgencyRequestContext } from '../types.ts';
import type { AgencyPropertyMedia } from './repository.ts';
const invalid = () => Error('No se pudieron cargar las fotografías autorizadas.');
/** Private URLs live only in the captured workspace, never in the public URL cache. */
export function createAgencyPropertyMedia(url: string, key: string, fetcher: typeof fetch = fetch): AgencyPropertyMedia {
    const base = url.replace(/\/$/, '');
    const pathUrl = (path: string) => {
        if (!/^[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$/.test(path))
            throw invalid();
        return path.split('/').map(encodeURIComponent).join('/');
    };
    async function request(path: string, context: AgencyRequestContext, init: RequestInit = {}) {
        context.checkpoint();
        const response = await fetcher(`${base}/storage/v1/${path}`, { ...init, signal: context.signal, headers: { apikey: key, Authorization: `Bearer ${context.accessToken}`, ...init.headers } });
        context.checkpoint();
        return response;
    }
    return {
        photos(context) {
            return {
                async upload(path, bytes, contentType) {
                    if (!path.startsWith(`${context.userId}/`))
                        throw invalid();
                    const r = await request(`object/property-photos/${pathUrl(path)}`, context, { method: 'POST', headers: { 'Content-Type': contentType, 'x-upsert': 'false' }, body: bytes });
                    if (!r.ok)
                        throw invalid();
                },
                async exists(path) {
                    const response = await request(`object/info/property-photos/${pathUrl(path)}`, context);
                    if (response.ok)
                        return true;
                    if (response.status === 404)
                        return false;
                    if (response.status === 400) {
                        const body: unknown = await response.json().catch(() => null);
                        context.checkpoint();
                        if (body && typeof body === 'object' && !Array.isArray(body)) {
                            const error = body as Record<string, unknown>;
                            const status = error.statusCode ?? error.status;
                            if (String(status) === '404' || (status === undefined && typeof error.message === 'string' && /^(?:object|file) (?:not found|does not exist)\.?$/i.test(error.message.trim())))
                                return false;
                        }
                    }
                    throw invalid();
                },
                async readLocal(uri) {
                    if (!/^(?:file|content|ph|assets-library):\/\//i.test(uri))
                        throw invalid();
                    const { File } = await import('expo-file-system');
                    const bytes = await new File(uri).arrayBuffer();
                    context.checkpoint();
                    return { bytes, contentType: /\.png(?:\?|$)/i.test(uri) ? 'image/png' : /\.webp(?:\?|$)/i.test(uri) ? 'image/webp' : 'image/jpeg' };
                },
                async getUploadId(photo) {
                    if (!photo.uploadId)
                        throw Error('Vuelve a seleccionar la fotografía para asignarle una referencia segura.');
                    return photo.uploadId;
                },
            };
        },
        async sign(paths, context) {
            paths.forEach(pathUrl);
            const r = await request('object/sign/property-photos', context, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths, expiresIn: 300 }) });
            const data: unknown = await r.json();
            context.checkpoint();
            if (!r.ok || !Array.isArray(data) || data.length !== paths.length)
                throw invalid();
            const urls = new Map<string, string>();
            for (const item of data) {
                if (!item || typeof item.path !== 'string' || !paths.includes(item.path) || typeof item.signedURL !== 'string' || urls.has(item.path))
                    throw invalid();
                const uri = new URL(item.signedURL.startsWith('/object/') ? `${base}/storage/v1${item.signedURL}` : item.signedURL, base);
                if (uri.origin !== new URL(base).origin || decodeURIComponent(uri.pathname) !== `/storage/v1/object/sign/property-photos/${item.path}` || !uri.searchParams.get('token'))
                    throw invalid();
                urls.set(item.path, uri.toString());
            }
            return urls;
        },
    };
}
