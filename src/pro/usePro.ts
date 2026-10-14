import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { proErrorMessage, type ProStatus } from './domain';
import { createProRepository } from './repository';

/** Pro of the signed-in account; an account or token change discards older answers, and only an account change clears the status. */
export function usePro() {
  const { user, session } = useAuth();
  const actorId = user?.id, token = session?.access_token;
  const repository = useMemo(() => supabase && actorId && token ? createProRepository(supabase, { actorId, accessToken: token }) : null, [actorId, token]);
  const [status, setStatus] = useState<ProStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++generation.current;
    if (!repository) { setStatus(null); setLoading(false); return; }
    setLoading(true); setError('');
    try { const next = await repository.status(); if (mine === generation.current) setStatus(next); }
    catch (failure) { if (mine === generation.current) setError(proErrorMessage(failure)); }
    finally { if (mine === generation.current) setLoading(false); }
  }, [repository]);
  // Another account must not inherit the previous status; a token refresh keeps it while the new answer loads.
  useEffect(() => { setStatus(null); }, [actorId]);
  useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);
  return { repository, status, error, loading, reload };
}
