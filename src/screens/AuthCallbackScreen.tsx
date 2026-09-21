import * as Linking from 'expo-linking';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { completeAuthCallback } from '../auth/completeCallback';
import { Button, Icon, Notice } from '../components/ui';
import { colors } from '../theme';

export default function AuthCallbackScreen() {
  const linkingUrl = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : linkingUrl;
    if (!url) return;
    setError(null);
    void completeAuthCallback(url).then(result => {
      if (!alive) return;
      // Replace removes email credentials from the browser URL and its current history entry.
      router.replace(result.recovery ? { pathname: '/auth', params: { mode: 'recovery' } } : result.returnTo as Href);
    }).catch(cause => {
      if (!alive) return;
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.replaceState(window.history.state, '', '/auth/callback');
      setError(cause instanceof Error ? cause.message : 'No se pudo verificar el enlace. Solicita uno nuevo.');
    });
    return () => { alive = false; };
  }, [linkingUrl]);

  return <SafeAreaView style={styles.safe}>
    <View style={styles.content}>
      <View style={styles.symbol}><Icon name={error ? 'key-outline' : 'mail-outline'} color={colors.primary} size={29} /></View>
      <Text accessibilityRole="header" style={styles.title}>{error ? 'Revisemos ese enlace' : 'Abriendo tu cuenta'}</Text>
      {error ? <><Notice error>{error}</Notice><Button label="Solicitar recuperación" onPress={() => router.replace({ pathname: '/auth', params: { mode: 'forgot' } })} /><Button label="Volver a entrar" secondary onPress={() => router.replace('/auth')} /></>
        : <><Text style={styles.copy}>Estamos verificando el enlace de tu correo.</Text><ActivityIndicator color={colors.primary} size="large" /></>}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: 20 },
  symbol: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700', letterSpacing: -.8 },
  copy: { color: colors.muted, fontSize: 16, lineHeight: 24, marginBottom: 12 },
});
