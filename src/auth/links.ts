import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

export function authCallbackUrl(recovery = false): string {
  const url = Platform.OS === 'web' && typeof window !== 'undefined'
    ? new URL('/auth/callback', window.location.origin).toString()
    : Linking.createURL('auth/callback', { scheme: 'karmahouse' });
  return recovery ? `${url}?mode=recovery` : url;
}
