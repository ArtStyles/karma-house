import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPendingIntentStore } from './pendingIntent';

export const pendingIntentStore = createPendingIntentStore({ storage: AsyncStorage, now: Date.now });
