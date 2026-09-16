import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ListingForm from '../components/ListingForm';
import { Button, Notice, PageTitle } from '../components/ui';
import type { Listing, ListingDraft } from '../domain/listings';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors } from '../theme';

export default function EditScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { ready, listings, saveListing, storageError } = useMarketplace();
  const listing = listings.find((item) => item.id === id);

  function cancel() {
    if (router.canGoBack()) router.back();
    else router.replace('/my-listings');
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <PageTitle title="Editar anuncio" back />
        {storageError ? <Notice error>{storageError}</Notice> : null}
      </View>

      {!ready ? (
        <View style={styles.loading} accessibilityLabel="Cargando anuncio local">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !listing ? (
        <Unavailable
          message="No encontramos este anuncio local. Puede haber sido eliminado o pertenecer a otra demostración."
          onBack={() => router.replace('/my-listings')}
        />
      ) : listing.owner !== 'local' ? (
        <Unavailable
          message="Los anuncios de ejemplo no se pueden editar. Crea uno nuevo para probar esta función."
          onBack={() => router.replace('/my-listings')}
        />
      ) : (
        <ListingForm
          key={listing.id}
          initialDraft={toDraft(listing)}
          submitLabel="Guardar cambios"
          onCancel={cancel}
          onSubmit={async (draft) => {
            await saveListing(draft, listing.id);
            router.dismissTo('/my-listings');
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Unavailable({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <View style={styles.unavailable}>
      <Notice error>{message}</Notice>
      <Button label="Volver a mis anuncios" secondary icon="arrow-back" onPress={onBack} />
    </View>
  );
}

function toDraft(listing: Listing): ListingDraft {
  return {
    title: listing.title,
    location: listing.location,
    province: listing.province,
    price: String(listing.price),
    bedrooms: String(listing.bedrooms),
    bathrooms: String(listing.bathrooms),
    area: String(listing.area),
    type: listing.type,
    description: listing.description,
    amenities: [...listing.amenities],
    imageKey: listing.imageKey,
    ...(listing.photoUri ? { photoUri: listing.photoUri } : {}),
  };
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  header: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  unavailable: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 16 },
});
