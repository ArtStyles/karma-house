import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { authErrorMessage, validateEmail, validateNewPassword } from './errors';
import { authCallbackUrl } from './links';
import { randomUUID } from 'expo-crypto';
import { createDeadlineFetch } from '../lib/fetchTimeout';
import { accountProfileError, type AccountProfileInput, type AccountRequestContext } from './accountProfile';
import { createAccountProfileRepository, saveAccountProfile } from './accountProfileRepository';
import { runBeforeSignOut } from '../push/signOutHooks';
import { PushError, sessionFromAccessToken } from '../push/domain';
import { deleteAccount } from './deleteAccount';

export type AuthContextValue = {
  ready: boolean;
  user: User | null;
  session: Session | null;
  displayName: string;
  avatarUrl: string | null;
  hasAvatar: boolean;
  profileReady: boolean;
  isAdmin: boolean;
  error: string | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  refreshProfile(): Promise<void>;
  saveProfile(input: AccountProfileInput): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
function client() {
  if (!supabase) throw new Error('Las cuentas no están disponibles en la demostración local.');
  return supabase;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ ownerId: string; displayName: string; avatarPath: string | null; avatarUrl: string | null; isAdmin: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const profileRequest = useRef(0);
  const mounted = useRef(true);
  const profileEpoch = useRef(0);
  const profileControllers = useRef(new Set<AbortController>());
  const savingProfile = useRef<string | null>(null);
  const accountRepository = useMemo(() => createAccountProfileRepository(process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '', process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '', createDeadlineFetch()), []);
  const ownerId = session?.user.id ?? null;

  const acceptSession = useCallback((next: Session | null) => {
    if (!mounted.current) return;
    if (sessionRef.current?.user.id !== next?.user.id) {
      profileEpoch.current += 1;
      for (const controller of profileControllers.current) controller.abort();
      profileControllers.current.clear();
      profileRequest.current += 1;
      setProfile(null);
      setError(null);
    }
    sessionRef.current = next;
    setSession(next);
    setReady(true);
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!supabase) return () => { mounted.current = false; };
    const auth = supabase.auth;
    let alive = true;
    let eventVersion = 0;
    // Keep this callback synchronous: Supabase holds its auth lock while notifying listeners.
    const { data: { subscription } } = auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      eventVersion += 1;
      acceptSession(next);
    });
    const initialVersion = eventVersion;
    void auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive || eventVersion !== initialVersion) return;
      if (sessionError) setError(authErrorMessage(sessionError));
      acceptSession(data.session);
    }).catch(() => {
      if (alive && eventVersion === initialVersion) { setError('No se pudo recuperar la sesión. Vuelve a iniciar sesión.'); setReady(true); }
    });
    return () => { alive = false; mounted.current = false; profileRequest.current += 1; for (const controller of profileControllers.current) controller.abort(); profileControllers.current.clear(); subscription.unsubscribe(); };
  }, [acceptSession]);

  const accountContext = useCallback((): AccountRequestContext & { release(): void } => {
    const current = sessionRef.current;
    if (!current) throw new Error('KH_ACCOUNT_CHANGED');
    const epoch = profileEpoch.current;
    const controller = new AbortController();
    profileControllers.current.add(controller);
    return { actorId: current.user.id, accessToken: current.access_token, signal: controller.signal,
      checkpoint() { if (!mounted.current || controller.signal.aborted || profileEpoch.current !== epoch || sessionRef.current?.user.id !== current.user.id) throw new Error('KH_ACCOUNT_CHANGED'); },
      release() { profileControllers.current.delete(controller); },
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    const ownerId = sessionRef.current?.user.id;
    const request = ++profileRequest.current;
    if (!supabase || !ownerId) { setProfile(null); return; }
    const context = accountContext();
    try {
      const [profileResult, adminResult] = await Promise.all([
        accountRepository.load(context),
        supabase.rpc('kh_is_admin').setHeader('Authorization', `Bearer ${context.accessToken}`).abortSignal(context.signal),
      ]);
      context.checkpoint();
      if (!mounted.current || request !== profileRequest.current || sessionRef.current?.user.id !== ownerId) return;
      if (adminResult.error) throw adminResult.error;
      let avatarUrl: string | null = null;
      let photoError = false;
      if (profileResult.avatarPath) { try { avatarUrl = await accountRepository.sign(profileResult.avatarPath, context); } catch { photoError = true; } }
      context.checkpoint();
      if (request !== profileRequest.current) return;
      setProfile({ ownerId, displayName: profileResult.displayName, avatarPath: profileResult.avatarPath, avatarUrl, isAdmin: adminResult.data === true });
      setError(photoError ? 'Tu perfil está disponible, pero no pudimos cargar la foto. Vuelve a actualizarlo.' : null);
    } catch {
      if (mounted.current && request === profileRequest.current && sessionRef.current?.user.id === ownerId) {
        setError('No se pudo cargar tu perfil. Comprueba tu conexión.');
      }
    } finally { context.release(); }
  }, [accountContext, accountRepository]);

  useEffect(() => { void refreshProfile(); }, [session?.user.id, refreshProfile]);
  useEffect(() => {
    if (!ownerId) return;
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refreshProfile(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refreshProfile(); }, 45 * 60 * 1000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [ownerId, refreshProfile]);

  const saveProfile = useCallback(async (input: AccountProfileInput) => {
    if (!ownerId || sessionRef.current?.user.id !== ownerId) throw new Error('La sesión cambió. Abre los ajustes con la cuenta actual.');
    if (!profile || profile.ownerId !== ownerId) throw new Error('Primero hay que cargar tu perfil. Vuelve a intentarlo.');
    if (savingProfile.current === ownerId) throw new Error('Espera a que terminen de guardarse los cambios.');
    savingProfile.current = ownerId;
    profileRequest.current += 1;
    const context = accountContext();
    setError(null);
    try {
      const updated = await saveAccountProfile(accountRepository, context, input, profile.avatarPath, randomUUID);
      let avatarUrl: string | null = null;
      let photoError = false;
      if (updated.avatarPath) { try { avatarUrl = await accountRepository.sign(updated.avatarPath, context); } catch { photoError = true; } }
      context.checkpoint();
      profileRequest.current += 1;
      setProfile(current => ({ ownerId, displayName: updated.displayName, avatarPath: updated.avatarPath, avatarUrl, isAdmin: current?.ownerId === ownerId ? current.isAdmin : false }));
      setError(photoError ? 'Los cambios se guardaron. La foto se mostrará cuando puedas volver a cargar el perfil.' : null);
    } catch (cause) {
      const message = accountProfileError(cause);
      if (mounted.current && sessionRef.current?.user.id === ownerId) setError(message);
      throw new Error(message);
    } finally { context.release(); if (savingProfile.current === ownerId) savingProfile.current = null; }
  }, [ownerId, profile, accountContext, accountRepository]);

  useEffect(() => {
    if (!supabase || Platform.OS === 'web' || !ready || !session?.user.id) return;
    const auth = supabase.auth;
    const update = (state: string) => { if (state === 'active') void auth.startAutoRefresh(); else void auth.stopAutoRefresh(); };
    update(AppState.currentState);
    const subscription = AppState.addEventListener('change', update);
    return () => { subscription.remove(); void auth.stopAutoRefresh(); };
  }, [ready, session?.user.id]);

  const fail = useCallback((cause: unknown): never => {
    const message = authErrorMessage(cause);
    if (mounted.current) setError(message);
    throw new Error(message);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const normalizedEmail = validateEmail(email);
    if (!password) throw new Error('Escribe tu contraseña.');
    setError(null);
    const result = await client().auth.signInWithPassword({ email: normalizedEmail, password }).catch(fail);
    if (result.error) fail(result.error);
  }, [fail]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const normalizedName = name.trim();
    if (normalizedName.length < 2 || normalizedName.length > 80) throw new Error('Escribe tu nombre, entre 2 y 80 caracteres.');
    const normalizedEmail = validateEmail(email);
    validateNewPassword(password);
    setError(null);
    const result = await client().auth.signUp({ email: normalizedEmail, password, options: { data: { display_name: normalizedName }, emailRedirectTo: authCallbackUrl() } }).catch(fail);
    if (result.error) fail(result.error);
    return { needsConfirmation: !result.data.session };
  }, [fail]);

  const signOut = useCallback(async () => {
    if (ownerId !== (sessionRef.current?.user.id ?? null)) throw new Error('La sesión cambió. Abre el menú con la cuenta actual.');
    const signingOutUserId = sessionRef.current?.user.id;
    const signingOutSessionId = sessionRef.current ? sessionFromAccessToken(sessionRef.current.user.id, sessionRef.current.access_token)?.sessionId : null;
    setError(null);
    if (signingOutUserId) {
      try { await runBeforeSignOut(signingOutUserId); }
      catch (cause) {
        const message = cause instanceof PushError ? cause.message : 'No se pudieron desactivar los avisos. Comprueba tu conexión e inténtalo de nuevo.';
        if (mounted.current) setError(message);
        throw new Error(message);
      }
      const current = sessionRef.current;
      if (current?.user.id !== signingOutUserId || (current ? sessionFromAccessToken(current.user.id, current.access_token)?.sessionId : null) !== signingOutSessionId) throw new Error('La sesión cambió. Abre el menú con la cuenta actual.');
    }
    const result = await client().auth.signOut({ scope: 'local' }).catch(fail);
    if (result.error) fail(result.error);
    if (!sessionRef.current || sessionRef.current.user.id === signingOutUserId) acceptSession(null);
  }, [acceptSession, fail, ownerId]);

  const removeAccount = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) throw new Error('Inicia sesión con la cuenta que quieres eliminar.');
    const actorId = current.user.id;
    setError(null);
    // As when signing out, this phone stops receiving the account's notices before anything is deleted.
    try { await runBeforeSignOut(actorId); }
    catch (cause) { throw new Error(cause instanceof PushError ? cause.message : 'No se pudieron desactivar los avisos. Comprueba tu conexión e inténtalo de nuevo.'); }
    await deleteAccount(client(), { id: actorId, accessToken: current.access_token }, () => {
      if (!mounted.current || sessionRef.current?.user.id !== actorId) throw new Error('La sesión cambió. Abre los ajustes con la cuenta actual.');
    });
    // The account no longer exists on the server, so only the local session is left to clear.
    await client().auth.signOut({ scope: 'local' }).catch(() => {});
    if (!sessionRef.current || sessionRef.current.user.id === actorId) acceptSession(null);
  }, [acceptSession]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const normalizedEmail = validateEmail(email);
    setError(null);
    const result = await client().auth.resetPasswordForEmail(normalizedEmail, { redirectTo: authCallbackUrl(true) }).catch(fail);
    if (result.error) fail(result.error);
  }, [fail]);

  const updatePassword = useCallback(async (password: string) => {
    validateNewPassword(password);
    if (!sessionRef.current) throw new Error('Abre el enlace de recuperación para elegir una nueva contraseña.');
    setError(null);
    const result = await client().auth.updateUser({ password }).catch(fail);
    if (result.error) fail(result.error);
  }, [fail]);

  const user = session?.user ?? null;
  const matchingProfile = profile?.ownerId === user?.id ? profile : null;
  const metadataName = typeof user?.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : '';
  const displayName = (matchingProfile?.displayName || metadataName || 'Mi cuenta').slice(0, 80);
  const value = useMemo<AuthContextValue>(() => ({ ready, user, session, displayName, avatarUrl: matchingProfile?.avatarUrl ?? null, hasAvatar: !!matchingProfile?.avatarPath, profileReady: !!matchingProfile, isAdmin: matchingProfile?.isAdmin ?? false, error, signIn, signUp, signOut, deleteAccount: removeAccount, requestPasswordReset, updatePassword, refreshProfile, saveProfile }), [ready, user, session, displayName, matchingProfile, error, signIn, signUp, signOut, removeAccount, requestPasswordReset, updatePassword, refreshProfile, saveProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return context;
}
