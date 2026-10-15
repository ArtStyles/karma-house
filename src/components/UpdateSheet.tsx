import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createThemedStyles, internalLayout } from '../theme';
import { formatReleaseDate, formatSize } from '../updates/release';
import { cancelUpdate, dismissUpdate, installUpdate, useAppUpdate } from '../updates/useAppUpdate';
import { ActionGroup, Button, Icon, Notice } from './ui';

/** The new version's date, size and changes, before anything is downloaded. */
export function UpdateSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const { colors, styles } = useStyles();
  const insets = useSafeAreaInsets();
  const { release, phase, percent, downloaded, error } = useAppUpdate();
  if (!release) return null;
  const size = formatSize(release.size);
  const verifying = phase === 'verifying';
  // Closing the sheet keeps a download going; the row in Mi espacio shows its progress.
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
      <View accessibilityViewIsModal style={styles.sheet}><ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>KarmaHouse {release.version}</Text>
          <Text style={styles.muted}>{formatReleaseDate(release.date)} · {size}</Text>
        </View>
        {release.notes.length > 0 && <View style={styles.gap}>
          <Text style={styles.label}>Qué cambia</Text>
          {release.notes.map(note => <View key={note} style={styles.note}><Icon name="checkmark-circle-outline" size={18} color={colors.primary} /><Text style={styles.noteText}>{note}</Text></View>)}
        </View>}
        <Text style={styles.muted}>Se instala encima de la versión que tienes. Android puede pedirte permiso para instalar desde KarmaHouse y un análisis de Play Protect.</Text>
        {phase === 'downloading' && <View accessible accessibilityRole="progressbar" accessibilityLabel="Descarga de la actualización" accessibilityValue={{ min: 0, max: 100, now: percent }} style={styles.gap}>
          <View style={styles.track}><View style={[styles.bar, { width: `${percent}%` }]} /></View>
          <Text style={styles.muted}>Descargando… {percent} % de {size}</Text>
        </View>}
        {error ? <Notice error>{error}</Notice> : null}
        {phase === 'downloading' ? <Button label="Cancelar descarga" secondary onPress={cancelUpdate} /> : <ActionGroup>
          <Button label={verifying ? 'Comprobando el archivo…' : downloaded ? 'Instalar' : `Descargar · ${size}`} icon={downloaded ? undefined : 'cloud-download-outline'} loading={verifying} onPress={() => void installUpdate()} />
          <Button label="Ahora no" secondary disabled={verifying} onPress={() => { dismissUpdate(); onClose(); }} />
        </ActionGroup>}
      </ScrollView></View>
    </View>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.photoOverlay, justifyContent: 'center', paddingHorizontal: 20 },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '100%', alignSelf: 'center', backgroundColor: colors.surface, borderRadius: internalLayout.radius, overflow: 'hidden' },
  content: { padding: 20, gap: 18 }, heading: { gap: 4 }, gap: { gap: 10 },
  title: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -.5 },
  label: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, noteText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.softBlue, overflow: 'hidden' }, bar: { height: 6, borderRadius: 3, backgroundColor: colors.primaryFill },
}));
