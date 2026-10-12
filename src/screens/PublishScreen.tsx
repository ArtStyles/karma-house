import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ListingForm from '../components/ListingForm';
import { AccountPrompt } from '../components/AccountPrompt';
import { useAuth } from '../auth/AuthProvider';
import { Button, Icon, PageTitle, Notice, type IconName } from '../components/ui';
import { ASSISTED_PUBLICATION_EMAIL, openAssistedPublicationRequest } from '../lib/assistedPublication';
import { useMarketplace } from '../state/MarketplaceProvider';
import { createThemedStyles, layout } from '../theme';
import { OPERATIONS, type ListingOperation } from '../domain/listingOptions';
import { publicationReturnTo, readPublicationEntry } from '../domain/publicationEntry';

const choices: { operation: ListingOperation; label: string; icon: IconName }[] = [
  { operation: 'sale', label: 'Venta', icon: 'pricetag-outline' },
  { operation: 'swap', label: 'Permuta', icon: 'swap-horizontal-outline' },
  { operation: 'rent', label: 'Alquiler', icon: 'key-outline' },
  { operation: 'wanted', label: 'Búsqueda', icon: 'search-outline' },
];

export default function PublishScreen() {
  const { colors, styles } = useStyles();
  const { ready, saveListing, mode } = useMarketplace();
  const { ready: authReady, user, isOwner, suspended } = useAuth();
  const params = useLocalSearchParams<{ operation?: string; import?: string }>();
  const routeEntry = readPublicationEntry(params);
  const [section, setSection] = useState<'choose' | 'own' | 'help'>(routeEntry.operation || routeEntry.import ? 'own' : 'choose');
  const [ownStarted, setOwnStarted] = useState(Boolean(routeEntry.operation || routeEntry.import));
  const [initialOperation, setInitialOperation] = useState(routeEntry.operation);
  const [formOperation, setFormOperation] = useState<ListingOperation>();
  const [importRequest, setImportRequest] = useState(routeEntry.import ? 1 : 0);
  const [emailError, setEmailError] = useState(false);
  const [openingEmail, setOpeningEmail] = useState(false);

  // An auth return or cold link restores intent only; it never submits an announcement.
  useEffect(() => {
    const entry = readPublicationEntry(params);
    if (!entry.operation && !entry.import) return;
    setInitialOperation(entry.operation); setOwnStarted(true); setSection('own');
    if (entry.import) setImportRequest(value => value + 1);
  }, [params.operation, params.import]);

  function startOwn(operation?: ListingOperation, paste = false) {
    if (!ownStarted) setInitialOperation(operation);
    setOwnStarted(true); setSection('own');
    if (paste) setImportRequest(value => value + 1);
  }
  async function requestHelp() {
    setOpeningEmail(true);
    setEmailError(!await openAssistedPublicationRequest(Linking.openURL));
    setOpeningEmail(false);
  }
  const currentOperation = formOperation ?? initialOperation;
  const returnTo = publicationReturnTo({ operation: currentOperation, import: importRequest > 0 });

  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
    <View style={styles.header}>
      <PageTitle title="Publicar" subtitle={section === 'choose' ? 'Elige una operación para empezar.' : section === 'own' ? 'Vivienda · Detalles · Revisar' : 'Prepara una solicitud por correo.'} />
      {section !== 'choose' && !suspended && <Button label="Volver a opciones" icon="chevron-back" secondary onPress={() => setSection('choose')} style={styles.change} />}
    </View>
    {suspended ? <View style={styles.suspension}><Notice error>Tu cuenta está suspendida. No puedes publicar anuncios hasta que se reactive.</Notice></View> : <>
      {section === 'choose' && <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Por mi cuenta</Text>
        {ownStarted ? <View style={styles.resume}>
          <Text accessibilityRole="header" style={styles.title}>Tu anuncio está empezado</Text>
          <Text style={styles.text}>Conservamos los datos y las fotos al volver a estas opciones.</Text>
          <Button label="Continuar anuncio" icon="create-outline" onPress={() => startOwn()} />
          {currentOperation && <Text style={styles.text}>{OPERATIONS.find(item => item.value === currentOperation)?.label}</Text>}
        </View> : <View style={styles.group}>
          {choices.map(({ operation, label, icon }) => <Pressable key={operation} accessibilityRole="button" accessibilityLabel={`Publicar anuncio de ${label.toLocaleLowerCase('es')}`} onPress={() => startOwn(operation)} style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
            <Icon name={icon} size={22} color={colors.primary} />
            <View style={styles.choiceCopy}><Text style={styles.choiceTitle}>{label}</Text><Text style={styles.choiceText}>{OPERATIONS.find(item => item.value === operation)?.description}</Text></View>
            <Icon name="chevron-forward" size={17} color={colors.muted} />
          </Pressable>)}
        </View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Pegar anuncio" onPress={() => startOwn(undefined, true)} style={({ pressed }) => [styles.paste, pressed && styles.pressed]}>
          <Icon name="clipboard-outline" size={22} color={colors.primary} />
          <View style={styles.choiceCopy}><Text style={styles.choiceTitle}>Pegar anuncio</Text><Text style={styles.choiceText}>Revisa el texto antes de enviarlo.</Text></View>
          <Icon name="chevron-forward" size={17} color={colors.muted} />
        </Pressable>
        <View style={styles.helpEntry}>
          <Text accessibilityRole="header" style={styles.helpTitle}>¿Prefieres ayuda?</Text>
          <Text style={styles.text}>Envíanos una solicitud por correo para preparar el anuncio contigo.</Text>
          <Button label="Publicar con ayuda" icon="mail-outline" secondary onPress={() => setSection('help')} style={styles.helpAction} />
        </View>
      </ScrollView>}
      {section === 'help' && <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.helpBody}>
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
      {/* An opened form stays mounted across own/help/choose; identity changes remount it. */}
      {ownStarted && <View style={[styles.form, section !== 'own' && styles.hidden]} accessibilityElementsHidden={section !== 'own'} importantForAccessibility={section !== 'own' ? 'no-hide-descendants' : 'auto'}>
        {mode === 'cloud' && !authReady ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.text}>Comprobando tu cuenta…</Text></View> : mode === 'cloud' && !user ? <AccountPrompt returnTo={returnTo} title="Entra para publicar" description="Conservaremos la operación elegida para que prepares tu anuncio." /> : ready ? <ListingForm
          key={user?.id ?? 'demo'} initialOperation={initialOperation} importRequest={importRequest} active={section === 'own'} onOperationChange={setFormOperation}
          draftStorageKey={mode === 'cloud' && user ? `karmahouse:draft:${user.id}:new` : undefined}
          cloud={mode === 'cloud'} submitLabel={mode === 'cloud' ? isOwner ? 'Publicar ahora' : 'Enviar a revisión' : 'Guardar anuncio'} directPublication={isOwner}
          onSubmit={async draft => { await saveListing(draft); }}
          onSaved={() => { setSection('choose'); setOwnStarted(false); setInitialOperation(undefined); setFormOperation(undefined); setImportRequest(0); router.replace('/my-listings'); }}
        /> : <View style={styles.loading} accessibilityLabel="Cargando anuncios locales"><ActivityIndicator size="large" color={colors.primary} /></View>}
      </View>}
    </>}
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper }, header: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20 },
  change: { marginBottom: 12, alignSelf: 'flex-start' }, content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 6, paddingBottom: layout.tabContentBottom, gap: 16 },
  sectionLabel: { color: colors.muted, fontSize: 13, fontWeight: '500', marginLeft: 4 },
  group: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 74, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  choiceCopy: { flex: 1, gap: 4, minWidth: 0 }, choiceTitle: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '500' },
  choiceText: { color: colors.muted, fontSize: 13, lineHeight: 19 }, paste: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 74, padding: 16, backgroundColor: colors.surface, borderRadius: 16 },
  pressed: { backgroundColor: colors.softBlue }, resume: { padding: 18, gap: 12, borderRadius: 16, backgroundColor: colors.surface },
  helpEntry: { paddingTop: 12, gap: 10 }, helpTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '600' }, helpAction: { alignSelf: 'flex-start', marginTop: 3 },
  helpBody: { gap: 18, paddingTop: 10 }, title: { fontSize: 21, lineHeight: 28, fontWeight: '600', letterSpacing: -.3, color: colors.ink },
  text: { fontSize: 14, lineHeight: 22, color: colors.muted }, email: { fontSize: 16, lineHeight: 24, color: colors.primary },
  form: { flex: 1 }, hidden: { display: 'none' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }, suspension: { paddingHorizontal: 20 },
}));
