import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
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
import { colors, typefaces } from '../theme';
import { Button, Icon, Notice, Pill } from './ui';

type DraftErrors = DraftValidation['errors'];

export interface ListingFormProps {
  initialDraft?: ListingDraft;
  submitLabel?: string;
  onSubmit(draft: ListingDraft): Promise<void>;
  onCancel?: () => void;
}

const stepFields: (keyof ListingDraft)[][] = [
  ['title', 'type', 'location', 'province'],
  ['price', 'bedrooms', 'bathrooms', 'area', 'description', 'amenities', 'photoUri'],
  [],
];

const amenities = ['Balcón', 'Patio', 'Garaje', 'Amueblado', 'Aire acondicionado', 'Ascensor'];
const maxPhotoBytes = 4 * 1024 * 1024;

export function ListingForm({
  initialDraft,
  submitLabel = 'Guardar anuncio',
  onSubmit,
  onCancel,
}: ListingFormProps) {
  const [draft, setDraft] = useState<ListingDraft>(() => cloneDraft(initialDraft ?? emptyDraft));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const selectedAmenities = useMemo(() => new Set(draft.amenities), [draft.amenities]);

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
    const currentFields = stepFields[step];
    const currentErrors = Object.fromEntries(
      currentFields
        .filter((field) => result.errors[field])
        .map((field) => [field, result.errors[field]]),
    ) as DraftErrors;

    if (Object.keys(currentErrors).length === 0) return true;
    setErrors((previous) => ({ ...previous, ...currentErrors }));
    return false;
  }

  function nextStep() {
    if (!validateCurrentStep()) return;
    setStep((current) => Math.min(current + 1, 2));
  }

  async function submit() {
    if (submitting) return;

    const result = validateDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      const firstInvalidStep = stepFields.findIndex((fields) =>
        fields.some((field) => Boolean(result.errors[field])),
      );
      setStep(firstInvalidStep >= 0 ? firstInvalidStep : 0);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(cloneDraft(draft));
    } catch (error) {
      setSubmitError(readError(error, 'No pudimos guardar el anuncio en este dispositivo.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function pickPhoto() {
    if (photoBusy || submitting) return;
    setPhotoBusy(true);
    setSubmitError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.5,
        base64: Platform.OS === 'web',
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) throw new Error('No se recibió la foto seleccionada.');
      if (asset.fileSize && asset.fileSize > maxPhotoBytes) {
        throw new Error('La foto debe ocupar 4 MB o menos.');
      }

      const photoUri = await persistPhoto(asset);
      changeField('photoUri', photoUri);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        photoUri: readError(error, 'No pudimos preparar esa foto. Prueba con otra imagen.'),
      }));
    } finally {
      setPhotoBusy(false);
    }
  }

  function toggleAmenity(value: string) {
    const next = selectedAmenities.has(value)
      ? draft.amenities.filter((item) => item !== value)
      : [...draft.amenities, value];
    changeField('amenities', next);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
      style={styles.flex}
    >
      <ScrollView
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
                    <Icon name="checkmark" size={15} color={colors.white} />
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

          <Notice>
            Este es un anuncio local de demostración. Se guarda solo en este dispositivo y no se
            publica en internet.
          </Notice>

          {submitError ? <Notice error>{submitError}</Notice> : null}

          {step === 0 ? (
            <View style={styles.section}>
              <SectionHeading
                eyebrow="Paso 1"
                title="Cuéntanos sobre la vivienda"
                description="Solo pedimos los datos necesarios para presentar el inmueble."
              />
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

              <Field
                label="Zona o barrio"
                required
                placeholder="Ej. Vedado"
                value={draft.location}
                onChangeText={(value) => changeField('location', value)}
                error={errors.location}
                maxLength={80}
              />
              <Field
                label="Provincia"
                required
                placeholder="Ej. La Habana"
                value={draft.province}
                onChangeText={(value) => changeField('province', value)}
                error={errors.province}
                maxLength={80}
              />
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.section}>
              <SectionHeading
                eyebrow="Paso 2"
                title="Añade los detalles"
                description="Las cifras se mostrarán tal como las escribas, después de validarlas."
              />
              <Field
                label="Precio en USD"
                required
                placeholder="85000"
                value={draft.price}
                onChangeText={(value) => changeField('price', value)}
                error={errors.price}
                keyboardType="decimal-pad"
                inputMode="decimal"
              />

              <View style={styles.fieldGrid}>
                <View style={styles.gridField}>
                  <Field
                    label="Habitaciones"
                    required
                    placeholder="3"
                    value={draft.bedrooms}
                    onChangeText={(value) => changeField('bedrooms', value)}
                    error={errors.bedrooms}
                    keyboardType="number-pad"
                    inputMode="numeric"
                  />
                </View>
                <View style={styles.gridField}>
                  <Field
                    label="Baños"
                    required
                    placeholder="2"
                    value={draft.bathrooms}
                    onChangeText={(value) => changeField('bathrooms', value)}
                    error={errors.bathrooms}
                    keyboardType="number-pad"
                    inputMode="numeric"
                  />
                </View>
                <View style={styles.gridField}>
                  <Field
                    label="Superficie (m²)"
                    required
                    placeholder="120"
                    value={draft.area}
                    onChangeText={(value) => changeField('area', value)}
                    error={errors.area}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                  />
                </View>
              </View>

              <Field
                label="Descripción"
                required
                placeholder="Describe la distribución, el estado y lo que hace especial a la vivienda."
                value={draft.description}
                onChangeText={(value) => changeField('description', value)}
                error={errors.description}
                maxLength={2000}
                multiline
                textAlignVertical="top"
                inputStyle={styles.descriptionInput}
              />

              <ChoiceField label="Comodidades (opcional)" error={errors.amenities}>
                {amenities.map((item) => (
                  <Pill
                    key={item}
                    label={item}
                    active={selectedAmenities.has(item)}
                    onPress={() => toggleAmenity(item)}
                  />
                ))}
              </ChoiceField>

              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Foto (opcional)</Text>
                  <Text style={styles.helper}>Máximo 4 MB</Text>
                </View>
                {draft.photoUri ? (
                  <View style={styles.photoCard}>
                    <Image source={{ uri: draft.photoUri }} style={styles.photo} resizeMode="cover" />
                    <View style={styles.photoActions}>
                      <Button
                        label="Cambiar foto"
                        secondary
                        loading={photoBusy}
                        onPress={() => void pickPhoto()}
                        style={styles.photoButton}
                      />
                      <Button
                        label="Quitar"
                        secondary
                        disabled={photoBusy}
                        onPress={() => changeField('photoUri', undefined)}
                        style={styles.photoButton}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.photoEmpty}>
                    <View style={styles.photoIcon}>
                      <Icon name="image-outline" color={colors.primary} size={27} />
                    </View>
                    <View style={styles.photoCopy}>
                      <Text style={styles.photoTitle}>Añade una foto principal</Text>
                      <Text style={styles.photoDescription}>
                        La imagen se conserva en este dispositivo junto con el anuncio.
                      </Text>
                    </View>
                    <Button
                      label="Elegir foto"
                      secondary
                      loading={photoBusy}
                      onPress={() => void pickPhoto()}
                    />
                  </View>
                )}
                {errors.photoUri ? <FieldError message={errors.photoUri} /> : null}
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.section}>
              <SectionHeading
                eyebrow="Paso 3"
                title="Revisa antes de guardar"
                description="Podrás editar, pausar o marcar como vendido este anuncio desde Mi espacio."
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
                <Text style={styles.reviewPrice}>$ {draft.price.trim()} USD</Text>
                <View style={styles.reviewFacts}>
                  <Fact icon="bed-outline" value={`${draft.bedrooms.trim()} hab.`} />
                  <Fact icon="water-outline" value={`${draft.bathrooms.trim()} baños`} />
                  <Fact icon="resize-outline" value={`${draft.area.trim()} m²`} />
                </View>
                <View style={styles.divider} />
                <Text style={styles.reviewType}>{draft.type}</Text>
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
            </View>
          ) : null}

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
        placeholderTextColor="#88959D"
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

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
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
  return { ...draft, amenities: [...draft.amenities] };
}

