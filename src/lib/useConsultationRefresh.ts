import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { createConsultationRefreshGate } from './consultationRefresh';

export function useConsultationRefresh(key: string, work: () => Promise<unknown>, blocked: boolean | (() => boolean) = false, onError?: (error: unknown) => void) {
  const gate = useRef(createConsultationRefreshGate()).current;
  const focused = useRef(false), renderedKey = useRef(key);
  const latest = useRef({ work, blocked, onError });
  latest.current = { work, blocked, onError };
  const [state, setState] = useState({ key, refreshing: false });
  if(renderedKey.current!==key){gate.leave();renderedKey.current=key;if(focused.current)gate.enter(key);}
  useFocusEffect(useCallback(() => {
    focused.current=true;gate.enter(key);
    setState({ key, refreshing: false });
    return () => {focused.current=false;gate.leave();};
  }, [gate, key]));
  const refresh = useCallback(() => gate.run(() => latest.current.work(), {
    blocked: typeof latest.current.blocked === 'function' ? latest.current.blocked() : latest.current.blocked,
    onRefreshing: refreshing => setState({ key, refreshing }),
    onError: error => latest.current.onError?.(error),
  }), [gate, key]);
  return { refreshing: state.key === key && state.refreshing, refresh, isRefreshing: gate.running };
}
