import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ListingForm from '../components/ListingForm';
import { AccountPrompt } from '../components/AccountPrompt';
import { useAuth } from '../auth/AuthProvider';
import { Button, PageTitle, Notice } from '../components/ui';
import { ASSISTED_PUBLICATION_EMAIL, openAssistedPublicationRequest } from '../lib/assistedPublication';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, layout } from '../theme';

export default function PublishScreen() {
  const { ready, saveListing, mode } = useMarketplace();
  const { user, isOwner, suspended } = useAuth();
  const [section, setSection] = useState<'choose' | 'own' | 'help'>('choose');
  const [ownStarted, setOwnStarted] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [openingEmail, setOpeningEmail] = useState(false);

  async function requestHelp() {
    setOpeningEmail(true);
    setEmailError(!await openAssistedPublicationRequest(Linking.openURL));
    setOpeningEmail(false);
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <PageTitle title="Publicar" subtitle={section === 'own' ? 'Publicar por mi cuenta · prepara tu anuncio paso a paso.' : 'Elige cómo preparar tu anuncio.'} />
        {section !== 'choose' && !suspended && <Button label="Cambiar opción de publicación" secondary onPress={() => setSection('choose')} style={styles.change} />}
      </View>
      {suspended ? <Notice error>Tu cuenta está suspendida. No puedes publicar anuncios hasta que se reactive.</Notice> : <>
      {section === 'choose' && <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Tu anuncio, a tu manera</Text>
          <Text style={styles.text}>Prepara los datos y las fotos de tu vivienda, o cuéntanos qué buscas.</Text>
          <Button label="Publicar por mi cuenta" icon="create-outline" onPress={() => { setOwnStarted(true); setSection('own'); }} />
          <Text style={styles.text}>Completa el formulario paso a paso. Si ya tienes el texto, usa «Pegar anuncio» y revísalo antes de enviarlo.</Text>
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Te ayudamos a prepararlo</Text>
          <Text style={styles.text}>Envíanos los datos por correo. Revisamos contigo el anuncio y te pedimos autorización antes de publicarlo.</Text>
          <Button label="Publicar con ayuda de KarmaHouse" icon="mail-outline" secondary onPress={() => setSection('help')} />
        </View>
      </ScrollView>}
      {section === 'help' && <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Publicar con ayuda de KarmaHouse</Text>
          <Text style={styles.text}>1. Cuéntanos si vendes, permutas, alquilas o buscas; incluye provincia, zona aproximada, características, precio y moneda o condiciones.</Text>
          <Text style={styles.text}>2. Adjunta fotos propias, individuales y nítidas si ofreces una vivienda. Si buscas, describe lo que necesitas.</Text>
          <Text style={styles.text}>3. Revisamos los datos contigo. La cuenta oficial necesita tu autorización expresa antes de publicar.</Text>
          <Text style={styles.text}>Si más adelante solicitas gestionar el anuncio desde tu cuenta, recibirás una invitación para aceptar o rechazar el traspaso. Se conservan el enlace, las fotos y los favoritos.</Text>
          <Button label="Preparar correo de solicitud" icon="mail-outline" loading={openingEmail} onPress={requestHelp} />
          <Text style={styles.text}>Se abrirá tu aplicación de correo con una plantilla. Completa los campos, adjunta tus fotos y revisa el mensaje antes de enviarlo.</Text>
          <Text selectable style={styles.email}>{ASSISTED_PUBLICATION_EMAIL}</Text>
          {emailError && <Notice error>No se pudo abrir una aplicación de correo. Puedes copiar esta dirección y escribir desde el correo que utilices.</Notice>}
        </View>
      </ScrollView>}
      {/* Keep an opened form mounted when changing options, preserving its draft and selected photos. */}
      {ownStarted && <View style={[styles.form, section !== 'own' && styles.hidden]} accessibilityElementsHidden={section !== 'own'} importantForAccessibility={section !== 'own' ? 'no-hide-descendants' : 'auto'}>
      {mode === 'cloud' && !user ? <AccountPrompt returnTo="/publish" title="Dale un lugar a tu vivienda" description="Crea tu cuenta para publicar una vivienda y seguir su revisión." /> : ready ? (
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
      </View>}
      </>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  header: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20 },
  change: { marginBottom: 12 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingBottom: layout.tabContentBottom, gap: 16 },
  card: { padding: 20, gap: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '600', color: colors.ink },
  text: { fontSize: 14, lineHeight: 22, color: colors.muted },
  email: { fontSize: 16, lineHeight: 24, color: colors.primary },
  form: { flex: 1 },
  hidden: { display: 'none' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
