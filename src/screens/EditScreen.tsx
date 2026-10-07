import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ListingForm from '../components/ListingForm';
import { useListing } from '../catalog/useCatalog';
import { useAuth } from '../auth/AuthProvider';
import { Button, goBack, Notice, PageTitle } from '../components/ui';
import type { Listing, ListingDraft } from '../domain/listings';
import { normalizeMapLocation } from '../domain/geo';
import { useMarketplace } from '../state/MarketplaceProvider';
import { createThemedStyles } from '../theme';
import {useListingManagement} from '../transfers/useListingManagement';

export default function EditScreen() {
  const { colors, styles } = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { saveListing, storageError, isOwnListing, mode, refresh } = useMarketplace();
  const { user, isOwner } = useAuth();
  const { listing, ready } = useListing(id);
  const management=useListingManagement(id);

  const cancel = () => goBack('/my-listings');

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <PageTitle title="Editar anuncio" back fallback="/my-listings" />
        {storageError ? <Notice error>{storageError}</Notice> : null}
      </View>

      {!ready||mode==='cloud'&&!management.ready ? (
        <View style={styles.loading} accessibilityLabel="Cargando anuncio local">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !listing ? (
        <Unavailable
          message="No encontramos este anuncio en tu cuenta. Vuelve a Mis anuncios para actualizar la lista."
          onBack={() => router.replace('/my-listings')}
        />
      ) : !isOwnListing(listing)||mode==='cloud'&&management.value?.managerId!==user?.id ? (
        <Unavailable
          message={management.error??'La gestión de este anuncio ya no está disponible para tu cuenta. Actualiza Mis anuncios.'}
          onBack={() => router.replace('/my-listings')}
        />
      ) : (
        <ListingForm
          key={`${user?.id ?? 'demo'}:${listing.id}`}
          initialDraft={toDraft(listing)}
          cloud={mode === 'cloud'}
          draftStorageKey={mode === 'cloud' && user ? `karmahouse:draft:${user.id}:${listing.id}` : undefined}
          submitLabel={mode === 'cloud' ? isOwner ? 'Guardar y publicar' : 'Guardar y enviar a revisión' : 'Guardar cambios'}
          directPublication={isOwner}
          onCancel={cancel}
          onReloadLatest={refresh}
          onSubmit={async (draft) => {
            if(mode==='cloud'){const current=await management.refresh();if(current?.managerId!==user?.id)throw Error('La gestión de este anuncio cambió. Actualiza Mis anuncios.');}
            await saveListing(draft, listing.id);
          }}
          onSaved={() => router.dismissTo('/my-listings')}
        />
      )}
    </SafeAreaView>
  );
}

function Unavailable({ message, onBack }: { message: string; onBack: () => void }) {
  const { styles } = useStyles();
  return (
    <View style={styles.unavailable}>
      <Notice error>{message}</Notice>
      <Button label="Volver a mis anuncios" secondary icon="arrow-back" onPress={onBack} />
    </View>
  );
}

export function toDraft(listing: Listing): ListingDraft {
  return {
    title: listing.title,
    location: listing.location,
    province: listing.province,
    mapLocation: listing.mapLocation ? normalizeMapLocation(listing.mapLocation) : undefined,
    price: String(listing.price),
    bedrooms: String(listing.bedrooms),
    bathrooms: listing.bathrooms === undefined ? '' : String(listing.bathrooms),
    area: listing.area === undefined ? '' : String(listing.area),
    condition: listing.condition ?? '',
    floor: listing.floor === undefined ? '' : String(listing.floor),
    priceNegotiable: listing.priceNegotiable ?? null,
    type: listing.type ?? '',
    operation: listing.operation,
    swapWants: listing.swap?.wants,
    swapProvinces: listing.swap?.provinces ? [...listing.swap.provinces] : undefined,
    swapBalance: listing.swap?.balance,
    swapAmount: listing.swap?.amount === undefined ? '' : String(listing.swap.amount),
    rentPeriod: listing.rent?.period,
    rentMinStay: listing.rent?.minStay === undefined ? '' : String(listing.rent.minStay),
    wantedOperations: listing.wantedOperations ? [...listing.wantedOperations] : undefined,
    description: listing.description,
    amenities: [...listing.amenities],
    imageKey: listing.imageKey,
    photos: listing.photos?.map(photo => ({ ...photo })),
    clientRequestId: listing.clientRequestId,
    expectedVersion: listing.version,
    ...(listing.photoUri ? { photoUri: listing.photoUri } : {}),
  };
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  header: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  unavailable: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 16 },
}));
