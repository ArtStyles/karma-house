import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import {
  emptyDraft,
  validateDraft,
  type DraftValidation,
  type ListingDraft,
} from '../domain/listings';
import { colors, formatMoney, layout, typefaces } from '../theme';
import { createDraftPersistence, draftToken, hasDraftVersionConflict, restoreDraft } from '../domain/draftPersistence';
import { draftStorage } from '../data/draftStorage';
import { ListingPhotos } from './ListingPhotos';
import { LocationPicker } from './maps/LocationPicker';
import { normalizeMapLocation } from '../domain/geo';
import { Button, Icon, Notice, Pill } from './ui';
import { SelectionField } from './SelectionField';
import { AMENITIES, CONDITIONS, PROVINCES } from '../domain/listingOptions';
import { normalizeDecimalInput, publishedNumber } from '../domain/numericInput';

type DraftErrors = DraftValidation['errors'];

export interface ListingFormProps {
  initialDraft?: ListingDraft;
  submitLabel?: string;
  onSubmit(draft: ListingDraft): Promise<void>;
  onSaved?: () => void;
  onCancel?: () => void;
  onReloadLatest?: () => Promise<void>;
  cloud?: boolean;
  draftStorageKey?: string;
}

const stepFields: (keyof ListingDraft)[][] = [
  ['title', 'type', 'location', 'province', 'mapLocation'],
  ['price', 'bedrooms', 'bathrooms', 'area', 'condition', 'floor', 'priceNegotiable', 'description', 'amenities', 'photoUri', 'photos'],
  [],
];

/** The names the seller reads on screen, so a validation summary names fields they can find. */
const fieldLabels: Partial<Record<keyof ListingDraft, string>> = {
  title: 'Título del anuncio', type: 'Tipo de vivienda', location: 'Zona o barrio', province: 'Provincia',
  mapLocation: 'Ubicación en el mapa', price: 'Precio en USD', bedrooms: 'Habitaciones', bathrooms: 'Baños',
  area: 'Superficie', condition: 'Estado de conservación', floor: 'Planta de acceso',
  priceNegotiable: 'Precio negociable', description: 'Descripción', amenities: 'Comodidades',
  photos: 'Fotos', photoUri: 'Fotos',
};

const roomOptions = Array.from({ length: 20 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }));
const floorOptions = [{ value: '', label: 'Sin especificar' }, ...Array.from({ length: 100 }, (_, value) => ({ value: String(value), label: value === 0 ? 'Planta baja' : `Planta ${value}` }))];

