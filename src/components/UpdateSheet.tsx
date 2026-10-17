import { Image, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, rounded, typography } from '../theme';
import { formatReleaseDate, formatSize } from '../updates/release';
import { cancelUpdate, dismissUpdate, installUpdate, useAppUpdate } from '../updates/useAppUpdate';
import { ArchImage } from './ArchImage';
import { Sheet } from './Sheet';
import { Button, Icon, Notice } from './ui';

/** The new version's date, size and changes, before anything is downloaded. */
export function UpdateSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const { colors, styles } = useStyles();
  const { release, phase, percent, downloaded, error } = useAppUpdate();
  if (!release) return null;
  const size = formatSize(release.size);
  const verifying = phase === 'verifying';
  // Closing the sheet keeps a download going; the button in Mi espacio says so.
  return <Sheet visible={visible} onClose={onClose}>
    <View style={styles.heading}>
      <ArchImage width={56} height={64} bottom={14} style={styles.tile}>
        <Image source={require('../../assets/karmahouse-mark.png')} accessible={false} resizeMode="contain" style={styles.mark} />
      </ArchImage>
      <View style={styles.headingCopy}>
        <Text accessibilityRole="header" style={styles.title}>Hay una versión nueva</Text>
        <Text style={styles.muted}>KarmaHouse {release.version} · {formatReleaseDate(release.date)} · {size}</Text>
      </View>
    </View>
    {release.notes.length > 0 && <View style={styles.gap}>
      <Text style={styles.label}>Qué cambia</Text>
      {release.notes.map(note => <View key={note} style={styles.note}><View style={styles.bullet} /><Text style={styles.noteText}>{note}</Text></View>)}
    </View>}
    {phase === 'downloading' && <View accessible accessibilityRole="progressbar" accessibilityLabel="Descarga de la actualización" accessibilityValue={{ min: 0, max: 100, now: percent }} style={styles.gap}>
      <View style={styles.track}><View style={[styles.bar, { width: `${percent}%` }]} /></View>
      <Text style={styles.muted}>Descargando… {percent} % de {size}</Text>
    </View>}
    {downloaded && phase !== 'downloading' && <View style={styles.ready}><Icon name="checkmark" size={16} color={colors.green} /><Text style={styles.readyText}>Lista para instalar</Text></View>}
    <Text style={styles.muted}>Se instala encima de la versión que tienes. Android puede pedirte permiso para instalar desde KarmaHouse y un análisis de Play Protect.</Text>
    {error ? <Notice error>{error}</Notice> : null}
    {phase === 'downloading' ? <Button label="Cancelar descarga" secondary onPress={cancelUpdate} /> : <View style={styles.actions}>
      <Button label="Ahora no" secondary disabled={verifying} onPress={() => { dismissUpdate(); onClose(); }} style={styles.later} />
      <Button label={verifying ? 'Comprobando el archivo…' : downloaded ? 'Instalar' : `Descargar · ${size}`} loading={verifying} onPress={() => void installUpdate()} style={styles.install} />
    </View>}
  </Sheet>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4 }, headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  // The logo in white on the day blue, the only way it may sit on a dark ground (BRAND.md).
  tile: { backgroundColor: colors.creamBlue, alignItems: 'center', justifyContent: 'center' }, mark: { width: 33, height: 26, tintColor: colors.onDark },
  title: { ...typography.sheetTitle, color: colors.ink }, gap: { gap: 8 },
  label: { ...typography.cardTitle, color: colors.ink, marginTop: 4 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 9, backgroundColor: colors.sol },
  noteText: { flex: 1, color: colors.body, fontSize: 15, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  track: { height: 8, borderRadius: rounded.pill, backgroundColor: colors.softNeutral, overflow: 'hidden' }, bar: { height: 8, borderRadius: rounded.pill, backgroundColor: colors.sol },
  ready: { flexDirection: 'row', alignItems: 'center', gap: 6 }, readyText: { color: colors.green, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }, later: { flexGrow: 1, flexBasis: 110 }, install: { flexGrow: 2, flexBasis: 170 },
}));
