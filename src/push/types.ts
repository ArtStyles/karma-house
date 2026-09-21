export type PushPermission = 'undetermined' | 'granted' | 'denied' | 'unavailable';
export interface PushSession { userId: string; sessionId: string; accessToken: string }
export interface PushRequestContext extends PushSession { signal: AbortSignal; checkpoint(): void }
export interface InstallationIdentity { installationId: string; installationSecret: string }
export interface PushIntent {
  enabled: boolean;
  userId: string | null;
  sessionId: string | null;
  expoPushToken: string | null;
  confirmed: boolean;
  wasEnabled: boolean;
}
export interface InstallationState extends InstallationIdentity { version: 1; revision: number; intent: PushIntent | null }
export interface InstallationStore {
  read(): Promise<InstallationState>;
  change(update: (current: InstallationState) => InstallationState): Promise<InstallationState>;
}
export interface RevocationInput extends InstallationIdentity { revision: number }
export interface RegistrationInput extends RevocationInput { expoPushToken: string; platform: 'android'; projectId: string }
export interface RegistrationResult { enabled: true; revision: number; platform: 'android' }
export interface RevocationResult { enabled: false; revision: number }
export interface ResolvedPush { notificationId: string; recipientId: string; conversationId: string }
export interface PushRepository {
  register(input: RegistrationInput, context: PushRequestContext): Promise<RegistrationResult>;
  disable(input: RevocationInput): Promise<RevocationResult>;
  resolve(notificationId: string, context: PushRequestContext): Promise<ResolvedPush>;
}
export interface PushPayload { kind: 'karmahouse.notification'; notificationId: string; recipientId: string }
export interface PermissionState { permission: PushPermission; canAskAgain: boolean }
export interface PushAdapter {
  ensureChannel(): Promise<void>;
  getPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  getToken(): Promise<string>;
  clearLastResponse(responseId: string): Promise<void>;
  openSettings(): Promise<void>;
}
export interface PushState extends PermissionState { supported: boolean; ready: boolean; enabled: boolean; busy: boolean; error: string | null }
export interface PushContextValue extends PushState {
  enable(): Promise<void>;
  disable(): Promise<void>;
  refresh(): Promise<void>;
  openSettings(): Promise<void>;
}
