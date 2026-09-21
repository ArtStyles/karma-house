import { useMemo, useReducer, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APPROXIMATE_RADIUS_METERS, normalizeMapLocation, type MapLocation } from '../../domain/geo';
import { colors } from '../../theme';
import { Button, Icon, IconButton, Pill } from '../ui';
import { KarmaMap } from './KarmaMap';
import { CUBA_CENTER, CUBA_ZOOM } from './mapConfig';
import { beginLocationSelection, locationSelectionReducer, publishedSelection } from './locationSelection';

interface LocationPickerProps {
  value?: MapLocation;
  onChange?: (value: MapLocation | undefined) => void;
  disabled?: boolean;
  error?: string;
  readOnly?: boolean;
}

export function LocationPicker({ value, onChange, disabled = false, error, readOnly = false }: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const published = useMemo(() => value ? normalizeMapLocation(value) : undefined, [value]);
  const markers = useMemo(() => published ? [{ id: 'location', coordinate: published, precision: published.precision }] : [], [published]);

  function openPicker() {
    Keyboard.dismiss();
    setOpen(true);
  }

  return <View style={styles.field}>
    <View style={styles.labelRow}>
      <Text style={styles.fieldTitle}>Ubicación en el mapa</Text>
      {!readOnly && <Text style={styles.optional}>Opcional</Text>}
    </View>
    {published ? <>
      <View style={styles.preview}>
        <KarmaMap center={published} zoom={published.precision === 'approximate' ? 13 : 15} markers={markers}
          interactive={false} accessibilityLabel={`Vista previa de ubicación ${published.precision === 'approximate' ? 'aproximada' : 'exacta'}`} />
      </View>
      <View style={styles.summary}>
        <Icon name={published.precision === 'approximate' ? 'shield-checkmark-outline' : 'location-outline'} size={19} color={colors.primary} />
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryTitle}>{published.precision === 'approximate' ? 'Ubicación aproximada' : 'Ubicación exacta'}</Text>
          <Text style={styles.description}>{published.precision === 'approximate' ? `Se mostrará esta zona, con un radio de ${APPROXIMATE_RADIUS_METERS} m.` : 'Se mostrará el punto que has elegido.'}</Text>
        </View>
      </View>
    </> : <Text style={styles.description}>{readOnly ? 'Sin ubicación en el mapa. Tu anuncio aparecerá en la lista de viviendas.' : 'Ayuda a encontrar tu vivienda. Puedes mostrar la zona aproximada o elegir un punto exacto.'}</Text>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!readOnly && <View style={styles.fieldActions}>
      <Button secondary icon="map-outline" label={published ? 'Cambiar ubicación' : 'Ubicar vivienda'} onPress={openPicker} disabled={disabled} style={styles.mainAction} />
      {published && <Pressable accessibilityRole="button" accessibilityLabel="Quitar ubicación del anuncio" disabled={disabled} onPress={() => onChange?.(undefined)} style={({ pressed }) => [styles.remove, (disabled || pressed) && styles.dimmed]}>
        <Text style={styles.removeText}>Quitar</Text>
      </Pressable>}
    </View>}
    {open && <LocationPickerModal value={published} onCancel={() => setOpen(false)} onConfirm={next => { onChange?.(next); setOpen(false); }} />}
  </View>;
}

