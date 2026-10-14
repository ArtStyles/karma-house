import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { readProBadge } from './repository';

/** kh_public_profile cannot grow a key (current APKs refuse it), so the badge is a separate read. */
export function useProBadge(userId: string | undefined): boolean {
  const [pro, setPro] = useState(false);
  useEffect(() => {
    setPro(false);
    if (!supabase || !userId) return;
    const controller = new AbortController();
    readProBadge(supabase, userId, controller.signal).then(value => { if (!controller.signal.aborted) setPro(value); }).catch(() => {});
    return () => controller.abort();
  }, [userId]);
  return pro;
}
