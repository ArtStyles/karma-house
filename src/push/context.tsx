import { createContext, useContext } from 'react';
import type { PushContextValue } from './types';

const unavailable = async () => { throw new Error('Los avisos de este teléfono se activan desde la app Android.'); };
export const unavailablePush: PushContextValue = { supported: false, ready: true, enabled: false, busy: false, permission: 'unavailable', canAskAgain: false, error: null,
  enable: unavailable, disable: unavailable, refresh: async () => {}, openSettings: unavailable };
export const PushContext = createContext<PushContextValue>(unavailablePush);
export function usePushNotifications(): PushContextValue { return useContext(PushContext); }
