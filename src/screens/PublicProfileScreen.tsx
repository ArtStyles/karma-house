import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { UserAvatar } from '../components/account/UserAvatar';
import { Mediopunto } from '../components/Mediopunto';
import { PropertyCard } from '../components/PropertyCard';
import { Sheet } from '../components/Sheet';
import { ActionGroup, Button, EmptyState, goBack, Icon, IconButton, Notice, type IconName } from '../components/ui';
import { levelDescription, levelLabel, memberSinceText, PROFILE_NOT_FOUND, responseText } from '../profiles/domain';
import { usePublicProfile } from '../profiles/usePublicProfile';
import { createThemedStyles, internalLayout, rounded, typography } from '../theme';

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  return <PublicProfileView data={usePublicProfile(id, { withListings: true })} isAdmin={auth.isAdmin} viewerId={auth.user?.id} />;
}

/** What a public profile shows, apart from where its data comes from. */
export function PublicProfileView({ data, isAdmin, viewerId }: { data: ReturnType<typeof usePublicProfile>; isAdmin: boolean; viewerId?: string }) {
  const { colors, styles } = useStyles();
  const { profile, avatarUrl, listings, loading, notFound, error, saving, saveError, retry, setVerified } = data;
  const { width } = useWindowDimensions();
  const [levelSheet, setLevelSheet] = useState(false);
  const [verifySheet, setVerifySheet] = useState(false);
  const [note, setNote] = useState('');
  const cellWidth = Math.floor((Math.min(width, internalLayout.maxWidth) - 32 - 14) / 2);
  async function confirmVerification() {
    if (!profile) return;
    if (await setVerified(!profile.verified, note)) { setVerifySheet(false); setNote(''); }
  }

  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.back}><IconButton name="chevron-back" label="Volver" onPress={() => goBack('/')} /></View>
      {notFound ? <EmptyState plain title={PROFILE_NOT_FOUND} description="Puede que la cuenta ya no tenga anuncios publicados o que se haya eliminado." action={<Button label="Volver a explorar" onPress={() => router.replace('/')} />} />
        : error ? <View style={styles.gap}><Notice error>{error}</Notice><Button label="Volver a cargar" secondary onPress={retry} /></View>
        : !profile ? <ActivityIndicator color={colors.primary} size="large" style={styles.loading} />
        : <>
          <View style={styles.identity}>
            <View style={styles.portrait}><UserAvatar arch size={96} avatarUrl={avatarUrl} name={profile.displayName} accessibilityLabel={`Foto de ${profile.displayName}`} /></View>
            <Text accessibilityRole="header" style={styles.name}>{profile.displayName}</Text>
            <Text style={styles.muted}>Información y anuncios de esta cuenta.</Text>
            {profile.verified && <View style={styles.badge}><Icon name="shield-checkmark-outline" size={16} color={colors.primary} /><Text style={styles.badgeText}>Perfil revisado por KarmaHouse</Text></View>}
            {profile.verified && <Text style={styles.disclaimer}>La insignia corresponde al perfil revisado por KarmaHouse. No acredita la titularidad ni la situación legal de una vivienda.</Text>}
          </View>
          {!profile.identityOnly && <Pressable accessibilityRole="button" accessibilityLabel={`Nivel ${levelLabel(profile.level)}. Ver qué significa`} onPress={() => setLevelSheet(true)} style={({ pressed }) => [styles.stats, pressed && { opacity: .8 }]}>
            <Stat value={levelLabel(profile.level)} label="Nivel" word />
            <Stat value={`${profile.activeListingCount}`} label="Anuncios activos" />
            <Stat value={`${new Date(profile.memberSince).getUTCFullYear()}`} label="En KarmaHouse" />
          </Pressable>}
          {!profile.identityOnly && <View style={styles.facts}>
            <Fact icon="calendar-outline" text={memberSinceText(profile.memberSince)} />
            {profile.responseMinutes !== null && <Fact icon="chatbubble-ellipses-outline" text={`${responseText(profile.responseMinutes)}${profile.responseRate !== null ? ` · responde al ${Math.round(profile.responseRate)} %` : ''}`} />}
            {profile.visitsAgreed > 0 && <Fact icon="walk-outline" text={profile.visitsAgreed === 1 ? '1 visita concertada' : `${profile.visitsAgreed} visitas concertadas`} />}
            <Fact icon="home-outline" text={profile.approvedListingCount === 1 ? '1 anuncio propio publicado y aprobado' : `${profile.approvedListingCount} anuncios propios publicados y aprobados`} />
          </View>}
          {!profile.identityOnly && isAdmin && viewerId !== profile.id && <Button label={profile.verified ? 'Quitar verificación' : 'Verificar'} secondary icon="shield-checkmark-outline" onPress={() => setVerifySheet(true)} />}
          {!profile.identityOnly && <><Text accessibilityRole="header" style={styles.section}>Sus anuncios{profile.activeListingCount ? ` · ${profile.activeListingCount}` : ''}</Text>
          {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} />
            : listings.length ? <View style={styles.grid}>{listings.map(listing => <PropertyCard key={listing.id} listing={listing} width={cellWidth} />)}</View>
            : <EmptyState plain title="Sin anuncios activos" description="Esta cuenta no tiene viviendas publicadas disponibles ahora." />}</>}
        </>}
    </ScrollView>
    {/* Explaining, not asking: a centred dialog with the lit window. */}
    {profile && <Modal visible={levelSheet} transparent animationType="fade" onRequestClose={() => setLevelSheet(false)}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => setLevelSheet(false)} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.dialog}><ScrollView contentContainerStyle={styles.dialogContent}>
          <Mediopunto width={56} ground={colors.surface} />
          <Text accessibilityRole="header" style={styles.dialogTitle}>{levelLabel(profile.level)}</Text>
          <Text style={styles.dialogText}>{levelDescription(profile.level)}</Text>
          {profile.levelReasons.length > 0 && <View style={styles.gap}>{profile.levelReasons.map(reason => <View key={reason} style={styles.reason}><Icon name="checkmark-circle" size={18} color={colors.primary} /><Text style={styles.reasonText}>{reason}</Text></View>)}</View>}
          <Text style={styles.note}>El nivel suma la antigüedad, los anuncios aprobados, las respuestas, las visitas concertadas y la verificación. Los reportes confirmados lo reducen.</Text>
          {profile.verified && <View style={styles.insignia}><Icon name="shield-checkmark-outline" size={16} color={colors.primary} /><Text style={styles.insigniaText}>La insignia corresponde al perfil revisado por KarmaHouse. No acredita la titularidad ni la situación legal de una vivienda.</Text></View>}
          <Button label="Entendido" onPress={() => setLevelSheet(false)} />
        </ScrollView></View>
      </View>
    </Modal>}
    {profile && <Sheet visible={verifySheet} onClose={() => { if (!saving) setVerifySheet(false); }} title={profile.verified ? 'Quitar verificación' : 'Verificar perfil'}>
      <Text style={styles.dialogText}>{profile.verified ? `${profile.displayName} dejará de mostrar la insignia «Perfil revisado por KarmaHouse».` : `${profile.displayName} mostrará la insignia «Perfil revisado por KarmaHouse».`}</Text>
      <View style={styles.gap}><Text style={styles.label}>Nota interna (opcional)</Text><TextInput accessibilityLabel="Nota interna (opcional)" value={note} onChangeText={setNote} multiline maxLength={500} editable={!saving} placeholder="Indica cómo se comprobó el perfil." placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.muted}>{note.length}/500 caracteres</Text></View>
      {saveError ? <Notice error>{saveError}</Notice> : null}
      <ActionGroup><Button label={profile.verified ? 'Quitar verificación' : 'Verificar'} loading={saving} onPress={() => void confirmVerification()} />
      <Button label="Cancelar" secondary disabled={saving} onPress={() => setVerifySheet(false)} /></ActionGroup>
    </Sheet>}
  </SafeAreaView>;
}