export function ListingForm({
  initialDraft,
  submitLabel = 'Guardar anuncio',
  onSubmit,
  onSaved,
  onCancel,
  onReloadLatest,
  cloud = false,
  draftStorageKey,
}: ListingFormProps) {
  const [draft, setDraft] = useState<ListingDraft>(() => ({ ...cloneDraft(initialDraft ?? emptyDraft), clientRequestId: initialDraft?.clientRequestId ?? draftToken() }));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [hydrated, setHydrated] = useState(!draftStorageKey);
  const [draftError, setDraftError] = useState('');
  const [readFailed, setReadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [discardRequested, setDiscardRequested] = useState(false);
  const [savedWarning, setSavedWarning] = useState('');
  const completed = useRef(false);
  const submitLock = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const mounted = useRef(true);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRef = useRef(draft);
  const latestRef = useRef(initialDraft);
  latestRef.current = initialDraft;
  const persistence = useMemo(() => draftStorageKey ? createDraftPersistence(draftStorage, draftStorageKey) : null, [draftStorageKey]);
  const versionConflict = hasDraftVersionConflict(draft, initialDraft);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [step]);

  useEffect(() => {
    let active = true;
    if (!persistence) return;
    setReadFailed(false); setHydrated(false);
    persistence.read().then(raw => {
      if (active) { setDraft(restoreDraft(raw, latestRef.current ?? initialRef.current)); setDraftError(''); setHydrated(true); }
    }).catch(() => { if (active) { setReadFailed(true); setDraftError('No pudimos recuperar el borrador guardado. Vuelve a intentarlo para conservar tus cambios.'); } });
    return () => { active = false; };
  }, [persistence, loadAttempt]);

  useEffect(() => {
    if (!persistence || !hydrated || completed.current || versionConflict || submitting || reloading) return;
    autosaveTimer.current = setTimeout(() => {
      if (completed.current) return;
      void persistence.write(draft).then(() => { if (mounted.current) setDraftError(''); }).catch(() => { if (mounted.current) setDraftError('No pudimos guardar el borrador en este dispositivo. Comprueba el espacio disponible y vuelve a intentarlo.'); });
    }, 250);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [draft, persistence, hydrated, versionConflict, submitting, reloading]);

  async function discardAndReload() {
    if (reloading || submitting) return;
    setReloading(true); setSubmitError(null);
    try {
      await onReloadLatest?.();
      if (mounted.current) setDiscardRequested(true);
    } catch { if (mounted.current) { setSubmitError('No pudimos cargar la versión actual. Tu borrador se conserva.'); setReloading(false); } }
  }

  useEffect(() => {
    if (!discardRequested || !latestRef.current) return;
    let active = true;
    const next = cloneDraft(latestRef.current);
    void (persistence?.write(next) ?? Promise.resolve()).then(() => {
      if (active) { setDraft(next); setErrors({}); setSubmitError(null); setDraftError(''); setStep(0); }
    }).catch(() => { if (active) setSubmitError('No pudimos guardar la versión actual en este dispositivo. Tu borrador anterior se conserva.'); })
      .finally(() => { if (active) { setDiscardRequested(false); setReloading(false); } });
    return () => { active = false; };
  }, [discardRequested, persistence]);

  const selectedAmenities = useMemo(() => new Set(draft.amenities), [draft.amenities]);
  const stepIssues = [...new Set(stepFields[step].filter((field) => errors[field]).map((field) => fieldLabels[field] ?? field))];
  const publishedPrice = publishedNumber(draft.price);
  const publishedArea = publishedNumber(draft.area);

  function changeField<K extends keyof ListingDraft>(field: K, value: ListingDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setSubmitError(null);
  }

  function validateCurrentStep(): boolean {
    const result = validateDraft(draft);
    if (cloud && !(draft.photos?.length)) result.errors.photos = 'Añade al menos una foto real de tu vivienda.';
    const currentFields = stepFields[step];
    const currentErrors = Object.fromEntries(
      currentFields
        .filter((field) => result.errors[field])
        .map((field) => [field, result.errors[field]]),
    ) as DraftErrors;

    if (Object.keys(currentErrors).length === 0) return true;
    // The summary sits with the buttons that were just tapped; jumping to the top hid the error.
    setErrors((previous) => ({ ...previous, ...currentErrors }));
    return false;
  }

  function nextStep() {
    if (!validateCurrentStep()) return;
    setStep((current) => Math.min(current + 1, 2));
  }

  async function submit() {
    if (submitLock.current || !hydrated || photoBusy || versionConflict || savedWarning) return;

    const result = validateDraft(draft);
    if (cloud && !(draft.photos?.length)) result.errors.photos = 'Añade al menos una foto real de tu vivienda.';
    if (Object.keys(result.errors).length) {
      setErrors(result.errors);
      const firstInvalidStep = stepFields.findIndex((fields) =>
        fields.some((field) => Boolean(result.errors[field])),
      );
      setStep(firstInvalidStep >= 0 ? firstInvalidStep : 0);
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setSubmitError(null);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    try {
      if (persistence) await persistence.write(draft);
      await onSubmit(cloneDraft(draft));
      completed.current = true;
      const cleaned = persistence ? await persistence.complete() : true;
      if (!mounted.current) return;
      if (!initialDraft) {
        persistence?.beginNext();
        setDraft({ ...cloneDraft(emptyDraft), clientRequestId: draftToken() });
        setStep(0);
        setErrors({});
      }
      if (!initialDraft) completed.current = false;
      if (cleaned) onSaved?.();
      else setSavedWarning('El anuncio se guardó y se envió a revisión. No pudimos limpiar el borrador de este dispositivo; no necesitas volver a enviarlo.');
    } catch (error) {
      if (mounted.current) setSubmitError(readError(error, 'No pudimos guardar el anuncio. Tu borrador sigue disponible para reintentar.'));
    } finally {
      submitLock.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  function toggleAmenity(value: string) {
    const next = selectedAmenities.has(value)
      ? draft.amenities.filter((item) => item !== value)
      : [...draft.amenities, value];
    changeField('amenities', next);
  }

  if (!hydrated) return <View style={{ padding: 24, gap: 16 }}><Notice error={readFailed}>{readFailed ? draftError : 'Recuperando tu borrador…'}</Notice>{readFailed && <Button label="Volver a cargar el borrador" onPress={() => setLoadAttempt(value => value + 1)} />}</View>;
  if (savedWarning) return <View style={{ padding: 24, gap: 16 }}><Notice>{savedWarning}</Notice><Button label="Ir a mis anuncios" onPress={() => { setSavedWarning(''); onSaved?.(); }} /></View>;
  if (versionConflict || reloading) return <View style={{ padding: 24, gap: 16 }}>
    <Notice>Este anuncio cambió desde que empezaste tu borrador. Tus cambios siguen guardados. Puedes descartar este borrador y cargar la versión actual para editarla.</Notice>
    {submitError && <Notice error>{submitError}</Notice>}
    <Button label="Descartar borrador y cargar versión actual" loading={reloading} onPress={discardAndReload} />
    {onCancel && <Button label="Volver sin descartar" secondary disabled={reloading} onPress={onCancel} />}
  </View>;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
      style={styles.flex}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formShell}>
          <View style={styles.steps} accessibilityLabel={`Paso ${step + 1} de 3`}>
            {['Vivienda', 'Detalles', 'Revisar'].map((label, index) => (
              <View key={label} style={styles.stepItem}>
                <View style={[styles.stepDot, index <= step && styles.stepDotActive]}>
                  {index < step ? (
                    <Icon name="checkmark" size={12} color={colors.white} />
                  ) : (
                    <Text style={[styles.stepNumber, index <= step && styles.stepNumberActive]}>
                      {index + 1}
                    </Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, index === step && styles.stepLabelActive]}>{label}</Text>
              </View>
            ))}
          </View>

          {submitError ? <Notice error>{submitError}</Notice> : null}
          {submitError && onReloadLatest && <Button label="Actualizar anuncio sin perder el borrador" secondary loading={reloading} onPress={async () => { setReloading(true); try { await onReloadLatest(); } catch { /* Existing error remains visible. */ } finally { if (mounted.current) setReloading(false); } }} />}
          {draftError ? <Notice error>{draftError}</Notice> : null}

          {step === 0 ? (
            <View style={styles.section}>
              <SectionHeading
                title="Sobre la vivienda"
                description="Una ubicación clara ayuda a encontrar tu vivienda. Los campos con * son obligatorios."
              />
              <View style={styles.fieldCard}>
                <Field
                  label="Título del anuncio"
                  required
                  placeholder="Ej. Casa luminosa cerca del malecón"
                  value={draft.title}
                  onChangeText={(value) => changeField('title', value)}
                  error={errors.title}
                  maxLength={100}
                  autoCapitalize="sentences"
                  returnKeyType="next"
                />

                <ChoiceField label="Tipo de vivienda" error={errors.type}>
                  <Pill
                    label="Casa"
                    icon="home-outline"
                    active={draft.type === 'Casa'}
                    onPress={() => changeField('type', 'Casa')}
                  />
                  <Pill
                    label="Apartamento"
                    icon="business-outline"
                    active={draft.type === 'Apartamento'}
                    onPress={() => changeField('type', 'Apartamento')}
                  />
                </ChoiceField>
              </View>
              <View style={styles.fieldCard}>
                <Field
                  label="Zona o barrio"
                  required
                  placeholder="Ej. Vedado"
                  value={draft.location}
                  onChangeText={(value) => changeField('location', value)}
                  error={errors.location}
                  maxLength={80}
                />
                <SelectionField
                  label="Provincia"
                  required
                  placeholder="Selecciona la provincia"
                  value={draft.province}
                  options={[...PROVINCES.map(value => ({ value, label: value })), ...(draft.province && !PROVINCES.some(value => value === draft.province) ? [{ value: draft.province, label: `${draft.province} · valor guardado` }] : [])]}
                  onChange={(value) => changeField('province', value)}
                  error={errors.province}
                />
                <Text style={styles.fieldHint}>Indica el barrio o reparto. Puedes señalar la ubicación aproximada en el mapa sin publicar la dirección exacta.</Text>
              </View>
              <View style={styles.fieldCard}>
                <LocationPicker value={draft.mapLocation} onChange={value => changeField('mapLocation', value)} disabled={submitting} error={errors.mapLocation} />
              </View>
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.section}>
              <SectionHeading
                title="Los detalles"
                description="Cuantos más detalles, más fácil será encontrarla con los filtros."
              />
              {/* Photos are required in the cloud, so they open the step instead of closing it. */}
              <View style={styles.fieldCard}>
                <ListingPhotos required={cloud} photos={draft.photos ?? []} busy={photoBusy} disabled={submitting} onBusy={setPhotoBusy}
                  onChange={photos => {
                    changeField('photos', photos);
                    changeField('photoUri', photos[0]?.uri);
                  }}
                  onError={message => setErrors(current => ({ ...current, photos: message }))} />
                {errors.photos || errors.photoUri ? <FieldError message={errors.photos ?? errors.photoUri!} /> : null}
              </View>
              <View style={styles.fieldCard}>
                <View style={styles.previewGroup}>
                  <Field
                    label="Precio en USD"
                    required
                    placeholder="85000"
                    value={draft.price}
                    onChangeText={(value) => changeField('price', normalizeDecimalInput(value))}
                    error={errors.price}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                  />
                  {/* A thousands separator turns «85.000» into 85; the seller has to see that first. */}
                  {publishedPrice !== null ? <Text style={styles.publishNote}>Se publicará como {formatMoney(publishedPrice)} USD</Text> : null}
                </View>

                <View style={styles.fieldGrid}>
                  <View style={styles.gridField}>
                    <SelectionField
                      label="Habitaciones"
                      required
                      placeholder="Seleccionar"
                      value={draft.bedrooms}
                      options={roomOptions}
                      onChange={(value) => changeField('bedrooms', value)}
                      error={errors.bedrooms}
                    />
                  </View>
                  <View style={styles.gridField}>
                    <SelectionField
                      label="Baños"
                      required
                      placeholder="Seleccionar"
                      value={draft.bathrooms}
                      options={roomOptions}
                      onChange={(value) => changeField('bathrooms', value)}
                      error={errors.bathrooms}
                    />
                  </View>
                  <View style={[styles.gridField, styles.previewGroup]}>
                    <Field
                      label="Superficie (m²)"
                      required
                      placeholder="120"
                      value={draft.area}
                      onChangeText={(value) => changeField('area', normalizeDecimalInput(value))}
                      error={errors.area}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                    />
                    {publishedArea !== null ? <Text style={styles.publishNote}>Se publicará como {publishedArea} m²</Text> : null}
                  </View>
                </View>

                <SelectionField label="Precio negociable" value={draft.priceNegotiable == null ? '' : draft.priceNegotiable ? 'yes' : 'no'} options={[{ value: '', label: 'Sin especificar' }, { value: 'yes', label: 'Sí, acepto negociar' }, { value: 'no', label: 'No, precio fijo' }]} onChange={value => changeField('priceNegotiable', value === '' ? null : value === 'yes')} error={errors.priceNegotiable} />
                <SelectionField label="Estado de conservación" value={draft.condition ?? ''} options={[{ value: '', label: 'Sin especificar' }, ...CONDITIONS]} onChange={value => changeField('condition', value as ListingDraft['condition'])} error={errors.condition} hint="Describe el estado actual, no las reformas que se podrían hacer." />
                <SelectionField label="Planta de acceso" value={draft.floor ?? ''} options={floorOptions} onChange={value => changeField('floor', value)} error={errors.floor} hint="La planta donde se encuentra la entrada de la vivienda. Opcional." />

                <Field
                  label="Descripción"
                  required
                  placeholder="Cuenta cómo se distribuyen los espacios, su iluminación y ventilación, el suministro de agua y las reformas realizadas."
                  value={draft.description}
                  onChangeText={(value) => changeField('description', value)}
                  error={errors.description}
                  maxLength={2000}
                  multiline
                  textAlignVertical="top"
                  inputStyle={styles.descriptionInput}
                />
                <View style={styles.descriptionHelp}><Icon name="bulb-outline" size={18} color={colors.primary} /><Text style={styles.fieldHint}>Incluye detalles que no se vean en las fotos. Evita repetir el precio o publicar datos personales.</Text></View>
                <Text style={styles.characterCount}>{draft.description.length}/2000 caracteres</Text>
              </View>

              <View style={styles.fieldCard}>
                <ChoiceField label="Comodidades (opcional)" error={errors.amenities}>
                  {Array.from(new Set([...AMENITIES, ...draft.amenities])).map((item) => (
                    <Pill
                      key={item}
                      label={item}
                      active={selectedAmenities.has(item)}
                      onPress={() => toggleAmenity(item)}
                    />
                  ))}
                </ChoiceField>
              </View>

            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.section}>
              <SectionHeading
                title="Revisa tu anuncio"
                description="Podrás editarlo después desde Mi espacio."
              />
              {draft.photoUri ? (
                <Image source={{ uri: draft.photoUri }} style={styles.reviewPhoto} resizeMode="cover" />
              ) : (
                <View style={styles.reviewPhotoPlaceholder}>
                  <Icon name="image-outline" color={colors.primary} size={31} />
                  <Text style={styles.photoDescription}>Sin foto propia</Text>
                </View>
              )}
              <View style={styles.reviewCard}>
                <Text style={styles.reviewTitle}>{draft.title.trim()}</Text>
                <Text style={styles.reviewLocation}>
                  {draft.location.trim()}, {draft.province.trim()}
                </Text>
                <Text style={styles.reviewPrice}>{publishedPrice !== null ? `${formatMoney(publishedPrice)} USD` : 'Precio sin indicar'}</Text>
                <View style={styles.reviewFacts}>
                  <Fact icon="bed-outline" value={`${draft.bedrooms.trim()} hab.`} />
                  <Fact icon="water-outline" value={`${draft.bathrooms.trim()} baños`} />
                  <Fact icon="resize-outline" value={`${draft.area.trim()} m²`} />
                </View>
                <View style={styles.divider} />
                <Text style={styles.reviewType}>{draft.type}</Text>
                {draft.condition ? <Text style={styles.reviewLocation}>Estado: {CONDITIONS.find(item => item.value === draft.condition)?.label}</Text> : null}
                {draft.floor !== undefined && draft.floor !== '' ? <Text style={styles.reviewLocation}>{draft.floor === '0' ? 'Planta baja' : `Planta ${draft.floor}`}</Text> : null}
                {draft.priceNegotiable != null ? <Text style={styles.reviewLocation}>{draft.priceNegotiable ? 'Precio negociable' : 'Precio fijo'}</Text> : null}
                <Text style={styles.reviewDescription}>{draft.description.trim()}</Text>
                {draft.amenities.length > 0 ? (
                  <View style={styles.reviewAmenities}>
                    {draft.amenities.map((item) => (
                      <View key={item} style={styles.amenityTag}>
                        <Text style={styles.amenityTagText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={styles.fieldCard}>
                <LocationPicker value={draft.mapLocation} readOnly />
              </View>
            </View>
          ) : null}

          {stepIssues.length > 0 ? <Notice error>Revisa estos campos antes de continuar: {stepIssues.join(', ')}.</Notice> : null}
          <View style={styles.actions}>
            {step > 0 ? (
              <Button
                label="Anterior"
                icon="arrow-back"
                secondary
                disabled={submitting || photoBusy}
                onPress={() => setStep((current) => current - 1)}
                style={styles.actionButton}
              />
            ) : onCancel ? (
              <Button
                label="Cancelar"
                secondary
                disabled={submitting || photoBusy}
                onPress={onCancel}
                style={styles.actionButton}
              />
            ) : null}
            {step < 2 ? (
              <Button
                label="Continuar"
                icon="arrow-forward"
                disabled={photoBusy}
                onPress={nextStep}
                style={styles.actionButton}
              />
            ) : (
              <Button
                label={submitLabel}
                icon="save-outline"
                loading={submitting}
                disabled={photoBusy}
                onPress={() => void submit()}
                style={styles.actionButton}
              />
            )}
          </View>

          {step > 0 && onCancel ? (
            <Button
              label="Cancelar edición"
              secondary
              disabled={submitting || photoBusy}
              onPress={onCancel}
            />
          ) : null}

          <Text style={styles.demoNote}>
            {cloud ? 'Tu borrador se guarda en este dispositivo. Al enviarlo, revisaremos el anuncio antes de publicarlo. Los cambios posteriores también requieren revisión.' : 'Demostración: se guarda en este dispositivo, sin publicarse en internet.'}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, error, required = false, inputStyle, ...props }: TextInputProps & {
  label: string;
  error?: string;
  required?: boolean;
  inputStyle?: TextInputProps['style'];
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>
        {label}{required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholderTextColor={colors.muted}
        style={[styles.input, error && styles.inputError, inputStyle]}
      />
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

function ChoiceField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choiceRow}>{children}</View>
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" style={styles.errorRow}>
      <Icon name="alert-circle-outline" size={15} color={colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionDescription}>{description}</Text>
    </View>
  );
}

function Fact({ icon, value }: { icon: Parameters<typeof Icon>[0]['name']; value: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={18} color={colors.muted} />
      <Text style={styles.factText}>{value}</Text>
    </View>
  );
}

function cloneDraft(draft: ListingDraft): ListingDraft {
  return { ...draft, amenities: [...draft.amenities], photos: draft.photos?.map(photo => ({ ...photo })) ?? (draft.photoUri ? [{ uri: draft.photoUri }] : []), mapLocation: draft.mapLocation ? normalizeMapLocation(draft.mapLocation) : undefined };
}

function readError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: layout.tabContentBottom },
  formShell: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: 20 },
  steps: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 16, backgroundColor: colors.white },
  stepItem: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  stepDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNumber: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  stepNumberActive: { color: colors.white },
  stepLabel: { color: colors.muted, fontSize: 13 },
  stepLabelActive: { color: colors.ink, fontWeight: '600' },
  section: { gap: 16 },
  sectionHeading: { gap: 6, paddingTop: 4, paddingBottom: 2 },
  sectionTitle: { color: colors.ink, fontFamily: typefaces.display, fontSize: 26, fontWeight: '600', lineHeight: 32, letterSpacing: -0.6 },
  sectionDescription: { color: colors.muted, fontSize: 15, lineHeight: 21, maxWidth: 560 },
  fieldCard: { backgroundColor: colors.white, borderRadius: 20, padding: 16, gap: 20 },
  fieldGroup: { gap: 7 },
  previewGroup: { gap: 6 },
  publishNote: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  required: { color: colors.muted },
  helper: { color: colors.muted, fontSize: 13 },
  input: { minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.white, color: colors.ink, paddingHorizontal: 0, paddingTop: 6, paddingBottom: 11, fontSize: 17, lineHeight: 23 },
  inputError: { borderBottomColor: colors.danger, backgroundColor: '#FFF9F9' },
  descriptionInput: { minHeight: 132, paddingTop: 8 },
  fieldHint: { flexShrink: 1, color: colors.muted, fontSize: 12, lineHeight: 18 }, descriptionHelp: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#F1F6FC', borderRadius: 13, padding: 12 }, characterCount: { color: colors.muted, fontSize: 11, textAlign: 'right', marginTop: -12 },
  errorRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 18, flex: 1 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridField: { flexGrow: 1, flexBasis: 130, minWidth: 125 },
  photoEmpty: { gap: 12, alignItems: 'center', paddingVertical: 10 },
  photoIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  photoCopy: { gap: 4 },
  photoTitle: { color: colors.ink, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  photoDescription: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  photoCard: { gap: 12 },
  photo: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: colors.softBlue },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoButton: { flexGrow: 1, minWidth: 145 },
  reviewPhoto: { width: '100%', aspectRatio: 16 / 9, borderRadius: 20, backgroundColor: colors.paper },
  reviewPhotoPlaceholder: { minHeight: 150, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', gap: 10 },
  reviewCard: { backgroundColor: colors.white, borderRadius: 20, padding: 20, gap: 10 },
  reviewTitle: { color: colors.ink, fontFamily: typefaces.display, fontSize: 24, fontWeight: '600', lineHeight: 30, letterSpacing: -0.4 },
  reviewLocation: { color: colors.muted, fontSize: 15 },
  reviewPrice: { color: colors.ink, fontSize: 24, fontWeight: '600', marginTop: 4 },
  reviewFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 5 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factText: { color: colors.ink, fontSize: 14 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 5 },
  reviewType: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  reviewDescription: { color: colors.ink, fontSize: 17, lineHeight: 25 },
  reviewAmenities: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  amenityTag: { backgroundColor: colors.paper, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 11 },
  amenityTagText: { color: colors.ink, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 2 },
  actionButton: { flexGrow: 1, minWidth: 145 },
  demoNote: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 12 },
});

export default ListingForm;
