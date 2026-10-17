import { StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, rounded } from '../theme';

/**
 * DESIGN.md §2, the same chip in Mis anuncios, Cartera and Revisar anuncios:
 * done — En el catálogo, Aceptada, Venta confirmada · waiting — En revisión, Pendiente, Sin usar ·
 * danger — Necesita cambios, Anuncio retirado, Suspendida · paused — En pausa, Ya no disponible ·
 * neutral — Borrador, Cerrado, Descartado, Caducado, Enviada.
 */
export type StateTone = 'done' | 'waiting' | 'danger' | 'paused' | 'neutral';

export function StateChip({ tone, label }: { tone: StateTone; label: string }) {
  const { colors, styles } = useStyles();
  const [color, tint] = {
    done: [colors.green, colors.softGreen], waiting: [colors.amber, colors.softAmber], danger: [colors.danger, colors.softDanger],
    paused: [colors.ocre, colors.softOcre], neutral: [colors.body, colors.softNeutral],
  }[tone];
  return <View style={[styles.chip, { backgroundColor: tint }]}>
    <View style={[styles.dot, { backgroundColor: color }]} />
    <Text style={[styles.text, { color }]}>{label}</Text>
  </View>;
}

const useStyles = createThemedStyles(() => StyleSheet.create({
  chip: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 24, paddingVertical: 3, paddingHorizontal: 9, borderRadius: rounded.pill },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
}));
