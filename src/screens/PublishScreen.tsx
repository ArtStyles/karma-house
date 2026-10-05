import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ListingForm from '../components/ListingForm';
import { AccountPrompt } from '../components/AccountPrompt';
import { useAuth } from '../auth/AuthProvider';
import { PageTitle, Notice } from '../components/ui';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors } from '../theme';

export default function PublishScreen() {
  const { ready, saveListing, mode } = useMarketplace();
  const { user, isOwner, suspended } = useAuth();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <PageTitle title="Publicar" subtitle="Publicar por mi cuenta · prepara tu anuncio paso a paso." />
      </View>
      {mode === 'cloud' && !user ? <AccountPrompt returnTo="/publish" title="Dale un lugar a tu vivienda" description="Crea tu cuenta para publicar una vivienda y seguir su revisión." /> : suspended ? <Notice error>Tu cuenta está suspendida. No puedes publicar anuncios hasta que se reactive.</Notice> : ready ? (
        <ListingForm
          key={user?.id ?? 'demo'}
          draftStorageKey={mode === 'cloud' && user ? `karmahouse:draft:${user.id}:new` : undefined}
          cloud={mode === 'cloud'}
          submitLabel={mode === 'cloud' ? isOwner ? 'Publicar ahora' : 'Enviar a revisión' : 'Guardar anuncio'}
          directPublication={isOwner}
          onSubmit={async (draft) => {
            await saveListing(draft);
          }}
          onSaved={() => router.replace('/my-listings')}
        />
      ) : (
        <View style={styles.loading} accessibilityLabel="Cargando anuncios locales">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  header: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
