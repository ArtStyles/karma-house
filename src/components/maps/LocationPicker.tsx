import { useMemo, useReducer, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APPROXIMATE_RADIUS_METERS, normalizeMapLocation, type MapLocation } from '../../domain/geo';
import { createThemedStyles, rounded, typography } from '../../theme';
import { Segmented } from '../Segmented';
import { SheetHandle } from '../Sheet';
import { Button, Icon, IconButton } from '../ui';
import { MapOnDemand } from '../ExploreMap';
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
  const { colors, styles } = useStyles();
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
      {/* Under «Ahorro de datos» the preview waits to be asked for, like every map in the app. */}
      <View style={styles.preview}><MapOnDemand height={160}>
        <KarmaMap center={published} zoom={published.precision === 'approximate' ? 13 : 15} markers={markers}
          interactive={false} accessibilityLabel={`Vista previa de ubicación ${published.precision === 'approximate' ? 'aproximada' : 'exacta'}`} />
      </MapOnDemand></View>
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
  const { colors, styles } = useStyles();
  const [selection, dispatch] = useReducer(locationSelectionReducer, value, beginLocationSelection);
  const published = useMemo(() => publishedSelection(selection), [selection]);
  const initialCenter = useRef(value ?? CUBA_CENTER);
  const initialZoom = useRef(value ? (value.precision === 'approximate' ? 13 : 15) : CUBA_ZOOM);
  const markers = useMemo(() => published ? [{ id: 'selection', coordinate: published, precision: published.precision }] : [], [published]);
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return <Modal transparent animationType="slide" onRequestClose={onCancel}>
    <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 12) }]}>
      <View accessibilityViewIsModal style={[styles.sheet, { maxHeight: Math.min(840, height - Math.max(insets.top, 12)) }, width >= 700 && styles.wideSheet]}>
        <SheetHandle />
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
        <ScrollView style={[styles.controls, { maxHeight: Math.min(304, height * 0.4) }]} contentContainerStyle={[styles.controlsContent, { paddingBottom: insets.bottom + 16 }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.controlTitle}>Cómo se verá en tu anuncio</Text>
          <Segmented<'approximate' | 'exact'> label="Precisión de la ubicación" value={selection.precision} onChange={precision => dispatch({ type: 'precision', precision })}
            options={[{ value: 'approximate', label: 'Aproximada' }, { value: 'exact', label: 'Exacta' }]} />
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

const useStyles = createThemedStyles(colors => StyleSheet.create({
  field: { gap: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  fieldTitle: { color: colors.body, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  optional: { fontSize: 12, color: colors.muted },
  description: { fontSize: 14, lineHeight: 20, color: colors.muted },
  preview: { height: 160, overflow: 'hidden', borderRadius: rounded.cardLg, backgroundColor: colors.sheet },
  summary: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', paddingHorizontal: 4 },
  summaryCopy: { flex: 1, gap: 2 },
  summaryTitle: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  fieldActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  mainAction: { flexGrow: 1 },
  remove: { minHeight: 44, minWidth: 62, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  removeText: { fontSize: 14, fontWeight: '600', color: colors.danger },
  dimmed: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  // A tall bottom sheet: the map fills it and the choice of precision sits below (DESIGN.md §6).
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: { flex: 1, width: '100%', borderTopLeftRadius: rounded.sheet, borderTopRightRadius: rounded.sheet, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.sheet },
  wideSheet: { width: 680 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  title: { ...typography.sheetTitle, color: colors.ink },
  close: { backgroundColor: colors.surface },
  map: { flex: 1, minHeight: 150, marginHorizontal: 12, borderRadius: rounded.card, overflow: 'hidden', backgroundColor: colors.paper },
  controls: { flexGrow: 0, maxHeight: 304 },
  controlsContent: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  controlTitle: { ...typography.cardTitle, color: colors.ink },
  // The confirmation takes the wider share so its label stays on one line; at 320 px the two stack.
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 2 },
  cancelAction: { flexGrow: 1, flexBasis: 110 },
  confirmAction: { flexGrow: 2, flexBasis: 190 },
  clearPoint: { flexDirection: 'row', gap: 6, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
}));
