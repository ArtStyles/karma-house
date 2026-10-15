import { StyleSheet, Text, View } from 'react-native';
import { listingBoardLabels, type ListingBoardState } from '../domain/listings';
import { createThemedStyles } from '../theme';

/** One state per listing («¿está en el catálogo?»), the same chip in Mis anuncios and in an agency's portfolio. */
export function ListingStateChip({ state }: { state: ListingBoardState }) {
  const { colors, styles } = useStyles();
  const tone = { sold: [colors.muted, colors.paper], rejected: [colors.danger, colors.softDanger], draft: [colors.muted, colors.paper],
    pending: [colors.amber, colors.softAmber], paused: [colors.amber, colors.softAmber], live: [colors.green, colors.softGreen] }[state];
  return <View style={[styles.chip, { backgroundColor: tone[1] }]}>
    <View style={[styles.dot, { backgroundColor: tone[0] }]} />
    <Text style={[styles.text, { color: tone[0] }]}>{listingBoardLabels[state]}</Text>
  </View>;
}
const useStyles = createThemedStyles(() => StyleSheet.create({
  chip: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 999 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: '600' },
}));