function LocationPickerModal({ value, onCancel, onConfirm }: { value?: MapLocation; onCancel: () => void; onConfirm: (value: MapLocation | undefined) => void }) {
  const [selection, dispatch] = useReducer(locationSelectionReducer, value, beginLocationSelection);
  const published = useMemo(() => publishedSelection(selection), [selection]);
  const initialCenter = useRef(value ?? CUBA_CENTER);
  const initialZoom = useRef(value ? (value.precision === 'approximate' ? 13 : 15) : CUBA_ZOOM);
  const markers = useMemo(() => published ? [{ id: 'selection', coordinate: published, precision: published.precision }] : [], [published]);
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return <Modal transparent animationType="slide" onRequestClose={onCancel}>
    <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View accessibilityViewIsModal style={[styles.sheet, { maxHeight: Math.min(840, height - Math.max(insets.top, 12) - Math.max(insets.bottom, 12)) }, width >= 700 && styles.wideSheet]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.title}>Ubica tu vivienda</Text>
            {height >= 560 && <Text style={styles.description}>Acerca el mapa y toca para elegir el lugar.</Text>}
          </View>
          <IconButton name="close" label="Cancelar selección de ubicación" onPress={onCancel} style={styles.close} />
        </View>
        <View style={[styles.map, { minHeight: Math.min(150, height * 0.28) }]}>
          <KarmaMap style={{ flex: 1 }} center={initialCenter.current} zoom={initialZoom.current} markers={markers} selectedMarkerId="selection"
            onMapPress={coordinate => dispatch({ type: 'point', coordinate })}
            accessibilityLabel="Mapa para elegir la ubicación de tu vivienda" />
        </View>
        <ScrollView style={[styles.controls, { maxHeight: Math.min(304, height * 0.4) }]} contentContainerStyle={styles.controlsContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.controlTitle}>Cómo se verá en tu anuncio</Text>
          <View style={styles.precision}>
            <Pill label="Aproximada" icon="shield-checkmark-outline" active={selection.precision === 'approximate'} onPress={() => dispatch({ type: 'precision', precision: 'approximate' })} />
            <Pill label="Exacta" icon="location-outline" active={selection.precision === 'exact'} onPress={() => dispatch({ type: 'precision', precision: 'exact' })} />
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.description}>{!published ? 'Todavía no has elegido un punto. Toca el mapa para situarlo.' : selection.precision === 'approximate' ? `El círculo muestra la zona pública de ${APPROXIMATE_RADIUS_METERS} m de radio. El punto preciso que tocaste no se guarda.` : 'El marcador muestra el punto exacto que será visible para todos.'}</Text>
          <View style={styles.modalActions}>
            <Button label="Cancelar" secondary onPress={onCancel} style={styles.cancelAction} />
            <Button label={!published && value ? 'Confirmar sin ubicación' : 'Confirmar ubicación'} disabled={!published && !value} onPress={() => onConfirm(published)} style={styles.confirmAction} />
          </View>
          {published && <Pressable accessibilityRole="button" accessibilityLabel="Retirar punto del mapa" onPress={() => dispatch({ type: 'clear' })} style={({ pressed }) => [styles.clearPoint, pressed && styles.dimmed]}>
            <Icon name="trash-outline" color={colors.danger} size={16} />
            <Text style={styles.removeText}>Retirar punto</Text>
          </Pressable>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  field: { gap: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  fieldTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  optional: { fontSize: 12, color: colors.muted },
  description: { fontSize: 14, lineHeight: 20, color: colors.muted },
  preview: { height: 180, overflow: 'hidden', borderRadius: 14, backgroundColor: colors.paper },
  summary: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  summaryCopy: { flex: 1, gap: 4 },
  summaryTitle: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  fieldActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  mainAction: { flexGrow: 1 },
  remove: { minHeight: 44, minWidth: 62, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  removeText: { fontSize: 14, fontWeight: '500', color: colors.danger },
  dimmed: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17233170', paddingHorizontal: 12 },
  sheet: { flex: 1, width: '100%', borderRadius: 24, overflow: 'hidden', backgroundColor: colors.white },
  wideSheet: { width: 680 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  headerCopy: { flex: 1, gap: 5 },
  title: { fontSize: 21, fontWeight: '600', letterSpacing: -0.4, color: colors.ink },
  close: { backgroundColor: colors.paper },
  map: { flex: 1, minHeight: 150, backgroundColor: colors.paper },
  controls: { flexGrow: 0, maxHeight: 304 },
  controlsContent: { padding: 16, gap: 10 },
  controlTitle: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  precision: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: colors.paper, padding: 5, borderRadius: 24, alignSelf: 'flex-start' },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 },
  cancelAction: { flexGrow: 1, flexBasis: 110 },
  confirmAction: { flexGrow: 2, flexBasis: 190 },
  clearPoint: { flexDirection: 'row', gap: 6, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