async function persistPhoto(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (Platform.OS === 'web') {
    if (!asset.base64) throw new Error('El navegador no pudo leer la foto seleccionada.');
    if (base64ByteLength(asset.base64) > maxPhotoBytes) {
      throw new Error('La foto debe ocupar 4 MB o menos.');
    }
    const mimeType = asset.mimeType?.startsWith('image/') ? asset.mimeType : 'image/jpeg';
    return `data:${mimeType};base64,${asset.base64}`;
  }

  const { Directory, File, Paths } = await import('expo-file-system');
  const directory = new Directory(Paths.document, 'karmahouse', 'listing-photos');
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });

  const extension = fileExtension(asset.fileName, asset.mimeType);
  const destination = new File(
    directory,
    `listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`,
  );
  const source = new File(asset.uri);
  await source.copy(destination);
  return destination.uri;
}

function fileExtension(fileName?: string | null, mimeType?: string | null): string {
  const extension = fileName?.split('.').pop()?.toLocaleLowerCase();
  if (extension && /^[a-z0-9]{2,5}$/.test(extension)) return extension;
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return 'heic';
  return 'jpg';
}

function base64ByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function readError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 18, paddingBottom: 42 },
  formShell: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 20 },
  steps: { flexDirection: 'row', paddingVertical: 4 },
  stepItem: { flex: 1, alignItems: 'center', gap: 6 },
  stepDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNumber: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  stepNumberActive: { color: colors.white },
  stepLabel: { color: colors.muted, fontSize: 12 },
  stepLabelActive: { color: colors.ink, fontWeight: '700' },
  section: { gap: 20 },
  sectionHeading: { gap: 6, paddingVertical: 3 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  sectionTitle: { color: colors.ink, fontFamily: typefaces.display, fontSize: 27, lineHeight: 33 },
  sectionDescription: { color: colors.muted, fontSize: 14, lineHeight: 21, maxWidth: 560 },
  fieldGroup: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  required: { color: colors.danger },
  helper: { color: colors.muted, fontSize: 12 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.white, color: colors.ink, paddingHorizontal: 15, paddingVertical: 12, fontSize: 16 },
  inputError: { borderColor: colors.danger, backgroundColor: '#FFF9F9' },
  descriptionInput: { minHeight: 140, paddingTop: 14 },
  errorRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 18, flex: 1 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  gridField: { flexGrow: 1, flexBasis: 150, minWidth: 145 },
  photoEmpty: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#B9C8D6', borderRadius: 16, padding: 18, gap: 14, backgroundColor: '#FBFCFF' },
  photoIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  photoCopy: { gap: 4 },
  photoTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  photoDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  photoCard: { gap: 12 },
  photo: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: colors.softBlue },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoButton: { flexGrow: 1, minWidth: 145 },
  reviewPhoto: { width: '100%', aspectRatio: 16 / 9, borderRadius: 18, backgroundColor: colors.softBlue },
  reviewPhotoPlaceholder: { minHeight: 150, borderRadius: 18, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center', gap: 10 },
  reviewCard: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 10 },
  reviewTitle: { color: colors.ink, fontFamily: typefaces.display, fontSize: 25, lineHeight: 31 },
  reviewLocation: { color: colors.muted, fontSize: 14 },
  reviewPrice: { color: colors.primary, fontSize: 22, fontWeight: '800', marginTop: 4 },
  reviewFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 5 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 5 },
  reviewType: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  reviewDescription: { color: colors.ink, fontSize: 14, lineHeight: 22 },
  reviewAmenities: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  amenityTag: { backgroundColor: colors.softBlue, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 11 },
  amenityTagText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, paddingTop: 4 },
  actionButton: { flexGrow: 1, minWidth: 145 },
});

export default ListingForm;
