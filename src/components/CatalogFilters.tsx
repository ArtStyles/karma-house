import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeFilterCount, defaultFilters, filterRangeError, type ListingFilters } from '../domain/listings';
import { AMENITIES, CONDITIONS, PROVINCES } from '../domain/listingOptions';
import { normalizeDecimalInput } from '../domain/numericInput';
import { colors } from '../theme';
import { Button, Icon, IconButton, Notice, Pill } from './ui';
import { SelectionField } from './SelectionField';

export const SORT_OPTIONS = [
  { value: 'recent', label: 'Más recientes' }, { value: 'price-asc', label: 'Menor precio' },
  { value: 'price-desc', label: 'Mayor precio' }, { value: 'area-desc', label: 'Mayor superficie' },
] as const;

/** Mounted only while open, so dismissing never mutates the applied catalogue. */
export function CatalogFilters({ filters, total, onApply, onClose }: { filters: ListingFilters; total: number; onApply(next: ListingFilters): void; onClose(): void }) {
  const [draft, setDraft] = useState<ListingFilters>(() => ({ ...filters, amenities: [...(filters.amenities ?? [])] }));
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const change = (next: Partial<ListingFilters>) => setDraft(old => ({ ...old, ...next }));
  const error = filterRangeError(draft);
  // The count is the server total for the applied filters; an invalid range still shows none.
  const count = error ? 0 : total;
  const selectedCount = activeFilterCount({ ...draft, query: '' });
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.overlay, width >= 700 && { justifyContent: 'center' }, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancelar filtros" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.header}><View style={styles.headerIcon}><Icon name="options-outline" color={colors.primary} size={23} /></View><View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>Tu búsqueda, a medida</Text><Text style={styles.subtitle}>{selectedCount ? `${selectedCount} ${selectedCount === 1 ? 'filtro seleccionado' : 'filtros seleccionados'}` : 'Elige lo que importa para tu hogar'}</Text></View><IconButton name="close" label="Cerrar filtros sin aplicar" onPress={onClose} style={{ backgroundColor: colors.paper }} /></View>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content}>
            {!!draft.query && <View style={styles.query}><Icon name="search-outline" size={17} color={colors.primary} /><Text style={styles.queryText}>Buscando «{draft.query}»</Text></View>}
            <View style={styles.section}><Text style={styles.sectionTitle}>Vivienda y ubicación</Text>
              <View style={styles.choices}>{(['Todas', 'Casa', 'Apartamento'] as const).map(type => <Pill key={type} label={type} active={draft.type === type} onPress={() => change({ type })} />)}</View>
              <SelectionField inline label="Provincia" value={draft.province ?? ''} options={[{ value: '', label: 'Todas las provincias' }, ...PROVINCES.map(value => ({ value, label: value }))]} onChange={province => change({ province })} />
            </View>
            <View style={styles.section}><Text style={styles.sectionTitle}>Tu presupuesto</Text>
              <RangeFields label="Precio" unit="USD" min={draft.minPrice ?? ''} max={draft.maxPrice} onMin={minPrice => change({ minPrice })} onMax={maxPrice => change({ maxPrice })} />
              <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.switchTitle}>Solo precio negociable</Text><Text style={styles.help}>Indicado por quien publica la vivienda.</Text></View><Switch accessibilityLabel="Solo precio negociable" value={draft.negotiableOnly ?? false} onValueChange={negotiableOnly => change({ negotiableOnly })} trackColor={{ false: '#DADEE5', true: colors.primary }} thumbColor={colors.white} /></View>
            </View>
            <View style={styles.section}><Text style={styles.sectionTitle}>Espacio para ti</Text>
              <Text style={styles.label}>Habitaciones · mínimo</Text><View style={styles.choices}>{[0, 1, 2, 3, 4, 5].map(n => <Pill key={n} label={n ? `${n}+` : 'Todas'} accessibilityLabel={n ? `Mínimo ${n} habitaciones` : 'Cualquier número de habitaciones'} active={draft.minBedrooms === n} onPress={() => change({ minBedrooms: n })} />)}</View>
              <Text style={styles.label}>Baños · mínimo</Text><View style={styles.choices}>{[0, 1, 2, 3, 4].map(n => <Pill key={n} label={n ? `${n}+` : 'Todos'} accessibilityLabel={n ? `Mínimo ${n} baños` : 'Cualquier número de baños'} active={(draft.minBathrooms ?? 0) === n} onPress={() => change({ minBathrooms: n })} />)}</View>
              <RangeFields label="Superficie" unit="m²" min={draft.minArea ?? ''} max={draft.maxArea ?? ''} onMin={minArea => change({ minArea })} onMax={maxArea => change({ maxArea })} />
            </View>
            <View style={styles.section}><SelectionField inline label="Estado de conservación" value={draft.condition ?? ''} options={[{ value: '', label: 'Cualquier estado' }, ...CONDITIONS]} onChange={condition => change({ condition: condition as ListingFilters['condition'] })} />
              <Text style={styles.sectionTitle}>Esos detalles que suman</Text><Text style={styles.help}>La vivienda debe tener todas las comodidades que elijas.</Text>
              <View style={styles.choices}>{AMENITIES.map(amenity => <Pill key={amenity} label={amenity} icon={draft.amenities?.includes(amenity) ? 'checkmark-circle' : 'add-outline'} active={draft.amenities?.includes(amenity)} onPress={() => change({ amenities: draft.amenities?.includes(amenity) ? draft.amenities.filter(item => item !== amenity) : [...(draft.amenities ?? []), amenity] })} />)}</View>
            </View>
            <View style={styles.section}><SelectionField inline label="Ordenar por" value={draft.sort} options={SORT_OPTIONS} onChange={sort => change({ sort: sort as ListingFilters['sort'] })} /></View>
          </ScrollView>
          <View style={styles.footer}>
            {error ? <Notice error>{error}</Notice> : <Text accessibilityLiveRegion="polite" style={styles.resultText}>{count === 1 ? '1 vivienda coincide con tu búsqueda' : `${count} viviendas coinciden con tu búsqueda`}</Text>}
            <View style={styles.actions}><Button secondary label="Limpiar" onPress={() => setDraft({ ...defaultFilters, query: filters.query, amenities: [] })} style={styles.clear} /><Button disabled={!!error} label={`Ver ${count} ${count === 1 ? 'vivienda' : 'viviendas'}`} onPress={() => { if (!error) { onApply(draft); onClose(); } }} style={styles.apply} /></View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function RangeFields({ label, unit, min, max, onMin, onMax }: { label: string; unit: string; min: string; max: string; onMin(value: string): void; onMax(value: string): void }) {
  return <View style={styles.range}><Text style={styles.label}>{label} · {unit}</Text><View style={styles.rangeRow}>
    <View style={styles.rangeField}><Text style={styles.rangeCaption}>Desde</Text><TextInput accessibilityLabel={`${label} mínimo en ${unit}`} value={min} onChangeText={text => onMin(normalizeDecimalInput(text))} placeholder="Sin mínimo" placeholderTextColor={colors.muted} keyboardType="decimal-pad" inputMode="decimal" style={styles.input} /></View>
    <View style={styles.rangeField}><Text style={styles.rangeCaption}>Hasta</Text><TextInput accessibilityLabel={`${label} máximo en ${unit}`} value={max} onChangeText={text => onMax(normalizeDecimalInput(text))} placeholder="Sin máximo" placeholderTextColor={colors.muted} keyboardType="decimal-pad" inputMode="decimal" style={styles.input} /></View>
  </View></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, overlay: { flex: 1, backgroundColor: '#14283D66', paddingHorizontal: 12, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 640, maxHeight: '100%', flexShrink: 1, alignSelf: 'center', borderRadius: 28, backgroundColor: colors.white, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: '#EDF0F5' }, headerIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' }, heading: { flex: 1, gap: 5 }, title: { fontSize: 20, fontWeight: '700', letterSpacing: -.5, color: colors.ink }, subtitle: { fontSize: 12, lineHeight: 17, color: colors.muted },
  scroll: { flexShrink: 1 }, content: { padding: 20, gap: 24 }, section: { gap: 13, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: '#EDF0F5' }, sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '600', letterSpacing: -.25 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, backgroundColor: '#F5F6F8', borderRadius: 18, padding: 6 }, label: { color: colors.ink, fontSize: 14, fontWeight: '600' }, help: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  range: { gap: 10 }, rangeRow: { flexDirection: 'row', gap: 10 }, rangeField: { flex: 1, minWidth: 0, backgroundColor: '#F5F6F8', borderRadius: 15, borderWidth: 1, borderColor: '#E5EAF0', paddingTop: 11, paddingHorizontal: 13 }, rangeCaption: { fontSize: 11, color: colors.muted }, input: { color: colors.ink, fontSize: 16, minHeight: 43, minWidth: 0, width: '100%' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4 }, switchCopy: { flex: 1, gap: 5 }, switchTitle: { fontSize: 14, color: colors.ink, fontWeight: '500' },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, padding: 16, gap: 12 }, resultText: { fontSize: 12, color: colors.muted, textAlign: 'center' }, actions: { flexDirection: 'row', gap: 10 }, clear: { flexShrink: 1 }, apply: { flex: 1 },
  query: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: colors.softBlue, borderRadius: 13 }, queryText: { flex: 1, fontSize: 13, color: colors.primary, lineHeight: 19 },
});
