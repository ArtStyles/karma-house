import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createChunkedAuthStorage } from '../auth/secureStorage';
import { createDeadlineFetch } from './fetchTimeout';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && publicKey);
const storage = Platform.OS === 'web' ? AsyncStorage : createChunkedAuthStorage({
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  removeItem: key => SecureStore.deleteItemAsync(key),
});

export const supabase = url && publicKey ? createClient(url, publicKey, {
  global: { fetch: createDeadlineFetch() },
  auth: { storage, persistSession: true, autoRefreshToken: Platform.OS === 'web', detectSessionInUrl: false, flowType: 'pkce', ...(Platform.OS !== 'web' ? { lock: processLock } : {}) },
}) : null;
