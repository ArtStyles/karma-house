import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MessageNegotiation } from '../../messaging/types';
import { availableNegotiationActions } from '../../negotiations/domain';
import { expiryHint, proposalStatus, proposalTitle, proposalValue, type StatusTone } from '../../negotiations/presentation';
import type { Negotiation, NegotiationAction } from '../../negotiations/types';
import { createThemedStyles, internalLayout } from '../../theme';
import { ActionGroup, Button, Icon } from '../ui';



/**
 * A proposal inside the thread. The message snapshot says what was proposed; `live` (the current row, when
 * loaded) decides the status and which answers this person may give, using the same rules as the server.
 */
export function ProposalCard({ proposal, live, userId, time, busy, managementChanged=false, onRespond, onCounter, onCancelAgreement }: {
  proposal: MessageNegotiation; live?: Negotiation; userId: string; time: string; busy: boolean;managementChanged?:boolean;
  onRespond(item: Negotiation, action: NegotiationAction): void; onCounter(item: Negotiation): void; onCancelAgreement(item: Negotiation): void;
}) {
  const { colors, styles } = useStyles();
  const tones: Record<StatusTone, { background: string; color: string }> = {
    pending: { background: colors.softAmber, color: colors.amber }, success: { background: colors.softGreen, color: colors.green },
    danger: { background: colors.softDanger, color: colors.danger }, neutral: { background: colors.softNeutral, color: colors.muted },
  };
  const own = proposal.createdBy === userId;
  const value = proposalValue(proposal);
  const status = live ? proposalStatus(live) : null;
  const hint = live ? expiryHint(live) : null;
  const actions = live ? availableNegotiationActions(live, userId) : null;
  const paused = !!live && !live.canAct && (live.status === 'pending' || live.status === 'accepted');
  const title = proposalTitle(proposal, userId);
  return <View style={[styles.row, own && styles.ownRow]}>
    <View accessible={false} style={[styles.card, own && styles.ownCard]}>
      <View style={styles.heading}>
        <View style={styles.icon}><Icon name={proposal.kind === 'offer' ? 'pricetag-outline' : 'calendar-outline'} size={18} color={colors.primary} /></View>
        <Text style={styles.title}>{title}</Text>
      </View>
      {status && <Text style={[styles.status, { color: tones[status.tone].color }]}>{status.label}</Text>}
      <Text style={[styles.value, live?.status === 'superseded' && styles.struck]}>{value.primary}</Text>
      {value.secondary && <Text style={styles.secondary}>{value.secondary}</Text>}
      {!!proposal.note && <Text style={styles.note}>{proposal.note}</Text>}
      {live?.status === 'pending' && own && <Text style={styles.meta}>Esperando respuesta{hint ? ` · ${hint}` : ''}</Text>}
      {live?.status === 'pending' && !own && hint && <Text style={styles.meta}>{hint}</Text>}
      {paused && <Text style={styles.paused}>Las respuestas están pausadas: el anuncio no está disponible o hay un bloqueo. Puedes cancelar.</Text>}
      {managementChanged&&<Text style={styles.paused}>Este acuerdo pertenece a la conversación anterior. Sus participantes y condiciones se conservan.</Text>}
      {actions && (actions.accept || actions.decline) && <ActionGroup style={styles.answers}>
        {actions.decline && <Button label="Rechazar" secondary disabled={busy} onPress={() => onRespond(live!, 'decline')} style={styles.answer} />}
        {actions.accept && <Button label="Aceptar" disabled={busy} onPress={() => onRespond(live!, 'accept')} style={styles.answer} />}
      </ActionGroup>}
      {actions?.counter && <Link label={proposal.kind === 'offer' ? 'Proponer otro importe' : 'Proponer otra fecha'} disabled={busy} onPress={() => onCounter(live!)} />}
      {actions?.cancel && (live!.status === 'accepted'
        ? <Link label="Cancelar acuerdo" danger disabled={busy} onPress={() => onCancelAgreement(live!)} />
        : <Link label="Retirar propuesta" disabled={busy} onPress={() => onRespond(live!, 'cancel')} />)}
      <Text style={styles.time}>{time}</Text>
    </View>
  </View>;
}

function Link({ label, onPress, disabled, danger = false }: { label: string; onPress(): void; disabled: boolean; danger?: boolean }) {
  const { colors, styles } = useStyles();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.link, (pressed || disabled) && { opacity: .5 }]}>
    <Text style={[styles.linkText, danger && { color: colors.danger }]}>{label}</Text>
  </Pressable>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  row: { alignItems: 'flex-start', paddingVertical: 6 }, ownRow: { alignItems: 'flex-end' },
  card: { width: '92%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: internalLayout.radius, borderBottomLeftRadius: 5, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  ownCard: { borderBottomLeftRadius: internalLayout.radius, borderBottomRightRadius: 5, borderColor: colors.border },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.ink },
  status: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  value: { fontSize: 21, lineHeight: 28, fontWeight: '700', letterSpacing: -.4, color: colors.ink }, struck: { textDecorationLine: 'line-through', color: colors.muted },
  secondary: { fontSize: 15, lineHeight: 21, color: colors.ink, marginTop: -2 },
  note: { fontSize: 14, lineHeight: 20, color: colors.ink, borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: 9, marginTop: 2 },
  meta: { fontSize: 13, lineHeight: 18, color: colors.muted }, paused: { fontSize: 13, lineHeight: 18, color: colors.amber },
  answers: { gap: 12, marginTop: 4 }, answer: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 12 },
  link: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, linkText: { color: colors.primary, fontSize: 14, lineHeight: 21, fontWeight: '600', textAlign: 'center' },
  time: { alignSelf: 'flex-end', fontSize: 12, color: colors.muted },
}));
