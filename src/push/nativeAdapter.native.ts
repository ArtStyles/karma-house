import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';
import { PUSH_CHANNEL_ID } from './domain';
import { createInstallationStore } from './installationStore';
import type { PushAdapter } from './types';

export const pushProjectId: string = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? '';
export const nativeInstallationStore = createInstallationStore({
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
}, async () => ({ installationId: Crypto.randomUUID(), installationSecret: Array.from(await Crypto.getRandomBytesAsync(32), byte => byte.toString(16).padStart(2, '0')).join('') }));

export const nativePushAdapter: PushAdapter = {
  async ensureChannel() {
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, { name: 'Mensajes, visitas y ofertas', importance: Notifications.AndroidImportance.HIGH, sound: 'default', vibrationPattern: [0, 250, 150, 250] });
  },
  async getPermission() { const permission = await Notifications.getPermissionsAsync(); return { permission: permission.status, canAskAgain: permission.canAskAgain }; },
  async requestPermission() { const permission = await Notifications.requestPermissionsAsync(); return { permission: permission.status, canAskAgain: permission.canAskAgain }; },
  async getToken() { return (await Notifications.getExpoPushTokenAsync({ projectId: pushProjectId })).data; },
  async clearLastResponse(responseId) {
    const last = Notifications.getLastNotificationResponse();
    if (last && `${last.notification.request.identifier}:${last.actionIdentifier}` === responseId) Notifications.clearLastNotificationResponse();
  },
  async openSettings() { await Linking.openSettings(); },
};
