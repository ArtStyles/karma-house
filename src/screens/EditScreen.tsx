import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ListingForm from '../components/ListingForm';
import { useListing } from '../catalog/useCatalog';
import { useAuth } from '../auth/AuthProvider';
import { Button, Notice, PageTitle } from '../components/ui';
import type { Listing, ListingDraft } from '../domain/listings';
import { normalizeMapLocation } from '../domain/geo';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors } from '../theme';

export default function EditScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { saveListing, storageError, isOwnListing, mode, refresh } = useMarketplace();
  const { user } = useAuth();
  const { listing, ready } = useListing(id);

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
          message="No encontramos este anuncio en tu cuenta. Vuelve a Mis anuncios para actualizar la lista."
          onBack={() => router.replace('/my-listings')}
        />
      ) : !isOwnListing(listing) ? (
        <Unavailable
          message="Solo puedes editar tus propios anuncios."
          onBack={() => router.replace('/my-listings')}
        />
      ) : (
        <ListingForm
          key={`${user?.id ?? 'demo'}:${listing.id}`}
          initialDraft={toDraft(listing)}
          cloud={mode === 'cloud'}
          draftStorageKey={mode === 'cloud' && user ? `karmahouse:draft:${user.id}:${listing.id}` : undefined}
          submitLabel={mode === 'cloud' ? 'Guardar y enviar a revisión' : 'Guardar cambios'}
          onCancel={cancel}
          onReloadLatest={refresh}
          onSubmit={async (draft) => {
            await saveListing(draft, listing.id);
          }}
          onSaved={() => router.dismissTo('/my-listings')}
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
    mapLocation: listing.mapLocation ? normalizeMapLocation(listing.mapLocation) : undefined,
    price: String(listing.price),
    bedrooms: String(listing.bedrooms),
    bathrooms: String(listing.bathrooms),
    area: String(listing.area),
    condition: listing.condition ?? '',
    floor: listing.floor === undefined ? '' : String(listing.floor),
    priceNegotiable: listing.priceNegotiable ?? null,
    type: listing.type,
    description: listing.description,
    amenities: [...listing.amenities],
    imageKey: listing.imageKey,
    photos: listing.photos?.map(photo => ({ ...photo })),
    clientRequestId: listing.clientRequestId,
    expectedVersion: listing.version,
    ...(listing.photoUri ? { photoUri: listing.photoUri } : {}),
  };
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  header: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  unavailable: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 16 },
});
