import type { PropsWithChildren } from 'react';
import { PushContext, unavailablePush } from './context';
export { usePushNotifications } from './context';
export function PushProvider({ children }: PropsWithChildren) { return <PushContext.Provider value={unavailablePush}>{children}</PushContext.Provider>; }
