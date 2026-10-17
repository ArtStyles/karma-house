import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ListingForm from '../components/ListingForm';
import { AccountPrompt } from '../components/AccountPrompt';
import { useAuth } from '../auth/AuthProvider';
import { Button, Icon, IconButton, PageTitle, Notice, type IconName } from '../components/ui';
import { ArchImage } from '../components/ArchImage';
import { Cartel } from '../components/Cartel';
import { DraftPhoto } from '../components/ListingPhotos';
import { Mediopunto } from '../components/Mediopunto';
import { OperationGrid } from '../components/OperationGrid';
import { StateChip } from '../components/StateChip';
import { ASSISTED_PUBLICATION_EMAIL, openAssistedPublicationRequest } from '../lib/assistedPublication';
import { useMarketplace } from '../state/MarketplaceProvider';
import { createThemedStyles, formatMoney, layout, rounded, typography } from '../theme';
import type { ListingOperation } from '../domain/listingOptions';
import type { ListingDraft } from '../domain/listings';
import { publishedNumber } from '../domain/numericInput';
import { cartelLabel } from '../domain/operations';
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
  const [focused, setFocused] = useState(false);
  // The confirmation after sending belongs to that visit: leaving the tab clears it.
  const [sent, setSent] = useState<ListingDraft | null>(null);
  const lastSent = useRef<ListingDraft | null>(null);
  useFocusEffect(useCallback(() => { setFocused(true); return () => { setFocused(false); setSent(null); }; }, []));

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

  const back = <IconButton name={section === 'own' ? 'close' : 'arrow-back'} label="Volver a opciones" onPress={() => setSection('choose')} style={styles.round} />;

  if (sent) return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
    <SentNotice draft={sent} mode={mode === 'cloud' ? isOwner ? 'published' : 'review' : 'local'}
      onListings={() => { setSent(null); router.replace('/my-listings'); }} onExplore={() => { setSent(null); router.navigate('/'); }} />
  </SafeAreaView>;

  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
    <View style={styles.header}>
      {section === 'choose' || suspended ? <PageTitle title="Publicar" subtitle="Elige una operación para empezar." />
        : section === 'own' ? <View style={styles.topBar}>{back}</View>
        : <View style={styles.helpHeader}>{back}<Text accessibilityRole="header" style={styles.display}>Publicar con ayuda</Text><Text style={styles.lead}>Envíanos una solicitud por correo y preparamos el anuncio contigo, con tu autorización.</Text></View>}
    </View>
    {suspended ? <View style={styles.suspension}><Notice error>Tu cuenta está suspendida. No puedes publicar anuncios hasta que se reactive.</Notice></View> : <>
      {section === 'choose' && <ScrollView contentContainerStyle={styles.content}>
        {ownStarted ? <View style={styles.resume}>
          <Text accessibilityRole="header" style={styles.title}>Tu anuncio está empezado</Text>
          <Text style={styles.text}>Conservamos los datos y las fotos al volver a estas opciones.</Text>
          {currentOperation && <Cartel label={cartelLabel({ operation: currentOperation })} />}
          <Button label="Continuar anuncio" icon="create-outline" onPress={() => startOwn()} />
        </View> : <OperationGrid onPick={operation => startOwn(operation)} labelFor={(_, operation) => `Publicar anuncio de ${choices.find(item => item.operation === operation)!.label.toLocaleLowerCase('es')}`} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Pegar anuncio" onPress={() => startOwn(undefined, true)} style={({ pressed }) => [styles.paste, pressed && styles.pressed]}>
          <View style={styles.choiceCopy}><Text style={styles.pasteTitle}>Pegar anuncio</Text><Text style={styles.pasteText}>¿Ya lo tienes escrito? Pégalo y rellenamos el formulario.</Text></View>
          <View style={styles.pasteIcon}><Icon name="clipboard-outline" size={22} color={colors.onDark} /></View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Publicar con ayuda" onPress={() => setSection('help')} style={({ pressed }) => [styles.helpEntry, pressed && styles.pressed]}>
          <View style={styles.solIcon}><Icon name="mail-outline" size={20} color={colors.amber} /></View>
          <View style={styles.choiceCopy}><Text style={styles.helpKicker}>¿Prefieres ayuda?</Text><Text style={styles.helpTitle}>Publicar con ayuda de KarmaHouse</Text><Text style={styles.text}>Envíanos una solicitud por correo para preparar el anuncio contigo.</Text></View>
          <Icon name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      </ScrollView>}
      {section === 'help' && <ScrollView contentContainerStyle={styles.content}>
        {helpSteps.map(({ icon, text, sol }) => <View key={icon} style={styles.helpStep}>
          <View style={sol ? styles.solIcon : styles.blueIcon}><Icon name={icon} size={20} color={sol ? colors.amber : colors.primary} /></View>
          <Text style={styles.stepText}>{text}</Text>
        </View>)}
        <View style={styles.transfer}><Icon name="information-circle-outline" size={18} color={colors.muted} /><Text style={styles.transferText}>Si más adelante solicitas gestionar el anuncio desde tu cuenta, recibirás una invitación para aceptar o rechazar el traspaso. Se conservan el enlace, las fotos y los favoritos.</Text></View>
        <Button label="Preparar correo de solicitud" icon="mail-outline" loading={openingEmail} onPress={requestHelp} />
        <Text style={styles.text}>Se abrirá tu aplicación de correo con una plantilla. Completa los campos, adjunta tus fotos y revisa el mensaje antes de enviarlo.</Text>
        <Text selectable style={styles.email}>{ASSISTED_PUBLICATION_EMAIL}</Text>
        {emailError && <Notice error>No se pudo abrir una aplicación de correo. Puedes copiar esta dirección y escribir desde el correo que utilices.</Notice>}
        <Button label="Volver a opciones" secondary onPress={() => setSection('choose')} />
      </ScrollView>}
      {/* An opened form stays mounted across own/help/choose; identity changes remount it. */}
      {ownStarted && <View style={[styles.form, section !== 'own' && styles.hidden]} accessibilityElementsHidden={section !== 'own'} importantForAccessibility={section !== 'own' ? 'no-hide-descendants' : 'auto'}>
        {mode === 'cloud' && !authReady ? <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.text}>Comprobando tu cuenta…</Text></View> : mode === 'cloud' && !user ? <AccountPrompt returnTo={returnTo} title="Entra para publicar" description="Conservaremos la operación elegida para que prepares tu anuncio." /> : ready ? <ListingForm
          key={user?.id ?? 'demo'} initialOperation={initialOperation} importRequest={importRequest} active={focused && section === 'own'} onOperationChange={setFormOperation}
          draftStorageKey={mode === 'cloud' && user ? `karmahouse:draft:${user.id}:new` : undefined}
          cloud={mode === 'cloud'} submitLabel={mode === 'cloud' ? isOwner ? 'Publicar ahora' : 'Enviar a revisión' : 'Guardar anuncio'} directPublication={isOwner}
          onSubmit={async draft => { await saveListing(draft); lastSent.current = draft; }}
          onSaved={() => { setSection('choose'); setOwnStarted(false); setInitialOperation(undefined); setFormOperation(undefined); setImportRequest(0); setSent(lastSent.current); }}
        /> : <View style={styles.loading} accessibilityLabel="Cargando anuncios locales"><ActivityIndicator size="large" color={colors.primary} /></View>}
      </View>}
    </>}
  </SafeAreaView>;
}

