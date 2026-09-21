import { supabase } from '../lib/supabase';
import { memoizeAuthCallback, parseAuthCallback } from './callback';
import { authErrorMessage } from './errors';
import { authCallbackUrl } from './links';

type Result = { recovery: boolean; returnTo: string };
// Keep successful single-use codes deduplicated while allowing transient failures to retry.
export const completeAuthCallback = memoizeAuthCallback(complete);

async function complete(url: string): Promise<Result> {
  if (!supabase) throw new Error('Las cuentas no están disponibles en la demostración local.');
  const callback = parseAuthCallback(url, authCallbackUrl());
  try {
    if (callback.kind === 'code') {
      const { data, error } = await supabase.auth.exchangeCodeForSession(callback.code);
      if (error) throw error;
      if (!data.session) throw new Error('Missing session');
      // Current SDK exposes this at runtime but its public return type omits the field.
      return { recovery: callback.recovery || ('redirectType' in data && data.redirectType === 'recovery'), returnTo: callback.returnTo };
    }
    if (callback.kind === 'token_hash') {
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: callback.tokenHash, type: callback.type });
      if (error) throw error;
      if (!data.session) throw new Error('Missing session');
    } else {
      const { data, error } = await supabase.auth.setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken });
      if (error) throw error;
      if (!data.session) throw new Error('Missing session');
    }
    return { recovery: callback.recovery, returnTo: callback.returnTo };
  } catch (error) { throw new Error(authErrorMessage(error)); }
}