function Stat({ value, label, word = false }: { value: string; label: string; word?: boolean }) {
  const { styles } = useStyles();
  return <View style={styles.stat}><Text numberOfLines={1} style={word ? styles.statWord : styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  const { colors, styles } = useStyles();
  return <View style={styles.fact}><Icon name={icon} size={20} color={colors.primary} /><Text style={styles.factText}>{text}</Text></View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 32, gap: 18 },
  back: { paddingTop: 8 }, loading: { padding: 40 }, gap: { gap: 10 }, muted: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  identity: { alignItems: 'center', gap: 6 },
  // The lamp light, once on this screen.
  portrait: { borderTopLeftRadius: 48, borderTopRightRadius: 48, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, boxShadow: `0 0 50px ${colors.glow}`, marginBottom: 8 },
  name: { ...typography.display, color: colors.ink, textAlign: 'center' },
  badge: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 12, borderRadius: rounded.pill, backgroundColor: colors.softBlue },
  badgeText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  disclaimer: { maxWidth: 420, fontSize: 12, lineHeight: 17, color: colors.muted, textAlign: 'center' },
  stats: { flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 8, borderRadius: 26, backgroundColor: colors.surface },
  stat: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 }, statValue: { ...typography.numeralLg, color: colors.ink }, statWord: { ...typography.section, color: colors.ink, lineHeight: 34 }, statLabel: { ...typography.caption, color: colors.muted, textAlign: 'center' },
  facts: { backgroundColor: colors.surface, borderRadius: rounded.card, paddingHorizontal: 16 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, factText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21 },
  section: { ...typography.section, color: colors.ink, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, rowGap: 18 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', paddingHorizontal: 24 },
  dialog: { width: '100%', maxWidth: 460, maxHeight: '90%', alignSelf: 'center', backgroundColor: colors.surface, borderRadius: rounded.sheet, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.45)' },
  dialogContent: { paddingVertical: 26, paddingHorizontal: 22, gap: 12 },
  dialogTitle: { ...typography.sheetTitle, color: colors.ink }, note: { color: colors.muted, fontSize: 14, lineHeight: 20 }, dialogText: { color: colors.body, fontSize: 15, lineHeight: 22 },
  insignia: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 20, backgroundColor: colors.softBlue }, insigniaText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 10 }, reasonText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21 },
  label: { color: colors.body, fontSize: 13, fontWeight: '600' }, input: { minHeight: 96, backgroundColor: colors.surface, borderRadius: rounded.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, lineHeight: 21, color: colors.ink, textAlignVertical: 'top' },
}));
