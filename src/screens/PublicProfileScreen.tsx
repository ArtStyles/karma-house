import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { UserAvatar } from '../components/account/UserAvatar';
import { PropertyCard } from '../components/PropertyCard';
import { Button, EmptyState, Icon, Notice, PageTitle, type IconName } from '../components/ui';
import { levelDescription, levelLabel, memberSinceText, PROFILE_NOT_FOUND, responseText } from '../profiles/domain';
import { usePublicProfile } from '../profiles/usePublicProfile';
import { colors } from '../theme';

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const { profile, avatarUrl, listings, loading, notFound, error, saving, saveError, retry, setVerified } = usePublicProfile(id, { withListings: true });
  const { width } = useWindowDimensions();
  const [levelSheet, setLevelSheet] = useState(false);
  const [verifySheet, setVerifySheet] = useState(false);
  const [note, setNote] = useState('');
  async function confirmVerification() {
    if (!profile) return;
    if (await setVerified(!profile.verified, note)) { setVerifySheet(false); setNote(''); }
  }

  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}>
      <PageTitle title="Perfil" back fallback="/" />
      {notFound ? <EmptyState icon="person-outline" title={PROFILE_NOT_FOUND} description="Puede que ya no tenga anuncios publicados en KarmaHouse." action={<Button label="Volver a explorar" onPress={() => router.replace('/')} />} />
        : error ? <View style={styles.gap}><Notice error>{error}</Notice><Button label="Volver a cargar" secondary onPress={retry} /></View>
        : !profile ? <ActivityIndicator color={colors.primary} size="large" style={styles.loading} />
        : <>
          <View style={styles.identity}>
            <UserAvatar size={76} avatarUrl={avatarUrl} name={profile.displayName} accessibilityLabel={`Foto de ${profile.displayName}`} />
            <View style={styles.identityCopy}>
              <Text accessibilityRole="header" style={styles.name}>{profile.displayName}</Text>
              {profile.verified && <View style={styles.verified}><Icon name="shield-checkmark" size={16} color={colors.green} /><Text style={styles.verifiedText}>Verificado por KarmaHouse</Text></View>}
              {!profile.identityOnly && <Pressable accessibilityRole="button" accessibilityLabel={`Nivel ${levelLabel(profile.level)}. Ver qué significa`} onPress={() => setLevelSheet(true)} style={({ pressed }) => [styles.level, pressed && { opacity: .7 }]}>
                <Icon name="sparkles-outline" size={15} color={colors.primary} /><Text style={styles.levelText}>{levelLabel(profile.level)}</Text><Icon name="information-circle-outline" size={15} color={colors.primary} />
              </Pressable>}
            </View>
          </View>
          {profile.verified && <Notice>La insignia corresponde al perfil revisado por KarmaHouse. No acredita la titularidad ni la situación legal de una vivienda.</Notice>}
          {!profile.identityOnly && <View style={styles.facts}>
            <Fact icon="calendar-outline" text={memberSinceText(profile.memberSince)} />
            {profile.responseMinutes !== null && <Fact icon="chatbubble-ellipses-outline" text={`${responseText(profile.responseMinutes)}${profile.responseRate !== null ? ` · responde al ${Math.round(profile.responseRate)} %` : ''}`} />}
            {profile.visitsAgreed > 0 && <Fact icon="walk-outline" text={profile.visitsAgreed === 1 ? '1 visita concertada' : `${profile.visitsAgreed} visitas concertadas`} />}
            <Fact icon="home-outline" text={profile.approvedListingCount === 1 ? '1 anuncio propio publicado y aprobado' : `${profile.approvedListingCount} anuncios propios publicados y aprobados`} />
          </View>}
          {!profile.identityOnly && auth.isAdmin && auth.user?.id !== profile.id && <Button label={profile.verified ? 'Quitar verificación' : 'Verificar'} secondary icon="shield-checkmark-outline" onPress={() => setVerifySheet(true)} />}
          {!profile.identityOnly && <><Text accessibilityRole="header" style={styles.section}>Sus anuncios{profile.activeListingCount ? ` · ${profile.activeListingCount}` : ''}</Text>
          {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} />
            : listings.length ? <View style={styles.grid}>{listings.map(listing => <View key={listing.id} style={{ width: width >= 720 ? '48.8%' : '100%' }}><PropertyCard listing={listing} /></View>)}</View>
            : <Text style={styles.muted}>Ahora no tiene anuncios activos.</Text>}</>}
        </>}
    </ScrollView>
    {profile && <Modal visible={levelSheet} transparent animationType="fade" onRequestClose={() => setLevelSheet(false)}>
      <View style={styles.backdrop}><View accessibilityViewIsModal style={styles.sheet}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>{levelLabel(profile.level)}</Text>
        <Text style={styles.sheetText}>{levelDescription(profile.level)}</Text>
        {profile.levelReasons.length > 0 && <View style={styles.gap}>{profile.levelReasons.map(reason => <View key={reason} style={styles.reason}><Icon name="checkmark-circle" size={18} color={colors.primary} /><Text style={styles.reasonText}>{reason}</Text></View>)}</View>}
        <Text style={styles.muted}>El nivel suma la antigüedad, los anuncios aprobados, las respuestas, las visitas concertadas y la verificación. Los reportes confirmados lo reducen.</Text>
        <Button label="Entendido" onPress={() => setLevelSheet(false)} />
      </View></View>
    </Modal>}
    {profile && <Modal visible={verifySheet} transparent animationType="fade" onRequestClose={() => !saving && setVerifySheet(false)}>
      <View style={styles.backdrop}><View accessibilityViewIsModal style={styles.sheet}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>{profile.verified ? 'Quitar verificación' : 'Verificar perfil'}</Text>
        <Text style={styles.sheetText}>{profile.verified ? `${profile.displayName} dejará de mostrar la insignia «Verificado por KarmaHouse».` : `${profile.displayName} mostrará la insignia «Verificado por KarmaHouse».`}</Text>
        <TextInput accessibilityLabel="Nota interna (opcional)" value={note} onChangeText={setNote} multiline maxLength={500} editable={!saving} placeholder="Nota interna (opcional): cómo se comprobó." placeholderTextColor={colors.muted} style={styles.input} />
        {saveError ? <Notice error>{saveError}</Notice> : null}
        <Button label={profile.verified ? 'Quitar verificación' : 'Verificar'} loading={saving} onPress={() => void confirmVerification()} />
        <Button label="Cancelar" secondary disabled={saving} onPress={() => setVerifySheet(false)} />
      </View></View>
    </Modal>}
  </SafeAreaView>;
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  return <View style={styles.fact}><Icon name={icon} size={20} color={colors.primary} /><Text style={styles.factText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 32, gap: 18 },
  loading: { padding: 40 }, gap: { gap: 10 }, muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.white, borderRadius: 26, padding: 20 },
  identityCopy: { flex: 1, minWidth: 0, gap: 8, alignItems: 'flex-start' },
  name: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -.5 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.softGreen, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  verifiedText: { color: colors.green, fontSize: 13, fontWeight: '600' },
  level: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.softBlue, borderRadius: 14, paddingHorizontal: 12, minHeight: 32 },
  levelText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  facts: { backgroundColor: colors.white, borderRadius: 24, padding: 20, gap: 16 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 12 }, factText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21 },
  section: { color: colors.ink, fontSize: 17, fontWeight: '600', letterSpacing: -.2, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: '2%', rowGap: 24 },
  backdrop: { flex: 1, backgroundColor: '#00000055', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: colors.white, borderRadius: 28, padding: 24, gap: 16 },
  sheetTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -.5 }, sheetText: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 10 }, reasonText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21 },
  input: { minHeight: 96, backgroundColor: colors.paper, borderRadius: 16, padding: 15, fontSize: 16, lineHeight: 23, color: colors.ink, textAlignVertical: 'top' },
});
