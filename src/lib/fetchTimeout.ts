export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

/** One request, with a bounded wait and the caller's cancellation preserved. */
export function createDeadlineFetch(
  implementation: typeof fetch = globalThis.fetch.bind(globalThis),
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): typeof fetch {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('El plazo de conexión debe ser mayor que cero.');

  return (input, init) => new Promise<Response>((resolve, reject) => {
    const controller = new AbortController();
    const requestSignal = typeof input === 'object' && input !== null && 'signal' in input ? input.signal : undefined;
    const callerSignal = init?.signal === undefined ? requestSignal : init.signal;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
      complete();
    };
    const abort = (reason: unknown) => {
      // Reject independently of the transport: a broken native request may ignore
      // cancellation. Its eventual response/error is still observed below.
      finish(() => { controller.abort(reason); reject(reason); });
    };
    const onCallerAbort = () => abort(callerSignal?.reason ?? namedError('AbortError', 'La solicitud fue cancelada.'));

    if (callerSignal?.aborted) { onCallerAbort(); return; }
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
    timer = setTimeout(() => abort(namedError('TimeoutError', 'La conexión con KarmaHouse tardó demasiado. Inténtalo de nuevo.')), timeoutMs);

    try {
      implementation(input, { ...init, signal: controller.signal }).then(
        response => finish(() => resolve(response)),
        error => finish(() => reject(error)),
      );
    } catch (error) { finish(() => reject(error)); }
  });
}

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}
