import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ListingForm from '../components/ListingForm';
import { Notice, PageTitle } from '../components/ui';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors } from '../theme';

export default function PublishScreen() {
  const { ready, saveListing, storageError } = useMarketplace();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <PageTitle title="Publicar" />
        {storageError ? <Notice error>{storageError}</Notice> : null}
      </View>
      {ready ? (
        <ListingForm
          submitLabel="Guardar anuncio"
          onSubmit={async (draft) => {
            await saveListing(draft);
            router.replace('/my-listings');
          }}
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
