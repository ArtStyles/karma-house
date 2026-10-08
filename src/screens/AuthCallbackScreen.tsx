import * as Linking from 'expo-linking';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { completeAuthCallback } from '../auth/completeCallback';
import { pendingIntentStore } from '../auth/pendingIntentStorage';
import { pendingIntentReturnTo } from '../auth/pendingIntent';
import { Button, Icon, Notice } from '../components/ui';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/useAgencyWorkspace';
import {recoverAgencyRegistration} from '../agencies/registration';
import {agencyError} from '../agencies/domain';
import { createThemedStyles } from '../theme';

export default function AuthCallbackScreen() {
  const { colors, styles } = useStyles();
  const auth=useAuth();const workspace=useAgencyWorkspace();
  const [destination,setDestination]=useState<string|null>(null);
  const linkingUrl = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : linkingUrl;
    if (!url) return;
    setError(null);
    void completeAuthCallback(url).then(async result => {
      const intent = result.recovery ? null : await pendingIntentStore.read();
      if (!alive) return;
      // Remove single-use email credentials before any server application lookup.
      if(Platform.OS==='web'&&typeof window!=='undefined')window.history.replaceState(window.history.state,'','/auth/callback');
      if(result.recovery)router.replace({pathname:'/auth',params:{mode:'recovery'}});
      else setDestination(pendingIntentReturnTo(intent,result.returnTo,true));
    }).catch(cause => {
      if (!alive) return;
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.replaceState(window.history.state, '', '/auth/callback');
      setError(cause instanceof Error ? cause.message : 'No se pudo verificar el enlace. Solicita uno nuevo.');
    });
    return () => { alive = false; };
  }, [linkingUrl]);

  useEffect(()=>{
    if(!destination||!auth.ready||!auth.user||!workspace.ready)return;
    if(auth.user.user_metadata.registration_intent!=='agency'){router.replace(destination as Href);return;}
    if(!workspace.repository)return;
    let active=true;const context=workspace.captureAccountContext();
    void recoverAgencyRegistration(workspace.repository,context,'agency').then(route=>{context.checkpoint();if(active)router.replace(route);}).catch(cause=>{try{context.checkpoint();if(active)setError(agencyError(cause));}catch{}}).finally(()=>context.release());
    return ()=>{active=false;};
  },[destination,auth.ready,auth.user?.id,workspace.ready,workspace.repository,workspace.captureAccountContext]);

  return <SafeAreaView style={styles.safe}>
    <View style={styles.content}>
      <View style={styles.symbol}><Icon name={error ? 'key-outline' : 'mail-outline'} color={colors.primary} size={29} /></View>
      <Text accessibilityRole="header" style={styles.title}>{error ? 'Revisemos ese enlace' : 'Abriendo tu cuenta'}</Text>
      {error ? <><Notice error>{error}</Notice><Button label="Solicitar recuperación" onPress={() => router.replace({ pathname: '/auth', params: { mode: 'forgot' } })} /><Button label="Volver a entrar" secondary onPress={() => router.replace('/auth')} /></>
        : <><Text style={styles.copy}>Estamos verificando el enlace de tu correo.</Text><ActivityIndicator color={colors.primary} size="large" /></>}
    </View>
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: 20 },
  symbol: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700', letterSpacing: -.8 },
  copy: { color: colors.muted, fontSize: 16, lineHeight: 24, marginBottom: 12 },
}));
