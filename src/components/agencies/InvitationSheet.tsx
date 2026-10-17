import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAgencyWorkspace } from '../../agencies/AgencyProvider';
import type { CapturedAccountContext } from '../../agencies/controller';
import { agencyError } from '../../agencies/domain';
import type { AgencyInvitation } from '../../agencies/types';
import { useAuth } from '../../auth/AuthProvider';
import { agencyRoleLabel } from '../../screens/AgencyWorkspaceScreen';
import { createThemedStyles, rounded, typography } from '../../theme';
import { Sheet } from '../Sheet';
import { Button, Notice } from '../ui';
import { AgencyMark } from './AgencyMark';

// Invitations put off with «Ahora no» while the app is open; Mi espacio does not offer them again until next time.
const later = new Set<string>();

/**
 * A pending team invitation, offered on its own when Mi espacio opens (artboard Invitacion). Accepting and
 * declining are the same calls as in Equipo e invitaciones, which keeps listing every invitation.
 */
export function InvitationSheet({ pending, onDecided }: { pending: number; onDecided(): void }) {
  const w = useAgencyWorkspace();
  const auth = useAuth();
  const { styles } = useStyles();
  const [invitation, setInvitation] = useState<AgencyInvitation | null>(null);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [issue, setIssue] = useState('');
  const requestIds = useRef(new Map<string, string>());
  const usable = pending > 0 && !!w.repository && w.enabled && !!auth.session && !auth.suspended;
  useEffect(() => {
    if (!usable) return;
    let active = true, context: CapturedAccountContext;
    try { context = w.captureAccountContext(); } catch { return; }
    void w.repository!.listInvitations(0, context).then(page => {
      context.checkpoint();
      const next = page.items.find(item => item.state === 'pending' && !later.has(item.id));
      if (active && next) { setIssue(''); setInvitation(next); }
    }).catch(() => undefined).finally(() => context.release());
    return () => { active = false; };
  }, [usable, pending, auth.session?.access_token, w.repository, w.captureAccountContext]);

  async function decide(accept: boolean) {
    if (!invitation || busy || !w.repository) return;
    const intent = `${invitation.id}:${accept}:${invitation.version}`;
    const clientRequestId = requestIds.current.get(intent) ?? randomUUID();
    requestIds.current.set(intent, clientRequestId);
    let context: CapturedAccountContext | null = null;
    setBusy(accept ? 'accept' : 'decline'); setIssue('');
    try {
      context = w.captureAccountContext();
      await w.repository.decideInvitation({ invitationId: invitation.id, accept, expectedVersion: invitation.version, clientRequestId }, context);
      context.checkpoint();
      await w.refreshAgencies();
      setInvitation(null); onDecided();
      if (accept) router.push({ pathname: '/agency-workspace', params: { agencyId: invitation.agencyId } });
    } catch (cause) { setIssue(agencyError(cause)); }
    finally { context?.release(); setBusy(null); }
  }
  const close = () => { if (busy) return; if (invitation) later.add(invitation.id); setInvitation(null); };
  const name = invitation?.agencyName ?? 'Una inmobiliaria';
  return <Sheet visible={!!invitation} onClose={close}>
    {invitation && <View style={styles.body}>
      <AgencyMark agencyId={invitation.agencyId} name={name} width={76} height={88} bottom={18} glow textStyle={styles.initials} />
      <Text accessibilityRole="header" style={styles.title}>{name} te invita a su equipo</Text>
      <View style={styles.chip}><Text style={styles.chipText}>Rol: {agencyRoleLabel[invitation.role]}</Text></View>
      <Text style={styles.text}>Entras en un equipo cuando aceptas la invitación de una inmobiliaria aprobada. Puedes salir del equipo cuando quieras.</Text>
      <Text style={styles.expiry}>Caduca el {new Date(invitation.expiresAt).toLocaleDateString('es-CU', { day: 'numeric', month: 'long' })}.</Text>
      {issue ? <Notice error>{issue}</Notice> : null}
      <View style={styles.actions}>
        <Button label="Aceptar invitación" loading={busy === 'accept'} disabled={!!busy} onPress={() => void decide(true)} />
        <Button label="Rechazar invitación" secondary loading={busy === 'decline'} disabled={!!busy} onPress={() => void decide(false)} />
        <Pressable accessibilityRole="button" disabled={!!busy} onPress={close} style={styles.later}><Text style={styles.laterText}>Ahora no</Text></Pressable>
      </View>
    </View>}
  </Sheet>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  body: { alignItems: 'center', gap: 12, paddingTop: 4 },
  initials: { ...typography.sheetTitle, color: colors.creamInk },
  title: { ...typography.sheetTitle, color: colors.ink, textAlign: 'center', marginTop: 4 },
  chip: { minHeight: 26, paddingHorizontal: 10, borderRadius: rounded.pill, backgroundColor: colors.softNeutral, justifyContent: 'center' }, chipText: { color: colors.body, fontSize: 12, fontWeight: '700' },
  text: { color: colors.body, fontSize: 14, lineHeight: 20, textAlign: 'center' }, expiry: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 6 }, later: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, laterText: { color: colors.muted, fontSize: 15, fontWeight: '600' },
}));