const helpSteps: { icon: IconName; text: string; sol?: boolean }[] = [
  { icon: 'chatbubble-ellipses-outline', text: 'Cuéntanos si vendes, permutas, alquilas o buscas; incluye provincia, zona aproximada, características, precio y moneda o condiciones.' },
  { icon: 'images-outline', text: 'Adjunta fotos propias, individuales y nítidas si ofreces una vivienda. Si buscas, describe lo que necesitas.' },
  { icon: 'checkmark', text: 'Revisamos los datos contigo. La cuenta oficial necesita tu autorización expresa antes de publicar.', sol: true },
];

/** After sending: the finished mediopunto, the listing as a row and where to follow it. It promises no notification. */
function SentNotice({ draft, mode, onListings, onExplore }: { draft: ListingDraft; mode: 'review' | 'published' | 'local'; onListings(): void; onExplore(): void }) {
  const { colors, styles } = useStyles();
  const price = publishedNumber(draft.price);
  const copy = mode === 'review' ? { title: 'Tu anuncio está en revisión', text: 'Aparecerá en el catálogo cuando sea aprobado. Puedes seguir su estado en Mis anuncios.', tone: 'waiting' as const, chip: 'En revisión' }
    : mode === 'published' ? { title: 'Tu anuncio está publicado', text: 'Ya aparece en el catálogo. Puedes cambiarlo desde Mis anuncios.', tone: 'done' as const, chip: 'Publicado' }
    : { title: 'Anuncio guardado', text: 'Se guardó en este dispositivo, sin publicarse en internet.', tone: 'neutral' as const, chip: 'En este dispositivo' };
  return <ScrollView contentContainerStyle={styles.sent}>
    <View accessibilityRole="alert" style={styles.sentBody}>
      <Mediopunto width={200} />
      <Text accessibilityRole="header" style={[styles.display, styles.center]}>{copy.title}</Text>
      <Text style={[styles.lead, styles.center]}>{copy.text}</Text>
      <View style={styles.sentRow}>
        <ArchImage width={56} height={64} bottom={14} style={styles.sentThumb}>{draft.photoUri ? <DraftPhoto uri={draft.photoUri} label={draft.title} style={styles.fill} /> : <Icon name="home-outline" size={22} color={colors.muted} />}</ArchImage>
        <View style={styles.choiceCopy}><Text numberOfLines={2} style={styles.sentTitle}>{draft.title.trim()}</Text><Text style={styles.text}>{[price !== null ? formatMoney(price) : null, draft.operation ? cartelLabel({ operation: draft.operation }) : null].filter(Boolean).join(' · ')}</Text></View>
        <StateChip tone={copy.tone} label={copy.chip} />
      </View>
    </View>
    <View style={styles.sentActions}>
      <Button label="Ver mis anuncios" onPress={onListings} />
      <Button label="Volver a Explorar" secondary onPress={onExplore} />
    </View>
  </ScrollView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper }, header: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20 },
  topBar: { flexDirection: 'row', paddingTop: 8, paddingBottom: 4 }, round: { backgroundColor: colors.surface },
  helpHeader: { paddingTop: 8, paddingBottom: 8, gap: 8 }, display: { ...typography.displayLong, color: colors.ink, marginTop: 8 }, lead: { color: colors.body, fontSize: 16, lineHeight: 23 }, center: { textAlign: 'center' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 6, paddingBottom: layout.tabContentBottom, gap: 12 },
  choiceCopy: { flex: 1, gap: 3, minWidth: 0 },
  // «Pegar anuncio» is the one cream card: paper, not a button colour.
  paste: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingLeft: 18, paddingRight: 16, borderRadius: rounded.cardLg, backgroundColor: colors.cream },
  pasteTitle: { ...typography.cardTitle, color: colors.creamInk }, pasteText: { color: colors.creamInk, fontSize: 14, lineHeight: 19, opacity: .78 },
  pasteIcon: { width: 48, height: 48, borderRadius: rounded.pill, backgroundColor: colors.creamBlue, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: .8 },
  resume: { padding: 18, gap: 12, borderRadius: rounded.cardLg, backgroundColor: colors.surface },
  helpEntry: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: rounded.card, backgroundColor: colors.surface },
  solIcon: { width: 40, height: 40, borderRadius: rounded.pill, backgroundColor: colors.softAmber, alignItems: 'center', justifyContent: 'center' },
  blueIcon: { width: 40, height: 40, borderRadius: rounded.pill, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  helpKicker: { color: colors.muted, fontSize: 13, lineHeight: 18 }, helpTitle: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  helpStep: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: rounded.card, backgroundColor: colors.surface },
  stepText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21 },
  transfer: { flexDirection: 'row', gap: 10, padding: 16, borderRadius: rounded.inner, borderWidth: 1, borderColor: colors.border }, transferText: { flex: 1, color: colors.body, fontSize: 13, lineHeight: 19 },
  title: { ...typography.sheetTitle, color: colors.ink },
  text: { fontSize: 14, lineHeight: 21, color: colors.muted }, email: { fontSize: 16, lineHeight: 24, color: colors.primary, textAlign: 'center' },
  form: { flex: 1 }, hidden: { display: 'none' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }, suspension: { paddingHorizontal: 20 },
  sent: { flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 48, paddingBottom: layout.tabContentBottom, gap: 28, justifyContent: 'space-between' },
  sentBody: { alignItems: 'center', gap: 12 },
  sentRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 10, paddingRight: 14, borderRadius: rounded.card, backgroundColor: colors.surface },
  sentThumb: { backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }, fill: { width: '100%', height: '100%' },
  sentTitle: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' }, sentActions: { gap: 10 },
}));
