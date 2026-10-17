import { StyleSheet, Text, View } from 'react-native';
import { OPERATIONS, type ListingOperation } from '../domain/listingOptions';
import { cartelLabel } from '../domain/operations';
import { createThemedStyles, rounded, typography } from '../theme';
import { Cartel } from './Cartel';
import { MotionPressable } from './MotionPressable';

const order: ListingOperation[] = ['sale', 'swap', 'rent', 'wanted'];
const tilts = [-3, 2, -2, 3];

/** The four operations as cards, each with its street sign. Used by Publicar and by the form's own chooser. */
export function OperationGrid({ onPick, labelFor = label => label }: { onPick(operation: ListingOperation): void; labelFor?: (label: string, operation: ListingOperation) => string }) {
  const { styles } = useStyles();
  return <View style={styles.grid}>
    {order.map((operation, index) => {
      const item = OPERATIONS.find(option => option.value === operation)!;
      return <MotionPressable key={operation} accessibilityRole="button" accessibilityLabel={labelFor(item.label, operation)} onPress={() => onPick(operation)}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <Cartel label={cartelLabel({ operation })} tilt={tilts[index]} />
        <View style={styles.copy}><Text style={styles.title}>{item.label}</Text><Text style={styles.text}>{item.description}</Text></View>
      </MotionPressable>;
    })}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Two per row from 320 px: flexBasis under half leaves room for the gap.
  card: { flexGrow: 1, flexBasis: '40%', minHeight: 164, padding: 16, gap: 18, justifyContent: 'space-between', borderRadius: rounded.cardLg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: .8 },
  copy: { gap: 4 }, title: { ...typography.section, color: colors.ink }, text: { color: colors.muted, fontSize: 13, lineHeight: 18 },
}));
